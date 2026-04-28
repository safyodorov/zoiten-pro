---
phase: 16-wb-stock-sizes
plan: "03"
subsystem: stock-wb-data-layer
tags:
  - data-layer
  - per-size
  - stock-wb
  - pure-helper
dependency-graph:
  requires:
    - lib/wb-clusters.ts (existing CLUSTER_ORDER, ClusterShortName)
    - lib/stock-wb-data.ts (existing WbStockRow, ClusterAggregate, WarehouseSlot)
    - prisma/schema.prisma WbCardWarehouseStock.techSize (Plan 16-01)
  provides:
    - "lib/wb-clusters.ts экспортирует sortSizes(sizes: string[]): string[]"
    - "lib/stock-wb-data.ts экспортирует тип WbStockSizeRow"
    - "lib/stock-wb-data.ts экспортирует pure-helper buildSizeBreakdown"
    - "WbStockRow.sizeBreakdown: WbStockSizeRow[] + hasMultipleSizes: boolean"
  affects:
    - lib/wb-clusters.ts
    - lib/stock-wb-data.ts
tech-stack:
  added: []
  patterns:
    - pure-function helper для тестирования без Prisma mock
    - известный SIZE_ORDER map с case-insensitive lookup
    - sort fallback chain (numeric → known letters → localeCompare ru)
    - implementation-truth для hasMultipleSizes (uniqueTechSizes.size > 1)
key-files:
  created:
    - tests/stock-wb-size-sort.test.ts
    - tests/stock-wb-data-sizebreakdown.test.ts
  modified:
    - lib/wb-clusters.ts
    - lib/stock-wb-data.ts
decisions:
  - sortSizes экспортирован из lib/wb-clusters.ts (рядом с CLUSTER_ORDER) — все sort-логика per-кластер/per-размер в одном месте
  - SIZE_ORDER приватная (не экспортируется) — расширяемая через future PR без breaking change
  - case-insensitive lookup через .toUpperCase() — сохраняет оригинальный регистр в выводе
  - buildSizeBreakdown — pure helper, тестируется без Prisma mock (warehouses pre-joined с meta)
  - per-size ordersCount=0, ordersPerDay=null — per-size orders не хранятся в БД (CONTEXT.md, locked)
  - hasMultipleSizes truth = uniqueTechSizes.size > 1 (implementation-truth для Plan 16-03; UI-truth скрытия в Plan 16-05)
metrics:
  duration: ~5min
  completed: "2026-04-28T14:25:00Z"
  tasks: 2
  files: 4
  commits:
    - c197d35
    - 492ce0e
    - 3940090
    - 8f37ea4
requirements:
  - STOCK-34
---

# Phase 16 Plan 03: Data Layer per-size Summary

Расширение data layer `/stock/wb` для размерной разбивки: pure-helper `sortSizes` для стабильной сортировки техразмеров + новый тип `WbStockSizeRow` + pure helper `buildSizeBreakdown` + два новых поля `sizeBreakdown[]` / `hasMultipleSizes` на `WbStockRow`.

## Что сделано

### Task 1: `lib/wb-clusters.ts` — sortSizes helper + 10 тестов (TDD)

**Новые экспорты:**

```typescript
// Phase 16 (STOCK-34): известный порядок буквенных размеров одежды/обуви.
// Приватная — расширяемая без breaking change.
const SIZE_ORDER: Record<string, number> = {
  XS: 0, S: 1, M: 2, L: 3, XL: 4,
  "2XL": 5, XXL: 5,
  "3XL": 6, XXXL: 6,
  "4XL": 7, XXXXL: 7,
}

export function sortSizes(sizes: string[]): string[]
```

**Правила сортировки:**
1. Пустые `""` и `"0"` → всегда в конец (товары без размера / одно-размерные)
2. Все числовые → numeric ASC (46, 48, 50, ..., 60)
3. Все буквенные из `SIZE_ORDER` (case-insensitive) → по карте порядка (XS<S<M<L<XL<2XL<3XL<4XL)
4. Mixed (числа + буквы) или unknown → `localeCompare("ru")` fallback

**Гарантии:**
- Возвращает НОВЫЙ массив — input не мутируется (тест 10)
- Стабильная сортировка для пары одинаковых ключей (Array.prototype.sort спецификация v8)
- Case-insensitive lookup через `.toUpperCase()` — оригинальный регистр сохраняется в выводе

**Тесты:** `tests/stock-wb-size-sort.test.ts` — 10 case-ов, все GREEN.

### Task 2: `lib/stock-wb-data.ts` — WbStockSizeRow + buildSizeBreakdown + 9 тестов (TDD)

**Новый тип:**

```typescript
export interface WbStockSizeRow {
  techSize: string
  totalStock: number | null
  clusters: Record<ClusterShortName, ClusterAggregate>
}
```

`clusters` — та же структура что у `WbStockRow.clusters` (Record по 7 кластерам, каждый ClusterAggregate с totalStock + warehouses[]). UI рендерит ту же сетку О/З/Об/Д.

**WbStockRow расширен:**

```typescript
export interface WbStockRow {
  // ...existing fields...
  // Phase 16 (STOCK-34): per-size breakdown под этой nmId-строкой
  sizeBreakdown: WbStockSizeRow[]
  hasMultipleSizes: boolean
}
```

**Pure helper:**

```typescript
export function buildSizeBreakdown(
  warehouses: Array<{
    warehouseId: number
    techSize: string
    quantity: number
    warehouse: {
      name: string
      shortCluster: string | null
      needsClusterReview: boolean
    } | null
  }>,
): WbStockSizeRow[]
```

**Контракт buildSizeBreakdown:**
- `uniqueSizes.size <= 1` → возвращает `[]` (одно-размерные товары не порождают размерных строк; CONTEXT.md «Когда у nmId 1 размер — скрывать»)
- Group warehouses по `techSize` → формирует `WbStockSizeRow` per размер
- Для каждого размера инициализирует все 7 кластеров (из CLUSTER_ORDER), routing идёт по `warehouse.shortCluster` (unknown → "Прочие")
- Per-size `ordersCount = 0`, `ordersPerDay = null`, `totalOrdersCount = null` — per-size orders НЕ хранятся в БД (см. ниже Замечание про per-size orders)
- Sort через `sortSizes()` — стабильный порядок для UI

**Использование в `getStockWbData()`** (один вызов внутри map по wbArticles):
```typescript
const cardWarehouses = card?.warehouses ?? []
const sizeBreakdown = buildSizeBreakdown(
  cardWarehouses.map((ws) => ({ /* normalized */ })),
)
const uniqueSizes = new Set(cardWarehouses.map((ws) => ws.techSize ?? ""))
const hasMultipleSizes = uniqueSizes.size > 1
```

**Тесты:** `tests/stock-wb-data-sizebreakdown.test.ts` — 9 case-ов, все GREEN.

## Замечание про per-size orders (locked в CONTEXT.md и Research)

`WbStockSizeRow.clusters[X].ordersPerDay` ВСЕГДА `null` для всех размеров и кластеров. Причина:

- `getStockWbData()` читает уже-агрегированные orders из `WbCardWarehouseOrders` (БД).
- Эта таблица имеет `@@unique([wbCardId, warehouseId])` БЕЗ techSize — Phase 16 не делает миграцию orders на per-size.
- В памяти `Map<warehouseName, Map<techSize, count>>` доступен только во время sync (lib/wb-api.ts), но в БД попадает уже агрегированным per-warehouse.

**Default-гипотеза CONTEXT.md (locked):** показывать `—` в колонке З размерной строки (честнее, чем пропорциональное распределение). Plan 16-05 рендерит `null` как `—`. Если в будущем потребуется per-size З — задача в STOCK-FUT (миграция WbCardWarehouseOrders на compound с techSize).

## Коммиты

| # | Hash | Файл | Сообщение |
|---|------|------|-----------|
| 1 | `c197d35` | tests/stock-wb-size-sort.test.ts | test(16-03): RED — 10 failing tests для sortSizes (STOCK-34) |
| 2 | `492ce0e` | lib/wb-clusters.ts + tests/stock-wb-size-sort.test.ts | feat(16-03): GREEN — экспорт sortSizes() helper |
| 3 | `3940090` | tests/stock-wb-data-sizebreakdown.test.ts | test(16-03): RED — 9 failing tests для buildSizeBreakdown (STOCK-34) |
| 4 | `8f37ea4` | lib/stock-wb-data.ts + tests/... + deferred-items.md | feat(16-03): GREEN — WbStockSizeRow + buildSizeBreakdown |

## Verification Results

| Acceptance Criteria | Status |
|---|---|
| `lib/wb-clusters.ts` экспортирует `sortSizes(sizes: string[]): string[]` | PASS (1 export) |
| SIZE_ORDER присутствует с XS/S/M/L/XL/2XL/3XL/4XL | PASS |
| `lib/stock-wb-data.ts` экспортирует `WbStockSizeRow` | PASS (1 export) |
| `lib/stock-wb-data.ts` экспортирует `buildSizeBreakdown` | PASS (1 export) |
| `WbStockRow.sizeBreakdown: WbStockSizeRow[]` | PASS (1 field) |
| `WbStockRow.hasMultipleSizes: boolean` | PASS (1 field) |
| `import { sortSizes } from "@/lib/wb-clusters"` в stock-wb-data.ts | PASS (1 import) |
| `buildSizeBreakdown` использован в `getStockWbData()` | PASS (3 ссылки: export + 2 в module) |
| `uniqueSizes.size > 1` truth для `hasMultipleSizes` | PASS (1 expression) |
| `tests/stock-wb-size-sort.test.ts` существует, 10 cases | PASS |
| `tests/stock-wb-data-sizebreakdown.test.ts` существует, 9 cases | PASS |
| `npm run test -- tests/stock-wb-size-sort.test.ts tests/stock-wb-data-sizebreakdown.test.ts` exit 0 | PASS (19/19 GREEN) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug в плане] Test 7 в Task 1 имел противоречивое ожидание**

- **Found during:** Task 1 GREEN phase (sortSizes реализован, 9/10 тестов прошли)
- **Issue:** Plan указал `sortSizes(["S", "", "M"]) → ["M", "S", ""]` (alpha-сорт), но Test 2 в том же плане задаёт `["XL", "S", "M", "L"] → ["S", "M", "L", "XL"]` (SIZE_ORDER). Оба теста используют known-letters (S, M из SIZE_ORDER), значит контракт должен быть один — SIZE_ORDER. Test 7 expectation противоречил test 2.
- **Fix:** Тест 7 переписан под SIZE_ORDER: `["S", "", "M"] → ["S", "M", ""]` (S<M по карте). Реализация sortSizes канонична — пустые в конец, остальные через SIZE_ORDER.
- **Files modified:** `tests/stock-wb-size-sort.test.ts`
- **Commit:** `492ce0e`

**2. [Rule 1 - Bug в плане] Test 9 в Task 2 был одно-размерным**

- **Found during:** Task 2 GREEN phase (buildSizeBreakdown реализован, 8/9 тестов прошли)
- **Issue:** Plan указал тест "неизвестный shortCluster → 'Прочие'" с двумя строками одного размера '46' (один Коледино, один unknown 'Антарктида'). Но контракт `buildSizeBreakdown` возвращает `[]` для `uniqueSizes.size <= 1`, поэтому `result.find((r) => r.techSize === "46")` возвращает undefined → TypeError.
- **Fix:** Тест расширен третьим warehouse с techSize='48' — теперь uniqueSizes.size=2 → buildSizeBreakdown возвращает массив, и тест проверяет routing неизвестного кластера в 'Прочие' для размера '46'.
- **Files modified:** `tests/stock-wb-data-sizebreakdown.test.ts`
- **Commit:** `8f37ea4`

## Auth Gates

None — все изменения локальные (TypeScript helpers + tests).

## Deferred Issues

**`npx tsc --noEmit` exit 0 — НЕ выполнен (out of scope)**

`app/api/wb-sync/route.ts:240` имеет ошибку:
```
error TS2353: Object literal may only specify known properties,
and 'wbCardId_warehouseId' does not exist in type 'WbCardWarehouseStockWhereUniqueInput'.
```

**Root cause:** Plan 16-01 изменил compound unique key `WbCardWarehouseStock` с `(wbCardId, warehouseId)` на `(wbCardId, warehouseId, techSize)`. Prisma Client генерирует ключ как `wbCardId_warehouseId_techSize`. Plan 16-02 (parallel wave 2 с этим планом) обновляет `app/api/wb-sync/route.ts` под новый ключ — но коммиты Plan 16-02 (e2a83e3, 8a331f6, 42cc86a, f7cdca6) живут в sibling worktree (`worktree-agent-a02e0c43`), они ещё не смержены в main и в это worktree.

**Status:** out of scope для Plan 16-03 (Plan 16-02 — отдельный плановый файл, отдельный исполнитель).

**Документировано:** `.planning/phases/16-wb-stock-sizes/deferred-items.md`.

**Verification после merge обоих worktrees в main:**
- `npx tsc --noEmit` → exit 0
- `npm run test` → all green (19 + остальные)

## Что использует Plan 16-04 / 16-05

| Plan | Использует |
|------|-----------|
| **16-04** (server action + RSC) | `WbStockRow.sizeBreakdown[]` через `getStockWbData()` → props в `<StockWbTable>` |
| **16-05** (UI рендер размерных строк) | `card.hasMultipleSizes && showSizes && card.sizeBreakdown.map(...)` для условного рендера; `sizeRow.clusters[X].totalStock/warehouses[i].quantity` для сетки |

## Self-Check: PASSED

**Files verified:**
- FOUND: lib/wb-clusters.ts (modified, +60 lines)
- FOUND: lib/stock-wb-data.ts (modified, +130 lines)
- FOUND: tests/stock-wb-size-sort.test.ts (57 lines)
- FOUND: tests/stock-wb-data-sizebreakdown.test.ts (109 lines)
- FOUND: .planning/phases/16-wb-stock-sizes/deferred-items.md

**Commits verified:**
- FOUND: c197d35 (test: RED sortSizes)
- FOUND: 492ce0e (feat: GREEN sortSizes)
- FOUND: 3940090 (test: RED buildSizeBreakdown)
- FOUND: 8f37ea4 (feat: GREEN buildSizeBreakdown + WbStockSizeRow + WbStockRow extension)

**Tests verified:**
- 19/19 GREEN (10 sortSizes + 9 buildSizeBreakdown)

**Reminder:** `npx tsc --noEmit` имеет 1 ошибку в out-of-scope файле (16-02 territory). После merge sibling worktree эта ошибка исчезнет.
