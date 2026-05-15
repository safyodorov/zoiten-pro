# Quick Task 260515-m5o: /cards/wb expandable row + WbCardOrdersDaily — Research

**Researched:** 2026-05-15
**Domain:** Next.js 15 RSC + Prisma 6 + WB Statistics Orders API + chart UI
**Confidence:** HIGH (всё подтверждено существующим кодом + офиц. WB docs)

## Summary

Все строительные блоки уже есть в проекте — задача в основном сборочная:

- **WB Orders API:** уже вызывается через `fetchOrdersPerWarehouse()` для 7-дневного окна. Тот же endpoint покроет и backfill (с 2026-04-01) и daily delta (за вчера). `wbFetch` + per-bucket cooldown (`statistics-orders`) + `WbRateLimitError` уже работают.
- **Cron:** в проекте 6 рабочих cron endpoints с одинаковым паттерном (`x-cron-secret` header → `process.env.CRON_SECRET`). systemd timer уже используется для bozon/cantonfair. Новый endpoint — копия `/api/cron/purge-deleted` + бизнес-логика.
- **Chart:** recharts 3.8.1 (latest, опубликован март 2025) официально декларирует React 19 в peerDependencies — установка без `--legacy-peer-deps` и без overrides.
- **Expandable row:** в проекте пока нет inline-expand паттерна в data-таблицах (StockWbTable раскрывает только колонки, не строки). Нужен новый паттерн — но с учётом sticky header он простой: `<tr>` под основной row с `colSpan={N}`, single-open state в parent.
- **Prisma migration:** 50 миграций в проекте, паттерн «вручную писать `migration.sql` без shadow-DB локально → применять через `prisma migrate deploy` на VPS в deploy.sh» устоялся.

**Primary recommendation:** Эндпоинт `fetchOrdersPerWarehouse` уже умеет всё, что нужно — расширить его (или сделать тонкий новый helper `fetchOrdersForBackfill(dateFrom, dateTo?)`) и обернуть upsert по `(nmId, date)` в transaction. Recharts через `npx shadcn@latest add chart bar-chart` для UI. Cron — копия `purge-deleted` route.

## User Constraints (from CONTEXT.md)

### Locked Decisions

- **Source API:** `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom={YYYY-MM-DD}T00:00:00`. НЕ Sales API, НЕ Analytics nm-report.
- **Группировка на нашей стороне:** `GROUP BY (nmId, date::date)`, `COUNT(*) WHERE isCancel = false`.
- **Backfill:** одноразово с `dateFrom = 2026-04-01`. Идемпотентно через `@@unique([nmId, date])`.
- **MSK timezone:** дата группировки — в МСК, не UTC.
- **График:** 28 столбцов, от `today - 28` до `today - 1` (вчера). Дни без заказов → qty=0 fill на сервере.
- **Daily cron:** 05:00 МСК, защищён `CRON_SECRET`.
- **Schema:** `WbCardOrdersDaily(id, nmId, date @db.Date, qty, createdAt)` + `@@unique([nmId, date])` + `@@index([nmId])` + `@@index([date])`. Расширяемая (future: sumRub, returnsQty).

### Claude's Discretion (планировщик выбирает)

- UI способ раскрытия (inline expand row, single-open).
- Chart library — рекомендация ниже **recharts**.
- Cron реализация — рекомендация ниже **systemd timer + curl на endpoint** (паттерн уже устоявшийся в проекте).
- Auto-backfill при пустой таблице vs. отдельная кнопка — рекомендация **обе**: cron сам инициирует backfill если qty=0 rows; ручная кнопка для пересинхрона.

### Deferred Ideas

- Дополнительные поля schema (sumRub, returnsQty, cancelQty) — расширение в будущих фазах.

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| M5O-01 | Новая таблица `WbCardOrdersDaily` + миграция | Prisma 6 + ручной migration.sql (паттерн проекта, см. §Prisma Migration Pattern) |
| M5O-02 | Backfill с 2026-04-01 через Statistics Orders API | `fetchOrdersPerWarehouse`-style + upsert по `(nmId, date)` |
| M5O-03 | Daily cron 05:00 МСК | systemd timer + curl + CRON_SECRET (копия паттерна `/api/cron/purge-deleted`) |
| M5O-04 | Expandable row в `/cards/wb` с bar chart + 2 числами | recharts BarChart + single-open state в parent, motion для анимации |

## Standard Stack

### Core (already installed)

| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.5.14 | Framework | Существует |
| Prisma | 6.19.3 | ORM | Существует |
| motion | 12.38.0 | Анимация expand | Уже импортируется в `components/landing/*`, `components/prices/PromoTooltip.tsx` — путь `motion/react` |
| sonner | 2.0.7 | Toasts | Существует |

### New dependency

| Library | Version | Install | Why |
|---------|---------|---------|-----|
| recharts | 3.8.1 (npm registry verified 2026-05-15) | `npm i recharts` | Latest stable, peerDeps `react ^16-^19` — нет override needed |

**peerDependencies recharts@3.8.1:**
```
react:     ^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0
react-dom: ^16.0.0 || ^17.0.0 || ^18.0.0 || ^19.0.0
react-is:  ^16.8.0 || ^17.0.0 || ^18.0.0 || ^19.0.0
```

shadcn-charts wrapper (`npx shadcn@latest add chart`) добавит `components/ui/chart.tsx` с `<ChartContainer>`, `<ChartTooltip>`, `<ChartTooltipContent>` — это просто типизированные обёртки над recharts, не lock-in. **Рекомендуется** для стилистической консистентности с остальным проектом.

### Alternatives Considered

| Instead of recharts | Could Use | Tradeoff |
|------------|-----------|----------|
| recharts (SVG via D3) | Pure inline `<svg>` 28 `<rect>` | Меньше bundle (~0kb), но придётся вручную писать tooltip, hover, axis. 28 баров — небольшая задача, но потом захочется line chart / pie → лучше сразу recharts. |
| recharts | nivo / visx / chart.js | recharts + shadcn-charts — устоявшийся combo для shadcn-проектов; для одного маленького chart выбор лишний. |

## Architecture Patterns

### Расположение нового кода

```
prisma/
└── migrations/
    └── 20260515_wb_card_orders_daily/
        └── migration.sql                  # NEW (ручная)
prisma/schema.prisma                       # +model WbCardOrdersDaily
lib/
└── wb-api.ts                              # +fetchOrdersForRange(dateFrom, dateTo?)
                                           # +upsertOrdersDaily(rows: {nmId, date, qty}[])
                                           #  - reuses wbFetch + statistics-orders cooldown bucket
app/api/cron/
└── wb-orders-daily/
    └── route.ts                           # NEW — GET, x-cron-secret, runs backfill+delta
app/(dashboard)/cards/wb/
└── page.tsx                               # +query WbCardOrdersDaily per visible nmId
                                           #  +pass ordersTimeSeries[] prop в WbCardsTable
components/cards/
├── WbCardsTable.tsx                       # +expand state (single-open) + onClick row + expanded <tr>
└── WbCardOrdersChart.tsx                  # NEW — recharts BarChart + 2 числа
components/ui/
└── chart.tsx                              # NEW (npx shadcn@latest add chart)
```

### Pattern 1: WB Orders API call с группировкой в МСК

WB endpoint возвращает индивидуальные заказы. Группируем на нашей стороне.

**ВАЖНЫЕ детали WB Orders API (подтверждены офиц. docs + existing code в `lib/wb-api.ts:1083-1184`):**

- URL: `GET https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom={ISO}&flag=0`
- `dateFrom` без `Z` → MSK timezone (UTC+3). С `Z` → UTC. Используем без `Z` для простоты.
- **Pagination quirk:** на `flag=0` WB ставит soft-limit **80 000 строк per response**. Если ответ >= 80k → нужно повторить запрос с `dateFrom = lastChangeDate последней строки`. Для 45-дневного backfill у Zoiten это вряд ли превысит лимит, но **safety check обязателен**: если `response.length === 80_000` → итерируем с `dateFrom = orders[orders.length-1].lastChangeDate`.
- `rrdid` к Orders **не применяется** — это поле есть в `/api/v5/supplier/reportDetailByPeriod` (отчёт по реализации), не в Orders. CONTEXT.md упоминал rrdid осторожно — на практике для Orders pagination идёт через `lastChangeDate`.
- Поле `date`: ISO без TZ = MSK локальное время (см. комментарий `fetchAvgSalesSpeed7d:1226-1232` в `lib/wb-api.ts`).
- `isCancel: boolean` — фильтр на нашей стороне.
- `nmId` (camelCase) — основное поле; в редких случаях встречается `nm_id` (snake_case) — оба варианта обрабатываются в `fetchOrdersPerWarehouse:1136`.

**Rate limit:** Statistics Orders bucket — ~1 req/min per токен. `wbFetch("Orders API", ...)` уже бросает `WbRateLimitError` с `retryAfterSec` из `X-Ratelimit-Retry`. Для backfill — один запрос покрывает 45 дней одним вызовом (один HTTP); для daily cron — тоже один запрос за вчера. Никаких циклов с pauses не нужно если не упёрлись в 80k.

**Группировка в МСК:**
```typescript
// MSK сдвиг: UTC + 3ч
function dateKeyMsk(iso: string): string {
  // WB возвращает ISO без TZ = уже MSK локальное → берём YYYY-MM-DD префикс
  return iso.slice(0, 10)
}
const counts = new Map<string, number>() // key = `${nmId}::${YYYY-MM-DD}`
for (const o of orders) {
  if (o.isCancel) continue
  const nm = o.nmId ?? o.nm_id
  if (nm == null || !o.date) continue
  const key = `${nm}::${dateKeyMsk(o.date)}`
  counts.set(key, (counts.get(key) ?? 0) + 1)
}
```

### Pattern 2: Idempotent upsert через compound unique

Prisma 6 + PostgreSQL поддерживает `upsert` по compound unique key (`@@unique([nmId, date])`):

```typescript
// Не используем createMany({ skipDuplicates: true }) — при backfill rerun нужно
// перезаписать qty (вдруг WB пересчитал), а skipDuplicates пропустит.
// Используем upsert в transaction (для 45 дней × ~100 nmId = 4500 строк это OK).
await prisma.$transaction(
  rows.map((r) =>
    prisma.wbCardOrdersDaily.upsert({
      where: { nmId_date: { nmId: r.nmId, date: r.date } },
      create: r,
      update: { qty: r.qty },
    })
  ),
  { timeout: 60_000 }
)
```

Для backfill (~4500 строк) альтернатива через raw SQL `INSERT ... ON CONFLICT (nmId, date) DO UPDATE SET qty = EXCLUDED.qty` будет быстрее — но в проекте подобный объём + явный паттерн `tx.X.upsert` в loop устоявшийся (см. `app/api/wb-sync/route.ts:418-435`). Берём знакомый паттерн.

### Pattern 3: Expandable row под кликнутой строкой

Sticky header сохраняется автоматически — он на `<thead>`, expand добавляет `<tr>` в `<TableBody>`. Single-open state живёт в parent client component.

```tsx
const [expandedId, setExpandedId] = useState<string | null>(null)

// В рендере rows:
cards.map((card) => (
  <Fragment key={card.id}>
    <TableRow
      onClick={() => setExpandedId(expandedId === card.id ? null : card.id)}
      className={cn(
        "cursor-pointer hover:bg-muted/30",
        expandedId === card.id && "bg-muted/50",
        selected.has(card.id) && "bg-muted/50"
      )}
    >
      {/* существующие 19 cells */}
      {/* В каждом cell с интерактивом — onClick с e.stopPropagation():
          - чекбокс уже в <Checkbox onCheckedChange={() => toggleSelect()}/> — он гасит event
          - артикул-cell уже имеет stopPropagation на line 393
          - название tooltip — render={<div className="truncate cursor-default" />} — без onClick
          ВСЕ кликабельные элементы внутри row уже изолированы. */}
    </TableRow>
    {expandedId === card.id && (
      <TableRow>
        <TableCell colSpan={19} className="bg-muted/20 p-0">
          <AnimatePresence>
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <WbCardOrdersChart nmId={card.nmId} timeSeries={ordersTimeSeries[card.nmId] ?? []} />
            </motion.div>
          </AnimatePresence>
        </TableCell>
      </TableRow>
    )}
  </Fragment>
))
```

**Важно:** `colSpan={19}` должен соответствовать кол-ву `<TableHead>` (сейчас 19 в WbCardsTable). Если меняется — обновляем в обоих местах.

**Импорт `motion`:** `import { motion, AnimatePresence } from "motion/react"` — паттерн проекта.

### Pattern 4: Cron via systemd timer + endpoint

Существующий паттерн (verified, см. `app/api/cron/purge-deleted/route.ts`):

```typescript
// app/api/cron/wb-orders-daily/route.ts
import { NextRequest, NextResponse } from "next/server"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    const result = await syncWbOrdersDaily()
    return NextResponse.json({ ok: true, ...result })
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 })
  }
}
```

systemd unit на VPS (`/etc/systemd/system/zoiten-wb-orders.{timer,service}`):

```ini
# .timer
[Unit]
Description=Zoiten WB orders daily sync (05:00 MSK)

[Timer]
OnCalendar=*-*-* 05:00:00 Europe/Moscow
Persistent=true

[Install]
WantedBy=timers.target

# .service
[Unit]
Description=Zoiten WB orders daily sync runner
After=network.target

[Service]
Type=oneshot
EnvironmentFile=/etc/zoiten.pro.env
ExecStart=/usr/bin/curl -fsS -X GET -H "x-cron-secret: ${CRON_SECRET}" http://localhost:3001/api/cron/wb-orders-daily
```

`Persistent=true` — если VPS лежал в 05:00, выполнит при подъёме (важно для daily sync).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WB Orders API call | Свой fetch с retry на 429 | `wbFetch("Orders API", url, ...)` из `lib/wb-api.ts:741` | Уже умеет per-bucket cooldown (statistics-orders) + `WbRateLimitError` с `retryAfterSec` |
| Group orders by date | Свой парсер ISO с TZ math | `iso.slice(0, 10)` — WB возвращает уже MSK | Проверено в `fetchAvgSalesSpeed7d:1227-1231`. Никаких `new Date()` + `.getTimezoneOffset()` — на сервере процесс может быть в любом TZ |
| Bar chart | Inline SVG `<rect>` | recharts `<BarChart>` | 28 баров с tooltip + axis + responsive — recharts даёт всё из коробки, bundle небольшой |
| Cron scheduler | node-cron внутри Next.js | systemd timer + curl на endpoint | Соответствует паттерну проекта (6 существующих cron routes), не блокирует Node.js процесс, persistent на reboot |
| Auth для cron endpoint | Открытый endpoint / IP-whitelist | `x-cron-secret` header + `process.env.CRON_SECRET` | Уже используется в 6 cron endpoints, secret в `/etc/zoiten.pro.env` |
| Idempotent backfill | `createMany({ skipDuplicates: true })` | `upsert` по `nmId_date` compound unique | skipDuplicates НЕ обновляет qty если повторный backfill вернёт другое число (например WB пересчитал); upsert обновляет |
| Авторазвал dates 28 дней | Manual loop по `new Date(...)` | Helper `getLast28Days(): Date[]` → fill missing с qty=0 на сервере | Чтобы chart всегда показывал 28 баров (включая пустые) и не зависел от того, какие даты в БД |

## Common Pitfalls

### Pitfall 1: WB Orders API 80k row limit

**What goes wrong:** Backfill с 2026-04-01 (~45 дней) теоретически может вернуть >80k заказов если объём продаж большой. WB обрезает ответ на 80k без явного сигнала — endpoint возвращает массив, и `length === 80_000` это единственный признак.

**How to avoid:** После первого fetch'а — проверить `if (orders.length >= 80_000)` → продолжить итерацию с `dateFrom = orders[orders.length-1].lastChangeDate`. Объединить массивы, dedup по `srid` (если нужно — для счётчика per `(nmId, date)` дубликаты по srid не страшны, но всё же).

**For Zoiten:** При текущем объёме (~267 карточек, обычно 100-300 заказов/день) 45 дней дают ~10k строк — лимит не достигнут. Но safety check необходим.

### Pitfall 2: MSK vs UTC дрейф «сегодняшней даты»

**What goes wrong:** На сервере (VPS Europe/Moscow или UTC?) `new Date().toISOString().split("T")[0]` даст UTC дату. При cron'е в 05:00 MSK (= 02:00 UTC) `today` будет уже текущий день в обоих TZ, но если cron запустится в 00:30 MSK (= 21:30 UTC вчера) — даты разойдутся.

**How to avoid:** Использовать паттерн `lib/wb-api.ts:1227`:
```typescript
const mskNow = new Date(Date.now() + 3 * 3600_000)
const yy = mskNow.getUTCFullYear()
const mm = String(mskNow.getUTCMonth() + 1).padStart(2, "0")
const dd = String(mskNow.getUTCDate()).padStart(2, "0")
const todayMsk = `${yy}-${mm}-${dd}`
```

**Warning signs:** Если первый бар графика (= today-28) сдвигается на 1 день при разных запусках.

### Pitfall 3: Сегодняшний день в графике (неполные данные)

**What goes wrong:** Если включить today в 28-дневное окно — последний бар будет занижен (день ещё не закончился). Cron на 05:00 МСК пишет за вчера — но если пользователь смотрит страницу в 03:00 МСК, в БД ещё нет данных за вчера, а сегодняшний день вообще не должен попадать.

**How to avoid:** Окно `[today - 28, today - 1]` — последний полный день = вчера (CONTEXT.md §График).

### Pitfall 4: Click bubbling в expand row

**What goes wrong:** Клик по чекбоксу / артикулу / tooltip раскроет/закроет row, что неожиданно. В WbCardsTable уже есть `<Checkbox onCheckedChange={...}>` (event isolated) и `<TableCell onClick={(e) => { e.stopPropagation(); ... }}>` на line 392-395 (артикул copy).

**How to avoid:** Проверить ВСЕ интерактивные элементы внутри row после добавления `<TableRow onClick>`:
- `<Checkbox>` — base-ui сам гасит, OK.
- `<Tooltip>` (название) — `TooltipTrigger render={<div className="cursor-default" />}` — без onClick, OK, но клик по нему всё равно поднимется в `<TableRow>`. Раскрытие при клике на название — приемлемо (это сама цель), но проверить что tooltip не мерцает.
- Артикул cell на line 390-399 — уже имеет `stopPropagation`, OK.
- `<Video />` cell — нет onClick, OK.

Добавить `cursor-pointer` на `<TableRow>` для визуальной подсказки.

### Pitfall 5: Sticky header при expand

**What goes wrong:** Если новая `<tr>` имеет `z-index` или `position: relative` — может перекрыть sticky header при scroll.

**How to avoid:** Sticky уже работает: `<TableHead className="sticky top-0 z-20 ...">` имеет z-20. Expanded `<tr>` — обычный flow, без `position`, без `z-index`. Не трогать.

### Pitfall 6: Prisma `@db.Date` vs `DateTime`

**What goes wrong:** В Prisma `@db.Date` маппится на PostgreSQL `date` (только дата, без времени). При insert с `new Date()` — Prisma usually нормализует, но при чтении через `findMany` поле возвращается как `Date` объект с временем 00:00 в UTC. Сравнения `date >= today` могут давать off-by-1 из-за TZ.

**How to avoid:** При записи передавать `new Date("2026-05-15")` (без времени). При чтении и группировке для chart — конвертировать обратно в YYYY-MM-DD string. Тест-кейс в Wave 0: backfill → дата 2026-05-14 → найти запись `findFirst({ where: { date: new Date("2026-05-14") } })`.

## Prisma Migration Pattern (проект-специфика)

50 миграций в проекте, все следуют одному паттерну:

1. **Локально:** `prisma migrate dev` НЕ запускается (нет локальной PG).
2. Создать директорию вручную: `prisma/migrations/20260515_wb_card_orders_daily/migration.sql`.
3. Написать SQL вручную (CREATE TABLE / CREATE INDEX).
4. Обновить `schema.prisma` с новой моделью.
5. `npx prisma generate` локально → проверить компиляция типов.
6. На VPS: `bash deploy.sh` → `prisma migrate deploy` применяет миграцию.

**Пример SQL** (~30 line, копировать стиль `20260515_wb_card_soft_delete/migration.sql`):

```sql
-- 2026-05-15 (quick 260515-m5o): WbCardOrdersDaily — snapshot заказов per nmId per day.
-- Daily cron 05:00 MSK пишет данные за вчера; одноразовый backfill с 2026-04-01.

CREATE TABLE "WbCardOrdersDaily" (
  "id"        SERIAL PRIMARY KEY,
  "nmId"      INTEGER NOT NULL,
  "date"      DATE NOT NULL,
  "qty"       INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "WbCardOrdersDaily_nmId_date_key" ON "WbCardOrdersDaily"("nmId", "date");
CREATE INDEX "WbCardOrdersDaily_nmId_idx" ON "WbCardOrdersDaily"("nmId");
CREATE INDEX "WbCardOrdersDaily_date_idx" ON "WbCardOrdersDaily"("date");
```

**Проверка соответствия Prisma schema vs migration.sql** — после `prisma generate` Prisma не валидирует что миграция применима к schema. Несоответствие обнаружится только на VPS при `migrate deploy`. Решение: писать SQL точно по generated Prisma SQL (можно временно `prisma migrate dev --create-only` в Docker если есть). В проекте это делается «на глаз» — проверить наличие всех `@@unique` / `@@index` декларированных в schema → как `CREATE INDEX` в SQL.

## Code Examples

### Helper: fetch orders за период

```typescript
// lib/wb-api.ts (новая функция)

export interface OrdersDailyRow {
  nmId: number
  date: Date    // только дата (00:00 MSK)
  qty: number
}

/** Получить заказы WB за период [dateFrom, dateTo?] и сгруппировать по (nmId, date MSK).
 *  isCancel=true исключаются.
 *  При response.length >= 80_000 — итерируем с lastChangeDate.
 */
export async function fetchOrdersForRange(
  dateFrom: Date,
  dateTo?: Date,
): Promise<OrdersDailyRow[]> {
  const token = await getToken()
  const counts = new Map<string, { nmId: number; date: string; qty: number }>()
  let currentDateFrom = dateFrom.toISOString().split(".")[0] // "2026-04-01T00:00:00"

  while (true) {
    const url =
      `https://statistics-api.wildberries.ru/api/v1/supplier/orders` +
      `?dateFrom=${encodeURIComponent(currentDateFrom)}&flag=0`

    const res = await wbFetch("Orders API (backfill)", url, {
      headers: { Authorization: token },
    })
    if (!res.ok) {
      const text = await res.text()
      throw new Error(`WB Orders API ${res.status}: ${text}`)
    }
    const orders = (await res.json()) as Array<{
      nmId?: number
      nm_id?: number
      date?: string
      isCancel?: boolean
      lastChangeDate?: string
    }>
    if (!Array.isArray(orders) || orders.length === 0) break

    for (const o of orders) {
      if (o.isCancel) continue
      const nm = o.nmId ?? o.nm_id
      if (nm == null || !o.date) continue
      const dateKey = o.date.slice(0, 10) // YYYY-MM-DD MSK
      // Фильтруем по dateTo если задано
      if (dateTo && new Date(dateKey) > dateTo) continue
      const k = `${nm}::${dateKey}`
      const existing = counts.get(k)
      if (existing) existing.qty++
      else counts.set(k, { nmId: nm, date: dateKey, qty: 1 })
    }

    // 80k limit check — продолжаем pagination
    if (orders.length >= 80_000) {
      const last = orders[orders.length - 1]
      if (!last.lastChangeDate) break
      currentDateFrom = last.lastChangeDate
      continue
    }
    break
  }

  return Array.from(counts.values()).map((r) => ({
    nmId: r.nmId,
    date: new Date(r.date), // 00:00 UTC, Prisma @db.Date нормализует
    qty: r.qty,
  }))
}
```

### Chart component

```tsx
// components/cards/WbCardOrdersChart.tsx
"use client"
import { BarChart, Bar, XAxis, ResponsiveContainer, Tooltip } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart"

interface DayPoint { date: string; qty: number }
interface Props { nmId: number; timeSeries: DayPoint[] }

export function WbCardOrdersChart({ nmId, timeSeries }: Props) {
  // timeSeries уже filled с 28 точек на сервере (включая дни с qty=0)
  const last7 = timeSeries.slice(-7)
  const avg7d = last7.reduce((s, d) => s + d.qty, 0) / 7
  const avg30d = timeSeries.reduce((s, d) => s + d.qty, 0) / timeSeries.length

  return (
    <div className="p-4 grid grid-cols-[1fr_auto] gap-6">
      <ChartContainer config={{ qty: { label: "Заказы", color: "hsl(var(--primary))" } }} className="h-40 w-full">
        <BarChart data={timeSeries}>
          <XAxis dataKey="date" tickFormatter={(s) => s.slice(5)} fontSize={10} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="qty" fill="var(--color-qty)" radius={2} />
        </BarChart>
      </ChartContainer>
      <div className="flex flex-col gap-3 text-sm">
        <div>
          <div className="text-muted-foreground text-xs">За месяц</div>
          <div className="text-lg font-medium">{avg30d.toFixed(1)} / день</div>
        </div>
        <div>
          <div className="text-muted-foreground text-xs">За 7 дней</div>
          <div className="text-lg font-medium">{avg7d.toFixed(1)} / день</div>
        </div>
      </div>
    </div>
  )
}
```

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| recharts | Bar chart | ✗ (need install) | 3.8.1 | inline SVG |
| systemd | cron timer (VPS) | ✓ | already used | — |
| WB_API_TOKEN | Statistics API | ✓ | scope bit 6 (Stats) | — |
| CRON_SECRET | cron auth | ✓ | в `/etc/zoiten.pro.env` | — |
| PostgreSQL `date` type | `@db.Date` | ✓ | PG 16 | — |

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.1.4 |
| Config file | `vitest.config.ts` (root, alias `@` → project root) |
| Quick run command | `npm run test -- tests/wb-card-orders-daily.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| M5O-01 | Schema applies cleanly (миграция SQL валидна) | manual-only (нет локальной PG) | через deploy.sh на VPS | ❌ — verify via prod migrate deploy |
| M5O-02 | `fetchOrdersForRange` группирует по (nmId, date MSK), исключает isCancel | unit | `vitest tests/wb-card-orders-daily.test.ts` | ❌ Wave 0 |
| M5O-02 | 80k pagination iterates with lastChangeDate | unit (mocked fetch) | same file | ❌ Wave 0 |
| M5O-03 | Cron endpoint 401 без x-cron-secret, 200 c корректным | unit + integration | `vitest tests/wb-orders-daily-cron.test.ts` | ❌ Wave 0 |
| M5O-04 | Bar chart: 28 баров, дни без заказов с qty=0 | unit (pure helper getLast28Days + fillTimeSeries) | `vitest tests/wb-orders-chart-fill.test.ts` | ❌ Wave 0 |
| M5O-04 | Expand state: single-open, click-toggle | manual UAT | визуальная проверка | manual |

### Sampling Rate
- **Per task commit:** `npm run test -- tests/wb-card-orders-daily.test.ts`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green + UAT раскрытия row на проде после deploy + миграция применена.

### Wave 0 Gaps
- [ ] `tests/wb-card-orders-daily.test.ts` — golden test группировки + isCancel фильтр + MSK TZ + 80k pagination (mocked fetch)
- [ ] `tests/wb-orders-chart-fill.test.ts` — fill missing days с qty=0 (pure helper)
- [ ] `prisma/migrations/20260515_wb_card_orders_daily/migration.sql` — ручная миграция
- [ ] systemd unit files в `deploy/` или DEPLOY.md дописать

## Open Questions

1. **Backfill: автомат vs ручная кнопка?**
   - CONTEXT.md рекомендует оба. Cron при пустой `WbCardOrdersDaily` сам запускает backfill (idempotent через upsert). Кнопка «Backfill заказов» в шапке — для re-run.
   - Recommendation: реализовать оба, кнопка — `POST /api/wb-orders-backfill` (auth = session, `requireSection("CARDS", "MANAGE")`).

2. **Хранить qty=0 строки в БД?**
   - CONTEXT.md: «Дни без заказов — отдельных записей в БД нет (только дни с qty > 0 пишем)».
   - Recommendation: следуем CONTEXT — экономия места. Fill в JS на сервере при сборке `timeSeries[]` для chart.

3. **Что показывать если карточка появилась после 2026-04-01?**
   - Recommendation: те дни до появления nmId — qty=0 в графике. Это естественное поведение fill missing days.

## Sources

### Primary (HIGH confidence — verified)
- `lib/wb-api.ts:1083-1184` — `fetchOrdersPerWarehouse` (existing pattern для тех же данных)
- `lib/wb-api.ts:1188-1254` — `fetchAvgSalesSpeed7d` (паттерн TZ MSK)
- `lib/wb-api.ts:741-763` — `wbFetch` + per-bucket cooldown + `WbRateLimitError`
- `app/api/cron/purge-deleted/route.ts` — cron endpoint pattern с `x-cron-secret`
- `app/api/wb-sync/route.ts:494-585` — pattern transaction + upsert цикл
- `components/cards/WbCardsTable.tsx` — целевой компонент, sticky header, click handlers
- `prisma/migrations/20260515_wb_card_soft_delete/migration.sql` — ручная миграция style guide

### Primary (HIGH confidence — external)
- npm `recharts@3.8.1` peerDependencies → `react ^16-^19` (verified via `npm view`)
- WB Statistics API official docs (через WebSearch): `/api/v1/supplier/orders`, flag=0, 80k row soft limit, `lastChangeDate` для pagination, поля `nmId/srid/isCancel/date`

### Secondary (MEDIUM confidence)
- [shadcn React 19 compatibility](https://ui.shadcn.com/docs/react-19) — официальная страница совместимости
- [recharts releases](https://github.com/recharts/recharts/releases) — versions log
- [WB Reports docs](https://dev.wildberries.ru/en/docs/openapi/reports) — Orders endpoint reference

### Tertiary (LOW confidence — required prod validation)
- 80k row pagination для backfill 45 дней — для Zoiten объёма не достигнем, но safety check добавлен.
- WB endpoint может не возвращать 4 недели за один запрос если объём заказов огромный — на проде verify первым запуском backfill.

## Metadata

**Confidence breakdown:**
- WB API + endpoint: **HIGH** — endpoint уже используется в проекте, паттерны проверены
- Recharts compat: **HIGH** — verified peerDependencies через npm registry
- Cron pattern: **HIGH** — 6 идентичных cron endpoints уже работают
- Migration pattern: **HIGH** — 50 ручных миграций в проекте, стиль устоявшийся
- Expand row UX: **MEDIUM** — паттерн новый для проекта, но прямолинеен; UAT покажет
- 80k pagination в проде: **MEDIUM** — теоретически возможно, на практике маловероятно для Zoiten

**Research date:** 2026-05-15
**Valid until:** ~2026-08-15 (3 месяца — WB API относительно стабилен, recharts тоже)
