---
phase: 260513-phu
plan: 01
subsystem: ui-data-tables
tags: [ux, sticky-tables, resizable-columns, tooltip, clipboard, user-preferences]
dependency-graph:
  requires:
    - "lib/use-resizable-columns.tsx (NEW)"
    - "lib/copy-to-clipboard.ts (NEW)"
    - "app/actions/user-preferences.ts (existing, no changes)"
    - "components/ui/tooltip.tsx (existing, no changes)"
  provides:
    - "Shared resizable columns hook (useResizableColumns + ColumnResizeHandle)"
    - "Shared clipboard helper (copyToClipboard)"
    - "Persisted column widths в /stock и /stock/wb (UserPreference keys: stock.columnWidths, stock.wb.columnWidths)"
    - "Always-on Tooltip с полным product name в /prices/wb, /stock, /stock/wb"
    - "1-click copy SKU/article в /stock и /stock/wb"
    - "Brand line под product name в /prices/wb Сводной"
  affects:
    - "/prices/wb (миграция inline-resize → hook, без поведенческих регрессий)"
    - "/stock (новый persisted resize + tooltip + copy)"
    - "/stock/wb (новый persisted resize + tooltip + copy; кластерные колонки без resize by design)"
tech-stack:
  added: []
  patterns:
    - "Shared client-side hook с DB-persist (UserPreference) — паттерн из CLAUDE.md «Per-user UI настройки»"
    - "Cumulative sticky left offsets через {photo, svodka, yarlyk, artikul}-widths reduce — позволяет resize sticky колонок без ломки sticky positioning"
    - "table-fixed + border-separate + bg-background thead — sticky pattern из CLAUDE.md «Sticky data-таблицы»"
key-files:
  created:
    - "lib/use-resizable-columns.tsx"
    - "lib/copy-to-clipboard.ts"
  modified:
    - "components/prices/PriceCalculatorTable.tsx"
    - "components/stock/StockProductTable.tsx"
    - "components/stock/StockWbTable.tsx"
    - "app/(dashboard)/prices/wb/page.tsx"
    - "app/(dashboard)/stock/page.tsx"
    - "app/(dashboard)/stock/wb/page.tsx"
decisions:
  - "useResizableColumns переиспользует setUserPreference (DB persist) — НЕ localStorage. Per CLAUDE.md, ширины колонок должны переживать смену браузера и устройства."
  - "В StockWbTable кластерные колонки (7 кластеров × 4 sub) НЕ resizable — их структура зависит от expand state, и добавление resize усложнило бы layout. Использован фиксированный clusterW=60px."
  - "Tooltip — always-on (не overflow-detect). Когда product name короткий, tooltip покажет ту же строку (UX OK, проще код)."
  - "Brand-line добавлена только в /prices/wb. В /stock и /stock/wb brandName уже отдельной строкой в Сводной (не дублируем)."
  - "Copy SKU и article-cell через `e.stopPropagation()` — не открывает модалку/не делает navigate."
  - "В stock-wb cluster колонки имеют 4 ячейки per cluster (О/З/Об/Д) без resize handle; sub-columns О/З/Об/Д для top-level «Итого склады WB» и «Товар в пути» имеют resize handle."
metrics:
  duration: "~25 минут"
  completed: "2026-05-13"
---

# Quick Task 260513-phu: Resizable columns + Tooltip + Copy + Brand line Summary

4 UX-улучшения в data-таблицах /prices/wb, /stock, /stock/wb.

## Outcome

1. **Resizable columns в /stock и /stock/wb** — drag правой границы заголовка, debounced save через `setUserPreference` (DB), double-click → reset к дефолту. Ширины persist между сессиями/устройствами.
2. **Always-on Tooltip на product name** во всех 3 таблицах — `line-clamp-2` обрезает длинные названия в Сводке, hover показывает полное.
3. **1-click copy SKU/article** в /stock и /stock/wb — клик по ячейке копирует значение + `toast.success("Артикул XXX скопирован")`. PriceCalculatorTable раньше имела inline navigator.clipboard, теперь — общий helper.
4. **Brand line под product name** в /prices/wb Сводной — `text-xs text-muted-foreground`. Только там (в /stock/wb brandName уже выводится отдельной строкой).

## Files

### Created

- **`lib/use-resizable-columns.tsx`** — Shared React hook `useResizableColumns<K>(storageKey, defaultWidths, initialWidths)` + `ColumnResizeHandle` компонент. Drag через requestAnimationFrame throttle, save debounced 500ms через `setUserPreference`. MIN_COLUMN_WIDTH=60.
- **`lib/copy-to-clipboard.ts`** — Pure helper `copyToClipboard(text, label?)` с toast.success/error. Edge case: navigator.clipboard может throw в не-HTTPS — toast.error.

### Modified

- **`components/prices/PriceCalculatorTable.tsx`**
  - Удалены: in-line `MIN_COLUMN_WIDTH`, `RESIZE_SAVE_DEBOUNCE_MS`, `PREFERENCE_KEY`, `saveTimerRef`, `scheduleSave`, `resizeStateRef`, `rafIdRef`, `handleMouseMove`, `handleMouseUp`, `startResize`, `resetColumnWidth`, локальный `ColumnResizeHandle`. Часть cleanup useEffect для resize.
  - Добавлено: import `useResizableColumns`/`ColumnResizeHandle` из lib, `copyToClipboard`, `Tooltip/TooltipTrigger/TooltipContent`. Hook вызов сохраняет имя `columnWidths` через destructuring (30+ обращений к `columnWidths[key]` не изменились).
  - Product name обёрнут в `<Tooltip>` с `line-clamp-2` (было `-3`), brand-line `{group.product.brandName && <div className="text-xs text-muted-foreground">{...}</div>}` под name.
  - Replaced inline navigator.clipboard на `copyToClipboard(String(cardGroup.card.nmId), "Артикул")`.
  - `ProductGroup.product` расширена optional `brandName?: string | null`.

- **`components/stock/StockProductTable.tsx`** — Полностью переписана: useResizableColumns с 19 ключами, cumulative sticky lefts, Tooltip+copy в Сводной, copy article в per-article строках. `table-fixed` class + `bg-background` thead (CLAUDE.md sticky pattern).
- **`components/stock/StockWbTable.tsx`** — Полностью переписана: useResizableColumns с 12 ключами (3 sticky + Иваново + Всего на WB + Товар в пути × 3 + Итого WB × 4). Кластерные cells — без resize, ширина 60px фиксирована. Tooltip+copy в Сводной, copy nmId в per-nmId.
- **`app/(dashboard)/prices/wb/page.tsx`** — Добавлено поле `brandName: firstProduct.brand?.name ?? null` в groups.push.
- **`app/(dashboard)/stock/page.tsx`** — `getUserPreference<Record<string, number>>("stock.columnWidths")` в Promise.all, `initialColumnWidths` проп.
- **`app/(dashboard)/stock/wb/page.tsx`** — `getUserPreference<Record<string, number>>("stock.wb.columnWidths")` в Promise.all, `initialColumnWidths` проп.

## Acceptance status (11 must_haves.truths)

| # | Truth | Status |
|---|-------|--------|
| 1 | В /stock и /stock/wb колонки таблицы можно тянуть за правую границу — ширина изменяется визуально | ✅ через useResizableColumns hook + ColumnResizeHandle |
| 2 | После перезагрузки страницы сохранённые ширины применяются автоматически | ✅ getUserPreference в page.tsx → initialColumnWidths → hook merge с defaults |
| 3 | Двойной клик по handle сбрасывает ширину колонки к дефолту | ✅ `onDoubleClick={() => resetColumnWidth(key)}` |
| 4 | Product name в Сводной /prices/wb, /stock и /stock/wb отображается максимум в 2 строки (line-clamp-2) | ✅ изменено с `line-clamp-3` на `line-clamp-2` в PriceCalculatorTable, было уже `line-clamp-2` в /stock и /stock/wb |
| 5 | При наведении на product name появляется Tooltip с полным названием | ✅ base-ui Tooltip render-prop в каждой таблице |
| 6 | Клик на ячейку с SKU (УКТ) в /stock и /stock/wb копирует значение + toast | ✅ copyToClipboard(p.sku, "Артикул") / copyToClipboard(g.productSku, "Артикул") |
| 7 | Клик на ячейку с маркетплейсным артикулом (per-article строка /stock) копирует значение + toast | ✅ copyToClipboard(a.article, "Артикул") |
| 8 | В /prices/wb Сводная строка под product name показывает product.brand.name мелким шрифтом | ✅ Task 3: brandName проброс в page.tsx + render в PriceCalculatorTable |
| 9 | В /stock и /stock/wb brand-line под name отсутствует (НЕ дублируется/НЕ удаляется существующий brandName) | ✅ существующий `<div className="text-xs text-muted-foreground">{p.brandName}</div>` сохранён без изменений |
| 10 | PriceCalculatorTable использует общий хук useResizableColumns вместо in-line логики | ✅ inline state/refs/handlers удалены, hook destructured как `widths: columnWidths` |
| 11 | Sticky-структура шапки не сломана: thead остаётся sticky, фон background сплошной, нет мерцания | ✅ `bg-background` thead, `border-separate border-spacing-0 table-fixed`, `sticky top-0 z-30` на sticky колонках. Cumulative sticky lefts из widths гарантируют корректный shift при resize |

## Deviations from Plan

### File extension correction (Rule 3 — blocking issue)

**Found during:** Task 1 first tsc check
**Issue:** Hook файл создавал JSX (`<div>` в ColumnResizeHandle), но имя было `lib/use-resizable-columns.ts` (без `x`). tsc ругался: `error TS1005: '>' expected.`
**Fix:** Переименован в `lib/use-resizable-columns.tsx`. План использовал `.ts`, исправлено в коде и в этом SUMMARY.
**Files modified:** `lib/use-resizable-columns.ts` → `lib/use-resizable-columns.tsx`
**Commit:** часть Task 1 commit (f97cf56)

### Stock/wb cluster cells — fixed width вместо resize (scope clarification)

Plan §scope_notes пункт 7 уже описывал это: «Кластерные колонки — БЕЗ resize». В реализации кластерные ячейки получают `width={clusterW}` где `const clusterW = 60` (захардкожен внутри ProductWbGroup map). Это минимально достаточно для отображения О/З/Об/Д с табулярным шрифтом.

### Auto-fixes

Никаких авто-фиксов уровня Rule 1/2 не понадобилось.

### Authentication gates

Нет.

## Self-Check: PASSED

- `lib/use-resizable-columns.tsx` существует, экспортирует useResizableColumns + ColumnResizeHandle (verified Read).
- `lib/copy-to-clipboard.ts` существует, экспортирует copyToClipboard (verified Read).
- Все 6 modified files commited (verified git log).
- Commits:
  - `f97cf56` feat(260513-phu-01): extract shared useResizableColumns hook + copyToClipboard helper + PriceCalculatorTable migration
  - `bd7bbaf` feat(260513-phu-01): apply resizable + Tooltip + copy в /stock and /stock/wb
  - `cb24972` feat(260513-phu-01): brand line under product name в /prices/wb
- tsc --noEmit: 0 errors ✅
- npm test: 38 failed / 457 passed = baseline preserved (no new failures introduced) ✅

## Smoke test commands (manual, local dev)

```bash
# 1. Запустить dev
npm run dev

# 2. Открыть /prices/wb
# - Drag правой границы колонки «Цена продавца» → ширина меняется
# - Двойной клик handle → reset
# - Hover на product name → Tooltip с полным name
# - Под name видна brandName (text-muted-foreground)
# - Click на nmId → toast «Артикул XXX скопирован»

# 3. Открыть /stock
# - Drag правой границы Сводки → ширина меняется (cumulative sticky lefts двигают остальные sticky колонки)
# - Reload страницы → ширины сохранены (через UserPreference)
# - Hover на product name → Tooltip
# - Click на SKU/article cell → toast

# 4. Открыть /stock/wb
# - Drag правой границы «Иваново» / «Всего на WB» / «Товар в пути» / «Итого склады WB» — работает
# - Кластерные колонки (ЦФО, СЗФО...) — НЕ resize-абельны (by design)
# - Hover на product name → Tooltip
# - Click на productSku → toast «Артикул УКТ-... скопирован»
# - Click на nmId → toast «Артикул 123456789 скопирован»

# 5. Deploy (после ревью)
ssh root@85.198.97.89 'cd /opt/zoiten-pro && bash deploy.sh'
```
