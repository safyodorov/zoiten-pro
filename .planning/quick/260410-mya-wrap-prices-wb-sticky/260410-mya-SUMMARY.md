---
phase: quick/260410-mya-wrap-prices-wb-sticky
plan: 01
subsystem: prices-wb
tags: [ui, database, persistence, sticky-columns, resize, wrap-headers, rounding]
requires:
  - Phase 7 prices-wb завершён (таблица PriceCalculatorTable существует)
  - Модель User с auth (session.user.id)
provides:
  - Новая модель UserPreference (key/value JSON, per-user)
  - Server actions getUserPreference / setUserPreference (auth-only)
  - Resize столбцов с debounced persist в БД
  - Wrap длинных заголовков (break-words, text-[11px])
  - Fix прозрачности sticky колонок (group-hover:bg-muted вместо /50)
  - Shadow-разделитель на правой границе Артикула
  - Округление денег и процентов до целых в UI (addendum 4.5)
affects:
  - app/(dashboard)/prices/wb/page.tsx (RSC загружает column widths pref)
  - components/prices/PriceCalculatorTableWrapper.tsx (прокидывает initialColumnWidths)
  - components/prices/PriceCalculatorTable.tsx (главные изменения)
  - prisma/schema.prisma (модель UserPreference + обратная связь User.preferences)
tech-stack:
  added: []
  patterns:
    - "UserPreference key/value JSON per-user (паттерн как AppSetting, но per-user)"
    - "requestAnimationFrame throttle для mousemove resize"
    - "Debounced save через useRef<timer> + функциональный setState для свежего значения"
    - "Cumulative sticky left offsets из state (не из захардкоженных Tailwind классов)"
    - "table-layout: fixed + inline style width/minWidth на th/td"
    - "fmtMoneyInt/fmtPctInt — display-only округление, БД и pricing-math остаются precise"
key-files:
  created:
    - app/actions/user-preferences.ts
    - prisma/migrations/20260410_add_user_preference/migration.sql
  modified:
    - prisma/schema.prisma
    - app/(dashboard)/prices/wb/page.tsx
    - components/prices/PriceCalculatorTableWrapper.tsx
    - components/prices/PriceCalculatorTable.tsx
decisions:
  - "Миграция создана вручную (не через prisma migrate dev) — проект использует формат YYYYMMDD_name, локального Postgres нет"
  - "getUserPreference/setUserPreference без requireSection — это пользовательские UI настройки, не данные домена"
  - "fmtMoneyInt/fmtPctInt — чистое display-форматирование, БД и lib/pricing-math.ts не трогаем (precision сохраняется для расчётов)"
  - "Status column в thead теперь text-left (единственная не-right скроллируемая колонка) — выделена через тернарник в className"
metrics:
  duration: "~15 min"
  completed: "2026-04-10"
  tasks_executed: "1, 2, 3, 4.5 + local commit (4 частично)"
  tasks_skipped: "5 (checkpoint — orchestrator handles)"
  tasks_deferred: "4 (push/deploy/migrate deploy — требует user approval)"
---

# Quick 260410-mya: Resize columns + persist + wrap headers + sticky transparency fix + округление

## Одной строкой

Добавлены 4+1 фичи в таблицу `/prices/wb`: резайз всех 30 столбцов с persist в новой таблице `UserPreference`, wrap длинных заголовков, fix непрозрачности sticky-колонок при hover, shadow-разделитель на границе sticky-зоны, округление денежных/процентных колонок до целых чисел в UI.

## Что сделано

### Task 1: Prisma миграция + server actions

**Новая модель `UserPreference`** (`prisma/schema.prisma`):
```prisma
model UserPreference {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  key       String
  value     Json
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@unique([userId, key])
  @@index([userId])
}
```

- Добавлена обратная связь `User.preferences: UserPreference[]`
- `onDelete: Cascade` — при удалении юзера удаляются все его preferences
- Unique index на `(userId, key)` + обычный index на `userId`

**Миграция `prisma/migrations/20260410_add_user_preference/migration.sql`:**
- `CREATE TABLE "UserPreference"` + primary key
- `CREATE UNIQUE INDEX "UserPreference_userId_key_key"` на `(userId, key)`
- `CREATE INDEX "UserPreference_userId_idx"` на `userId`
- `ALTER TABLE ... ADD CONSTRAINT "UserPreference_userId_fkey"` с `ON DELETE CASCADE`

Миграция создана вручную (не через `prisma migrate dev`) — в проекте используется формат `YYYYMMDD_name`, локального Postgres нет. Prisma Client сгенерирован (`npx prisma generate`), `prisma validate` проходит.

**Server actions** (`app/actions/user-preferences.ts`):
- `getUserPreference<T>(key): Promise<T | null>` — прочитать значение из `UserPreference` для `session.user.id`, вернуть `null` если нет сессии или нет записи
- `setUserPreference<T>(key, value): Promise<ActionResult>` — upsert. Валидация: auth + key length 1..200. `revalidatePath` НЕ вызывается (state управляется на клиенте).
- Оба action'а **без `requireSection`** — это пользовательские UI настройки, любой залогиненный пользователь может читать/писать свои preferences.

### Task 2: RSC page + Wrapper

`app/(dashboard)/prices/wb/page.tsx`:
- Добавлен импорт `getUserPreference`
- Добавлен 4-й параллельный запрос в `Promise.all`:
  ```ts
  const [appSettings, promotions, linkedArticles, columnWidthsPref] =
    await Promise.all([
      ...,
      getUserPreference<Record<string, number>>("prices.wb.columnWidths"),
    ])
  ```
- `<PriceCalculatorTableWrapper>` получает проп `initialColumnWidths={columnWidthsPref ?? {}}`

`components/prices/PriceCalculatorTableWrapper.tsx`:
- Props расширен `initialColumnWidths?: Record<string, number>`
- Прокидывает проп в `<PriceCalculatorTable>`

### Task 3: PriceCalculatorTable — главные изменения (~500 строк)

**Константы (новые, после `PriceCalculatorTableProps`):**
- `COLUMN_KEYS` — readonly tuple из 30 ключей колонок
- `DEFAULT_WIDTHS: Record<ColumnKey, number>` — дефолтные px, сумма ~2480px
- `SCROLL_COLUMNS: {key, label}[]` — 27 колонок (Статус цены + 26 расчётных) с русскими лейблами
- `MIN_COLUMN_WIDTH = 60`, `RESIZE_SAVE_DEBOUNCE_MS = 500`, `PREFERENCE_KEY = "prices.wb.columnWidths"`

**Helper компонент `ColumnResizeHandle`:**
- `<div>` с `absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-50`
- Передаёт `onMouseDown` и `onDoubleClick` наружу
- Tooltip на русском: «Потяните чтобы изменить ширину. Двойной клик — сброс к дефолту.»

**State + resize логика (в `PriceCalculatorTable`):**
- `columnWidths: Record<ColumnKey, number>` — merged из `{...DEFAULT_WIDTHS, ...initialColumnWidths}` (неизвестные ключи игнорируются)
- `saveTimerRef` — debounce таймер
- `resizeStateRef<{key, startX, startWidth}>` — активный drag (не вызывает re-render)
- `rafIdRef` — requestAnimationFrame throttle
- `startResize(e, key)` — mousedown → записать state + добавить глобальные listeners + `cursor: col-resize` + `userSelect: none` на body
- `handleMouseMove(e)` — rAF throttled → обновить только нужный ключ в columnWidths
- `handleMouseUp()` — cleanup listeners + `scheduleSave(current widths)` через функциональный setState
- `resetColumnWidth(key)` — установить `DEFAULT_WIDTHS[key]` + `scheduleSave`
- `scheduleSave(widths)` — debounced 500ms → `await setUserPreference(...)`, toast на ошибке
- `useEffect` cleanup на unmount — clear всех таймеров/listeners/rAF

**Cumulative sticky lefts** (пересчитывается на каждый render):
```ts
const stickyLefts = {
  photo: 0,
  svodka: columnWidths.photo,
  yarlyk: columnWidths.photo + columnWidths.svodka,
  artikul: columnWidths.photo + columnWidths.svodka + columnWidths.yarlyk,
}
```

**Разметка:**
- `<table>`: `table-fixed` + `style={{ width: "max-content", minWidth: "100%" }}`
- `<thead>`:
  - 4 sticky `<th>` (Фото/Сводка/Ярлык/Артикул) с inline `style={{ width, minWidth, left }}`
  - каждый с `ColumnResizeHandle`
  - wrap: `whitespace-normal break-words leading-tight text-[11px]`
  - Артикул с `shadow-[4px_0_6px_-1px_rgba(0,0,0,0.08)]` — визуальный разделитель
  - Далее `SCROLL_COLUMNS.map()` рендерит 27 th с тем же механизмом (Статус цены = `text-left`, остальные = `text-right`)
- `<tbody>` — 4 sticky `<td>` (Фото/Сводка/Ярлык/Артикул):
  - inline `style={{ width, minWidth, left: stickyLefts.KEY }}`
  - `group-hover:bg-muted` (не `/50`) — полная непрозрачность при hover
  - Артикул с тем же shadow что и в th
- Все 27 не-sticky `<td>` (Статус цены + 26 расчётных): добавлен `style={{ width, minWidth }}`, убраны `min-w-[Npx]` классы из className
- `<tr>` остаётся с `hover:bg-muted/50` (row hover прозрачный — это нормально для скроллируемой области)

### Task 4.5 (Addendum): Округление денег и процентов

**Новые helpers:**
- `fmtMoneyInt(n)` — `Math.round(n).toLocaleString("ru-RU", {minimumFractionDigits: 0, maximumFractionDigits: 0})`
- `fmtPctInt(n)` — `${Math.round(n)}%`

**17 денежных колонок** переведены с `fmtMoney` → `fmtMoneyInt`:
sellerPriceBeforeDiscount, sellerPrice, priceAfterWbDiscount, priceAfterClubDiscount, priceAfterWallet, acquiringAmount, commissionAmount, drrAmount, jemAmount, transferAmount, costPrice, defectAmount, deliveryAmount, creditAmount, overheadAmount, taxAmount, profit

**5 процентных колонок** переведены с `fmtPctSimple` → `fmtPctInt`:
sellerDiscountPct, wbDiscountPct, clubDiscountPct, walletPct, drrPct

**НЕ тронуто:**
- `buyoutPct` и `commFbwPct` — остаются `fmtPctSimple` (с десятыми)
- `returnOnSalesPct` и `roiPct` — остаются `fmtPct(..., true)` (со знаком +/−)
- `lib/pricing-math.ts` — расчёт precise, НЕ трогаем
- БД (`AppSetting`, `CalculatedPrice`, `WbCard`) — precision сохраняется

Grep counts подтверждают:
- `fmtMoneyInt` — 18 вхождений (1 definition + 17 uses)
- `fmtPctInt` — 6 вхождений (1 definition + 5 uses)

### Task 4 (частично): Local commit

**Сделано локально:**
- `npx tsc --noEmit` — проходит без ошибок
- `npx prisma validate` — schema valid
- Grep checks на `min-w-[`, `left-[`, `whitespace-nowrap`, `bg-muted/50` — осталась только одна строка `hover:bg-muted/50` на `<tr>` (это ожидаемое, row hover остаётся прозрачным)
- Commit через `gsd-tools commit` с 6 файлами

**Коммит:** `fc270d0`

**НЕ сделано (требует user approval — orchestrator gate):**
- `git push` — НЕ выполнен
- `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"` — НЕ выполнен
- `npx prisma migrate deploy` на VPS — НЕ выполнен
- Верификация на https://zoiten.pro/prices/wb — НЕ выполнена

### Task 5: SKIPPED

Human verification checkpoint — обрабатывается orchestrator.

## Deviations from Plan

### Отклонения

**1. Task 1: миграция создана вручную (не через `prisma migrate dev --create-only`)**

- **Причина:** `prisma migrate dev` требует реального подключения к БД даже с флагом `--create-only` (P1001 error при попытке с fake DATABASE_URL). Проект использует manually-authored миграции с форматом `YYYYMMDD_name` (все предыдущие миграции типа `20260409_prices_wb`, `20260408_pass_number` и т.д.). Это project convention.
- **Решение:** Создал `prisma/migrations/20260410_add_user_preference/migration.sql` вручную по образцу `20260409_prices_wb`.
- **Impact:** Нулевое — содержимое SQL идентично тому, что создал бы `prisma migrate dev`. Валидация `prisma validate` прошла.

**2. Task 3: `thead` колонка «Статус цены» — уточнение**

- **Причина:** В плане было 26 scroll колонок `<th>`, но на самом деле «Статус цены» — это 27-я scroll колонка (итого 27 th в скроллируемой зоне, а не 26). Плана не нарушает, но потребовалось аккуратнее посчитать.
- **Решение:** `SCROLL_COLUMNS` содержит 27 элементов; в рендере добавлен тернарник `key === "status" ? "text-left" : "text-right"` чтобы «Статус цены» остался left-aligned как в исходнике.
- **Impact:** Нулевое — UX сохраняется.

Никаких Rule 1/2/3 автофиксов не понадобилось — план был precise.

## Self-Check: PASSED

**Файлы созданы:**
- FOUND: `app/actions/user-preferences.ts`
- FOUND: `prisma/migrations/20260410_add_user_preference/migration.sql`

**Файлы модифицированы:**
- FOUND: `prisma/schema.prisma` (модель `UserPreference` + `User.preferences`)
- FOUND: `app/(dashboard)/prices/wb/page.tsx` (getUserPreference в Promise.all)
- FOUND: `components/prices/PriceCalculatorTableWrapper.tsx` (initialColumnWidths prop)
- FOUND: `components/prices/PriceCalculatorTable.tsx` (state + resize + wrap + transparency + округление)

**Коммит:**
- FOUND: `fc270d0` — feat(prices-wb): регулируемые ширины столбцов + persist в БД + wrap headers + fix sticky transparency + округление денег

**Проверки:**
- `npx tsc --noEmit` — проходит
- `DATABASE_URL=fake npx prisma validate` — schema valid
- Grep `min-w-[|left-[|whitespace-nowrap|bg-muted/50` — 1 вхождение (ожидаемое `hover:bg-muted/50` на `<tr>`)
- Grep `fmtMoneyInt` — 18 (1 def + 17 use)
- Grep `fmtPctInt` — 6 (1 def + 5 use)

## Awaiting user approval (orchestrator gate)

Для завершения quick требуется:
1. `git push`
2. `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"` (deploy.sh включает `prisma migrate deploy`)
3. Верификация на https://zoiten.pro/prices/wb через Chrome MCP + фидбек пользователя (Task 5)

Deploy safety: проект деплоится в shared production со всеми активными пользователями — поэтому пуш и миграция gated через orchestrator.
