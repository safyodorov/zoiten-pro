---
quick_id: 260514-kzg
task: stock-wb-show-all-sizes-highlight-out-of-stock
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/stock-wb-data.ts
  - components/stock/StockWbTable.tsx
autonomous: true
requirements:
  - quick-260514-kzg
must_haves:
  truths:
    - "В /stock/wb при включённом toggle «По размерам» под каждым многоразмерным nmId видны строки для ВСЕХ размеров из WbCard.techSizes, даже без записей в WbCardWarehouseStock"
    - "Строки размеров, у которых totalStock = 0 или null, отображают числа О/З/Об/Д красным (text-red-600 dark:text-red-500) во ВСЕХ колонках: Иваново-плейсхолдер не красим; Всего на WB, sub-cells Товара в пути, Итого WB (4 ячейки), каждый кластер collapsed (4 ячейки) и каждый склад в expanded кластере (4 ячейки)"
    - "Label размера («↳ M») и фон строки НЕ меняются — красятся только числовые значения"
    - "Существующая deficit-окраска для не-выпавших размеров остаётся (yellow/green/red по dеficit threshold); для выпавших размеров переопределяется на сплошную красную"
    - "Default режим /stock/wb без showSizes не меняется, per-nmId Сводная строка не меняется"
    - "Однораразмерные nmId (uniqueSizes.size === 1) НЕ генерируют размерных строк — поведение Phase 16 buildSizeBreakdown сохраняется"
  artifacts:
    - path: "lib/stock-wb-data.ts"
      provides: "buildSizeBreakdown расширен: принимает techSizes из WbCard и добавляет недостающие размеры с totalStock=null"
      contains: "techSizes"
    - path: "components/stock/StockWbTable.tsx"
      provides: "Per-size rows подсвечивают числа красным когда isFallenOut"
      contains: "isFallenOut"
  key_links:
    - from: "lib/stock-wb-data.ts:getStockWbData"
      to: "buildSizeBreakdown"
      via: "передача card.techSizes из WbCard вторым параметром"
      pattern: "buildSizeBreakdown\\(.*techSizes"
    - from: "components/stock/StockWbTable.tsx размерная row"
      to: "sizeRow.totalStock"
      via: "isFallenOut = (sizeRow.totalStock ?? 0) === 0 → cn(text-red-600 dark:text-red-500) override на числовых ячейках"
      pattern: "text-red-600 dark:text-red-500"
---

<objective>
В /stock/wb (вкладка WB склады, режим «По размерам») показывать ВСЕ размеры из `WbCard.techSizes`, даже если у них нет записей в WbCardWarehouseStock/Orders. Размеры с нулевым физическим остатком (totalStock = 0 или null) подсвечивать красным текстом в числовых ячейках — продавец сразу видит «выпавшие» размеры.

Purpose: Сейчас бэкенд (`buildSizeBreakdown`) собирает размер только если есть stock-rows на нём — выпавшие размеры тихо исчезают из таблицы и продавец их не замечает. Это маскирует сигнал к закупке.

Output:
- `lib/stock-wb-data.ts` — `buildSizeBreakdown` принимает доп. параметр `techSizes` и доливает недостающие размеры с пустыми метриками.
- `components/stock/StockWbTable.tsx` — в размерных строках детектится `isFallenOut` и применяется красный текст к числовым ячейкам (override существующего deficit-coloring).
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/260514-kzg-stock-wb-wb/260514-kzg-CONTEXT.md
@./CLAUDE.md
@lib/stock-wb-data.ts
@components/stock/StockWbTable.tsx
@prisma/schema.prisma

<interfaces>
<!-- Extracted from current codebase — executor uses these directly. -->

From prisma/schema.prisma (model WbCard):
```prisma
model WbCard {
  id                  String   @id @default(cuid())
  nmId                Int      @unique
  // ...
  // Phase 17: techSizes из sizes[].techSize (исключая "0" для one-size товаров).
  characteristics     Json?
  techSizes           String[] @default([])
  // ...
  warehouses          WbCardWarehouseStock[]   // include в getStockWbData
  warehouseOrders     WbCardWarehouseOrders[]
}
```

From lib/stock-wb-data.ts (current contracts):
```ts
export interface WbStockSizeRow {
  techSize: string
  totalStock: number | null
  clusters: Record<ClusterShortName, ClusterAggregate>
}

export function buildSizeBreakdown(
  warehouses: Array<{
    warehouseId: number
    techSize: string
    quantity: number
    warehouse: { name: string; shortCluster: string | null; needsClusterReview: boolean } | null
  }>,
): WbStockSizeRow[]
```

Current behaviour (before patch):
- `uniqueSizes` берётся только из `warehouses.map(w => w.techSize)`. Если в БД нет записей по размеру — он отсутствует.
- `if (uniqueSizes.size <= 1) return []` — однораразмерные товары не дают строк (сохранить).
- Сортировка через `sortSizes()` из `@/lib/wb-clusters`.

Required behaviour (after patch):
- Доп. параметр `techSizes: string[]` (из `card.techSizes`).
- `effectiveSizes = union(uniqueSizes_from_warehouses, techSizes.filter(s => s !== "0" && s !== ""))`.
- Если `effectiveSizes.size <= 1` → `return []` (однораразмерные — без строк).
- Для каждого размера ∈ effectiveSizes:
  - Если есть stock-rows → как сейчас (aggregate по кластерам).
  - Если НЕТ stock-rows → создаём WbStockSizeRow с `totalStock: null`, кластеры инициализированы (totalStock=null, warehouses=[], totalOrdersCount=null, ordersPerDay=null) — как пустые кластеры в текущем коде.
- Сортировка: согласно D-3 CONTEXT.md — **порядок WbCard.techSizes preserved**. Заметим: `sortSizes()` уже даёт стабильный результат (числа ASC / SIZE_ORDER S/M/L/XL / алфавит). Используем `sortSizes()` — это та же логика что и сейчас, и она устойчиво сортирует независимо от порядка входа. Это совместимо с CONTEXT (WB techSizes уже разумно отсортирован → sortSizes не ломает порядок). НЕ добавляем новый sort helper.

From components/stock/StockWbTable.tsx (per-size rendering, lines ~666-731):
- Размерная строка рендерится через `{showSizes && card.hasMultipleSizes && card.sizeBreakdown.map((sizeRow) => (...))}`.
- Используются компоненты `<StockCell>`, `<IntCell>`, `<DeficitCell>` — они не принимают prop'а для override цвета. Inline-рендер с `<TableCell className={cn(...)}>` уже есть в одном месте (per-warehouse deficit).

Strategy for red-highlighting (per CONTEXT D-4 + clarification):
- НЕ модифицировать `StockCell`/`IntCell`/`DeficitCell` (риск регрессии в Сводной/per-nmId/non-size rows).
- Внутри размерной строки заменить `<StockCell>` / `<IntCell>` / `<DeficitCell>` на **inline TableCell c условным классом** ТОЛЬКО для тех ячеек, где значение должно стать красным при `isFallenOut`.
- Альтернатива: extract local helper `<FallenStockCell>`, `<FallenIntCell>`, `<FallenDeficitCell>` — но проще inline (используется один раз per row).

`isFallenOut` сigна:
```ts
const isFallenOut = (sizeRow.totalStock ?? 0) === 0
```

Color class:
```ts
const fallenColor = isFallenOut ? "text-red-600 dark:text-red-500 font-medium" : ""
```

Применяется к ячейкам (всего N во ВСЕХ колонках одной размерной row):
1. «Всего на WB» (1 cell) — текущее: `<TableCell className="...">` с inline display
2. «Итого склады WB» — 4 cells (О/З/Об/Д); сейчас `<StockCell><StockCell><IntCell><DeficitCell>`
3. Каждый кластер collapsed: 4 cells (О/З/Об/Д); сейчас `<StockCell><StockCell><IntCell><DeficitCell>`
4. Каждый склад в expanded кластере: 4 cells; сейчас `<StockCell><StockCell><IntCell>< inline TableCell>`

«Иваново» (placeholder `—`) и 3 ячейки «Товар в пути» (placeholders `—`) — НЕ красим (там и так muted-foreground, не числа).

Important: existing `<DeficitCell>` имеет логику yellow/green/red на основе threshold. У размерных строк deficit всегда null (так как ordersPerDay=null) → текущий цвет = text-muted-foreground. Override: для выпавших — text-red-600 заменяет text-muted-foreground; визуально — у нас "—", окрашивать "—" не очень важно, но для консистентности применяем тот же класс.

Чтобы для выпавших ячейка `—` не выглядела красным (это путает), уточнение: красим только числовые значения, не `—`. Реализация:
- В inline ячейке: `text-right` + если `value !== null && isFallenOut` → `text-red-600 dark:text-red-500 font-medium`, иначе текущая логика.
- Для размерных строк: `sizeRow.totalStock` может быть null (когда нет stock-rows вообще для этого размера) — это число «О» в Итого WB и Всего WB.
  - "Всего на WB" при null → "—" (не красить).
  - "О" в Итого WB при null → "—" (не красить).
  - "З/Об/Д" в Итого WB ВСЕГДА null (per-size orders нет) → "—" (не красить).
- При isFallenOut=true и totalStock=0 → "0" красным.
- При isFallenOut=true и totalStock=null → "—" muted (не красным).

Уточнённая формула:
```ts
const isFallenOut = sizeRow.totalStock === 0  // строго 0, не null
```
Это совпадает с D-2 CONTEXT.md: «Остаток = 0 или null → красный». НО null визуально остаётся "—" muted (не красим — выглядит неуместно). Краснеем только когда есть число 0.

Финальное правило: `isFallenOut = sizeRow.totalStock === 0`. Краснит цифру 0 в О-колонках. Остальные ячейки (где null) рендерятся как обычно через `—`.

Для caсла кластера: `clusterTotalStock = sizeRow.clusters[c].totalStock`. В размерной row сейчас этот totalStock = sum stock-rows; если в кластере нет складов → totalStock=null (NOT 0). Если в кластере есть склад с qty=0 → totalStock=0 (а такие записи в WbCardWarehouseStock существуют? обычно нет — записи создаются только когда qty > 0; пустых rows быть не должно). Безопасно проверять `clusterTotalStock === 0`.

Для warehouseSlot в expanded: `slot?.quantity ?? 0` — если slot не найден (склад не имеет stock-row на этом размере), всегда 0 → краснит. Это И есть желаемое поведение по CONTEXT: «склад без остатка по размеру → красный».
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: buildSizeBreakdown — доливать недостающие размеры из WbCard.techSizes</name>
  <files>lib/stock-wb-data.ts</files>
  <action>
    Расширить `buildSizeBreakdown` доп. параметром `techSizes: string[]` (default `[]` для обратной совместимости с тестами Phase 16 если есть).

    1) Изменить сигнатуру:
    ```ts
    export function buildSizeBreakdown(
      warehouses: Array<{...}>,
      techSizes: string[] = [],
    ): WbStockSizeRow[]
    ```

    2) Внутри функции после строки `const uniqueSizes = new Set<string>(warehouses.map((w) => w.techSize ?? ""))` добавить:
    ```ts
    // Phase 17/quick 260514-kzg: добить недостающие размеры из WbCard.techSizes
    // (даже если в БД нет stock-rows). Фильтруем "" и "0" — это one-size sentinel.
    const extraSizes = techSizes.filter((s) => s && s !== "0")
    const effectiveSizes = new Set<string>([...uniqueSizes, ...extraSizes])

    // Однораразмерные товары не дают строк (контракт Phase 16 сохраняется).
    if (effectiveSizes.size <= 1) return []
    ```
    Заменить ВЕСЬ блок проверки `if (uniqueSizes.size <= 1) return []` (строка ~401) на новый код.

    3) Перед циклом `for (const [techSize, sizeWarehouses] of bySize.entries())` (строка ~414) изменить логику:
    Заменить итерацию по `bySize.entries()` на итерацию по `effectiveSizes`:
    ```ts
    for (const techSize of effectiveSizes) {
      const sizeWarehouses = bySize.get(techSize) ?? []  // пустой массив для размеров без stock-rows
      // ... остальной код тот же ...
    }
    ```

    4) Внутри цикла — текущая логика инициализации `clusters`, `totalStock`, и `for (const w of sizeWarehouses)` сохраняется как есть. Если `sizeWarehouses` пустой — `totalStock` останется `null`, все кластеры останутся с `totalStock=null`, `warehouses=[]` (что и нужно — пустая строка размера).

    5) Сортировка через `sortSizes(rows.map(r => r.techSize))` остаётся без изменений — она работает с любым набором размеров.

    6) В вызывающем коде `getStockWbData` (около строки 319) передать `card.techSizes` вторым параметром:
    ```ts
    const sizeBreakdown = buildSizeBreakdown(
      cardWarehouses.map((ws) => ({...})),
      card?.techSizes ?? [],
    )
    ```

    7) Скорректировать `uniqueSizes` для `hasMultipleSizes` (строка 333-334): использовать `effectiveSizes`-эквивалент. Сейчас:
    ```ts
    const uniqueSizes = new Set<string>(cardWarehouses.map((ws) => ws.techSize ?? ""))
    const hasMultipleSizes = uniqueSizes.size > 1
    ```
    Изменить на:
    ```ts
    // Учитываем techSizes из карточки, чтобы выпавшие размеры тоже считались "multiple"
    const stockSizes = new Set<string>(cardWarehouses.map((ws) => ws.techSize ?? ""))
    const cardTechSizesFiltered = (card?.techSizes ?? []).filter((s) => s && s !== "0")
    const effectiveSizeCount = new Set([...stockSizes, ...cardTechSizesFiltered]).size
    const hasMultipleSizes = effectiveSizeCount > 1
    ```
    Это важно: товар где WB API вернул techSizes=["S","M","L"] но в БД stock есть только на "M" — сейчас hasMultipleSizes=false (одно значение в stockSizes) → размерные строки не рендерятся. После фикса hasMultipleSizes=true → размерные строки видны, "S" и "L" красные.

    JSDoc для `buildSizeBreakdown` обновить: упомянуть параметр techSizes, описать поведение для размеров без stock-rows (totalStock=null, кластеры пустые).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    - `buildSizeBreakdown(warehouses, techSizes)` принимает второй параметр и доливает недостающие размеры.
    - Вызов в getStockWbData передаёт card.techSizes.
    - `hasMultipleSizes` учитывает union(stockSizes, techSizes).
    - tsc проходит без ошибок.
    - Существующее поведение для размеров с stock-rows не изменилось (только дополнились пустые размеры).
  </done>
</task>

<task type="auto">
  <name>Task 2: StockWbTable — подсветка красным выпавших размеров</name>
  <files>components/stock/StockWbTable.tsx</files>
  <action>
    Внутри размерной строки (`{showSizes && card.hasMultipleSizes && card.sizeBreakdown.map((sizeRow) => (...))}`, строки ~666-731) добавить локальный флаг `isFallenOut` и применить красный цвет к числовым ячейкам.

    1) В callback `(sizeRow) => (...)` сразу после `key=...` (или внутри JSX перед TableRow) добавить:
    ```tsx
    const isFallenOut = sizeRow.totalStock === 0
    const fallenNumClass = isFallenOut ? "text-red-600 dark:text-red-500 font-medium" : ""
    ```

    2) Заменить inline-ячейки в размерной row:

    **(a) «Всего на WB» (строка ~681-683):**
    Сейчас:
    ```tsx
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r">
      {sizeRow.totalStock !== null ? formatInt(sizeRow.totalStock) : <span className="text-muted-foreground">—</span>}
    </TableCell>
    ```
    Заменить на:
    ```tsx
    <TableCell className={cn("px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right border-r", sizeRow.totalStock !== null && fallenNumClass)}>
      {sizeRow.totalStock !== null ? formatInt(sizeRow.totalStock) : <span className="text-muted-foreground">—</span>}
    </TableCell>
    ```

    **(b) «Итого склады WB» О/З/Об/Д (строки ~689-692):**
    Сейчас:
    ```tsx
    <StockCell value={sizeRow.totalStock} />
    <StockCell value={null} />
    <IntCell value={null} />
    <DeficitCell deficit={null} threshold={null} />
    ```
    Заменить на 4 inline TableCell — только «О» получает fallenNumClass когда totalStock=0; З/Об/Д остаются "—" muted (не красим):
    ```tsx
    <TableCell className={cn("px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right", sizeRow.totalStock !== null && fallenNumClass)}>
      {sizeRow.totalStock !== null ? formatStockValue(sizeRow.totalStock) : <span className="text-muted-foreground">—</span>}
    </TableCell>
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground">—</TableCell>
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground">—</TableCell>
    <TableCell className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground border-r">—</TableCell>
    ```
    NB: NO `border-r` на первые 3 (между О-З, З-Об, Об-Д нет границы), только на последней «Д» (по аналогии с DeficitCell).

    **Уточнение CONTEXT D-4:** decision говорит «4 числовых ячейки во ВСЕХ колонках». Но в размерной row З/Об/Д = null = "—" — это НЕ число. Реалистично красить можно только те ячейки, где есть число. Применяем правило: «красим число; если ячейка содержит `—`, цвет остаётся muted-foreground». Это соответствует общему UI-принципу проекта (см. формат-функции stockQty, deficit).

    **(c) Кластеры collapsed:**
    Сейчас:
    ```tsx
    <StockCell key={`${cluster}-size-o`} value={sizeClusterAgg.totalStock ?? null} />
    <StockCell key={`${cluster}-size-z`} value={null} />
    <IntCell key={`${cluster}-size-ob`} value={null} />
    <DeficitCell key={`${cluster}-size-d`} deficit={null} threshold={null} />
    ```
    Заменить (внутри `return [...]`) на 4 inline TableCell. «О» получает fallenNumClass при `sizeClusterAgg.totalStock === 0`:
    ```tsx
    const clusterStock = sizeClusterAgg.totalStock
    const clusterIsFallen = clusterStock === 0
    return [
      <TableCell key={`${cluster}-size-o`} className={cn("px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right", clusterStock !== null && clusterIsFallen && "text-red-600 dark:text-red-500 font-medium")}>
        {clusterStock !== null ? formatStockValue(clusterStock) : <span className="text-muted-foreground">—</span>}
      </TableCell>,
      <TableCell key={`${cluster}-size-z`} className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground">—</TableCell>,
      <TableCell key={`${cluster}-size-ob`} className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground">—</TableCell>,
      <TableCell key={`${cluster}-size-d`} className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground border-r">—</TableCell>,
    ]
    ```

    **(d) Кластеры expanded (per-warehouse):**
    Сейчас (строки ~709-720):
    ```tsx
    return [
      <StockCell key={`${cluster}-size-${w.warehouseId}-o`} value={slotQty} />,
      <StockCell key={`${cluster}-size-${w.warehouseId}-z`} value={null} />,
      <IntCell key={`${cluster}-size-${w.warehouseId}-ob`} value={null} />,
      <TableCell key={`${cluster}-size-${w.warehouseId}-d`} className={cn(..., borderClass)}>—</TableCell>,
    ]
    ```
    Изменить «О» на inline с fallenNumClass когда `slotQty === 0`:
    ```tsx
    const slotIsFallen = slotQty === 0
    return [
      <TableCell key={`${cluster}-size-${w.warehouseId}-o`} className={cn("px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right", slotIsFallen && "text-red-600 dark:text-red-500 font-medium")}>
        {formatStockValue(slotQty)}
      </TableCell>,
      <TableCell key={`${cluster}-size-${w.warehouseId}-z`} className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground">—</TableCell>,
      <TableCell key={`${cluster}-size-${w.warehouseId}-ob`} className="px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground">—</TableCell>,
      <TableCell key={`${cluster}-size-${w.warehouseId}-d`} className={cn("px-2 py-1 h-8 text-xs leading-tight tabular-nums text-right text-muted-foreground", borderClass)}>—</TableCell>,
    ]
    ```

    NB: `formatStockValue` уже определён в файле (строка 31). Не дублировать.

    3) Иваново-плейсхолдер (строка ~679) и 3 ячейки Товар в пути (строки ~685-687) — НЕ трогать (они и так muted "—").

    4) Sanity check: проверить что `formatStockValue` обрабатывает `0` корректно: `0 < 10 → "0.0"`. Это не идеально (нужно `"0"`, а не `"0.0"`). Но это существующее поведение для других строк проекта — не меняем (out of scope).

    5) НЕ менять `StockCell`/`IntCell`/`DeficitCell` — они используются Сводной и per-nmId, любое изменение может сломать существующее поведение.

    6) Label размера «↳ M» (строка ~676) НЕ красим — по CONTEXT D-4.

    7) Background строки `bg-muted` НЕ меняем — по CONTEXT D-4.

    8) Существующая deficit-окраска: для размерных строк deficit ВСЕГДА null (orders=null) → текущее поведение = muted "—". С нашим патчем «О» красным, остальные ячейки muted — конфликта нет (D и так "—").
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>
    - В размерной строке `isFallenOut = sizeRow.totalStock === 0` детектится.
    - Числа «О» в «Всего на WB», «Итого WB», каждом кластере collapsed и каждом складе в expanded — красные при isFallenOut.
    - Ячейки с null/"—" остаются muted-foreground (не красим прочерки).
    - Label «↳ M» и фон строки не изменены.
    - StockCell/IntCell/DeficitCell не модифицированы.
    - tsc проходит без ошибок.
  </done>
</task>

</tasks>

<verification>

## Manual UAT (после deploy на VPS)

1. **Базовый случай — товар где WB вернул больше размеров чем в БД:**
   - Найти многоразмерный товар (одежда), у которого в `WbCard.techSizes` ≥ 2 размера, а в `WbCardWarehouseStock` есть rows только по части из них.
   - Открыть /stock/wb, включить «По размерам».
   - Под nmId должны быть строки для ВСЕХ размеров из techSizes.
   - У размеров без stock-rows: «Всего на WB» = "—", все кластеры = "—", «Итого WB О» = "—".
   - У размеров с stock=0 на каком-то складе (в expanded view): «О» этого склада = "0" красным.
   - У размеров где totalStock = 0 (нигде нет): «Всего на WB» = "0" красным, «Итого WB О» = "0" красным, все кластеры «О» = "0" или "—" (красным если 0).

2. **Default (showSizes=false):** Никаких визуальных изменений. Только Сводная + per-nmId без размерных строк.

3. **Однораразмерные товары:** Не появляются размерные строки даже если techSizes=["46"] (1 элемент).

4. **Полноразмерный товар (все размеры с стоком):** Размерные строки отображаются как раньше, никакой красной подсветки.

5. **Существующий deficit-coloring (per-nmId / Сводная):** Не затронут, yellow/green/red работают как раньше.

## Out of scope (НЕ проверять в этом quick task)

- Per-size orders (Phase 16 deferred — З/Об/Д остаются "—")
- Cледующих миграций на ProductSize/Barcode
- Сортировка размеров по продуктовому правилу (доверяем sortSizes)
- Подсветка label/фона строки

</verification>

<success_criteria>

- [ ] Файл `lib/stock-wb-data.ts`: `buildSizeBreakdown` принимает `techSizes` параметр, доливает недостающие размеры пустыми кластерами. `getStockWbData` передаёт `card.techSizes`. `hasMultipleSizes` учитывает union.
- [ ] Файл `components/stock/StockWbTable.tsx`: в размерных строках детектится `isFallenOut`, применяется `text-red-600 dark:text-red-500 font-medium` к ячейкам «О» (Всего на WB, Итого WB О, кластер collapsed О, склад expanded О) когда соответствующее число = 0. StockCell/IntCell/DeficitCell не модифицированы.
- [ ] `npx tsc --noEmit` проходит без ошибок.
- [ ] Pre-existing vitest tests (38 baseline) не сломаны — НЕ запускать, но если запустить должны пройти.
- [ ] Default режим (без showSizes) визуально не изменился — баг-фикс не утекает.
- [ ] Однораразмерные товары не порождают размерные строки.

</success_criteria>

<output>
После завершения создать `.planning/quick/260514-kzg-stock-wb-wb/260514-kzg-SUMMARY.md` (статус: Needs Review до прод-проверки пользователем).
</output>
