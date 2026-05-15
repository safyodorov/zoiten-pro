---
phase: quick-260515-phv
plan: 01
subsystem: cards-wb
tags: [wb-orders-api, historical-prices, forward-fill, cleanup, dual-gate]
requires: []
provides:
  - OrdersDailyRow с sellerPrice/buyerPrice (number | null)
  - fetchOrdersForRange агрегирует priceWithDisc/finishedPrice как Math.round(avg) per (nmId, date MSK)
  - upsertOrdersDaily пишет 3 поля (qty + sellerPrice + buyerPrice)
  - fillTimeSeries forward-fill цен по sellerPrice/buyerPrice (leading null остаются null, qty не трогается)
  - POST /api/wb-orders-backfill dual-gate (x-cron-secret HEADER ИЛИ requireSection PRODUCTS MANAGE)
affects:
  - lib/wb-api.ts (OrdersDailyRow interface + fetchOrdersForRange + upsertOrdersDaily)
  - lib/wb-orders-chart.ts (DayPoint + fillTimeSeries forward-fill)
  - app/api/wb-orders-backfill/route.ts (NextRequest + cron secret gate)
  - daily cron /api/cron/wb-orders-daily transparently captures цены (через те же helpers)
tech-stack:
  added: []
  patterns:
    - Math.round(avg) per group для денежной агрегации (INTEGER columns)
    - Forward-fill loop с lastSeller/lastBuyer tracking
    - Dual-gate auth (header secret OR session RBAC) для cron + UI компат
key-files:
  created: []
  modified:
    - lib/wb-api.ts
    - lib/wb-orders-chart.ts
    - app/api/wb-orders-backfill/route.ts
    - tests/wb-card-orders-daily.test.ts
    - tests/wb-orders-chart-fill.test.ts
    - lib/wb-cron-schedule.ts
    - app/(dashboard)/cards/wb/page.tsx
  deleted:
    - app/api/wb-prices-retroactive-backfill/route.ts
    - components/cards/WbPricesRetroactiveBackfillButton.tsx
    - tests/wb-prices-retro.test.ts
decisions:
  - "avg per day (safe для intraday промо) — несколько заказов с разными ценами становятся одной строкой через Math.round(avg)"
  - "x-cron-secret как ВТОРОЙ гейт, не replace RBAC — UI button продолжает работать через сессию, orchestrator curl с VPS shell через header"
  - "keep /api/cron/wb-prices-daily — нужен для дней без заказов + сегодняшний snapshot перед 05:10 МСК"
  - "forward-fill ТОЛЬКО (no backward-fill) — leading null = 'цены ещё не было', визуально честно"
  - "fillTimeSeries forward-fill'ит ТОЛЬКО sellerPrice/buyerPrice; qty=0 на дни без заказов остаётся 0 (правда — продаж не было)"
  - "computeBuyerPriceRetro УДАЛЁН — формула sellerPrice × (1 − discountWb/100) от СЕГОДНЯШНИХ цен давала неправильные исторические цены"
metrics:
  duration: ~8 минут
  tasks: 2
  files_modified: 7
  files_deleted: 3
  tests_added: 5 (golden+null guard в wb-card-orders-daily; 3 forward-fill в wb-orders-chart-fill)
  tests_removed: 8 (wb-prices-retro.test.ts)
  commits: 3 (test RED + feat GREEN + chore cleanup)
  completed: 2026-05-15
---

# Phase quick-260515-phv: Реальные исторические цены через WB Orders API + Forward-fill + Cleanup retroactive backfill — Summary

Подтянуты РЕАЛЬНЫЕ исторические цены в `WbCardOrdersDaily` напрямую из WB Statistics Orders API (`priceWithDisc` → sellerPrice, `finishedPrice` → buyerPrice), `fillTimeSeries` теперь forward-fill'ит цены между точками с заказами, retroactive backfill button/endpoint/helper удалены — больше не нужны.

## Что сделано

### Task 1 — extend OrdersDailyRow + forward-fill + dual-gate (TDD)

**RED** — 12 failing тестов в двух файлах (test commit `ad4c3c6`).

**GREEN** — implementation:

1. **`lib/wb-api.ts`** — `OrdersDailyRow` расширен `sellerPrice/buyerPrice: number | null`. `fetchOrdersForRange` теперь:
   - В type narrowing orders array добавлены поля `priceWithDisc?: number` и `finishedPrice?: number`
   - В цикле order parsing собираются массивы `sellerPrices`/`buyerPrices` (только если value > 0 — игнорирует 0 и undefined)
   - В финальном map: `Math.round(avg)` если массив не пуст, иначе `null`
   - `upsertOrdersDaily` пишет 3 поля в `create` и `update`

2. **`lib/wb-orders-chart.ts`** — `DayPoint` расширен `sellerPrice?: number | null`. `fillTimeSeries`:
   - Принимает raw rows с `sellerPrice` и `buyerPrice`
   - После построения 28-точечного array проходит **forward-fill loop**: трекает `lastSeller`/`lastBuyer`, замещает `null` на `lastKnown`
   - Leading nulls (до первого ненулевого значения) остаются null
   - **qty НЕ forward-fill'ится** — на день без заказов остаётся 0

3. **`app/api/wb-orders-backfill/route.ts`** — POST signature изменена на `(req: NextRequest)`. Dual-gate:
   - Если `x-cron-secret` header совпадает с `process.env.CRON_SECRET` → проходит без RBAC
   - Иначе → `requireSection("PRODUCTS", "MANAGE")` (как раньше)
   - В логи: `auth=cron-secret | rbac`

4. **Тесты** — `tests/wb-card-orders-daily.test.ts` (7 кейсов, 5 расширенных + 2 новых golden agg + null guard); `tests/wb-orders-chart-fill.test.ts` (4 расширенных + 3 forward-fill golden/edge-cases).

### Task 2 — cleanup retroactive backfill

- `git rm app/api/wb-prices-retroactive-backfill/route.ts` — endpoint
- `git rm components/cards/WbPricesRetroactiveBackfillButton.tsx` — кнопка
- `git rm tests/wb-prices-retro.test.ts` — 8 unit-тестов
- `lib/wb-cron-schedule.ts` — удалена функция `computeBuyerPriceRetro` (другие 4 helpers сохранены: `getMskHHMM`, `getMskTodayString`, `isValidCronHHMM`, `shouldFireCron`)
- `app/(dashboard)/cards/wb/page.tsx` — удалены import + JSX `<WbPricesRetroactiveBackfillButton />`

## Файлы изменены / удалены / добавлены

**Modified (7 файлов):**
- `lib/wb-api.ts` (+47 / −15 строк) — OrdersDailyRow + aggregation
- `lib/wb-orders-chart.ts` (+44 / −13 строк) — forward-fill loop + sellerPrice
- `app/api/wb-orders-backfill/route.ts` (+19 / −5 строк) — dual-gate
- `tests/wb-card-orders-daily.test.ts` (+71 / −7 строк) — 7 тестов (5 расширенных + 2 новых)
- `tests/wb-orders-chart-fill.test.ts` (+95 / −15 строк) — 4 расширенных + 3 forward-fill теста
- `lib/wb-cron-schedule.ts` (−13 строк) — удалена computeBuyerPriceRetro
- `app/(dashboard)/cards/wb/page.tsx` (−2 строки) — import + JSX

**Deleted (3 файла):**
- `app/api/wb-prices-retroactive-backfill/route.ts`
- `components/cards/WbPricesRetroactiveBackfillButton.tsx`
- `tests/wb-prices-retro.test.ts` (8 unit-тестов computeBuyerPriceRetro)

## Test coverage

| Файл | До | После | Δ |
|------|-----|-------|---|
| wb-card-orders-daily.test.ts | 5 | 7 | +2 (golden agg + null guard) |
| wb-orders-chart-fill.test.ts | 5 | 8 | +3 (forward-fill golden + 2 edge-case) |
| wb-prices-retro.test.ts | 8 | — | −8 (удалён) |

**Прогон test suite после implementation:**
```
Test Files  3 passed (3)
Tests      19 passed (19) — целевые файлы (wb-card-orders-daily + wb-orders-chart-fill + wb-orders-chart-msk)
```

**Full suite:** 506 passed / 41 pre-existing failures (template-picker, appeal-actions, customer-actions, customer-sync-chat, merge-customers, wb-sync-route — все НЕ затронуты этим планом, baseline confirmed через `git stash`). Out-of-scope per SCOPE BOUNDARY.

**Build:** `npm run build` clean. `npx tsc --noEmit` clean.

## Commits

| Hash | Type | Description |
|------|------|-------------|
| `ad4c3c6` | test | TDD RED — failing тесты для price aggregation + forward-fill |
| `c51e7f0` | feat | TDD GREEN — aggregate priceWithDisc/finishedPrice + forward-fill + dual-gate |
| `633be9b` | chore | Cleanup retroactive backfill (3 файла, computeBuyerPriceRetro) |

## Deploy plan (orchestrator выполняет после merge)

**Шаг 1 — Push + deploy:**
```bash
git push origin main
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

`deploy.sh` сделает: `git pull` → `npm ci --omit=dev` → `prisma migrate deploy` (схема `WbCardOrdersDaily.sellerPrice/buyerPrice` уже была добавлена в quick 260515-o4o миграции) → `next build` → `systemctl restart zoiten-erp`.

**Шаг 2 — Re-backfill цен через curl (запуск с VPS shell):**

```bash
ssh root@85.198.97.89 'set -a; source /etc/zoiten.pro.env; set +a; curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" http://127.0.0.1:3001/api/wb-orders-backfill'
```

Ожидаемый ответ JSON:
```json
{"ok":true,"dateFrom":"2026-04-01T00:00:00.000Z","rowsFetched":~2200,"upserted":~2165}
```

Логи на сервере: `journalctl -u zoiten-erp -f` — должны быть `[wb-orders-backfill] start dateFrom=2026-04-01T00:00:00.000Z auth=cron-secret` и `[wb-orders backfill] page=N ... rowsReturned=...`.

**Шаг 3 — SQL spot check:**

```bash
ssh root@85.198.97.89 'sudo -u postgres psql zoiten_erp -c "SELECT \"nmId\", date, qty, \"sellerPrice\", \"buyerPrice\" FROM \"WbCardOrdersDaily\" WHERE \"nmId\" = 800750522 ORDER BY date;"'
```

**Ожидание:** sellerPrice/buyerPrice заполнены (не NULL), и НЕ одинаковые для всех дат одного nmId — отражают исторические промо-акции. Например на дни промо buyerPrice < обычной, после промо возврат к baseline.

**Шаг 4 — UI smoke test:**

Открыть https://zoiten.pro/cards/wb → expand row для карточки с заказами (nmId 800750522 или любой популярный) → ComposedChart bar+line:
- Линия `buyerPrice` показывает реальные провалы во время акций (а не плоскую сегодняшнюю цену)
- Между точками с заказами линия идёт **plateau** (forward-fill), а НЕ рвётся
- Leading дни без previous заказов отображаются разрывом (recharts `connectNulls={false}`)

## Ожидаемый prod-эффект

- **2165 строк** в `WbCardOrdersDaily` после re-backfill будут иметь исторические `sellerPrice` + `buyerPrice` из WB Orders API (вместо синтетических из retroactive формулы)
- На `/cards/wb` chart линия `buyerPrice` показывает **реальные** провалы во время акций — менеджер видит, что в момент `2026-04-22` цена была 3800₽, а сейчас 4500₽
- Между точками с заказами **plateau** — линия не рвётся («цена же не исчезает, когда нет продаж»)
- Daily cron `/api/cron/wb-orders-daily` теперь захватывает цены автоматически (через те же helpers — без изменений в cron-коде)
- Daily cron `/api/cron/wb-prices-daily` остаётся для сегодняшнего snapshot перед 05:10 (день без заказов всё равно получит snapshot)

## Key decisions

1. **`Math.round(avg)` per (nmId, date MSK)** — на день может быть несколько заказов с разными ценами (intraday промо). Avg даёт безопасную репрезентативную цену; разница ±1-2₽ не критична для chart. INTEGER columns в БД требуют округления.
2. **`x-cron-secret` как ВТОРОЙ гейт, не replace RBAC** — UI button продолжает работать через сессию, orchestrator curl с VPS shell использует header. Альтернатива (только secret) ломала бы UI; альтернатива (только RBAC) блокировала бы curl re-backfill.
3. **Keep `/api/cron/wb-prices-daily`** — нужен для дней без заказов + сегодняшний snapshot перед 05:10 МСК. Orders API не даёт точку для «сегодня без продаж» — без cron-snapshot буду gaps в tail.
4. **Forward-fill ТОЛЬКО (no backward-fill)** — leading null = «цены ещё не было», визуально честно (recharts разрывает линию). Backward-fill дал бы фальшивую ретроспективу «цена была одинаковой 28 дней назад».
5. **`qty` НЕ forward-fill** — это критически важно: `qty=0` на день без заказов — это правда, продаж не было. Forward-fill цен — гипотеза «цена объективно не менялась между датами»; forward-fill заказов сломал бы метрики.
6. **`computeBuyerPriceRetro` УДАЛЁН** — формула `sellerPrice × (1 − discountWb/100)` от СЕГОДНЯШНИХ `WbCard.price + discountWb` давала неправильные исторические цены (промо-акции прошлой недели исчезали). Орdrers API даёт source of truth — формула больше не нужна.

## Self-Check: PASSED

**Файлы созданы/удалены/изменены:**
- FOUND: lib/wb-api.ts (modified)
- FOUND: lib/wb-orders-chart.ts (modified)
- FOUND: app/api/wb-orders-backfill/route.ts (modified)
- FOUND: tests/wb-card-orders-daily.test.ts (modified)
- FOUND: tests/wb-orders-chart-fill.test.ts (modified)
- FOUND: lib/wb-cron-schedule.ts (modified, no computeBuyerPriceRetro)
- FOUND: app/(dashboard)/cards/wb/page.tsx (modified, no WbPricesRetroactiveBackfillButton)
- VERIFIED: app/api/wb-prices-retroactive-backfill/route.ts deleted
- VERIFIED: components/cards/WbPricesRetroactiveBackfillButton.tsx deleted
- VERIFIED: tests/wb-prices-retro.test.ts deleted

**Commits:**
- FOUND: ad4c3c6 (test RED)
- FOUND: c51e7f0 (feat GREEN)
- FOUND: 633be9b (chore cleanup)

**Verifications:**
- npm test --run target files: 19/19 pass (wb-card-orders-daily + wb-orders-chart-fill + wb-orders-chart-msk)
- npm test --run target files Phase: 35/35 pass (+ wb-prices-cron-dispatch + wb-cron-schedule-validation)
- npx tsc --noEmit: clean
- npm run build: clean (47 routes incl. /api/wb-orders-backfill, БЕЗ /api/wb-prices-retroactive-backfill)
- grep audit на orphan references в live files: 0 matches
