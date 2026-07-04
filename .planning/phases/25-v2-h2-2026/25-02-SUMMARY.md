---
phase: 25-v2-h2-2026
plan: "02"
subsystem: sales-plan
tags: [pure-functions, tdd, engine, arrivals, iu, date-buckets]
dependency_graph:
  requires: [25-01]
  provides: [lib/date-buckets.ts, lib/sales-plan/types.ts, lib/sales-plan/dates.ts, lib/sales-plan/iu.ts, lib/sales-plan/arrivals.ts, lib/sales-plan/engine.ts]
  affects: [lib/loan-math.ts, tests/date-buckets.test.ts, tests/sales-plan-iu.test.ts, tests/sales-plan-engine.test.ts, tests/sales-plan-arrivals.test.ts]
tech_stack:
  added: []
  patterns: [pure-functions, tdd-green, date-buckets, T+3/T+6-simulation, stock-limit-invariant]
key_files:
  created:
    - lib/date-buckets.ts
    - lib/sales-plan/types.ts
    - lib/sales-plan/dates.ts
    - lib/sales-plan/iu.ts
    - lib/sales-plan/arrivals.ts
    - lib/sales-plan/engine.ts
  modified:
    - lib/loan-math.ts
decisions:
  - "Seed-заказы → только buyout-поток (T+3), НЕ return. Возвраты от seed-заказов создавали артефактный сток при stockNow=0 (нарушение zero-guard теста)."
  - "Инвариант сток-лимита: orders[d] = min(rate[d], stockEnd[d-1]); inflow и returns добавляются в stockEnd[d] (доступны следующему дню). Это отличается от оригинального lib/sales-forecast.ts где inflow добавляется до расчёта orders — изменение необходимо для прохождения теста сток-лимит."
  - "lib/date-buckets.ts: Granularity = 6 значений (day|week|month|quarter|halfyear|year); LoanGranularity сохранён как alias в loan-math для обратной совместимости."
  - "resolveArrivalBatches: уровень 4 (legacy-expected) активируется только если length===1 открытых закупок без дат, что соответствует спеке (один товар без дат) и тесту."
metrics:
  duration: "~8 min"
  completed: "2026-07-04"
  tasks: 3
  files: 7
---

# Phase 25 Plan 02: Pure-ядро движка плана продаж v2 — SUMMARY

**One-liner:** Pure-движок computeSalesPlan (T+3/T+6/сток-лимит/ступенька), resolveArrivalBatches (5 уровней fallback), iuTotalForRange (golden 438 068 120 ₽), date-buckets (6 бакетов) — все 4 Wave-0-стаба GREEN.

## Tasks Completed

| Task | Commit | Files | Tests |
|------|--------|-------|-------|
| Task 1: lib/date-buckets.ts + переключение loan-math | `43e4955` | lib/date-buckets.ts, lib/loan-math.ts | 27 GREEN (date-buckets) + 29 GREEN (loan-math регресс) |
| Task 2: types.ts + dates.ts + iu.ts (golden ИУ GREEN) | `dcee440` | lib/sales-plan/types.ts, dates.ts, iu.ts | 12 GREEN (iu, golden 438 068 120) |
| Task 3: arrivals.ts + engine.ts (симуляция + golden GREEN) | `230236e` | lib/sales-plan/arrivals.ts, engine.ts | 9 GREEN (arrivals) + 8 GREEN (engine) |

**Итого: 85 тестов GREEN, 7 файлов создано/изменено.**

## Verification

```
npx vitest run tests/sales-plan-engine.test.ts tests/sales-plan-arrivals.test.ts tests/sales-plan-iu.test.ts tests/date-buckets.test.ts
→ 4 Test Files passed, 58 Tests passed

npx vitest run tests/loan-math.test.ts
→ 29 Tests passed (регресс не введён)

npx tsc --noEmit
→ (пустой вывод, ошибок нет)
```

## Деviации от плана

### Авто-фикс #1: Seed-заказы — только buyout, без returns [Rule 1 - Bug]

**Обнаружено во время:** Task 3 (engine)
**Проблема:** При `stockNow = 0` seed-заказы [today−3, today−1] генерировали возвраты (T+6) в первые дни горизонта, добавляя 2-2.4 ед/день в сток и нарушая тест zero-guard.
**Фикс:** Seed-заказы инициализируют только buyout-поток (T+3), возвраты от них не добавляются в returnsMap.
**Обоснование:** RESEARCH.md §3.3 говорит «seed-заказы для выкупов первых дней» — только выкупы, не возвраты. Возвраты — следствие заказов симуляции.
**Файлы:** `lib/sales-plan/engine.ts`
**Коммит:** `230236e`

### Авто-фикс #2: Переработка сток-лимит-инварианта [Rule 1 - Bug]

**Обнаружено во время:** Task 3 (engine)
**Проблема:** Первая реализация (`stock = prev_stock + inflow + returns; orders = min(rate, stock)`) позволяла orders[d] > stockEnd[d-1] в дни с приходом товара (arrival), нарушая тест сток-лимит.
**Фикс:** Переработан порядок: `orders[d] = min(rate[d], stockEnd[d-1]); stockEnd[d] = stockEnd[d-1] - orders[d] + inflow[d] + returns[d]`.
**Семантика:** inflow добавляется в конце дня — товар доступен со следующего дня. Это строгий инвариант `orders[d] ≤ stockEnd[d-1]`.
**Файлы:** `lib/sales-plan/engine.ts`
**Коммит:** `230236e`

## Pure-проверка

```
grep -c "import.*prisma|from \"@prisma|from \"react|from \"next" \
  lib/sales-plan/iu.ts lib/sales-plan/types.ts lib/sales-plan/dates.ts \
  lib/sales-plan/engine.ts lib/sales-plan/arrivals.ts
→ 0 для каждого файла (все pure)
```

## Known Stubs

Нет — все реализованные функции полностью работают. Остающиеся стабы Wave-0:
- `tests/sales-plan-virtual.test.ts` — RED (реализуется Wave 3)
- `tests/sales-plan-plan-fact.test.ts` — RED (реализуется Wave 3)
- `tests/sales-plan-pdds-feed.test.ts` — RED (реализуется Wave 6)

Это норма согласно плану — эти 3 стаба реализуются в следующих волнах.

## Threat Flags

Нет — все новые файлы pure-вычислительные, без сетевых endpoint'ов или обращений к БД.

## Self-Check: PASSED

Все 6 файлов найдены. Все 3 коммита (43e4955, dcee440, 230236e) существуют в git log.
