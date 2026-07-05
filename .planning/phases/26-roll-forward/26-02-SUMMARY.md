---
phase: 26-roll-forward
plan: 02
subsystem: ui
tags: [sales-plan, react, typescript, badge, stockout]

# Dependency graph
requires:
  - phase: 26-roll-forward/26-01
    provides: "ProductPlanTable.tsx с тумблером автопротяжки и кнопками сброса (уже закоммичены)"
  - phase: 25-sales-plan-v2
    provides: "Движок engine.ts с rateRequested/ordersUnits/firstStockoutDate в PlanDayRow + ProductPlanResult; planResult.days сериализованы в tableProducts"
provides:
  - "Бейдж «срезано −X% · приход dd.mm» в ячейке месяца матрицы «Товары» при per-month срезе > 2% (D-3)"
  - "Плашка «⚠ нет товара · dd.mm» при полностью нулевом месяце из-за стокаута (D-3)"
  - "Хелперы nextArrivalAfter / fmtDayMonth / fmtMonthShort / monthShortfall в ProductPlanTable"
affects: [26-roll-forward/26-03, sales-plan, stock-warning-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-month shortfall: Σ(rateRequested − ordersUnits) по дням конкретного месяца из planResult.days — НЕ product-total lostRubToStockout (который покрывает весь горизонт)"
    - "nextArrivalAfter: берём первый приход из arrivals строго после reference-даты (firstStockoutDate или today)"

key-files:
  created: []
  modified:
    - components/sales-plan/ProductPlanTable.tsx

key-decisions:
  - "Порог 2% применяется к per-month lostShare (Σ monthly days), а не к product-total lostRubToStockout — чтобы бейдж не появлялся на месяцах ПОСЛЕ восстановившего сток прихода (D-4 + checker WARNING)"
  - "isEmptyMonth = monthPlanUnits < 0.5 && stockoutInOrBefore — взаимоисключает isCutMonth через !isEmptyMonth"
  - "arrivalRef = psr.firstStockoutDate ?? today — берём первый приход после даты стокаута или после сегодня"
  - "Движок и page.tsx не тронуты — чисто presentational-слой (D-3)"

patterns-established:
  - "SP-16 pattern: per-month срез из planResult.days без изменения движка"

requirements-completed: [SP-16]

# Metrics
duration: 15min
completed: 2026-07-05
---

# Phase 26 Plan 02: SP-16 — Явное предупреждение о срезе плана в матрице «Товары» Summary

**Per-month бейдж среза «срезано −X% · приход dd.mm» и плашка «нет товара» в ячейках матрицы /sales-plan/products — presentational-слой поверх уже существующих данных движка без изменения расчётов**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-07-05T10:00Z
- **Completed:** 2026-07-05T10:15Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Добавлены 4 чистых хелпера в ProductPlanTable: `nextArrivalAfter`, `fmtDayMonth`, `fmtMonthShort`, `monthShortfall`
- Реализован per-month расчёт среза из `planResult.days` (Σ(rateRequested − ordersUnits) по дням конкретного месяца), порог 2%
- Бейдж «срезано −X% · приход dd.mm» появляется только в compare-режиме ячейки при недоливе месяца > 2%
- Плашка «⚠ нет товара · dd.mm» при полностью нулевом месяце из-за стокаута
- Дата прихода берётся из `nextArrivalAfter(p.arrivals, firstStockoutDate|today)` — первый реальный/виртуальный приход
- Build зелёный; engine golden тест + iu===438_068_120 не тронуты

## Task Commits

1. **Task 1: Хелперы бейджа среза (SP-16)** — `774d5c7` (feat)
2. **Task 2: Бейдж «срезано −X%» и плашка «нет товара» в ячейке месяца** — `bf9b942` (feat)

## Files Created/Modified

- `components/sales-plan/ProductPlanTable.tsx` — добавлен импорт `PlanDayRow`; 4 хелпера module-level; per-month вычисление `sf/isEmptyMonth/isCutMonth/cutPct` внутри months.map; JSX бейджей в non-edit ветке ячейки

## Decisions Made

- Per-month порог применяется к `sf.lostShare` (недолив конкретного месяца из его дней), а не к product-total `lostRubToStockout` — чтобы бейдж не «протекал» на месяцы после прихода, восстановившего сток (правка checker WARNING из D-4)
- `isEmptyMonth` и `isCutMonth` взаимоисключающи через `!isEmptyMonth && ...` — красный и янтарный цвета не конфликтуют
- При отсутствии будущего прихода для пустого месяца — «придёт в \<месяц\>» (`fmtMonthShort(month)`); для срезанного — «срезано −X%» без даты

## Deviations from Plan

Нет — план исполнен точно по спецификации.

## Issues Encountered

Нет — tsc чист, build успешен, движок не тронут.

## Known Stubs

Нет.

## Threat Flags

Нет новых поверхностей (T-26-05, T-26-06, T-26-07 из план-файла — presentational UI только read, RBAC SALES VIEW уже enforced на page.tsx).

## Self-Check

- [x] `components/sales-plan/ProductPlanTable.tsx` существует и модифицирован
- [x] Коммит `774d5c7` существует (хелперы)
- [x] Коммит `bf9b942` существует (бейдж)
- [x] `grep -c "срезано −"` = 1 ✓
- [x] `grep -c "нет товара"` = 3 ✓
- [x] `grep -c "sf.lostShare > 0.02"` = 1 ✓
- [x] `grep -c "monthShortfall(psr.days"` = 1 ✓
- [x] `npm run build` — SUCCESS ✓
- [x] vitest sales-plan-engine + sales-plan-iu — 20/20 passed ✓

## Self-Check: PASSED

## Next Phase Readiness

- SP-16 закрыт; ProductPlanTable.tsx содержит все правки 26-01 + 26-02 (тумблер/сброс + бейджи)
- 26-03 (SP-17: динамический roll-forward виртуальных закупок + крон) можно начинать

---
*Phase: 26-roll-forward*
*Completed: 2026-07-05*
