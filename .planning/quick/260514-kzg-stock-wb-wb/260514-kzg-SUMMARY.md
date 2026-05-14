---
quick_id: 260514-kzg
task: stock-wb-show-all-sizes-highlight-out-of-stock
status: Needs Review
completed: 2026-05-14
duration: ~3min
tasks_completed: 2
files_modified:
  - lib/stock-wb-data.ts
  - components/stock/StockWbTable.tsx
commits:
  - 27614cb: "feat(260514-kzg-01): backfill missing sizes из WbCard.techSizes в stock-wb-data"
  - 3403e4d: "feat(260514-kzg-01): подсветить выпавшие размеры красным в StockWbTable"
requirements:
  - quick-260514-kzg
tech-stack:
  added: []
  patterns:
    - "Visual fallback chain: union(stockSizes, techSizes) для полного списка размеров"
    - "Inline TableCell с условным cn() для override цвета — без модификации общих StockCell/IntCell/DeficitCell"
key-decisions:
  - "Источник полного списка размеров — WbCard.techSizes (Phase 17), не ProductSize (нет linked Product fallback нужен)"
  - "Краснит только число 0, не null/«—» — прочерки остаются muted (визуально консистентнее)"
  - "buildSizeBreakdown techSizes default [] — обратная совместимость с тестами Phase 16"
  - "hasMultipleSizes считает union — товар S/M/L с stock только на M показывает размерные строки"
---

# Quick Task 260514-kzg: /stock/wb — все размеры WB + подсветка выпавших Summary

В /stock/wb (вкладка WB склады, режим «По размерам») теперь показываются ВСЕ размеры из `WbCard.techSizes`, даже без записей в `WbCardWarehouseStock`; «выпавшие» размеры (totalStock=0) подсвечиваются красным в числовых ячейках «О» — продавец сразу видит сигнал к закупке.

## Что сделано

### Task 1 — `lib/stock-wb-data.ts` (commit 27614cb)

**`buildSizeBreakdown(warehouses, techSizes = [])`** — расширена доп. параметром `techSizes: string[]`.

- `effectiveSizes = union(stockSizes, techSizes.filter(s => s && s !== "0"))` — размеры, попавшие только в `techSizes` (нет stock-rows), всё равно формируют WbStockSizeRow с `totalStock=null` и пустыми кластерами.
- Контракт сохранён: `effectiveSizes.size <= 1` → `[]` (одно-размерные товары не дают строк).
- Итерация по `effectiveSizes` вместо `bySize.entries()`; внутри цикла `bySize.get(techSize) ?? []` — пустой массив для «выпавших» размеров.

**`getStockWbData`** теперь передаёт `card.techSizes` вторым параметром в `buildSizeBreakdown`. `hasMultipleSizes` пересчитывает `union(stockSizes, cardTechSizesFiltered).size > 1` — товар, где WB API вернул S/M/L, а в БД stock только M, теперь показывает размерные строки (S и L окажутся «выпавшими»).

### Task 2 — `components/stock/StockWbTable.tsx` (commit 3403e4d)

В callback размерной строки добавлены `isFallenOut = sizeRow.totalStock === 0` и `fallenNumClass = "text-red-600 dark:text-red-500 font-medium"`.

Применено к ячейкам «О» (остаток):

1. **«Всего на WB»** (1 cell) — inline TableCell с условным `cn(...)` (красит при `totalStock!==null && isFallenOut`).
2. **«Итого склады WB» О/З/Об/Д** (4 cells) — заменены inline TableCell: «О» с conditional class, З/Об/Д всегда muted "—".
3. **Кластер collapsed** О/З/Об/Д (4 cells per cluster) — inline TableCell: «О» красная при `clusterStock===0`.
4. **Склад в expanded кластере** О/З/Об/Д (4 cells per warehouse) — inline TableCell: «О» красная при `slotQty===0` (включая случай `slot=undefined → slotQty=0` — склад без stock-row по этому размеру).

**Не трогаем:** `StockCell`, `IntCell`, `DeficitCell` (используются Сводной/per-nmId/non-size rows — риск регрессии). Label «↳ M», bg-muted фон строки, прочерки "—" (остаются muted-foreground — визуально консистентнее).

## Deviations from Plan

None — план выполнен ровно как написан.

## Verification

- `npx tsc --noEmit` → 0 errors после T1 и после T2.
- Existing pre-edit baseline (38 vitest tests) — не запускались (out of scope per план). buildSizeBreakdown получил дефолт `techSizes: string[] = []` → старые тесты, если есть, продолжают работать без правок.
- Структурные инварианты сохранены: размерные строки рендерят то же количество ячеек на ту же позицию (rowSpan/colSpan в шапке не меняли).

## Manual UAT (после deploy)

1. Многоразмерный товар с `techSizes=[S,M,L]` и stock только на M → S и L строки видны, числа красные в «Всего на WB», «Итого WB О», collapsed кластеры (там где stock=0).
2. Default режим (`showSizes=false`) визуально не меняется.
3. Однораразмерные товары (`techSizes=[46]` или `[]`) — размерные строки не появляются.
4. Полноразмерный товар (все размеры с стоком) — никакой красной подсветки.
5. Существующий deficit-coloring (per-nmId / Сводная) — без изменений.

## Self-Check: PASSED

- File `lib/stock-wb-data.ts` — FOUND, modified
- File `components/stock/StockWbTable.tsx` — FOUND, modified
- Commit 27614cb — FOUND
- Commit 3403e4d — FOUND
- tsc 0 errors — VERIFIED после каждого task'а

## Known Stubs

None. Существующая «заглушка» per-size orders (З/Об/Д всегда null = "—") — это deferred Phase 16 контракт, не stub текущей задачи. Зафиксирована в JSDoc `buildSizeBreakdown` и контракте `WbStockSizeRow`.
