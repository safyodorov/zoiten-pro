---
phase: 16-wb-stock-sizes
plan: 05
subsystem: ui

tags: [stock-wb, react, table, optimistic-update, useTransition, per-user-prefs, sticky-table, react-fragment]

# Dependency graph
requires:
  - phase: 14-stock
    provides: Базовая sticky-таблица /stock/wb с per-cluster колонками + per-warehouse expand
  - phase: 15-per-cluster-orders
    provides: Per-cluster ordersPerDay в WbStockRow.clusters[].ordersPerDay
  - phase: 16-wb-stock-sizes (16-01, 16-03, 16-04)
    provides: User.stockWbShowSizes Boolean, WbStockSizeRow type + sizeBreakdown/hasMultipleSizes на WbStockRow, saveStockWbShowSizes server action, page.tsx initialShowSizes prop
provides:
  - Кнопка «По размерам» в верхнем toolbar /stock/wb с optimistic toggle
  - Per-user persist toggle через useTransition → saveStockWbShowSizes
  - Render размерных строк (size rows) под per-nmId TableRow с полной cluster/warehouse структурой
  - rowSpan recalc для sticky cells (Фото/Сводка/Иваново/Артикул) с учётом размерных строк
  - React.Fragment wrap для per-nmId TableRow — позволяет render multiple TableRow'ов как сиблингов внутри map'а
affects: [Phase 16-06 deploy + UAT, future v2 per-size orders/in-way support]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "B5 split: Структурное изменение JSX (Fragment wrap + rowSpan) + JSX render в отдельных tasks для безопасной балансировки скобок"
    - "Optimistic toggle + per-user persist: useState + useTransition → server action с revalidatePath (паттерн quick 260422-oy5)"
    - "Composite-row table: внутри map() функции один-к-многим — Fragment(card) → TableRow(per-nmId) + N×TableRow(per-size)"
    - "Inter/intra-group borders: border-r полный между складами кластера (last), border-r-border/40 (40%) между складами внутри кластера"

key-files:
  created:
    - .planning/phases/16-wb-stock-sizes/16-05-SUMMARY.md
  modified:
    - components/stock/StockWbTable.tsx (extended Props + toolbar Button + Fragment wrap + size rows render)

key-decisions:
  - "Plan 16-05 использует контракт-driven разработку: импортирует из @/app/actions/stock-wb (Plan 16-04) и @/lib/stock-wb-data (Plan 16-03) даже если они недоступны в parallel worktree — финальная сборка после merge всех 16-01..16-05 закрывает TS-ошибки"
  - "B5 split-pattern для JSX: Task 2 = только Fragment wrap + rowSpan recalc (TODO маркер), Task 3 = только JSX render — каждый task самодостаточный, балансировка скобок не размывается между задачами"
  - "Размерная строка имеет ТОЧНО ту же column-структуру что и per-nmId row (О/З/Об/Д per cluster + per-warehouse при expanded), но: О из sizeRow.totalStock; З/Об/Д = null → '—' (per-size orders не доступны в БД, deferred до v2)"
  - "hideSc / hiddenWarehouseIds применяются к visibleClusterWarehouses в expanded view размерной строки — visual filter only, идентично per-nmId row"
  - "card.hasMultipleSizes === false → размерная строка НЕ рендерится даже при showSizes=true (one-size товары избегают дубликатов)"
  - "Fragment key {card.wbCardId} переехал с TableRow на React.Fragment — требование React: key на корневом возвращаемом элементе map callback'а"

patterns-established:
  - "B5 JSX split: структурное изменение (Fragment wrap) выполняется в отдельном task'е от JSX render — TODO comment-маркер связывает их"
  - "Per-user UI toggle: useState(initial) + useTransition + server action call → revalidatePath без явного rollback (next render синхронизирует из БД)"
  - "Размерная row рендеринг: внутри Fragment, ПОСЛЕ </TableRow> per-nmId; guard {showSizes && card.hasMultipleSizes && card.sizeBreakdown.map(...)}"

requirements-completed: [STOCK-36]

# Metrics
duration: 4min
completed: 2026-04-28
---

# Phase 16 Plan 05: UI кнопка «По размерам» + рендер размерных строк Summary

**Кнопка «По размерам» в /stock/wb toolbar с optimistic persist + per-size TableRow рендер с полной cluster/warehouse структурой (О из sizeRow.totalStock; З/Об/Д = null = «—»)**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-28T11:36:56Z
- **Completed:** 2026-04-28T11:40:51Z
- **Tasks:** 3
- **Files modified:** 1 (`components/stock/StockWbTable.tsx`)

## Accomplishments

- `interface Props` extended `initialShowSizes: boolean` (контракт-prop из Plan 16-04 page.tsx)
- Кнопка «По размерам» в верхней панели рядом с «Без СЦ», «Склады» — variant=`default` при включённом, `outline` при выключенном; title-tooltip объясняет текущее состояние и эффект клика
- Optimistic state via `useState` + `useTransition`, server-call `saveStockWbShowSizes(next)` — на ошибке `console.error`, без rollback (revalidate следующий synчит)
- Структурное изменение JSX (B5 split a): per-nmId `<TableRow>` обёрнут в `<React.Fragment key={card.wbCardId}>` (key переехал на Fragment), rowSpan = `1 + g.wbCards.length + totalSizeRows` где `totalSizeRows` учитывает только карточки с `hasMultipleSizes`
- JSX render размерных строк (B5 split b): под per-nmId TableRow при `showSizes && card.hasMultipleSizes` рендерятся `card.sizeBreakdown.map(sizeRow => <TableRow>)` — приглушённый bg-muted/30 фон, intra-group тонкий border-t-border/40, префикс `↳ {techSize}` в Артикул-колонке, placeholder `—` для Иваново и in-way (per-size данных нет), полная cluster/warehouse структура с inter/intra-group границами

## Task Commits

Each task was committed atomically:

1. **Task 1: Расширить interface Props + state + кнопка «По размерам»** — `208da67` (feat)
2. **Task 2: Wrap per-nmId TableRow в React.Fragment + пересчёт rowSpan** — `758f412` (feat)
3. **Task 3: Render размерных строк внутри Fragment (после </TableRow>)** — `c8746e4` (feat)

**Plan metadata:** _(добавится после metadata commit)_

_Note: B5 split-pattern — Task 2 + Task 3 разделены чтобы изолировать структурные изменения JSX от рендера; каждый task самодостаточный с балансированными скобками_

## Files Created/Modified

- `components/stock/StockWbTable.tsx` — расширен:
  - Import: `useTransition` (was: только useState/useCallback), `WbStockSizeRow` тип, `saveStockWbShowSizes` action
  - `interface Props.initialShowSizes: boolean`
  - State: `showSizes` + `isShowSizesPending` + `toggleShowSizes` callback
  - Toolbar: новая `<Button>` после `WarehouseVisibilityPopover`
  - Body: rowSpan formula = `1 + g.wbCards.length + totalSizeRows`
  - Body: per-nmId map → `<React.Fragment key={card.wbCardId}>` → `<TableRow>` (per-nmId) + `{showSizes && card.hasMultipleSizes && card.sizeBreakdown.map((sizeRow) => <TableRow>...)}`
- `.planning/phases/16-wb-stock-sizes/16-05-SUMMARY.md` — этот документ

## Decisions Made

1. **Контракт-driven импорты в parallel worktree** — `WbStockSizeRow`, `saveStockWbShowSizes`, `card.hasMultipleSizes`, `card.sizeBreakdown` пишутся согласно frontmatter-контракту 16-03/16-04 несмотря на отсутствие в текущем worktree (parallel execution). После merge всех 16-01..16-05 TS errors закроются.
2. **B5 split на Task 2 + Task 3** — по требованию плана разделены чтобы балансировка скобок (`((` open vs `))` close + Fragment open/close + 3-уровневый flatMap) не размывалась между задачами. Task 2 оставляет TODO-маркер, Task 3 заменяет его на полный JSX.
3. **Z колонка размерной строки = null** — соответствует locked default-гипотезе CONTEXT.md (per-size orders не хранятся в БД; UI показывает `—`). Также Об/Д = null по той же причине (зависят от ordersPerDay).
4. **Per-cluster агрегаты через `sizeRow.clusters[shortCluster]`** — Plan 16-03 предоставляет в `WbStockSizeRow.clusters` per-size aggregate; UI просто использует тот же flatMap по `CLUSTER_ORDER` что и per-nmId row, только source — `sizeRow.clusters` вместо `card.clusters`.
5. **visibleClusterWarehouses фильтр применяется к expanded view размерной строки** — идентично per-nmId. Visual filter only — агрегаты считаются по полному набору складов.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking, документировано] TypeScript errors из parallel worktree**

- **Found during:** Все 3 task'а
- **Issue:** `npx tsc --noEmit` exit ≠ 0 в текущем worktree — отсутствуют `WbStockSizeRow`, `saveStockWbShowSizes`, `card.hasMultipleSizes`, `card.sizeBreakdown`, `wbCardId_warehouseId` (Prisma ключ); `app/(dashboard)/stock/wb/page.tsx` не передаёт `initialShowSizes` prop. Это все артефакты из Plans 16-01 (schema), 16-02 (sync upsert key), 16-03 (data helper типы), 16-04 (action + page.tsx).
- **Fix:** Plan 16-05 явно описывает себя как **параллельный с 16-04**, и зависит от 16-01/16-03 — финальная сборка после merge всех 16-01..16-05 закрывает все TS errors. Acceptance criteria `npx tsc --noEmit exit 0` будут выполнены ПОСЛЕ merge, не в isolated worktree.
- **Files modified:** None (no fix needed — это ожидаемое состояние parallel execution)
- **Verification:** Все TS errors классифицированы как expected dependency-on-parallel-plan; ни один не относится к коду самого Plan 16-05.
- **Committed in:** Documented в commit messages (Task 1, 3)

---

**Total deviations:** 1 documented (TS errors из parallel parts)
**Impact on plan:** Нулевой — parallel execution корректно работает, финальный merge закроет dependencies. Plan 16-05 выполнил свой scope (UI слой) полностью.

## Issues Encountered

- **TS compile errors в parallel worktree** — ожидаемо для parallel execution model (см. Deviations выше). Не блокирует merge.

## Next Phase Readiness

- **Ready для Plan 16-06 (deploy + UAT):** Все UI пути готовы (кнопка + размерные строки + persist). После merge с Plan 16-01 (schema), Plan 16-02 (sync fix), Plan 16-03 (data helper), Plan 16-04 (action + page.tsx) — финальная сборка функциональна.
- **UAT-каверы:**
  - Включить «По размерам» → проверить что под nmId 859398279 (8 размеров) и 901585883 (8 размеров) видны размерные строки с разными остатками
  - Перезагрузить страницу → toggle persist
  - One-size товар (techSize="0") при showSizes=true → размерная строка НЕ должна показаться
  - Expand-all + showSizes ON → проверить что layout не лагает (combinatorial column count, Pitfall 6 из RESEARCH.md)
  - sticky cells Фото/Сводка не пересекаются (rowSpan корректный)
- **Замечания для UAT:** Layout проверять при `Развернуть все` + `По размерам` ON — combinatorial column count может вызвать perf issues на mid-range машинах (deferred до v2 virtualization).

## Self-Check: PASSED

- [x] `components/stock/StockWbTable.tsx` существует и содержит все ожидаемые маркеры (см. acceptance criteria всех 3 task'ов)
- [x] Commits 208da67, 758f412, c8746e4 присутствуют в git log
- [x] JSX балансирован: 2 `<React.Fragment>` open / 2 `</React.Fragment>` close, 3 `<TableRow>` open / 3 `</TableRow>` close
- [x] TODO-маркер «Task 3 (B5)» удалён в Task 3
- [x] Все Task 1/2/3 acceptance criteria grep counts pass

---
*Phase: 16-wb-stock-sizes*
*Completed: 2026-04-28*
