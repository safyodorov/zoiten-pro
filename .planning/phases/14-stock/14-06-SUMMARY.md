---
phase: 14-stock
plan: "06"
subsystem: stock
tags: [rsc, prisma, sticky-table, rowspan, deficit-colors, debounce, url-searchparams, react-19]

dependency_graph:
  requires:
    - phase: 14-01
      provides: stock-math.ts (calculateStockMetrics, deficitThreshold), WbCard.stockQty/avgSalesSpeed7d, Product.ivanovoStock/productionStock
    - phase: 14-03
      provides: WbCardWarehouseStock per-warehouse data, WbCard денорм stockQty
    - phase: 14-04
      provides: IvanovoUploadButton + IvanovoUploadDialog
    - phase: 14-05
      provides: updateProductionStock + updateTurnoverNorm server actions, TurnoverNormInput, WbRefreshButton
  provides:
    - lib/stock-data.ts getStockData() + getStockFilterOptions() + типы StockProductRow/StockArticleRow/StockAggregates
    - components/stock/StockFilters.tsx URL searchParams driven MultiSelect бренд/кат/подкат + deficit toggle
    - components/stock/StockProductTable.tsx sticky 4 cols + 6 групп + rowSpan + цветовой Д + inline production input
    - app/(dashboard)/stock/page.tsx RSC page с шапкой + фильтрами + таблицей
  affects:
    - 14-07 (StockTabs поверх /stock page, подготовлена к интеграции)

tech-stack:
  added: []
  patterns:
    - RSC data fetcher (getStockData) с батч WbCard.findMany + JS агрегация (не GROUP BY SQL)
    - Sticky accumulated left table: left-0 / left-[80px] / left-[320px] / left-[400px], z-20/30, bg-background
    - 2-level TableHeader: top-0 (группы) + top-[40px] (sub-columns), sticky вертикально
    - rowSpan = 1 + N_articles на Фото+Сводка; Сводная строка + per-article строки
    - DeficitCell 3-уровневая цветовая кодировка через cn() multi-condition
    - Inline production input: нативный <input> (не shadcn Input) + debounced 500ms через useRef Map<productId, timer>
    - StockFilters: URL searchParams через router.replace({scroll:false}) + useCallback мемоизация

key-files:
  created:
    - lib/stock-data.ts
    - components/stock/StockFilters.tsx
    - components/stock/StockProductTable.tsx
  modified:
    - app/(dashboard)/stock/page.tsx

key-decisions:
  - "Агрегация wbTotalStock/rfTotalStock на JS после батч WbCard.findMany — проще чем GROUP BY SQL, достаточно для 100-500 товаров"
  - "DeficitCell: когда deficit>0 и threshold=null (З=0) → жёлтый (не зелёный и не красный) — сигнализирует наличие запасов без продаж"
  - "Inline production input: нативный <input> вместо shadcn Input — экономия места в ячейке, паттерн из 14-UI-SPEC §4"
  - "rowSpan Map<productId, timer> для debounce — у каждого Product независимый таймер, изменение одной строки не сбрасывает другую"
  - "Ozon = placeholder null для всех ячеек — данные появятся когда реализуется интеграция Ozon API"

requirements-completed: [STOCK-16, STOCK-17, STOCK-18, STOCK-19, STOCK-20]

duration: "~4 минуты"
completed: "2026-04-22"
---

# Phase 14 Plan 06: RSC /stock Product-level таблица — Summary

**Sticky 4-col RSC страница /stock с 6 группами остатков, rowSpan агрегацией, 3-уровневым цветовым дефицитом и inline productionStock input, интегрирующая TurnoverNormInput + IvanovoUploadButton + WbRefreshButton в шапку.**

## Performance

- **Duration:** ~4 минуты
- **Started:** 2026-04-22T06:54:21Z
- **Completed:** 2026-04-22T06:58:12Z
- **Tasks:** 2
- **Files modified:** 4 (1 modified + 3 created)

## Accomplishments

- `lib/stock-data.ts`: RSC data helper — батч WbCard.findMany для всей страницы одним запросом, JS агрегация wbTotalStock/mpTotalStock/rfTotalStock с null-safe guards, фильтр onlyDeficit через dynamic import stock-math
- `components/stock/StockProductTable.tsx`: Client-таблица с 4 sticky cols (exact accumulated left), 2-level header (top-0/top-[40px]), rowSpan = 1+N_articles, DeficitCell с 3-цветовой кодировкой, debounced inline production input (Map<id, timer>)
- `components/stock/StockFilters.tsx`: URL-driven MultiSelectDropdown × 3 + Switch toggle с useCallback мемоизацией, router.replace({scroll:false})
- `app/(dashboard)/stock/page.tsx`: RSC замена placeholder — requireSection + Promise<searchParams> (Next.js 15) + параллельный fetch, шапка flex justify-between с TurnoverNormInput слева + кнопки ml-auto справа

## Task Commits

1. **Task 1: lib/stock-data.ts RSC helper + StockFilters** — `92c049d` (feat)
2. **Task 2: StockProductTable + /stock/page.tsx** — `91c5eb3` (feat)

## Files Created/Modified

- `lib/stock-data.ts` — RSC data layer: getStockData(filters) + getStockFilterOptions() + типы StockProductRow/StockArticleRow/StockAggregates/StockDataResult/StockFilters
- `components/stock/StockFilters.tsx` — URL searchParams фильтры с 3 MultiSelectDropdown + Switch "Только с дефицитом"
- `components/stock/StockProductTable.tsx` — sticky-таблица Product-level: 6 групп, цветовой Д, inline input production, empty state
- `app/(dashboard)/stock/page.tsx` — RSC страница (заменила Plan 14-01 placeholder): шапка + фильтры + таблица

## Decisions Made

- **Батч WbCard:** Один `wbCard.findMany({nmId: {in: allNmIds}})` вместо N запросов per product — O(1) round-trip к БД для всей страницы
- **JS агрегация vs SQL GROUP BY:** Проще поддерживать, Prisma ORM не требует raw SQL, данных < 500 products — JS достаточно
- **DeficitCell при threshold=null:** когда `deficit>0` и `threshold === null` (З=0) → показываем жёлтый (не зелёный и не красный) — есть запасы, но нет продаж, требует внимания
- **Map<productId, timer> для debounce:** Каждый product имеет независимый таймер — изменение production в строке A не сбрасывает pending save строки B
- **Ozon placeholder:** Все 4 ячейки Ozon рендерят `<StockCell value={null}/>` = «—». Интеграция Ozon API — будущий план.

## Deviations from Plan

Нет — план выполнен точно как написан.

## Issues Encountered

Нет — TypeScript 0 ошибок с первого прохода.

## Known Stubs

- **Ozon группа колонок** (`StockProductTable.tsx`): все 4 ячейки МП/WB/Ozon per-article для Ozon артикулов рендерят `null` = «—». Будет заполнено когда реализуется Ozon API (будущий план).
- **МП агрегат = WB агрегат** (`lib/stock-data.ts`): `mpTotalStock = wbTotalStock` пока Ozon = 0. Формула rfTotalStock = Иваново + Производство + МП корректна; при добавлении Ozon нужно обновить только этот блок.

## Next Phase Readiness

- Plan 14-07 добавит `StockTabs` поверх layout.tsx (переключение /stock /stock/wb /stock/ozon) — страница к этому готова
- `StockProductTable` не содержит tabs-логики, принимает только products + turnoverNormDays — чистый пропс-контракт
- TurnoverNormInput/IvanovoUploadButton/WbRefreshButton интегрированы в шапку без изменений

---
*Phase: 14-stock*
*Completed: 2026-04-22*
