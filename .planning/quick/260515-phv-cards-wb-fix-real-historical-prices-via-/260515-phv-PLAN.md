---
phase: quick-260515-phv
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/wb-api.ts
  - lib/wb-orders-chart.ts
  - app/api/wb-orders-backfill/route.ts
  - tests/wb-card-orders-daily.test.ts
  - tests/wb-orders-chart-fill.test.ts
  - lib/wb-cron-schedule.ts
  - app/api/wb-prices-retroactive-backfill/route.ts
  - components/cards/WbPricesRetroactiveBackfillButton.tsx
  - tests/wb-prices-retro.test.ts
  - app/(dashboard)/cards/wb/page.tsx
autonomous: true
requirements:
  - QUICK-260515-PHV-01
  - QUICK-260515-PHV-02
  - QUICK-260515-PHV-03
  - QUICK-260515-PHV-04

must_haves:
  truths:
    - "fetchOrdersForRange возвращает строки с qty + sellerPrice + buyerPrice (avg по дню, округлённый до целого рубля)"
    - "upsertOrdersDaily пишет sellerPrice и buyerPrice в WbCardOrdersDaily при каждом backfill/cron-проходе"
    - "POST /api/wb-orders-backfill принимает x-cron-secret в дополнение к RBAC — позволяет orchestrator'у запустить re-backfill через curl без браузерной сессии"
    - "Все 2165 строк WbCardOrdersDaily после re-backfill имеют исторические цены, отражающие реальные акции на момент заказа (не сегодняшний снэпшот)"
    - "Кнопка «Backfill цен» и сопутствующие endpoint/helper удалены из проекта"
    - "/cards/wb page.tsx не импортирует и не рендерит WbPricesRetroactiveBackfillButton"
    - "Тесты wb-card-orders-daily.test.ts покрывают агрегацию цен (golden: 2 заказа в день priceWithDisc 5000+5500 → sellerPrice 5250)"
    - "При построении timeseries fillTimeSeries forward-fill'ит sellerPrice/buyerPrice: дни без заказов наследуют последнюю известную цену из дня с заказом; qty=0 не меняется (правда — продаж не было)"
    - "Leading null дни (до первой известной цены) остаются null — никакого backward-fill"
    - "npm test + npx tsc --noEmit + npm run build проходят чисто после удаления тестов и кода"
  artifacts:
    - path: "lib/wb-api.ts"
      provides: "OrdersDailyRow расширен sellerPrice/buyerPrice; fetchOrdersForRange агрегирует priceWithDisc/finishedPrice; upsertOrdersDaily пишет 3 поля"
      contains: "sellerPrice"
    - path: "lib/wb-orders-chart.ts"
      provides: "fillTimeSeries расширен forward-fill loop для sellerPrice/buyerPrice (qty не трогается)"
      contains: "lastBuyer"
    - path: "app/api/wb-orders-backfill/route.ts"
      provides: "POST endpoint с двумя гейтами: x-cron-secret OR requireSection PRODUCTS MANAGE"
      contains: "x-cron-secret"
    - path: "tests/wb-card-orders-daily.test.ts"
      provides: "Тесты агрегации priceWithDisc/finishedPrice + golden assertion 5250"
      contains: "priceWithDisc"
    - path: "tests/wb-orders-chart-fill.test.ts"
      provides: "3 новых теста forward-fill: golden 3 точки, edge-case all null, edge-case last-only no backward-fill"
      contains: "forward-fill"
  key_links:
    - from: "lib/wb-api.ts:fetchOrdersForRange"
      to: "lib/wb-api.ts:upsertOrdersDaily"
      via: "OrdersDailyRow (qty+sellerPrice+buyerPrice)"
      pattern: "sellerPrice"
    - from: "app/api/wb-orders-backfill/route.ts"
      to: "lib/wb-api.ts (fetchOrdersForRange + upsertOrdersDaily)"
      via: "POST handler"
      pattern: "fetchOrdersForRange\\(BACKFILL_START\\)"
    - from: "app/(dashboard)/cards/wb/page.tsx"
      to: "[deleted WbPricesRetroactiveBackfillButton]"
      via: "import removed + JSX removed"
      pattern: "WbPricesRetroactiveBackfillButton"
    - from: "lib/wb-orders-chart.ts:fillTimeSeries"
      to: "result loop forward-fill"
      via: "iterate result[], track lastSeller/lastBuyer, substitute null → lastKnown"
      pattern: "lastBuyer\\s*=|lastSeller\\s*="
---

<objective>
Подтянуть РЕАЛЬНЫЕ исторические цены в WbCardOrdersDaily из WB Statistics Orders API (priceWithDisc → sellerPrice, finishedPrice → buyerPrice) per (nmId, date MSK), пере-backfill'нуть существующие 2165 строк, после чего удалить retroactive backfill button/endpoint/helper — он больше не нужен, потому что цены теперь приходят из самого Orders API, а не вычисляются из сегодняшнего snapshot WbCard.

Плюс: расширить `fillTimeSeries` forward-fill'ом по sellerPrice/buyerPrice — дни без заказов унаследуют последнюю известную цену из предыдущего дня с заказом, чтобы ценовая линия на графике не рвалась («цена же не исчезает, когда нет заказов»).

Purpose: текущий retroactive backfill использует формулу `sellerPrice × (1 − discountWb/100)` от СЕГОДНЯШНИХ WbCard.price + WbCard.discountWb — это даёт неправильные исторические цены (промо-акции на прошлой неделе исчезают). WB Orders API возвращает в каждом заказе priceWithDisc и finishedPrice — реальные цены на момент заказа. Это source of truth. Forward-fill — visual fix: между точками с заказами цена объективно не менялась (предположение), и user видит plateau вместо gap.

Output:
- lib/wb-api.ts: OrdersDailyRow + fetchOrdersForRange + upsertOrdersDaily с поддержкой sellerPrice/buyerPrice
- lib/wb-orders-chart.ts: fillTimeSeries расширен forward-fill loop для sellerPrice/buyerPrice
- app/api/wb-orders-backfill/route.ts: добавлен x-cron-secret гейт (в дополнение к RBAC)
- tests/wb-card-orders-daily.test.ts: расширены 5 существующих кейсов assertions для price aggregation + golden 5250
- tests/wb-orders-chart-fill.test.ts: добавлены 3 теста forward-fill (golden + 2 edge-case)
- Удалены: app/api/wb-prices-retroactive-backfill/, components/cards/WbPricesRetroactiveBackfillButton.tsx, tests/wb-prices-retro.test.ts, computeBuyerPriceRetro из lib/wb-cron-schedule.ts
- app/(dashboard)/cards/wb/page.tsx: import + JSX удалены
- После deploy: orchestrator curl'ом запускает /api/wb-orders-backfill → все 2165 строк перезаписываются реальными ценами; chart показывает plateau между точками вместо gaps
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md
@.planning/STATE.md
@lib/wb-api.ts
@lib/wb-orders-chart.ts
@prisma/schema.prisma
@app/api/wb-orders-backfill/route.ts
@app/api/cron/wb-orders-daily/route.ts
@app/api/cron/wb-prices-daily/route.ts
@lib/wb-cron-schedule.ts
@app/api/wb-prices-retroactive-backfill/route.ts
@components/cards/WbPricesRetroactiveBackfillButton.tsx
@app/(dashboard)/cards/wb/page.tsx
@components/cards/WbCardOrdersChart.tsx
@tests/wb-card-orders-daily.test.ts
@tests/wb-orders-chart-fill.test.ts
@tests/wb-prices-retro.test.ts
@.planning/quick/260515-m5o-cards-wb-expandable-row-4-7-wbcardorders/260515-m5o-SUMMARY.md
@.planning/quick/260515-o4o-cards-wb-expand-v2-2x-narrower-design-po/260515-o4o-SUMMARY.md

<interfaces>
<!-- Из lib/wb-api.ts (line 1261-1372, после quick 260515-m5o) -->

```typescript
export interface OrdersDailyRow {
  nmId: number
  date: Date // 00:00 UTC (Prisma @db.Date нормализует к DATE)
  qty: number
  // НОВОЕ — добавляется в этом плане:
  sellerPrice: number | null
  buyerPrice: number | null
}

export async function fetchOrdersForRange(dateFrom: Date): Promise<OrdersDailyRow[]>
export async function upsertOrdersDaily(rows: OrdersDailyRow[]): Promise<{ upserted: number }>
```

WB Orders API response shape (фактический, верифицирован):
```typescript
{
  nmId?: number
  nm_id?: number
  date?: string          // "2026-05-14T15:00:00" — MSK интерпретация
  isCancel?: boolean
  lastChangeDate?: string
  priceWithDisc: number  // ₽ — цена с учётом скидки продавца (= sellerPrice)
  finishedPrice: number  // ₽ — финальная цена с WB-скидками + СПП (= buyerPrice)
}
```

<!-- Из lib/wb-orders-chart.ts (после quick 260515-o4o) — DayPoint уже расширен.
     В этом плане расширяем сигнатуру fillTimeSeries + добавляем forward-fill. -->

```typescript
export interface DayPoint {
  date: string
  qty: number
  sellerPrice?: number | null // ← добавляется в этом плане (для будущего)
  buyerPrice?: number | null  // ← уже есть, fillTimeSeries уже принимает
}

// fillTimeSeries уже принимает raw rows с buyerPrice. Расширяем:
// 1) raw row также может содержать sellerPrice — прокидываем по аналогии с buyerPrice
// 2) после window-fill — forward-fill loop по обоим полям (qty не трогать)
```

<!-- Из prisma/schema.prisma -->

```prisma
model WbCardOrdersDaily {
  id          Int      @id @default(autoincrement())
  nmId        Int
  date        DateTime @db.Date
  qty         Int
  sellerPrice Int?     // ← уже есть в БД
  buyerPrice  Int?     // ← уже есть в БД
  createdAt   DateTime @default(now())
  @@unique([nmId, date])
  @@index([nmId])
}
```

<!-- Из lib/wb-cron-schedule.ts — оставляем кроме computeBuyerPriceRetro -->

```typescript
export function getMskHHMM(now?: Date): string             // KEEP
export function getMskTodayString(now?: Date): string      // KEEP
export function isValidCronHHMM(value: string): boolean    // KEEP
export function shouldFireCron(args: {...}): boolean       // KEEP
export function computeBuyerPriceRetro(args: {...}): number | null  // ← УДАЛЯЕМ (не нужен)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Extend OrdersDailyRow with price aggregation + x-cron-secret gate + fillTimeSeries forward-fill + tests</name>
  <files>
    lib/wb-api.ts,
    lib/wb-orders-chart.ts,
    app/api/wb-orders-backfill/route.ts,
    tests/wb-card-orders-daily.test.ts,
    tests/wb-orders-chart-fill.test.ts
  </files>
  <behavior>
    - OrdersDailyRow gains sellerPrice + buyerPrice fields (number | null)
    - fetchOrdersForRange: для каждого (nmId, dateKey) собирает qty + arrays priceWithDisc/finishedPrice из non-cancelled orders; возвращает sellerPrice = Math.round(avg priceWithDisc), buyerPrice = Math.round(avg finishedPrice); null если все значения отсутствуют/0
    - upsertOrdersDaily пишет 3 поля (qty + sellerPrice + buyerPrice) и в create, и в update
    - POST /api/wb-orders-backfill: header check x-cron-secret === process.env.CRON_SECRET ИЛИ requireSection("PRODUCTS", "MANAGE") — любой из двух гейтов открывает endpoint (для orchestrator curl + UI button оба работают)
    - fillTimeSeries forward-fill: после построения 28-точечного array — пройти from left to right, трекая lastSeller/lastBuyer. Если sellerPrice/buyerPrice = null → заменить на lastKnown. Leading nulls (до первого ненульного значения) остаются null. qty не трогается.
    - Test «группирует по (nmId, date MSK), фильтрует isCancel»: расширить mock orders priceWithDisc=5000 и priceWithDisc=5500 (одинаковые finishedPrice=3800) для (111, 2026-05-14) → assertion: row.sellerPrice === 5250, row.buyerPrice === 3800
    - Test «обрабатывает snake_case nm_id»: добавить priceWithDisc=1000 finishedPrice=900 → assert sellerPrice=1000 buyerPrice=900
    - Test «date MSK интерпретация»: добавить priceWithDisc=2000 finishedPrice=1500 → assert значения попали в row
    - Test «80k pagination»: оба mock'a включают priceWithDisc=1234 finishedPrice=1000 → assert price aggregation работает через pagination (Math.round(avg) корректен)
    - Test «пустой ответ»: остаётся без изменений (rows=[])
    - НОВЫЙ test case 6: «golden agg: avg priceWithDisc/finishedPrice»: 3 orders в один день priceWithDisc=[5000,5500,6000] finishedPrice=[3800,3850,3900] → assert sellerPrice=5500, buyerPrice=3850 (Math.round)
    - НОВЫЙ test case 7: «null guard: priceWithDisc/finishedPrice отсутствуют или 0 → null»: order без полей или с 0 → row.sellerPrice=null AND row.buyerPrice=null (но qty всё равно увеличивается)
    - НОВЫЙ test (fill): «forward-fill golden: 3 точки с заказами на day-5, day-10, day-20 с разными ценами → дни между ними заполнены последней известной ценой; дни 0..4 = null (нет previous)»
    - НОВЫЙ test (fill): «edge-case all null: ни одной цены вообще → все 28 точек buyerPrice=null, sellerPrice=null (не падает)»
    - НОВЫЙ test (fill): «edge-case last-only: только day-27 имеет цену → days 0..26 остаются null (никакого backward-fill); day-27 = заданная цена»
  </behavior>
  <action>
    **Шаг 1 — lib/wb-api.ts (extend OrdersDailyRow + aggregation logic):**

    1.1. Расширить interface OrdersDailyRow (line ~1261):
    ```typescript
    export interface OrdersDailyRow {
      nmId: number
      date: Date
      qty: number
      sellerPrice: number | null  // NEW
      buyerPrice: number | null   // NEW
    }
    ```

    1.2. В `fetchOrdersForRange` (line ~1274) изменить структуру counts:
    - Заменить `Map<string, { nmId, date, qty }>` на `Map<string, { nmId, date, qty, sellerPrices: number[], buyerPrices: number[] }>`
    - В цикле order parsing (line ~1309-1318): после `o.isCancel` фильтра и `dateKey` extract, читать `o.priceWithDisc` и `o.finishedPrice` (number, optional на uint level); push в массивы только если value `> 0`
    - В type narrowing для orders array (line ~1295-1302): добавить `priceWithDisc?: number` и `finishedPrice?: number` в inline type

    1.3. В финальном map (line ~1332-1336) считать avg:
    ```typescript
    return Array.from(counts.values()).map((r) => ({
      nmId: r.nmId,
      date: new Date(r.date),
      qty: r.qty,
      sellerPrice: r.sellerPrices.length > 0
        ? Math.round(r.sellerPrices.reduce((a, b) => a + b, 0) / r.sellerPrices.length)
        : null,
      buyerPrice: r.buyerPrices.length > 0
        ? Math.round(r.buyerPrices.reduce((a, b) => a + b, 0) / r.buyerPrices.length)
        : null,
    }))
    ```

    1.4. В `upsertOrdersDaily` (line ~1344) изменить create+update передачу:
    ```typescript
    await tx.wbCardOrdersDaily.upsert({
      where: { nmId_date: { nmId: r.nmId, date: r.date } },
      create: { nmId: r.nmId, date: r.date, qty: r.qty, sellerPrice: r.sellerPrice, buyerPrice: r.buyerPrice },
      update: { qty: r.qty, sellerPrice: r.sellerPrice, buyerPrice: r.buyerPrice },
    })
    ```

    **Шаг 2 — lib/wb-orders-chart.ts (forward-fill loop + sellerPrice support):**

    2.1. Расширить interface DayPoint — добавить `sellerPrice?: number | null` (для будущего использования; пока не рендерится в ComposedChart, но семантически нужен):
    ```typescript
    export interface DayPoint {
      date: string
      qty: number
      sellerPrice?: number | null  // NEW
      buyerPrice?: number | null
    }
    ```

    2.2. Расширить сигнатуру `fillTimeSeries`:
    ```typescript
    export function fillTimeSeries(
      raw: Array<{ date: Date; qty: number; sellerPrice?: number | null; buyerPrice?: number | null }>,
      now?: Date,
    ): DayPoint[]
    ```

    2.3. Добавить `sellerByKey` Map параллельно с `priceByKey` (buyerPrice). Логика та же — если `r.sellerPrice != null && r.sellerPrice > 0` → записываем; иначе если ключа ещё нет → null.

    2.4. В финальном `window.map((date) => ({ ... }))` — собрать `result` array с sellerPrice и buyerPrice (получаем `(number | null)`).

    2.5. **Forward-fill loop** — после `result` собран:
    ```typescript
    let lastSeller: number | null = null
    let lastBuyer: number | null = null
    for (const point of result) {
      if (point.sellerPrice != null) {
        lastSeller = point.sellerPrice
      } else if (lastSeller != null) {
        point.sellerPrice = lastSeller
      }
      if (point.buyerPrice != null) {
        lastBuyer = point.buyerPrice
      } else if (lastBuyer != null) {
        point.buyerPrice = lastBuyer
      }
    }
    return result
    ```

    Семантика: дни без заказов наследуют последнюю известную цену из предыдущего дня с заказом. Leading nulls (до первой известной цены) остаются null. **qty НЕ трогается** — на день без заказов qty=0 остаётся (это правда — продаж не было).

    2.6. Обновить header-comment функции — добавить «forward-fill цены для дней без заказов; qty не трогается».

    **Шаг 3 — app/api/wb-orders-backfill/route.ts (add x-cron-secret gate):**

    Заменить блок RBAC (line 21-26) на dual-gate проверку:
    ```typescript
    const cronSecret = req.headers.get("x-cron-secret")
    const isCronAuth = cronSecret && cronSecret === process.env.CRON_SECRET

    if (!isCronAuth) {
      try {
        await requireSection("PRODUCTS", "MANAGE")
      } catch {
        return NextResponse.json({ error: "Нет прав" }, { status: 403 })
      }
    }
    ```

    - Изменить signature `POST()` на `POST(req: NextRequest)`, добавить импорт `NextRequest` из next/server.
    - Логика логирования остаётся.

    **Шаг 4 — tests/wb-card-orders-daily.test.ts (расширить assertions):**

    4.1. В каждый existing test mock добавить `priceWithDisc` + `finishedPrice` в order объектах:
    - Test 1 (line 20-42): orders 111+111 за 2026-05-14 → priceWithDisc=5000 и priceWithDisc=5500 (finishedPrice=3800 у обоих); 222 cancelled — любые; 222 за 2026-05-13 priceWithDisc=1500 finishedPrice=1200. Добавить assertions:
      - row(111, 2026-05-14).sellerPrice === 5250 (avg of 5000+5500 = 5250, round = 5250)
      - row(111, 2026-05-14).buyerPrice === 3800
      - row(222, 2026-05-13).sellerPrice === 1500
      - row(222, 2026-05-13).buyerPrice === 1200

    4.2. Test 2 (snake_case): добавить priceWithDisc=1000 finishedPrice=900; assert row(333).sellerPrice === 1000, row(333).buyerPrice === 900

    4.3. Test 3 (MSK 23:30): добавить priceWithDisc=2000 finishedPrice=1500; assert row(444).sellerPrice === 2000, row(444).buyerPrice === 1500

    4.4. Test 4 (80k pagination): добавить priceWithDisc=1234 finishedPrice=1000 во все 80k объекты first_batch и priceWithDisc=2000 finishedPrice=1700 во второй batch; assert:
      - row(555, 2026-04-10).sellerPrice === 1234 (все одинаковые → avg = 1234)
      - row(555, 2026-04-20).sellerPrice === 2000

    4.5. Test 5 (empty): остаётся без изменений.

    4.6. ДОБАВИТЬ test 6 — golden agg avg:
    ```typescript
    it("aggregates priceWithDisc/finishedPrice as Math.round(avg) per (nmId, date)", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: async () => [
          { nmId: 999, date: "2026-05-14T10:00:00", isCancel: false, priceWithDisc: 5000, finishedPrice: 3800 },
          { nmId: 999, date: "2026-05-14T11:00:00", isCancel: false, priceWithDisc: 5500, finishedPrice: 3850 },
          { nmId: 999, date: "2026-05-14T12:00:00", isCancel: false, priceWithDisc: 6000, finishedPrice: 3900 },
        ],
      }) as any
      const rows = await fetchOrdersForRange(new Date("2026-05-13"))
      const r = rows.find((x) => x.nmId === 999)!
      expect(r.qty).toBe(3)
      expect(r.sellerPrice).toBe(5500)  // avg(5000,5500,6000) = 5500
      expect(r.buyerPrice).toBe(3850)   // avg(3800,3850,3900) = 3850
    })
    ```

    4.7. ДОБАВИТЬ test 7 — null guard:
    ```typescript
    it("returns null prices when priceWithDisc/finishedPrice отсутствуют или 0", async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true, status: 200, headers: new Headers(),
        json: async () => [
          { nmId: 888, date: "2026-05-14T10:00:00", isCancel: false },  // нет полей
          { nmId: 888, date: "2026-05-14T11:00:00", isCancel: false, priceWithDisc: 0, finishedPrice: 0 },
        ],
      }) as any
      const rows = await fetchOrdersForRange(new Date("2026-05-13"))
      const r = rows.find((x) => x.nmId === 888)!
      expect(r.qty).toBe(2)
      expect(r.sellerPrice).toBeNull()
      expect(r.buyerPrice).toBeNull()
    })
    ```

    **Шаг 5 — tests/wb-orders-chart-fill.test.ts (3 новых теста forward-fill):**

    5.1. ДОБАВИТЬ test (forward-fill golden):
    ```typescript
    it("forward-fill: дни без заказов наследуют последнюю известную цену", () => {
      // now = 2026-05-15 → window 2026-04-17 (day 0) .. 2026-05-14 (day 27)
      // Заказы только на day 5 (=2026-04-22), day 10 (=2026-04-27), day 20 (=2026-05-07)
      const ts = fillTimeSeries(
        [
          { date: new Date("2026-04-22"), qty: 1, sellerPrice: 5000, buyerPrice: 3800 },
          { date: new Date("2026-04-27"), qty: 2, sellerPrice: 5500, buyerPrice: 4000 },
          { date: new Date("2026-05-07"), qty: 1, sellerPrice: 6000, buyerPrice: 4500 },
        ],
        now,
      )
      expect(ts.length).toBe(28)

      // days 0..4 (до первой цены) — null
      for (let i = 0; i < 5; i++) {
        expect(ts[i].sellerPrice).toBeNull()
        expect(ts[i].buyerPrice).toBeNull()
      }
      // day 5 — 5000/3800
      expect(ts[5].sellerPrice).toBe(5000)
      expect(ts[5].buyerPrice).toBe(3800)
      // days 6..9 — наследуют 5000/3800 (forward-fill)
      for (let i = 6; i < 10; i++) {
        expect(ts[i].sellerPrice).toBe(5000)
        expect(ts[i].buyerPrice).toBe(3800)
      }
      // day 10 — 5500/4000
      expect(ts[10].sellerPrice).toBe(5500)
      // days 11..19 — наследуют 5500/4000
      for (let i = 11; i < 20; i++) {
        expect(ts[i].sellerPrice).toBe(5500)
        expect(ts[i].buyerPrice).toBe(4000)
      }
      // day 20 — 6000/4500
      expect(ts[20].sellerPrice).toBe(6000)
      // days 21..27 — наследуют 6000/4500
      for (let i = 21; i < 28; i++) {
        expect(ts[i].sellerPrice).toBe(6000)
        expect(ts[i].buyerPrice).toBe(4500)
      }
      // qty НЕ forward-fill'ится: только дни с заказом имеют qty>0
      const qtyByDay = ts.map((p) => p.qty)
      expect(qtyByDay[5]).toBe(1)
      expect(qtyByDay[10]).toBe(2)
      expect(qtyByDay[20]).toBe(1)
      // Сумма qty = 4, не больше (forward-fill ничего не добавил)
      expect(qtyByDay.reduce((s, q) => s + q, 0)).toBe(4)
    })
    ```

    5.2. ДОБАВИТЬ test (edge-case all null):
    ```typescript
    it("forward-fill: все цены null → все точки null (не падает)", () => {
      const ts = fillTimeSeries(
        [
          { date: new Date("2026-05-14"), qty: 1 }, // без cен
          { date: new Date("2026-05-10"), qty: 2, sellerPrice: null, buyerPrice: null },
        ],
        now,
      )
      expect(ts.length).toBe(28)
      for (const p of ts) {
        expect(p.sellerPrice).toBeNull()
        expect(p.buyerPrice).toBeNull()
      }
    })
    ```

    5.3. ДОБАВИТЬ test (edge-case last-only — no backward-fill):
    ```typescript
    it("forward-fill: только day-27 имеет цену → days 0..26 остаются null (нет backward-fill)", () => {
      const ts = fillTimeSeries(
        [{ date: new Date("2026-05-14"), qty: 1, sellerPrice: 5000, buyerPrice: 3800 }],
        now,
      )
      expect(ts.length).toBe(28)
      // days 0..26 — null (нет previous)
      for (let i = 0; i < 27; i++) {
        expect(ts[i].sellerPrice).toBeNull()
        expect(ts[i].buyerPrice).toBeNull()
      }
      // day 27 — заданная цена
      expect(ts[27].sellerPrice).toBe(5000)
      expect(ts[27].buyerPrice).toBe(3800)
    })
    ```

    5.4. **Обновить existing tests на новую сигнатуру:** Существующий test «прокидывает buyerPrice из raw в DayPoint» использует raw rows без sellerPrice — TypeScript должен принять (поле optional). Проверить, что assertions ts[27]/ts[26]/ts[25] остаются валидными — buyerPrice forward-fill'ится. Учитывая что raw row на 2026-05-14 имеет buyerPrice=3817, на 2026-05-13 null, на 2026-05-12 нет cены — ожидание меняется:
      - Раньше: ts[25] (2026-05-12) = null
      - После forward-fill: ts[25] остаётся null (нет previous значения слева — 2026-04-17..2026-05-11 все null)
      - ts[26] (2026-05-13) — input raw имеет explicit null → после forward-fill всё ещё null (нет previous)
      - ts[27] (2026-05-14) — 3817 (есть значение)
      - **Assertions старого теста по факту остаются валидны** — ничего не fwd-fill'ится назад от day 27.

    Запустить локально: `npm run test -- tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts` — все кейсы pass.
  </action>
  <verify>
    <automated>npm test -- tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts tests/wb-orders-chart-msk.test.ts --run</automated>
  </verify>
  <done>
    - OrdersDailyRow содержит sellerPrice + buyerPrice (number | null)
    - fetchOrdersForRange: Math.round(avg) per (nmId, date) по priceWithDisc/finishedPrice; null если все значения отсутствуют
    - upsertOrdersDaily пишет 3 поля в create + update
    - DayPoint расширен sellerPrice; fillTimeSeries принимает raw row с sellerPrice
    - fillTimeSeries forward-fill loop пройден после window-build: дни без price наследуют lastKnown; leading null остаются null; qty не трогается
    - /api/wb-orders-backfill принимает x-cron-secret OR RBAC (любой гейт открывает endpoint)
    - 7 тестов в wb-card-orders-daily.test.ts проходят (5 расширенных + 2 новых)
    - 3 новых теста forward-fill в wb-orders-chart-fill.test.ts проходят (golden + 2 edge-case)
    - npm test (3 файла Verify-команды) проходит чисто, нет regression
  </done>
</task>

<task type="auto">
  <name>Task 2: Cleanup retroactive backfill (delete endpoint+button+helper+test) + remove import/JSX from page + build verify</name>
  <files>
    app/api/wb-prices-retroactive-backfill/route.ts,
    components/cards/WbPricesRetroactiveBackfillButton.tsx,
    tests/wb-prices-retro.test.ts,
    lib/wb-cron-schedule.ts,
    app/(dashboard)/cards/wb/page.tsx
  </files>
  <action>
    **Шаг 1 — Удалить файлы (через PowerShell или git rm):**

    ```powershell
    git rm app/api/wb-prices-retroactive-backfill/route.ts
    git rm components/cards/WbPricesRetroactiveBackfillButton.tsx
    git rm tests/wb-prices-retro.test.ts
    ```

    Если папка `app/api/wb-prices-retroactive-backfill/` опустеет — удалить её тоже (Remove-Item -Path "app/api/wb-prices-retroactive-backfill" -Recurse).

    **Шаг 2 — lib/wb-cron-schedule.ts: удалить функцию computeBuyerPriceRetro:**

    Удалить строки 47-59 (комментарий + function body computeBuyerPriceRetro). Файл должен закончиться функцией shouldFireCron (line 45). СОХРАНИТЬ: isValidCronHHMM, shouldFireCron, getMskHHMM, getMskTodayString.

    **Шаг 3 — app/(dashboard)/cards/wb/page.tsx: удалить импорт + JSX:**

    3.1. Удалить line 8: `import { WbPricesRetroactiveBackfillButton } from "@/components/cards/WbPricesRetroactiveBackfillButton"`

    3.2. Удалить line 180 (внутри `<div className="flex gap-2">` блока — line ~178): `<WbPricesRetroactiveBackfillButton />`

    **Шаг 4 — Grep audit на orphan references:**

    Запустить:
    ```bash
    grep -rn "WbPricesRetroactiveBackfillButton\|wb-prices-retroactive-backfill\|computeBuyerPriceRetro" --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=.next .
    ```

    Ожидается 0 matches (кроме SUMMARY.md/PLAN.md в .planning/quick/260515-o4o*/). Если есть code references — устранить.

    **Шаг 5 — Type-check + build:**

    ```bash
    npx tsc --noEmit
    npm run build
    ```

    Оба должны пройти чисто. Если падает на orphan import — fix.

    **Шаг 6 — Deploy plan (для SUMMARY) — НЕ выполнять в task, только зафиксировать в SUMMARY:**

    После merge:
    1. `git push`
    2. `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"`
    3. Trigger re-backfill через curl:
       ```bash
       curl -X POST https://zoiten.pro/api/wb-orders-backfill \
         -H "x-cron-secret: $(ssh root@85.198.97.89 'cat /etc/zoiten.pro.env | grep CRON_SECRET | cut -d= -f2')"
       ```
       Или, если короче — через SSH напрямую:
       ```bash
       ssh root@85.198.97.89 'source /etc/zoiten.pro.env && curl -X POST http://127.0.0.1:3001/api/wb-orders-backfill -H "x-cron-secret: $CRON_SECRET"'
       ```
       Ожидается ответ: `{ok:true, rowsFetched:~2200, upserted:~2165}`. Логи на сервере: `journalctl -u zoiten-erp -f`.
    4. SQL spot-check на VPS:
       ```sql
       SELECT nm_id, date, qty, "sellerPrice", "buyerPrice"
       FROM "WbCardOrdersDaily"
       WHERE date BETWEEN '2026-04-15' AND '2026-04-20'
       ORDER BY nm_id, date LIMIT 20;
       ```
       Ожидание: sellerPrice/buyerPrice заполнены и НЕ одинаковые для всех дат одного nmId (отражают исторические акции).
    5. Smoke test UI: /cards/wb → expand row → линия buyerPrice на графике в моменты акций должна «опускаться», а не быть плоской; **между точками с заказами линия идёт plateau (forward-fill), а НЕ рвётся**.
  </action>
  <verify>
    <automated>npm test -- --run && npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>
    - Файлы app/api/wb-prices-retroactive-backfill/route.ts, components/cards/WbPricesRetroactiveBackfillButton.tsx, tests/wb-prices-retro.test.ts удалены (git status confirmed deleted)
    - lib/wb-cron-schedule.ts: computeBuyerPriceRetro отсутствует, isValidCronHHMM/shouldFireCron/getMskHHMM/getMskTodayString сохранены
    - app/(dashboard)/cards/wb/page.tsx: import и JSX WbPricesRetroactiveBackfillButton удалены
    - grep on orphan references возвращает 0 в code
    - npm test (полный набор, без удалённого wb-prices-retro.test.ts) — pass
    - npx tsc --noEmit — clean
    - npm run build — clean
    - SUMMARY.md содержит deploy plan со step-by-step curl команд для orchestrator
  </done>
</task>

</tasks>

<verification>
**Полный набор verify-команд после обоих тасков:**

```bash
npm test -- --run
npx tsc --noEmit
npm run build
```

**Узкая проверка целевых тест-файлов:**

```bash
npm test -- tests/wb-card-orders-daily.test.ts tests/wb-orders-chart-fill.test.ts tests/wb-orders-chart-msk.test.ts tests/wb-prices-cron-dispatch.test.ts tests/wb-cron-schedule-validation.test.ts --run
```

Ожидание: 5 файлов, ~30+ assertions (включая 3 новых forward-fill), ALL pass. Тест wb-prices-retro.test.ts удалён — vitest discovery не должен его искать.

**Grep audit:**

```bash
grep -rn "WbPricesRetroactiveBackfillButton\|wb-prices-retroactive-backfill\|computeBuyerPriceRetro" \
  --include='*.ts' --include='*.tsx' --exclude-dir=node_modules --exclude-dir=.next \
  --exclude-dir=.planning .
```

Ожидание: 0 matches.
</verification>

<success_criteria>
- npm test --run проходит чисто (нет regression на полном наборе тестов)
- npx tsc --noEmit + npm run build — clean
- OrdersDailyRow содержит sellerPrice/buyerPrice; fetchOrdersForRange агрегирует priceWithDisc/finishedPrice как Math.round(avg) per (nmId, date MSK)
- fillTimeSeries forward-fill'ит sellerPrice/buyerPrice (leading null остаются null, qty не трогается)
- POST /api/wb-orders-backfill принимает либо x-cron-secret, либо RBAC сессию
- Retroactive backfill button/endpoint/helper/test полностью удалены, нет orphan references
- /cards/wb page не импортирует и не рендерит WbPricesRetroactiveBackfillButton (страница рендерится без ошибки)
- Daily cron wb-orders-daily (delta mode) теперь захватывает priceWithDisc/finishedPrice (т.к. использует те же helpers)
- Daily cron wb-prices-daily НЕ изменён (нужен для дней без заказов + сегодняшний snapshot до 05:10)
- SUMMARY.md содержит step-by-step deploy plan с curl команд для orchestrator re-backfill prod данных (2165 строк → реальные исторические цены); user видит plateau между точками вместо gap
</success_criteria>

<output>
After completion, create `.planning/quick/260515-phv-cards-wb-fix-real-historical-prices-via-/260515-phv-SUMMARY.md` со следующими секциями:
- Что сделано (расширение OrdersDailyRow + dual gate + forward-fill в fillTimeSeries + cleanup)
- Файлы изменены / удалены / добавлены (с line counts)
- Test coverage (7 кейсов в wb-card-orders-daily.test.ts + 3 forward-fill в wb-orders-chart-fill.test.ts, минус удалённый wb-prices-retro.test.ts)
- Deploy plan — точные curl команды для orchestrator (push + ssh deploy.sh + curl backfill + SQL spot-check + UI smoke)
- Ожидаемый prod-эффект: после re-backfill все 2165 строк имеют исторические цены, на /cards/wb chart линия buyerPrice показывает реальные провалы во время акций; между точками — plateau (forward-fill), не gap
- Key decisions: avg per day (safe для intraday промо), x-cron-secret as второй гейт (не replace RBAC), keep wb-prices-daily cron (для дней без заказов), forward-fill only (no backward-fill — leading null = «цены ещё не было»)
</output>
