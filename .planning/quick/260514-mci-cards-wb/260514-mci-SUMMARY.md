---
phase: quick-260514-mci
plan: 01
subsystem: cards-wb
tags: [wb-api, feedbacks, rating, ui, filter, sort]
requires:
  - lib/wb-support-api.ts:listFeedbacks
  - lib/wb-cooldown.ts:feedbacks-bucket
provides:
  - lib/wb-ratings.ts:fetchProductRatings + aggregateFeedbacks
  - POST /api/wb-ratings-sync
  - components/cards/WbSyncRatingsButton
  - WbCard.imtId / ratingImt / reviewsTotalImt
affects:
  - /cards/wb (RSC page + table + filters)
  - app/api/wb-sync (parseCard теперь пишет imtId)
key-files:
  created:
    - prisma/migrations/20260514_mci_wb_card_ratings/migration.sql
    - lib/wb-ratings.ts
    - tests/wb-ratings.test.ts
    - app/api/wb-ratings-sync/route.ts
    - components/cards/WbSyncRatingsButton.tsx
  modified:
    - prisma/schema.prisma
    - lib/wb-api.ts (parseCard + WbCardRaw.imtID)
    - app/api/wb-sync/route.ts (updateData/createData imtId)
    - app/(dashboard)/cards/wb/page.tsx
    - components/cards/WbCardsTable.tsx
    - components/cards/WbFilters.tsx
decisions:
  - imtId не nullable в WB API ответе → храним nullable в БД (резерв на API drift)
  - aggregateFeedbacks — pure function без I/O для unit-test
  - sweepFeedbacks: active + archive (isAnswered=false/true), TAKE=5000, SLEEP=1100ms
  - RBAC: requireSection("PRODUCTS", "MANAGE") — план указывал "CARDS" но enum не содержит такого значения (Rule 3 fix)
  - Не интегрировано в /api/wb-sync — отдельный endpoint и ручная кнопка
metrics:
  duration: ~25 минут
  tasks: 4
  files_created: 5
  files_modified: 6
  tests_added: 5
  commits: 4
completed: 2026-05-15
---

# Quick Task 260514-mci: /cards/wb улучшения Summary

Рейтинг карточки + рейтинг склейки через WB Feedbacks API, фильтр по Ярлыку, сортировка по Остатку.

## Что сделано

### Task 1 — Schema migration + parseCard добавляет imtId (commit `dea3c29`)

**Файлы:**
- `prisma/schema.prisma` — 3 nullable поля в `WbCard` (imtId, ratingImt, reviewsTotalImt) + `@@index([imtId])`
- `prisma/migrations/20260514_mci_wb_card_ratings/migration.sql` — ручная миграция (применится через `deploy.sh`)
- `lib/wb-api.ts` — `WbCardRaw.imtID?: number` + `parseCard` возвращает `imtId`
- `app/api/wb-sync/route.ts` — `updateData.imtId` + `createData.imtId` (теперь следующий полный sync заполнит поле)

### Task 2 — fetchProductRatings + pure aggregator + 5 unit tests (commit `1fbac40`)

**Файлы:**
- `lib/wb-ratings.ts`:
  - `aggregateFeedbacks(feedbacks)` — pure function без I/O. Считает avg+count per nmId и per imtId. Игнорирует `productValuation=null/0`, `imtId=0/null` идёт только в perNmId.
  - `fetchProductRatings()` — sweep active+archive feedbacks через `listFeedbacks`. `TAKE=5000`, `SLEEP=1100ms` (1 req/sec + буфер), `MAX_PAGES=20` cap (≤100k feedbacks).
- `tests/wb-ratings.test.ts` — 5 тестов: агрегация, dirty data (`valuation=0/null`), `imtId=0`, округление до 2 знаков, пустой массив.

**Test output:** `Test Files 1 passed (1) | Tests 5 passed (5) | Duration 206ms`

### Task 3 — POST /api/wb-ratings-sync + WbSyncRatingsButton (commit `a96380e`)

**Файлы:**
- `app/api/wb-ratings-sync/route.ts`:
  - `requireSection("PRODUCTS", "MANAGE")` (см. Deviations — план указывал `"CARDS"`)
  - **Pre-check cooldown** bucket=`feedbacks` → если активен, возвращает 429 + `retryAfterSec` БЕЗ запроса к WB
  - Batch update: `WbCard.rating` + `reviewsTotal` + (backfill `imtId` если null)
  - `prisma.wbCard.updateMany({ where: { imtId } })` для агрегата склейки → `ratingImt` + `reviewsTotalImt`
  - На `WbRateLimitError` → `setWbCooldownUntil("feedbacks", retryAfterSec)` + 429 (защита support-sync)
  - `revalidatePath("/cards/wb")` на успех
- `components/cards/WbSyncRatingsButton.tsx`:
  - Star icon (lucide-react), паттерн `WbSyncSppButton`
  - toast.success / warning(429) / error(403) / error(network), `router.refresh()` на ok

### Task 4 — UI (commit `f4aa0ff`)

**Файлы:**
- `app/(dashboard)/cards/wb/page.tsx`:
  - `searchParams.labels?: string` + парсинг → `where.label = { in: [...] }`
  - sort whitelist += `"stockQty"`
  - `Promise.all` += 4-й запрос: distinct labels из WbCard
  - `<WbSyncRatingsButton />` рендерится в шапке между `WbUploadIuButton` и `WbSyncSppButton`
- `components/cards/WbFilters.tsx`:
  - props += `labelOptions, selectedLabels`
  - `<MultiSelectDropdown label="Ярлык" />` рядом с Бренд/Категория
  - `clearAll` сбрасывает labels тоже
- `components/cards/WbCardsTable.tsx`:
  - `WbCard` interface += `ratingImt, reviewsTotalImt`
  - `selectedLabels` в props + `buildUrl` сохраняет labels при пагинации/сортировке
  - **4 новых столбца** (Рейтинг карт. / Оценок / Рейтинг скл. / Оценок) между Клуб и Остаток
  - Остаток теперь кликабельный sort header (`stockQty` asc/desc toggle)
  - `colSpan` empty-state: 15 → 19

## Migration SQL

Для понимания deploy impact — содержимое `prisma/migrations/20260514_mci_wb_card_ratings/migration.sql`:

```sql
-- Phase 260514-mci: WbCard.imtId + ratingImt + reviewsTotalImt
-- Поля заполняются через POST /api/wb-ratings-sync (lib/wb-ratings.ts)
-- и parseCard (lib/wb-api.ts) при следующем полном sync через /api/wb-sync.

ALTER TABLE "WbCard"
  ADD COLUMN "imtId"           INTEGER,
  ADD COLUMN "ratingImt"       DOUBLE PRECISION,
  ADD COLUMN "reviewsTotalImt" INTEGER;

CREATE INDEX "WbCard_imtId_idx" ON "WbCard"("imtId");
```

3 nullable колонки + 1 indexed (~267 строк WbCard у Zoiten = моментальный ALTER на проде).

## Sync timing recap

**Внимание — общий bucket `feedbacks` с support-sync (15-мин cron):**

- `/api/wb-ratings-sync` использует тот же per-endpoint cooldown bus (`lib/wb-cooldown.ts` bucket=`feedbacks`), что и `lib/support-sync.ts` для отзывов/вопросов.
- Если запустить ratings-sync параллельно с support-sync cron tick — оба упадут в 429, WB заблокирует bucket до retry-after (часто 720s — 12 мин).
- Sweep всех active+archive feedback'ов может занять **2-10 минут** (зависит от объёма — у Zoiten ≤50k feedbacks, ≤14 батчей × 1.1с).
- При `WbRateLimitError` (retry>60s) — endpoint пишет cooldown bucket-lock, защищая последующий cron support-sync (за счёт того что bucket = `feedbacks`, обе подсистемы skip'ают через `getWbCooldownSecondsRemaining`).

**Рекомендация UX:**
- **Запускать раз в день**, желательно ранним утром (например, 06:00 MSK) или late ночью — когда support-sync 15-мин tick не активен.
- НЕ автоматизирован (нет cron, нет интеграции в `/api/wb-sync`) — только кнопка пользователя.
- Кнопка не имеет UI-cooldown 5 мин (как у `WbSyncSppButton`) — пользователь может запустить повторно, но получит мгновенный 429 если bucket в lock'е (защита on server-side).

## Tests run

```
$ npx prisma validate (with DATABASE_URL placeholder)
  → The schema at prisma\schema.prisma is valid 🚀

$ npx vitest run tests/wb-ratings.test.ts
  → Test Files  1 passed (1)
  → Tests       5 passed (5)
  → Duration    206ms

$ npx tsc --noEmit -p tsconfig.json
  → No errors related to (wb-ratings | WbSyncRatings | cards/wb | WbCardsTable | WbFilters)
```

## Deploy steps for VPS

Стандартный паттерн (см. CLAUDE.md «VPS заметки»):

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

Что произойдёт внутри `deploy.sh`:
1. `git pull` — заберёт 4 commit'а (`dea3c29` → `f4aa0ff`)
2. `npx prisma migrate deploy` — применит `20260514_mci_wb_card_ratings/migration.sql` (3 ALTER + 1 INDEX, моментально)
3. `npm ci --omit=dev` + `npm run build` + restart `zoiten-erp.service`

После deploy:
1. Открыть `/cards/wb` — увидеть 4 новых столбца (пустые `—`), новый фильтр «Ярлык», кликабельный header «Остаток», новую кнопку «Рейтинги».
2. Нажать кнопку «Рейтинги» — sweep займёт несколько минут, появится toast `«Рейтинги обновлены: N карточек / M склеек (обработано K отзывов)»`.
3. Опционально запустить «Синхронизировать с WB» — `imtId` подтянется из Content API в `WbCard`, после следующего ratings-sync `ratingImt` будет покрывать ВСЕ карточки склейки (а не только те, у которых были feedback'и).

## Deviations from Plan

### Rule 3 fix — RBAC section "CARDS" → "PRODUCTS"

**Found during:** Task 3 (POST /api/wb-ratings-sync)
**Issue:** План указывал `requireSection("CARDS", "MANAGE")`, но enum `ERP_SECTION` в `prisma/schema.prisma:21-32` содержит только `PRODUCTS / PRICES / WEEKLY_CARDS / STOCK / COST / PROCUREMENT / SALES / SUPPORT / EMPLOYEES / USER_MANAGEMENT`. Значения `CARDS` нет.
**Fix:** Использован `requireSection("PRODUCTS", "MANAGE")` — это согласовано с `app/(dashboard)/cards/layout.tsx:9` где уже `await requireSection("PRODUCTS")`. Tooltip кнопки тоже скорректирован: «нужны права MANAGE на «Товары»».
**Why это blocking:** Если бы я оставил `"CARDS"`, то для non-superadmin MANAGER'ов запрос всегда возвращал бы 403 (ни один пользователь не имеет `sectionRoles["CARDS"]`). Superadmin прошёл бы благодаря bypass.
**Files modified:** `app/api/wb-ratings-sync/route.ts`, `components/cards/WbSyncRatingsButton.tsx` (текст toast'а 403)
**Commit:** `a96380e`

Других отклонений нет — план выполнен в точности, остальные изменения соответствуют тексту PLAN.md.

## Self-Check

- [x] `prisma/migrations/20260514_mci_wb_card_ratings/migration.sql` — FOUND
- [x] `lib/wb-ratings.ts` — FOUND
- [x] `tests/wb-ratings.test.ts` — FOUND
- [x] `app/api/wb-ratings-sync/route.ts` — FOUND
- [x] `components/cards/WbSyncRatingsButton.tsx` — FOUND
- [x] commit `dea3c29` — FOUND (Task 1)
- [x] commit `1fbac40` — FOUND (Task 2)
- [x] commit `a96380e` — FOUND (Task 3)
- [x] commit `f4aa0ff` — FOUND (Task 4)
- [x] prisma validate OK
- [x] vitest 5/5 pass
- [x] tsc no new errors

## Self-Check: PASSED
