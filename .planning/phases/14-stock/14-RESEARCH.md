# Phase 14: Управление остатками — Research

**Researched:** 2026-04-21
**Domain:** WB Analytics API (per-warehouse stocks) + Excel import + sticky-table + URL state + stock math
**Confidence:** HIGH

---

## Резюме

Phase 14 строится полностью на паттернах уже реализованных фаз — новых внешних зависимостей нет. Единственная реально новая область — новый endpoint WB Analytics API `POST /api/analytics/v1/stocks-report/wb-warehouses` (запущен 2026-03-23), который заменяет устаревший Statistics API `/api/v1/supplier/stocks` (sunset 2026-06-23). Endpoint требует токен типа Personal или Service со scope Аналитика — существующий `WB_API_TOKEN` должен иметь этот scope (bit 2 по CLAUDE.md). Rate limit строгий: 3 req/min, пауза 20 сек между batches.

Справочник `WbWarehouse` не имеет официального API — список складов WB собирается вручную через DevTools Network tab на seller.wildberries.ru, затем hardcode в seed-скрипте. Новое поле `federalDistrict` в ответе API (добавлено в 2025) теоретически может помочь при кластеризации, но доверять ему полностью нельзя — null для зарубежных складов. Cluster mapping лучше строить вручную + fallback-insert `cluster="Прочие"` для незнакомых складов.

Route rename `/inventory` → `/stock` делается в `lib/sections.ts`, `components/layout/nav-items.ts`, `components/layout/section-titles.ts` + переименование папки `app/(dashboard)/inventory/` → `stock/` + добавление redirect в `next.config.ts` (через `redirects()` — не nginx). Nginx rewrite нужен только для 1-релизной совместимости с закладками старого URL.

**Основная рекомендация:** Начать Phase 14 с Plan 14-01 (Wave 0: smoke test нового endpoint curl + схема + rename + test stubs). Получить smoke test результат до начала кодирования остатка — если 401/403, нужна регенерация WB_API_TOKEN до Plan 14-03.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| STOCK-01 | Prisma миграция: WbWarehouse, WbCardWarehouseStock, поля Product.ivanovoStock/productionStock/timestamps, AppSetting seed | Схема ниже, clean-replace транзакция, seed pattern Phase 7 |
| STOCK-02 | Pure function `lib/stock-math.ts` — calculateStockMetrics с null-guards | Формулы ниже, паттерн pricing-math.ts |
| STOCK-03 | Утилита `lib/normalize-sku.ts` — trim+upper+em-dash→hyphen+regex | Regex pattern ниже, golden cases |
| STOCK-04 | Route rename /inventory → /stock + nginx rewrite 1 релиз | Список файлов для изменения ниже, next.config.ts redirects |
| STOCK-05 | RBAC requireSection("STOCK") read, requireSection("STOCK","MANAGE") write | Паттерн identical Phase 7 PRICES |
| STOCK-06 | Wave 0 smoke-test curl нового WB Analytics endpoint | Endpoint верифицирован (HIGH), команда curl ниже |
| STOCK-07 | fetchStocksPerWarehouse() в lib/wb-api.ts, batch 1000 nmIds, rate limit 20s, retry 60s на 429 | API формат верифицирован, паттерн fetchAvgSalesSpeed7d |
| STOCK-08 | /api/wb-sync extension: clean-replace per wbCardId в транзакции + WbCard.stockQty denorm | Транзакция pattern ниже |
| STOCK-09 | Seed WbWarehouse через скрипт с hardcoded array, кластеры 7 шт | Manual DevTools сбор, список майоритарных складов из публичных источников |
| STOCK-10 | Auto-insert неизвестных складов с cluster="Прочие" + needsClusterReview=true | Паттерн upsert, console.warn |
| STOCK-11 | Excel-import Иваново — POST /api/stock/ivanovo-upload + parseIvanovoExcel + preview Dialog | Паттерн parse-auto-promo-excel.ts, колонки A=SKU/B=qty |
| STOCK-12 | server action upsertIvanovoStock, normalizeSku lookup, tx.product.update | normalizeSku → Product.sku, batch upsert pattern |
| STOCK-13 | Inline productionStock input debounced 500ms | Паттерн GlobalRatesBar, native input в ячейке |
| STOCK-14 | TurnoverNormInput в шапке, AppSetting key stock.turnoverNormDays | Паттерн GlobalRatesBar, updateAppSetting action |
| STOCK-15 | Кнопка «Обновить из WB» — POST /api/wb-sync с toast.loading | Паттерн WbSyncButton, toast.loading/dismiss |
| STOCK-16 | RSC /stock: rowSpan Сводная + per-артикул строки | Паттерн Phase 7 PriceCalculatorTable |
| STOCK-17 | Sticky 4 columns: Фото/Сводка/Ярлык/Артикул, accumulated left, z-index | Phase 7 точные значения: left-0/[80px]/[320px]/[400px] |
| STOCK-18 | 6 групп колонок: РФ/Иваново/Производство/МП/WB/Ozon, 2-уровневые заголовки sticky | Паттерн Phase 7, top-0/top-[40px] |
| STOCK-19 | Формат чисел: <10→toFixed(1), ≥10→Math.floor; null→«—»; цветовой Д | formatStockValue helper + cn() классы |
| STOCK-20 | Фильтры /stock — MultiSelect + toggle «только с дефицитом» через URL searchParams | Паттерн PricesFilters |
| STOCK-21 | StockTabs — Остатки/WB склады/Ozon — паттерн PricesTabs | pathname.startsWith pattern |
| STOCK-22 | RSC /stock/wb: nmId-level, 7 кластерных колонок, expand до per-warehouse | Данные из WbCardWarehouseStock JOIN WbWarehouse |
| STOCK-23 | WbWarehouse.shortCluster денормализован, CLUSTER_FULL_NAMES в lib/wb-clusters.ts | 7 значений, full names верифицированы |
| STOCK-24 | ClusterTooltip при hover на кластере | Компонент Tooltip уже в проекте |
| STOCK-25 | Expand кластера в URL (?expandedClusters=ЦФО,ПФО), useSearchParams + router.replace | Паттерн StatsTabs/PeriodFilter Phase 13 |
| STOCK-26 | Vitest tests/stock-math.test.ts, 5+ test cases | Паттерн pricing-math.test.ts |
| STOCK-27 | Vitest tests/normalize-sku.test.ts, canonical+invalid cases | golden cases ниже |
| STOCK-28 | Vitest tests/parse-ivanovo-excel.test.ts, реальная fixture | Zero Wave требует fixture от пользователя |
| STOCK-29 | Deploy + human UAT чеклист 9 пунктов | deploy.sh паттерн Phase 7 |
</phase_requirements>

---

## Стандартный стек

### Core (уже установлен в проекте, не устанавливать повторно)

| Библиотека | Версия | Назначение | Почему стандарт |
|------------|--------|-----------|-----------------|
| Next.js | 15.5.14 | App Router, RSC, Server Actions | Проектный стек |
| Prisma | 6.x | ORM, миграции | Проектный стек |
| `xlsx` | 0.18.5 | Парсинг Excel | Уже используется Phase 7 |
| `vitest` | 4.1.4 | Unit tests | Уже установлен Phase 7 |
| shadcn/ui v4 base-nova | — | Компоненты UI | Проектный стек |
| `@base-ui/react` | — | Нижний слой shadcn | Проектный стек |
| `lucide-react` | — | Иконки | Проектный стек |
| `sonner` | — | Toast уведомления | Уже в проекте |

**Новых зависимостей устанавливать не нужно.** Все уже есть.

### Компоненты shadcn в проекте (не добавлять)

Все нужные компоненты уже установлены:
`table`, `dialog`, `button`, `input`, `form`, `checkbox`, `switch`, `label`, `badge`, `card`, `separator`, `sonner`, `alert`, `tooltip`, `multi-select-dropdown`, `ComingSoon`

---

## Architecture Patterns

### Рекомендуемая структура новых файлов Phase 14

```
app/(dashboard)/stock/
├── layout.tsx          # RSC: requireSection("STOCK") + <h1> + <StockTabs>
├── page.tsx            # RSC: data fetch + шапка + <StockProductTable>
├── wb/page.tsx         # RSC: data fetch + toolbar + <StockWbTable>
└── ozon/page.tsx       # RSC: <ComingSoon sectionName="Управление остатками Ozon" />

components/stock/
├── StockTabs.tsx       # Client: Остатки/WB склады/Ozon — паттерн PricesTabs
├── TurnoverNormInput.tsx   # Client: debounced save — паттерн GlobalRatesBar
├── StockProductTable.tsx   # Client: sticky-таблица /stock с rowSpan + inline inputs
├── StockWbTable.tsx    # Client: кластеры + expand + URL state
├── IvanovoUploadButton.tsx # Client: кнопка + <IvanovoUploadDialog>
├── IvanovoUploadDialog.tsx # Client: preview diff + 4 секции
├── WbRefreshButton.tsx # Client: primary CTA — паттерн WbSyncButton
└── StockFilters.tsx    # Client: MultiSelect + toggle — паттерн PricesFilters

lib/
├── stock-math.ts       # Pure: calculateStockMetrics
├── normalize-sku.ts    # Pure: trim+upper+regex → УКТ-000001
├── parse-ivanovo-excel.ts  # Pure: парсер Excel (паттерн parse-auto-promo-excel.ts)
└── wb-clusters.ts      # Const: CLUSTER_FULL_NAMES map

app/actions/stock.ts    # Server Actions: upsertIvanovoStock, updateProductionStock, updateTurnoverNorm

tests/
├── stock-math.test.ts
├── normalize-sku.test.ts
└── parse-ivanovo-excel.test.ts

prisma/seed-wb-warehouses.ts  # One-time seed script для WbWarehouse

app/api/stock/
└── ivanovo-upload/route.ts  # POST multipart Excel upload
```

### Pattern 1: WB Analytics API — fetchStocksPerWarehouse

**Что:** `POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses`
**Когда:** Заменяет `fetchStocks()` при полном `/api/wb-sync`. Rate limit: 3 req/min, интервал 20s, burst 1.

```typescript
// lib/wb-api.ts — добавить ниже fetchStocks()
// @deprecated fetchStocks() — sunset 2026-06-23, заменён fetchStocksPerWarehouse()

/** POST /api/analytics/v1/stocks-report/wb-warehouses
 *  Rate limit: 3 req/min, интервал 20s между batches.
 *  Batch size: до 1000 nmIds.
 *  При 429 — retry через 60s.
 *  Возвращает Map<nmId, Array<{warehouseId, warehouseName, regionName, quantity, inWayToClient, inWayFromClient}>>
 */
const ANALYTICS_API = "https://seller-analytics-api.wildberries.ru"
const STOCKS_BATCH_SIZE = 1000
const STOCKS_INTERVAL_MS = 20_000  // 20s между batches (rate limit)
const STOCKS_RETRY_MS = 60_000     // 60s retry при 429

export interface WarehouseStockItem {
  warehouseId: number
  warehouseName: string
  regionName: string
  quantity: number
  inWayToClient: number
  inWayFromClient: number
}

export async function fetchStocksPerWarehouse(
  nmIds: number[]
): Promise<Map<number, WarehouseStockItem[]>> {
  const token = getToken()
  const result = new Map<number, WarehouseStockItem[]>()
  if (nmIds.length === 0) return result

  for (let i = 0; i < nmIds.length; i += STOCKS_BATCH_SIZE) {
    if (i > 0) await sleep(STOCKS_INTERVAL_MS)

    const batch = nmIds.slice(i, i + STOCKS_BATCH_SIZE)
    let attempt = 0

    while (attempt <= 1) {
      const res = await fetch(
        `${ANALYTICS_API}/api/analytics/v1/stocks-report/wb-warehouses`,
        {
          method: "POST",
          headers: { Authorization: token, "Content-Type": "application/json" },
          body: JSON.stringify({ nmIds: batch, limit: 250000, offset: 0 }),
        }
      )

      if (res.status === 429) {
        if (attempt >= 1) throw new Error("stocks-report 429 после retry")
        attempt++
        await sleep(STOCKS_RETRY_MS)
        continue
      }

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`stocks-report ${res.status}: ${text}`)
      }

      const data = await res.json()
      const rows: Array<{
        nmId: number
        warehouseId: number
        warehouseName: string
        regionName: string
        quantity: number
        inWayToClient: number
        inWayFromClient: number
      }> = data?.data ?? data ?? []

      for (const row of rows) {
        const items = result.get(row.nmId) ?? []
        items.push({
          warehouseId: row.warehouseId,
          warehouseName: row.warehouseName,
          regionName: row.regionName,
          quantity: row.quantity,
          inWayToClient: row.inWayToClient,
          inWayFromClient: row.inWayFromClient,
        })
        result.set(row.nmId, items)
      }
      break
    }
  }

  return result
}
```

**Источник:** dev.wildberries.ru/en/openapi/analytics (HIGH confidence, верифицирован 2026-04-21)

### Pattern 2: Prisma схема — новые модели и поля

```prisma
// prisma/schema.prisma — добавить

model WbWarehouse {
  id                 Int                    @id  // warehouseId из WB API
  name               String                 // "Коледино", "Казань" и т.д.
  cluster            String                 // Полное название кластера
  shortCluster       String                 // "ЦФО" | "ЮГ" | "Урал" | "ПФО" | "СЗО" | "СФО" | "Прочие"
  isActive           Boolean                @default(true)
  needsClusterReview Boolean                @default(false)  // auto-inserted, незнакомый склад
  stocks             WbCardWarehouseStock[]
}

model WbCardWarehouseStock {
  id          String     @id @default(cuid())
  wbCardId    String
  wbCard      WbCard     @relation(fields: [wbCardId], references: [id], onDelete: Cascade)
  warehouseId Int
  warehouse   WbWarehouse @relation(fields: [warehouseId], references: [id])
  quantity    Int        @default(0)
  updatedAt   DateTime   @updatedAt

  @@unique([wbCardId, warehouseId])
  @@index([wbCardId])
  @@index([warehouseId])
}

// В модели Product добавить:
// ivanovoStock            Int?
// productionStock         Int?
// ivanovoStockUpdatedAt   DateTime?
// productionStockUpdatedAt DateTime?

// В модели WbCard добавить:
// warehouses              WbCardWarehouseStock[]
```

**Примечание:** Relation `WbCard → WbCardWarehouseStock` нужно добавить в существующую модель `WbCard`. При Prisma 6 поле добавляется без breaking change.

### Pattern 3: stock-math.ts — pure functions

```typescript
// lib/stock-math.ts
// Source: REQUIREMENTS.md STOCK-02, STOCK-19

export interface StockMetricsInput {
  stock: number | null        // О: остаток (шт)
  ordersPerDay: number | null // З: заказы в день (avgSalesSpeed7d)
  turnoverNormDays: number    // из AppSetting stock.turnoverNormDays
}

export interface StockMetricsOutput {
  turnoverDays: number | null  // Об = О / З (дни до нуля)
  deficit: number | null       // Д = (norm * 0.3 * З) - О (шт дефицита)
}

export function calculateStockMetrics(input: StockMetricsInput): StockMetricsOutput {
  const { stock, ordersPerDay, turnoverNormDays } = input

  // Guard: О = null → не считаем ничего
  if (stock === null) return { turnoverDays: null, deficit: null }

  // Guard: normDays <= 0 → Д нельзя посчитать
  if (turnoverNormDays <= 0) return { turnoverDays: null, deficit: null }

  // Об = О / З. Если З = 0 или null → Об = null (нет продаж, нет оборачиваемости)
  const turnoverDays =
    ordersPerDay === null || ordersPerDay === 0
      ? null
      : stock / ordersPerDay

  // Д = (norm * 0.3 * З) - О. Если З = null → Д = null
  const deficit =
    ordersPerDay === null
      ? null
      : turnoverNormDays * 0.3 * ordersPerDay - stock

  // Infinity/NaN guard
  return {
    turnoverDays: turnoverDays !== null && isFinite(turnoverDays) ? turnoverDays : null,
    deficit: deficit !== null && isFinite(deficit) ? deficit : null,
  }
}

/** Порог для цветовой кодировки жёлтого (0 < Д < threshold). */
export function deficitThreshold(turnoverNormDays: number, ordersPerDay: number | null): number | null {
  if (ordersPerDay === null || ordersPerDay === 0) return null
  return turnoverNormDays * 0.3 * ordersPerDay
}
```

**Тесты (STOCK-26):**
- happy path: stock=100, ordersPerDay=5, norm=37 → turnoverDays=20, deficit=55.5−100=−44.5 (зелёный)
- О=null → {null, null}
- З=0 → turnoverDays=null, deficit=0−100=−100 (зелёный, нет продаж)
- З=null → {null, null}
- normDays=0 → {null, null}
- О=0, З=5, norm=37 → turnoverDays=0, deficit=55.5 (красный)

### Pattern 4: normalize-sku.ts

```typescript
// lib/normalize-sku.ts
// Converts various SKU formats to canonical "УКТ-000001"

const EM_DASH = "\u2014"
const SKU_REGEX = /^(?:УКТ-?)?(\d+)$/

export function normalizeSku(raw: string): string {
  const s = raw.trim().toUpperCase().replace(EM_DASH, "-")
  const match = SKU_REGEX.exec(s)
  if (!match || !match[1]) {
    throw new Error(`Невалидный УКТ: "${raw}"`)
  }
  return `УКТ-${match[1].padStart(6, "0")}`
}
```

**Golden cases (STOCK-27):**
- `"УКТ-000001"` → `"УКТ-000001"` (canonical)
- `"УКТ-1"` → `"УКТ-000001"` (padStart)
- `"1"` → `"УКТ-000001"` (без префикса)
- `" укт-000001 "` → `"УКТ-000001"` (trim + upper)
- `"УКТ\u2014000001"` → `"УКТ-000001"` (em-dash)
- `"abc"` → throw Error
- `"УКТ-"` → throw Error (нет цифр)
- `""` → throw Error

### Pattern 5: Route rename /inventory → /stock

**Файлы для изменения:**

| Файл | Изменение |
|------|-----------|
| `app/(dashboard)/inventory/` → `stock/` | Переименовать папку (включая вложенные) |
| `lib/sections.ts:11` | `"/inventory": "STOCK"` → `"/stock": "STOCK"` |
| `components/layout/nav-items.ts:34` | `href: "/inventory"` → `href: "/stock"` |
| `components/layout/section-titles.ts:21` | `/^\/inventory/` → `/^\/stock/` |
| `middleware.ts` | Если sections.ts используется через import — автоматически |
| `next.config.ts` | Добавить redirect (см. ниже) |

**next.config.ts redirect (на 1 релиз):**
```typescript
// next.config.ts
const nextConfig: NextConfig = {
  output: "standalone",
  async redirects() {
    return [
      {
        source: "/inventory/:path*",
        destination: "/stock/:path*",
        permanent: true,  // 308 в Next.js = семантически "permanent"
      },
    ]
  },
}
```

**nginx rewrite (VPS, для закладок браузера):**
```nginx
# /etc/nginx/sites-enabled/zoiten-pro
# Добавить ДО location / блока:
location ~* ^/inventory(.*)$ {
  return 301 /stock$1;
}
```

**Важно:** Next.js `permanent: true` выдаёт 308 (не 301) — это нормально для modern браузеров. nginx rewrite даёт классический 301 для старых закладок. Оба работают параллельно без конфликта.

**Источник:** nextjs.org/docs/app/api-reference/config/next-config-js/redirects (HIGH)

### Pattern 6: clean-replace транзакция в /api/wb-sync

```typescript
// app/api/wb-sync/route.ts — добавить после получения stocksPerWarehouse

// Per-wbCard clean-replace:
await prisma.$transaction(async (tx) => {
  for (const [nmId, warehouseItems] of stocksPerWarehouse.entries()) {
    const card = await tx.wbCard.findUnique({ where: { nmId }, select: { id: true } })
    if (!card) continue

    const incomingIds = warehouseItems.map(w => w.warehouseId)

    // Удалить склады, которых нет в ответе
    await tx.wbCardWarehouseStock.deleteMany({
      where: {
        wbCardId: card.id,
        NOT: { warehouseId: { in: incomingIds } }
      }
    })

    // Upsert входящих + auto-insert неизвестных складов
    for (const item of warehouseItems) {
      // Auto-insert неизвестного склада
      await tx.wbWarehouse.upsert({
        where: { id: item.warehouseId },
        create: {
          id: item.warehouseId,
          name: item.warehouseName,
          cluster: "Прочие склады",
          shortCluster: "Прочие",
          needsClusterReview: true,
        },
        update: {},  // Не трогаем существующий кластер
      })

      await tx.wbCardWarehouseStock.upsert({
        where: { wbCardId_warehouseId: { wbCardId: card.id, warehouseId: item.warehouseId } },
        create: { wbCardId: card.id, warehouseId: item.warehouseId, quantity: item.quantity },
        update: { quantity: item.quantity },
      })
    }

    // Денормализация stockQty для backward compat /prices/wb
    const totalQty = warehouseItems.reduce((sum, w) => sum + w.quantity, 0)
    await tx.wbCard.update({
      where: { id: card.id },
      data: { stockQty: totalQty },
    })
  }
})
```

### Pattern 7: Excel upload Иваново — паттерн parse-auto-promo-excel.ts

```typescript
// lib/parse-ivanovo-excel.ts
// Zero Wave: колонки станут известны только после получения реального файла от пользователя.
// Предположение (подтвердить в Plan 14-04 Zero Wave): A=SKU (УКТ-000001), B=количество.
// Паттерн идентичен parse-auto-promo-excel.ts (by-index, defval: null).

import * as XLSX from "xlsx"

export interface ParsedIvanovoRow {
  sku: string   // сырой SKU до normalizeSku
  quantity: number
}

export interface ParseIvanovoResult {
  valid: ParsedIvanovoRow[]
  invalidRows: number[]  // номера строк с ошибкой (1-indexed)
}

export function parseIvanovoExcel(buf: Buffer): ParseIvanovoResult {
  const wb = XLSX.read(buf, { type: "buffer" })
  const sheet = wb.Sheets[wb.SheetNames[0]!]!
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(
    sheet, { header: 1, defval: null }
  )

  const valid: ParsedIvanovoRow[] = []
  const invalidRows: number[] = []

  // Пропускаем строку 0 (заголовки)
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    if (!r || r.length === 0) continue

    const skuRaw = r[0]  // A = УКТ
    const qtyRaw = r[1]  // B = количество

    if (skuRaw == null || skuRaw === "" || qtyRaw == null || qtyRaw === "") {
      invalidRows.push(i + 1)
      continue
    }

    const qty = parseInt(String(qtyRaw), 10)
    if (isNaN(qty) || qty < 0) {
      invalidRows.push(i + 1)
      continue
    }

    valid.push({ sku: String(skuRaw).trim(), quantity: qty })
  }

  return { valid, invalidRows }
}
```

**ВАЖНО:** Реальные индексы колонок A/B — предположение. Паттерн Phase 7 показал, что реальный файл может иметь другие индексы (off-by-one). Plan 14-04 Zero Wave ОБЯЗАН получить от пользователя реальный .xlsx fixture и проверить индексы перед кодированием.

### Pattern 8: URL state для expand кластеров

```typescript
// components/stock/StockWbTable.tsx — паттерн из Phase 13 PeriodFilter/StatsTabs
"use client"
import { useRouter, useSearchParams } from "next/navigation"
import { useCallback } from "react"

const CLUSTERS = ["ЦФО", "ЮГ", "Урал", "ПФО", "СЗО", "СФО", "Прочие"] as const

export function StockWbTable({ ...props }) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const expandedClusters = new Set(
    (searchParams.get("expandedClusters") ?? "").split(",").filter(Boolean)
  )

  const toggleCluster = useCallback((cluster: string) => {
    const next = new Set(expandedClusters)
    if (next.has(cluster)) {
      next.delete(cluster)
    } else {
      next.add(cluster)
    }

    const params = new URLSearchParams(searchParams.toString())
    if (next.size > 0) {
      params.set("expandedClusters", [...next].join(","))
    } else {
      params.delete("expandedClusters")
    }
    router.replace(`?${params.toString()}`, { scroll: false })
  }, [expandedClusters, searchParams, router])

  const expandAll = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.set("expandedClusters", CLUSTERS.join(","))
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  const collapseAll = () => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete("expandedClusters")
    router.replace(`?${params.toString()}`, { scroll: false })
  }

  // ...render
}
```

**Паттерн:** Phase 13 `search-params.ts` (StatsTabs + PeriodFilter). `router.replace` (не `push`) — не создаёт новую запись в history stack при каждом expand. `scroll: false` — не скролит страницу вверх.

### Anti-Patterns

- **НЕ использовать `router.push` для expand** — засоряет history stack при частом expand/collapse.
- **НЕ хранить expand state в localStorage** — теряет shareability ссылок. URL searchParams = single source of truth.
- **НЕ делать `/api/wb-sync` синхронным в UI** — ~2 мин выполнения, обязателен `toast.loading`.
- **НЕ накапливать `WbCardWarehouseStock`** — всегда clean-replace per wbCardId в транзакции, иначе склады-фантомы.
- **НЕ зависеть только от `federalDistrict` из WB API** — поле может быть null; cluster mapping должен быть hardcoded в `WbWarehouse.shortCluster`.
- **НЕ парсить Excel по именам колонок** — заголовки WB меняются; всегда by-index (паттерн Phase 7).

---

## Не изобретать велосипед

| Задача | Не строить | Использовать | Почему |
|--------|-----------|--------------|--------|
| Debounced save | setTimeout вручную | Pattern GlobalRatesBar: `useRef<ReturnType<typeof setTimeout>>` per field | Уже проверен, edge cases учтены |
| Excel parse | ручной CSV | `xlsx` `sheet_to_json({header:1, defval:null})` by-index | BOM, formula cells, encoding — xlsx решает автоматически |
| Toast loading | кастомный spinner | `toast.loading("...")` + `toast.dismiss(id)` из sonner | Паттерн WbSyncButton/WbPromotionsSyncButton |
| Sticky table | position:fixed или JS | `position: sticky` + `bg-background` (не transparent) | Phase 7 решил все edge cases (скролл, z-index) |
| URL state | localStorage | `useSearchParams` + `router.replace` | Server-renderable, shareable, back/forward нативно |
| RBAC check | middleware-only | `requireSection("STOCK")` в каждом RSC + action | Двойная защита: middleware redirect + server-side error |
| WB API rate limit | sleep в loop | pattern fetchAvgSalesSpeed7d: `await sleep(INTERVAL)` между batches | Уже проверен на 429 от WB |

---

## Типичные ошибки

### Ошибка 1: WB Analytics API — неправильный токен scope

**Что пойдёт не так:** `fetchStocksPerWarehouse` вернёт 401/403 при первом запуске.
**Почему:** WB_API_TOKEN в CLAUDE.md имеет scope: Контент (bit 1), Аналитика (bit 2), Цены (bit 3), Отзывы (bit 5), Статистика (bit 6), Тарифы (bit 7). Новый endpoint требует Аналитика (bit 2) — тот же scope. НО: может требовать Personal или Service token type, а не Standard.
**Как избежать:** Wave 0 smoke test с curl ОБЯЗАТЕЛЕН до Plan 14-03. Команда:
```bash
curl -X POST \
  "https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses" \
  -H "Authorization: $WB_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"nmIds":[800750522],"limit":10,"offset":0}' \
  -w "\nHTTP %{http_code}"
```
**Признаки:** HTTP 401 → неверный токен. HTTP 403 → неверный тип токена (нужен Personal/Service, а у нас Standard). HTTP 429 → лимит; подождать 20 сек.

### Ошибка 2: stockQty денормализация ломает /prices/wb

**Что пойдёт не так:** После добавления per-warehouse stocks, `/prices/wb` перестанет показывать `WbCard.stockQty` правильно.
**Почему:** Phase 7 `/prices/wb` читает `WbCard.stockQty` напрямую. Если clean-replace удаляет все `WbCardWarehouseStock`, но не обновляет `stockQty` — поле устаревает.
**Как избежать:** В clean-replace транзакции ВСЕГДА обновлять `WbCard.stockQty = SUM(quantity)` той же транзакцией. Уже учтено в Pattern 6 выше.

### Ошибка 3: Excel Иваново — неверные индексы колонок

**Что пойдёт не так:** `parseIvanovoExcel` будет возвращать null/NaN для всех строк.
**Почему:** WB Excel файлы меняют порядок колонок. Phase 7 поймал off-by-one (T=19 vs U=20).
**Как избежать:** Plan 14-04 НАЧИНАЕТСЯ с Zero Wave: пользователь даёт реальный fixture → проверяем индексы в Excel → фиксируем в коде. Тест fixtures/ivanovo-sample.xlsx подтверждает правильные индексы перед кодированием.

### Ошибка 4: rowSpan в sticky-таблице с двумя уровнями заголовков

**Что пойдёт не так:** Sticky заголовок второго уровня (О/З/Об/Д) накрывает первую строку данных при вертикальном скролле.
**Почему:** `top-[40px]` предполагает, что первый уровень `<thead>` ровно 40px. При изменении высоты строки заголовка смещение ломается.
**Как избежать:** Жёстко фиксировать `h-10` (40px) для первой строки `<thead>`. Точный pattern из Phase 7: `sticky top-0` для первого уровня, `sticky top-[40px]` для второго.

### Ошибка 5: Em-dash в УКТ из Excel

**Что пойдёт не так:** `normalizeSku("УКТ—000001")` бросает ошибку вместо нормализации.
**Почему:** Кириллический em-dash U+2014 (`—`) выглядит как дефис, но это другой символ. Excel из некоторых источников заменяет дефис em-dash.
**Как избежать:** `normalizeSku` явно делает `.replace("\u2014", "-")` ДО regex. Тест STOCK-27 пинит этот кейс.

### Ошибка 6: next.config.ts redirect с /* vs :path*

**Что пойдёт не так:** Redirect `/inventory/*` не работает для пути `/inventory` (без trailing slash).
**Почему:** В Next.js `source: "/inventory/*"` не матчит `/inventory` — только `/inventory/something`.
**Как избежать:** Использовать `source: "/inventory/:path*"` — это матчит `/inventory` AND `/inventory/wb` AND `/inventory/wb/detail`.

### Ошибка 7: WbCardWarehouseStock upsert — составной ключ в Prisma 6

**Что пойдёт не так:** `prisma.wbCardWarehouseStock.upsert({where: {wbCardId_warehouseId: {...}}})` — неправильное имя составного ключа.
**Почему:** Prisma генерирует имя из полей `@@unique([wbCardId, warehouseId])` как `wbCardId_warehouseId` (camelCase join). Нужно именно это.
**Как избежать:** Проверить сгенерированный Prisma Client после `prisma generate`. Имя следует паттерну `field1_field2` (lowercase camelCase join).

---

## Примеры кода

### Форматирование числа остатка

```typescript
// Source: UI-SPEC Pattern 4, REQUIREMENTS.md STOCK-19
function formatStockValue(n: number): string {
  if (n < 10) return n.toFixed(1)
  return Math.floor(n).toString()
}
```

### CLUSTER_FULL_NAMES

```typescript
// lib/wb-clusters.ts
// Source: REQUIREMENTS.md STOCK-23, UI-SPEC Copywriting Contract
export const CLUSTER_FULL_NAMES: Record<string, string> = {
  "ЦФО": "Центральный федеральный округ",
  "ЮГ": "Южный + Северо-Кавказский ФО",
  "Урал": "Уральский федеральный округ",
  "ПФО": "Приволжский федеральный округ",
  "СЗО": "Северо-Западный федеральный округ",
  "СФО": "Сибирский + Дальневосточный ФО",
  "Прочие": "Прочие склады",
} as const

export const CLUSTER_ORDER = ["ЦФО", "ЮГ", "Урал", "ПФО", "СЗО", "СФО", "Прочие"] as const
```

### Ячейка Д с цветовой кодировкой

```tsx
// Source: UI-SPEC Phase 14, REQUIREMENTS.md STOCK-19
import { cn } from "@/lib/utils"
import { deficitThreshold } from "@/lib/stock-math"

function DeficitCell({ deficit, turnoverNormDays, ordersPerDay }: {
  deficit: number | null
  turnoverNormDays: number
  ordersPerDay: number | null
}) {
  const threshold = deficitThreshold(turnoverNormDays, ordersPerDay)

  return (
    <TableCell className={cn(
      "px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right",
      deficit === null && "text-muted-foreground",
      deficit !== null && deficit <= 0 && "text-green-600 dark:text-green-500",
      deficit !== null && threshold !== null && deficit > 0 && deficit < threshold && "text-yellow-600 dark:text-yellow-400",
      deficit !== null && threshold !== null && deficit >= threshold && "text-red-600 dark:text-red-500 font-medium",
    )}>
      {deficit !== null ? formatStockValue(deficit) : "—"}
    </TableCell>
  )
}
```

### Seed WbWarehouse (структура)

```typescript
// prisma/seed-wb-warehouses.ts
// Запускать: npx prisma db seed -- --wb-warehouses
// Список складов собирается ВРУЧНУЮ через DevTools Network tab на seller.wildberries.ru
// Zero Wave Plan 14-02: получить от пользователя подтверждение cluster names до seed

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// PLACEHOLDER: реальные warehouseId получить через DevTools + user validation
// Структура согласно WB API response: warehouseId из stocks-report/wb-warehouses
const WB_WAREHOUSES = [
  // ЦФО (Центральный ФО) — Москва и область, Тула, Тамбов
  { id: 507, name: "Коледино", cluster: "Центральный федеральный округ", shortCluster: "ЦФО" },
  { id: 686, name: "Электросталь", cluster: "Центральный федеральный округ", shortCluster: "ЦФО" },
  // ... остальные ЦФО
  // ЮГ (Южный + Северо-Кавказский ФО) — Краснодар, Ставрополь, Волгоград
  { id: 117501, name: "Краснодар", cluster: "Южный ФО", shortCluster: "ЮГ" },
  // ... остальные ЮГ
  // ПФО (Приволжский ФО) — Казань, Самара, Уфа
  { id: 301212, name: "Казань", cluster: "Приволжский федеральный округ", shortCluster: "ПФО" },
  // ... остальные
  // Аналогично для Урал, СЗО (СПб), СФО (Новосибирск, Хабаровск)
] as const

async function main() {
  for (const w of WB_WAREHOUSES) {
    await prisma.wbWarehouse.upsert({
      where: { id: w.id },
      create: { ...w, isActive: true, needsClusterReview: false },
      update: { name: w.name, cluster: w.cluster, shortCluster: w.shortCluster },
    })
  }
  console.log(`Seeded ${WB_WAREHOUSES.length} WbWarehouse records`)
}

main().finally(() => prisma.$disconnect())
```

**КРИТИЧЕСКИ ВАЖНО:** Реальные `warehouseId` нужно получить ТОЛЬКО из первого ответа `fetchStocksPerWarehouse` или из DevTools Network tab (seller.wildberries.ru → раздел поставок → список складов). Не хардкодить ID из публичных сайтов — они могут устареть. Plan 14-02 Zero Wave должен получить подтверждение cluster names от пользователя ПЕРЕД seed.

---

## Среда (Environment Availability)

| Зависимость | Требуется для | Доступна | Версия | Fallback |
|-------------|--------------|----------|--------|---------|
| PostgreSQL на VPS | Prisma migrate | ✓ | 16 | — |
| WB_API_TOKEN (scope Аналитика) | fetchStocksPerWarehouse | Неизвестно | — | Блокер — нужна регенерация токена до Plan 14-03 |
| `xlsx` npm package | Excel парсинг | ✓ | 0.18.5 | — |
| `vitest` | Unit tests | ✓ | 4.1.4 | — |
| nginx на VPS | /inventory → /stock rewrite | ✓ | актуальная | — |
| Next.js redirects | /inventory → /stock в приложении | ✓ | 15.5.14 | — |

**Блокер без fallback:**
- WB_API_TOKEN тип токена (Personal/Service для Analytics API scope). Если WB выдал Standard token — Analytics endpoint вернёт 403. Решение: регенерация токена в кабинете WB → Personal token с bit Аналитика. Smoke test в Plan 14-01 Wave 0 определяет это ДО кодирования.

**Fallback для WB API:**
- Если scope проблема не решена к Plan 14-03 — можно временно оставить `fetchStocks()` (старый endpoint работает до 2026-06-23) и добавить TODO на миграцию. Но лучше решить сразу.

---

## Инвентарь runtime state (rename фаза /inventory → /stock)

| Категория | Найдено | Действие |
|-----------|---------|---------|
| Stored data | Нет — `WbCardWarehouseStock` новая таблица, `Product` без stock полей | Добавить поля в миграции |
| Live service config | `lib/sections.ts:11` `/inventory` → STOCK, `nav-items.ts:34` href="/inventory", `section-titles.ts:21` regex `/inventory/` | Code edit в Plan 14-01 |
| OS-registered state | Systemd cron timers — не содержат "inventory" (только support-sync, wb-sync) | Нет действий |
| Secrets/env vars | Нет — `WB_API_TOKEN` не содержит "inventory" | Нет действий |
| Build artifacts | `/opt/zoiten-pro/.next/` на VPS — пересобирается при deploy | deploy.sh делает npm run build |

**Stub замена:** `app/(dashboard)/inventory/page.tsx` заменяется полноценным `app/(dashboard)/stock/page.tsx`. Stub ComingSoon → реальный функционал. Папка просто переименовывается.

**Middleware.ts:** Импортирует `SECTION_PATHS` из `lib/sections.ts` — изменение `/inventory` → `/stock` в sections.ts автоматически обновляет middleware без правок.

---

## Архитектура валидации (Nyquist)

### Тестовая инфраструктура

| Свойство | Значение |
|---------|---------|
| Framework | vitest 4.1.4 |
| Config | `vitest.config.ts` в корне проекта |
| Quick run | `npm run test` |
| Full suite | `npm run test` |

### Маппинг требований → тесты

| REQ ID | Поведение | Тип теста | Команда | Файл |
|--------|----------|-----------|---------|------|
| STOCK-02 | calculateStockMetrics корректно считает Об/Д | unit | `npm run test -- tests/stock-math.test.ts` | ❌ Wave 0 |
| STOCK-03 | normalizeSku правильно нормализует УКТ | unit | `npm run test -- tests/normalize-sku.test.ts` | ❌ Wave 0 |
| STOCK-06 | WB endpoint отвечает 200 с правильной схемой | smoke (manual curl) | ручной Wave 0 | ❌ Wave 0 |
| STOCK-11 | parseIvanovoExcel парсит колонки A/B | unit | `npm run test -- tests/parse-ivanovo-excel.test.ts` | ❌ Wave 0 |
| STOCK-26 | 5+ edge cases stock-math | unit | `npm run test -- tests/stock-math.test.ts` | ❌ Wave 0 |
| STOCK-27 | canonical + invalid cases normalize-sku | unit | `npm run test -- tests/normalize-sku.test.ts` | ❌ Wave 0 |
| STOCK-28 | Excel parse с реальным fixture | unit | `npm run test -- tests/parse-ivanovo-excel.test.ts` | ❌ Wave 0 (нужен fixture) |
| STOCK-29 | UAT deploy чеклист | manual | human UAT | Plan 14-07 |

### Sampling Rate

- **Per task commit:** `npm run test` (весь suite, ~10-15 сек при текущем размере)
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite GREEN перед `/gsd:verify-work`

### Wave 0 Gaps (Plan 14-01)

- [ ] `tests/stock-math.test.ts` — 5+ test cases для STOCK-02/STOCK-26
- [ ] `tests/normalize-sku.test.ts` — canonical + invalid для STOCK-03/STOCK-27
- [ ] `tests/parse-ivanovo-excel.test.ts` — stub (RED до получения fixture от пользователя в Plan 14-04)
- [ ] `tests/fixtures/ivanovo-sample.xlsx` — ждём от пользователя; без него тест остаётся RED stub

*(Тест-инфраструктура vitest уже установлена и настроена — никакого нового framwork install не требуется)*

---

## State of the Art

| Старый подход | Текущий подход | Когда изменилось | Impact |
|--------------|---------------|------------------|--------|
| `GET /api/v1/supplier/stocks` (Statistics API) | `POST /api/analytics/v1/stocks-report/wb-warehouses` | 2026-03-23 (launch) | per-warehouse данные, 250k строк, offset pagination |
| Sum по всем складам → единый `stockQty` | WbCardWarehouseStock per склад + денормализованный `stockQty` | Phase 14 | drill-down до склада, кластеры |
| stub `/inventory` | реальный `/stock` с кластерами | Phase 14 | полный функционал |

**Deprecated/устаревшее:**
- `fetchStocks()` в `lib/wb-api.ts`: помечается `@deprecated — sunset 2026-06-23`. Физически удаляется в STOCK-FUT-09 (v1.3+).
- `app/(dashboard)/inventory/page.tsx`: удаляется полностью, заменяется `stock/page.tsx`.

---

## Открытые вопросы

1. **Тип WB_API_TOKEN**
   - Что известно: `WB_API_TOKEN` имеет scope Аналитика (bit 2) согласно CLAUDE.md. Новый endpoint требует Personal или Service token.
   - Неясно: Является ли существующий токен Personal/Service или Standard? Standard tokens могут не иметь доступа к Analytics API.
   - Рекомендация: Wave 0 smoke test ответит. Если 403 — регенерировать Personal token в кабинете WB. Не блокирует Plans 14-01, 14-02, 14-04, 14-05 (они не зависят от этого endpoint).

2. **Реальные warehouseId для seed WbWarehouse**
   - Что известно: WB не предоставляет официального API списка складов. DevTools Network tab на seller.wildberries.ru показывает список при открытии раздела поставок.
   - Неясно: Точный список warehouseId для всех активных складов WB в 2026 году, правильность кластеризации по ФО.
   - Рекомендация: Plan 14-02 Zero Wave — пользователь открывает seller.wildberries.ru в DevTools, копирует JSON ответа API складов (endpoint `/api/v1/warehouses` или аналогичный), предоставляет список. Кластеры подтверждаются с пользователем перед seed. Автоматический fallback `cluster="Прочие"` покрывает все новые склады при sync.

3. **Формат Excel склада Иваново**
   - Что известно: Колонки предположительно A=УКТ, B=количество. Паттерн Phase 7 показал риск off-by-one.
   - Неясно: Реальные индексы колонок, наличие заголовков, encoding.
   - Рекомендация: Plan 14-04 Zero Wave — пользователь предоставляет реальный .xlsx файл. `parseIvanovoExcel` НЕЛЬЗЯ кодировать до получения fixture.

---

## Источники

### Primary (HIGH confidence)

- `dev.wildberries.ru/en/openapi/analytics` — endpoint `POST /api/analytics/v1/stocks-report/wb-warehouses`, request/response schema, rate limits (верифицирован 2026-04-21)
- `dev.wildberries.ru/en/release-notes` — sunset `GET /api/v1/supplier/stocks` на 2026-06-23, launch нового endpoint 2026-03-23 (верифицирован 2026-04-21)
- `nextjs.org/docs/app/api-reference/config/next-config-js/redirects` — синтаксис `redirects()` с `:path*` matcher, 308 permanent behaviour (HIGH)
- Существующий код проекта (`lib/wb-api.ts`, `lib/parse-auto-promo-excel.ts`, `components/prices/GlobalRatesBar.tsx`, `app/api/wb-sync/route.ts`, `lib/sections.ts`) — паттерны для переиспользования (HIGH — это наш код)
- `REQUIREMENTS.md` STOCK-01..STOCK-29 — формулы О/З/Об/Д, цветовая кодировка, 7 кластеров (HIGH — source of truth)
- `14-UI-SPEC.md` — approved design contract (HIGH — source of truth)

### Secondary (MEDIUM confidence)

- WebSearch результаты о WB складах по ФО — список городов/регионов для cluster mapping (MEDIUM — публичные сайты, нужно верифицировать через DevTools)

### Tertiary (LOW confidence)

- Предполагаемые индексы колонок A=УКТ, B=количество в Excel Иваново (LOW — не верифицированы реальным файлом; Plan 14-04 Zero Wave обязателен)
- Предполагаемые warehouseId для seed WbWarehouse (LOW — нужен DevTools Network tab на seller.wildberries.ru)

---

## Метаданные

**Уровни confidence:**
- Standard Stack: HIGH — все библиотеки из проекта, нет новых зависимостей
- WB Analytics API endpoint: HIGH — верифицирован официальной документацией
- Architecture (паттерны): HIGH — переиспользование Phase 7/13 паттернов
- WbWarehouse cluster mapping: LOW — требует ручной сбор через DevTools + user validation
- Excel Иваново колонки: LOW — требует реальный fixture от пользователя
- Pitfalls: HIGH — основаны на фактических проблемах Phase 7 (off-by-one, em-dash, WB API токен)

**Research date:** 2026-04-21
**Valid until:** 2026-05-21 (WB API стабильна; WbWarehouse seed может устареть при открытии новых складов WB)
