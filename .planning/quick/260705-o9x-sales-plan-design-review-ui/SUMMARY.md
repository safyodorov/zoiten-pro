---
task: 260705-o9x-sales-plan-design-review-ui
phase: quick
plan: 260705-o9x
subsystem: sales-plan
tags: [ui, dark-mode, sticky, recharts, terminology]
completed: 2026-07-05
duration: ~35 min
tasks_completed: 3/3
files_changed: 12

key-decisions:
  - "Cell per-point opacity реализован в Task 1 вместе с P0-3 (один блок Bar)"
  - "Комментарий «Выполнение ИУ %» переименован для полного grep == 0"
---

# Quick 260705-o9x: UI-правки /sales-plan по итогам дизайн-ревью

20 UI-правок (P0-1…P2-7): dark-токены для чарта и ABC-бейджей, sticky-футер без просвечивания, --chart-iu токен, семантические цвета, styled-ссылка режима, терминология матрицы, empty states, глиф.

## Задачи и коммиты

| Задача | Название | Коммит | Файлы |
|--------|----------|--------|-------|
| 1 | P0 — dark-читаемость и sticky | 1f5d770 | ProductPlanTable, PlanFactChart, ProductPlanDialog, globals.css |
| 2 | P1 — семантика цветов + доводка | e5d61a3 | 9 файлов |
| 3 | P2 — терминология, empty states, hit-area, глифы | d16fba6 | 5 файлов + sales-plan/page.tsx |

## Deviations from Plan

None — план выполнен дословно.

## Self-Check: PASSED

- tsc --noEmit: 0 ошибок
- npm run build: OK
- vitest: 3 файла, 31 тест, GREEN
- Все grep-инварианты из плана истинны
