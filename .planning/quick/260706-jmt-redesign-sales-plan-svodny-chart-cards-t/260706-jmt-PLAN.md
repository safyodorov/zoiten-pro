---
quick_id: 260706-jmt
title: Редизайн Сводного плана продаж — наглядность (график/карточки/таблица + логика)
status: in-progress
date: 2026-07-06
---

# Задача

Вкладка «Сводный» (`/sales-plan`) путает: текущий месяц у плана обрезан по прошедшим дням (pro-rata), а у ИУ — нет; «План за период» показывает hybrid (284М вместо полного 325М); «−95% от плана» сравнивает 5 дней факта с планом всего горизонта. Сделать нагляднее по утверждённому макету.

Реальные числа (актив. версия `cmr8x68ly1wdrvhkhhu4oden9`, сегодня 06.07.2026): план горизонта **325,2М**; июль полный **43,3М** / до 05.07 (pro-rata) **1,9М**; ИУ горизонта **438,1М**; ИУ июля полный **73,8М** / до 05.07 **11,9М**; факт июля **12,8М**; прогноз июля **≈54,2М**; Прогноз 31.12 (FAC) **336,1М**.

# Задачи

## T1 — lib/sales-plan/plan-fact.ts (логика, TDD)
Расширить `PlanFactBucket` (только добавлять, existing поля не трогать):
- `planRubFull` = полный план бакета (= acc.planRub, без pro-rata)
- `planRubToDate` = acc.planRubProRata (план за дни ≤ yesterday)
- `iuRubFull` = acc.iuRub (полный ИУ — уже есть в iuRub, дублируем явно)
- `iuRubToDate` = НОВЫЙ аккумулятор: ИУ за дни ≤ yesterday
- `forecastRub`: bucket весь в прошлом → factRub; текущий → factRub + (planRubFull − planRubToDate); будущий → planRubFull
- `elapsedDays` (дни ≤ yesterday в бакете), `totalDays` (= dayCount) — для метки «5/31»

`existing planRub` оставляем как есть (pro-rata для текущего) — deviation-строки не ломаем.
`total`: planRubFull=Σ, iuRubFull=Σ, forecastRub=Σ (=FAC), elapsedDays/totalDays суммарно.
`PlanFactKpi`: добавить `planHorizonFullRub` = Σ planRubFull.
Тест `tests/sales-plan-plan-fact.test.ts`: расширить — проверить planRubFull для текущего бакета = полный план, forecastRub текущего = fact+remaining, planHorizonFullRub = Σ.

## T2 — PlanFactChart.tsx
Точка графика: добавить `planRubFull`, `forecastRub`, `elapsedDays`, `totalDays`, `factRub`. Текущий бакет: план = planRubFull (не pro-rata); факт сплошной bar; прогноз-остаток (forecastRub−factRub) штриховкой поверх факта; метка «N/M дн». В not-cumulative режиме использовать planRubFull для линии плана (не pro-rata). ИУ уже полный.

## T3 — PlanFactSummaryCards.tsx
Два блока. «Темп на сегодня»: Факт-накоп vs ИУ-накоп (vsIuGapRub, honest), убрать «−95% от плана». «Прогноз до 31.12»: Прогноз (facPrimaryRub) / План весь горизонт (planHorizonFullRub ~325) / до ИУ (facPrimaryRub − iuHorizonTotalRub). «План за период» → planHorizonFullRub (полный).

## T4 — PlanFactMatrix.tsx
Главная «План»-строка → planRubFull (полный месяц). Добавить строку «Прогноз» = forecastRub. ИУ-строка → iuRubFull. Для текущего бакета — tooltip (title) с to-date (planRubToDate, iuRubToDate). Deviation-строки: пересчитать как forecast−planFull (Итог = FAC−план = +11М), убрать −95%.

## T5 — page.tsx
Прокинуть planHorizonFullRub в карточки, новые поля в chartPoints. `cumulative` default ON: `sp.cumulative !== "0"` (тумблер оставить).

# Verify
- `npx tsc --noEmit` чисто (кроме pre-existing exceljs)
- `npm run test` — golden plan-fact/engine зелёные + новые проверки
- деплой detached nohup, curl 200, глазами /sales-plan
