---
phase: 25-v2-h2-2026
plan: "00"
subsystem: sales-plan-tests
tags: [tdd, red-stubs, vitest, sales-plan, wave-0]
dependency_graph:
  requires: []
  provides:
    - RED-стабы: tests/sales-plan-engine.test.ts
    - RED-стабы: tests/sales-plan-arrivals.test.ts
    - RED-стабы: tests/sales-plan-iu.test.ts
    - RED-стабы: tests/date-buckets.test.ts
    - RED-стабы: tests/sales-plan-plan-fact.test.ts
    - RED-стабы: tests/sales-plan-virtual.test.ts
    - RED-стабы: tests/sales-plan-pdds-feed.test.ts
  affects: []
tech_stack:
  added: []
  patterns:
    - vitest RED-stub pattern (импорт несуществующих модулей)
    - golden-test pattern (pricing-math.test.ts канон)
key_files:
  created:
    - tests/sales-plan-engine.test.ts
    - tests/sales-plan-arrivals.test.ts
    - tests/sales-plan-iu.test.ts
    - tests/date-buckets.test.ts
    - tests/sales-plan-plan-fact.test.ts
    - tests/sales-plan-virtual.test.ts
    - tests/sales-plan-pdds-feed.test.ts
  modified: []
decisions:
  - "Wave 0 — RED-стабы фиксируют контракт движка ДО реализации (Nyquist-compliance)"
  - "Golden-якорь ИУ 438_068_120 ₽ = 2_380_805 ₽/день × 184 дня H2-2026 зафиксирован"
  - "Импортируемые имена функций совпадают с сигнатурами из 25-RESEARCH.md §3"
  - "date-buckets.test.ts фиксирует quarter/halfyear/year ДО выноса из loan-math.ts"
metrics:
  duration: "323s (~5 min)"
  completed: "2026-07-04"
  tasks_completed: 2
  files_created: 7
---

# Phase 25 Plan 00: RED-стабы тест-инфраструктуры Sales Plan v2 Summary

Wave 0: 7 vitest-файлов как RED-стабы зафиксированы. Все тесты падают на резолве несуществующих модулей `lib/sales-plan/*` и `lib/date-buckets.ts` — это ожидаемое RED-состояние. Golden-якорь ИУ 438 068 120 ₽ зафиксирован.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | RED-стабы engine, arrivals, iu, date-buckets | 7aa8de9 | tests/sales-plan-engine.test.ts, tests/sales-plan-arrivals.test.ts, tests/sales-plan-iu.test.ts, tests/date-buckets.test.ts |
| 2 | RED-стабы plan-fact, virtual, pdds-feed | 43ab980 | tests/sales-plan-plan-fact.test.ts, tests/sales-plan-virtual.test.ts, tests/sales-plan-pdds-feed.test.ts |

## What Was Built

7 vitest-тест-файлов как RED-стабы для Phase 25 (План продаж v2):

### tests/sales-plan-engine.test.ts
- Импортирует `computeSalesPlan, type SalesPlanInputs` из `@/lib/sales-plan/engine`
- Golden inputs: 1 товар, 2 месяца, 2 партии прихода (июль/август 2026)
- Тесты: T+3 выкупы (12×0.8=9.6), day override 2026-07-15=20, ступенька авг=15, сток-лимит, zero-guard

### tests/sales-plan-arrivals.test.ts
- Импортирует `resolveArrivalBatches` из `@/lib/sales-plan/arrivals`
- Тесты: все 5 уровней fallback-цепочки + dateSource-тег + сплит частичного TRANSIT + TRANSIT date=null + виртуальные закупки

### tests/sales-plan-iu.test.ts
- Импортирует `iuTotalForRange, iuSeriesForRange` из `@/lib/sales-plan/iu`
- **GOLDEN: `iuTotalForRange("2026-07-01","2026-12-31",[{dailyRub:2_380_805}]) === 438_068_120`**
- Тесты: 184 дня в H2, граничные случаи, мульти-период, серия cumulative

### tests/date-buckets.test.ts
- Импортирует `bucketKey, bucketLabel, type Granularity` из `@/lib/date-buckets`
- Тесты: quarter (2026-Q3), halfyear (2026-H2), year (2026) + регресс day/week/month
- Метки: "Q3 2026", "H2 2026" / "П2 2026"

### tests/sales-plan-plan-fact.test.ts
- Импортирует `buildPlanFactReport` из `@/lib/sales-plan/plan-fact`
- Тесты: бакетирование month/quarter/halfyear, deviation ₽/%, pro-rata текущего бакета, factSettled unsettled

### tests/sales-plan-virtual.test.ts
- Импортирует `suggestVirtualPurchases` из `@/lib/sales-plan/virtual-purchases`
- Тесты: триггер страхового запаса, qty покрытия 60 дн, clamp orderDate ≥ today, итерации ≤6, DISMISSED подавление ±14 дн

### tests/sales-plan-pdds-feed.test.ts
- Импортирует `buildVirtualPurchasePayments` из `@/lib/sales-plan/pdds-feed`
- Тесты: DEPOSIT dueDate = orderDate+3, BALANCE dueDate = deposit+leadTime, fallback 30/70, CNY/USD без конвертации

## Deviations from Plan

None — план выполнен точно как написан.

## Known Stubs

Все 7 файлов — это намеренные RED-стабы: они импортируют модули, которые ещё не существуют. Это ожидаемое состояние Wave 0. Стабы будут доводиться до GREEN по мере реализации в последующих волнах:
- Wave 1: engine, arrivals, iu, date-buckets → GREEN
- Wave 3: plan-fact → GREEN
- Wave 4: virtual-purchases → GREEN
- Wave 6: pdds-feed → GREEN

## Self-Check

### Check created files exist
- [x] tests/sales-plan-engine.test.ts — FOUND
- [x] tests/sales-plan-arrivals.test.ts — FOUND
- [x] tests/sales-plan-iu.test.ts — FOUND (содержит 5 вхождений 438_068_120)
- [x] tests/date-buckets.test.ts — FOUND (содержит 4 вхождения "2026-Q3")
- [x] tests/sales-plan-plan-fact.test.ts — FOUND
- [x] tests/sales-plan-virtual.test.ts — FOUND
- [x] tests/sales-plan-pdds-feed.test.ts — FOUND

### Check commits exist
- [x] 7aa8de9 — test(25-00): RED-стабы engine, arrivals, iu, date-buckets
- [x] 43ab980 — test(25-00): RED-стабы plan-fact, virtual-purchases, pdds-feed

### RED state confirmed
- lib/sales-plan/ — НЕ существует (ожидаемый RED)
- lib/date-buckets.ts — НЕ существует (ожидаемый RED)

## Self-Check: PASSED
