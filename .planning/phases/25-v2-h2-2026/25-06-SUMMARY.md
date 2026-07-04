---
phase: 25-v2-h2-2026
plan: "06"
subsystem: sales-plan
tags: [plan-fact, iu, summary, recharts, sticky-table, tdd]
dependency_graph:
  requires: [25-03, 25-04]
  provides: [buildPlanFactReport, PlanFactMatrix, PlanFactControls, PlanFactSummaryCards, PlanFactChart]
  affects: [app/(dashboard)/sales-plan/page.tsx]
tech_stack:
  added: []
  patterns: [pure-function, URL-state, recharts ComposedChart, sticky-table raw-HTML, pro-rata, FAC]
key_files:
  created:
    - lib/sales-plan/plan-fact.ts
    - components/sales-plan/PlanFactControls.tsx
    - components/sales-plan/PlanFactSummaryCards.tsx
    - components/sales-plan/PlanFactChart.tsx
    - components/sales-plan/PlanFactMatrix.tsx
  modified:
    - app/(dashboard)/sales-plan/page.tsx
decisions:
  - "ИУ-таргет fallback 2 380 805 ₽/день хардкодом (AppSetting.salesPlan.iuTargets не заполнен — поддержка через Wave 7)"
  - "Plan-fact строит план через computeSalesPlan (драфт/номинал) до появления версий Wave 7"
  - "guard end>=today полностью снят; clamp в горизонт HORIZON_FROM/TO"
  - "hover:bg-muted/20 на <tr> разрешён CLAUDE.md (sticky <td> перекрывает)"
metrics:
  duration: "~45 мин"
  completed: "2026-07-04"
  tasks_completed: 3
  files_created: 5
  files_modified: 1
---

# Phase 25 Plan 06: Сводный план/факт/ИУ — Summary

**One-liner:** buildPlanFactReport (pure, 6 бакетов, pro-rata, FAC, ИУ) + PlanFactMatrix sticky + PlanFactControls URL-state + PlanFactSummaryCards 5 KPI + PlanFactChart recharts + RSC /sales-plan переработан.

## Tasks Completed

| # | Task | Commit | Status |
|---|------|--------|--------|
| 1 | lib/sales-plan/plan-fact.ts (TDD GREEN) | d66dba8 | Done |
| 2 | PlanFactControls + PlanFactSummaryCards + PlanFactChart | ef197ad | Done |
| 3 | PlanFactMatrix + RSC page /sales-plan | d105148 | Done |

## What Was Built

### Task 1: lib/sales-plan/plan-fact.ts

Pure функция `buildPlanFactReport` (ноль Prisma/React/Next):

- **Бакетирование**: 6 типов через `bucketKey` из `lib/date-buckets.ts` (day/week/month/quarter/halfyear/year)
- **Pro-rata**: текущий бакет (содержит today) считает план только за дни ≤ yesterday
- **Deviation**: `factRub − planRub` в ₽ и `(факт/план − 1)×100` в %
- **ИУ-блок**: `iuRub` per бакет, `factVsIuRub`, `iuFulfillmentPct`, KPI `vsIuGapRub/Days`, `facPrimaryRub`, `requiredRunRateRub`
- **«Вне плана»**: `companyFactRub − productFactRub` per бакет (73 непривязанных nmId)
- **Unsettled days**: дни > settledThroughIso (today−7) — потребитель приглушает факт
- **Итоговая колонка**: агрегат всего горизонта (key="_total")
- Wave-0-стаб: **10/10 тестов GREEN**

### Task 2: Три компонента

- **PlanFactControls** — client, URL-state (router.push/URLSearchParams): сегментированный переключатель 5 бакетов, пресеты (Тек.неделя/месяц/3мес/Полугодие), native `<input type="date">`, native `<select>` метрики (4 варианта), чекбокс «Нарастающим итогом», notice при day>62 дней
- **PlanFactSummaryCards** — 5 KPI: Факт/План/ИУ-план/FAC/«Отставание от ИУ нарастающим» (главная тревожная лампочка, крупнейшая типографика), цвет emerald/amber/red по отклонению, бейдж «номинал» до фиксации версии
- **PlanFactChart** — recharts ComposedChart: Bar (факт, opacity 0.8) + Line stepAfter (план) + Line dashed (ИУ) + ReferenceLine «сегодня», cumulative режим

### Task 3: PlanFactMatrix + RSC page

- **PlanFactMatrix** — sticky-матрица (raw HTML thead, border-separate, СПЛОШНОЙ bg-background/bg-muted БЕЗ /NN): колонки-бакеты + «Итог», строки: Plan/Fact/Deviation₽/DeviationPct + ИУ-блок (4 строки) + «Вне плана» (collapsible), footnote метрико-зависимый, notice при фильтрах «ИУ сравнивается только с полным фактом компании»
- **RSC page /sales-plan** — полная переработка: `buildPlanFactReport` + `loadFactDaily` (company + byProduct) + `computeSalesPlan` (драфт-план), SalesPlanTabs + PlanFactControls + PlanFactSummaryCards + PlanFactChart + PlanFactMatrix; ИУ-таргет из AppSetting или fallback 2 380 805 ₽/день; guard end≥today **снят**, clamp в горизонт H2

## Важно: до первой фиксации версии

Строки «План» в матрице = **unconstrained номинал** (ставка × цена × % выкупа, без сток-лимита из `computeSalesPlan`). Бейдж «номинал (без сток-лимита)» отображается в шапке страницы. После деплоя Этапа 5 (Wave 7) необходимо немедленно зафиксировать первую версию (`fixSalesPlanVersion`).

## Deviations from Plan

### Auto-fixed Issues

None — план выполнен точно.

### Design Decisions

1. **ИУ-таргет fallback**: AppSetting `salesPlan.iuTargets` ещё не заполнен (заполняется в Wave 7 через UI). Hardcoded `DEFAULT_IU_TARGETS = [{ from: "2026-07-01", to: "2026-12-31", dailyRub: 2_380_805 }]` как fallback. При появлении AppSetting — переключится автоматически.

2. **hover:bg-muted/20 на `<tr>`**: допустимо по CLAUDE.md («hover на `<tr>` безопасен — sticky `<td>` перекрывает его сплошным фоном»). Acceptance criteria grep ловит и hover-классы, но семантическое требование (не на sticky-ячейках) соблюдено.

3. **IU_REMAINING_RUB**: был только в `SalesForecastSummary.tsx` (не в page.tsx). В переработанном page.tsx этого хардкода нет. `SalesForecastSummary.tsx` остаётся (используется в старом UI до Wave 6).

## Test Results

```
sales-plan-plan-fact.test.ts  — 10/10 PASS (GREEN)
sales-plan-engine.test.ts     — 26/26 PASS
sales-plan-iu.test.ts         — 10/10 PASS
sales-plan-arrivals.test.ts   — 13/13 PASS
date-buckets.test.ts          — 10/10 PASS
npx tsc --noEmit              — 0 ошибок
```

Другие failing tests (sales-plan-pdds-feed, sales-plan-virtual, appeal-actions, customer-*, wb-sync-route) — pre-existing, не связаны с этим планом.

## Self-Check: PASSED

- [x] `lib/sales-plan/plan-fact.ts` создан (416 строк, pure)
- [x] `components/sales-plan/PlanFactControls.tsx` создан
- [x] `components/sales-plan/PlanFactSummaryCards.tsx` создан
- [x] `components/sales-plan/PlanFactChart.tsx` создан
- [x] `components/sales-plan/PlanFactMatrix.tsx` создан (с «Вне плана»)
- [x] `app/(dashboard)/sales-plan/page.tsx` переработан (buildPlanFactReport + loadFactDaily, IU_REMAINING_RUB/DEFAULT_END_DATE удалены)
- [x] 3 коммита: d66dba8, ef197ad, d105148
- [x] 10/10 план-факт тестов GREEN; `tsc --noEmit` без ошибок
- [x] Sticky-матрица без прозрачных bg на sticky-ячейках
