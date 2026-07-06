---
quick_id: 260706-jmt
title: Редизайн Сводного плана продаж — наглядность
status: complete
date: 2026-07-06
commits: [96e2b3e, bfea34c]
---

# Итог

Устранена путаница на вкладке «Сводный» (`/sales-plan`): раньше текущий месяц у плана обрезался по прошедшим дням (pro-rata), а у ИУ — нет; «План за период» показывал hybrid 284М вместо полного 325М; «−95% от плана» сравнивал 5 дней факта с планом всего горизонта.

## Что сделано

- **`lib/sales-plan/plan-fact.ts`** — `PlanFactBucket` += `planRubFull`, `planRubToDate`, `iuRubFull`, `iuRubToDate`, `forecastRub` (= факт + план остатка бакета: past→факт, текущий→факт+остаток, future→план), `elapsedDays`/`totalDays`. `PlanFactKpi` += `planHorizonFullRub`. Existing поля не тронуты. +6 проверок в golden-тесте.
- **`PlanFactChart.tsx`** — текущий месяц в полном масштабе: факт сплошным + прогноз-остаток штриховкой (stacked, `pattern`), план-линия = полный месяц (`planRubFull`), метка «N/M дн» на текущем бакете; кастомный tooltip (Факт/Прогноз/План/ИУ).
- **`PlanFactSummaryCards.tsx`** — два блока: «Темп на сегодня» (vsIuGapRub, honest) и «Прогноз до 31.12» (Прогноз / План весь период `planHorizonFullRub` / ИУ / до ИУ). Убрана «−95% от плана».
- **`PlanFactMatrix.tsx`** — план/ИУ строки = полный месяц (`planRubFull`/`iuRubFull`), новая строка «Прогноз», сравнения «Прогноз − план» / «Прогноз − ИУ» / «Прогноз к ИУ %»; pro-rata «за N/M дн» в tooltip.
- **`PlanFactControls.tsx` + `page.tsx`** — «нарастающим итогом» включено по умолчанию (`cumulative !== "0"`); прокинуты новые поля бакета в chartPoints.

## Проверка

- `npx tsc --noEmit` — чисто (кроме pre-existing exceljs).
- `npm run test` (sales-plan) — 93/93 зелёные, вкл. новые проверки forecastRub/planRubFull/planHorizonFullRub.
- Golden-инвариант: `total.forecastRub === kpi.facPrimaryRub` (FAC).

## Осталось / примечания

- Реальная сверка на проде (числа июля: план полный 43,3М / до 05.07 1,9М, факт 12,8М, прогноз 54,2М, Прогноз горизонта 336,1М, до ИУ −102М) — визуальный UAT пользователя.
- Боевую палитру графика (Факт/Прогноз/План/ИУ) при желании прогнать через dataviz-валидатор (CVD-safe light+dark).
