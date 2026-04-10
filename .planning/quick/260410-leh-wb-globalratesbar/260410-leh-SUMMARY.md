---
phase: quick/260410-leh-wb-globalratesbar
plan: 01
subsystem: prices-wb-ui
tags:
  - ui-fix
  - sticky-columns
  - layout
  - post-release-polish
requires:
  - Phase 07 завершён и задеплоен (PriceCalculatorTable + GlobalRatesBar в проде)
provides:
  - Корректные ширины sticky колонок таблицы /prices/wb
  - GlobalRatesBar собран слева через flex-wrap
affects:
  - components/prices/PriceCalculatorTable.tsx
  - components/prices/GlobalRatesBar.tsx
tech_stack_added: []
patterns:
  - "min-w-[Npx] + w-[Npx] пара для фиксации ширины колонок при table-layout: auto"
  - "flex flex-wrap для компактного горизонтального layout'а с естественной шириной"
key_files_created: []
key_files_modified:
  - components/prices/PriceCalculatorTable.tsx
  - components/prices/GlobalRatesBar.tsx
decisions:
  - "min-w-[...] + w-[...] вместо table-layout: fixed — минимальное вмешательство, 26 расчётных колонок продолжают auto-распределяться"
  - "Сузить колонку Сводка до 200px (было декларативно 240px, фактически 112px) — компромисс между плану 240px и фидбеку пользователя"
  - "Sticky left offsets пересчитаны: 0 / 128 / 328 / 400 — согласованы с новыми реальными ширинами 128 / 200 / 72 / 112"
metrics:
  duration: 68s
  completed_date: "2026-04-10"
  tasks_completed: 2
  tasks_total: 2
  files_modified: 2
requirements_completed:
  - FIX-WB-COL-WIDTH
  - FIX-GLOBAL-RATES-LAYOUT
---

# Quick Task 260410-leh: Починить ширины sticky колонок + GlobalRatesBar layout

**One-liner:** Замена `w-32/w-60/w-20/w-28` на `min-w-[...] w-[...]` для sticky колонок `PriceCalculatorTable` с пересчётом sticky offsets (0/128/328/400) + замена `grid grid-cols-3/6` на `flex flex-wrap` в `GlobalRatesBar` для компактного layout'а слева.

## Изменения по файлам

### `components/prices/PriceCalculatorTable.tsx`

**Заголовки таблицы (thead):**
- L217-219 (th Фото): `w-32` → `min-w-[128px] w-[128px]`, sticky `left-0`, комментарий `{/* Sticky 1: Фото (128px) */}`
- L221-223 (th Сводка): `left-32 ... w-60` → `left-[128px] ... min-w-[200px] w-[200px]`, комментарий `{/* Sticky 2: Сводка (left 128, width 200 → 328) */}`
- L225-227 (th Ярлык): `left-[368px] ... w-20` → `left-[328px] ... min-w-[72px] w-[72px]`, комментарий `{/* Sticky 3: Ярлык (left 328, width 72 → 400) */}`
- L229-231 (th Артикул): `left-[448px] ... w-28` → `left-[400px] ... min-w-[112px] w-[112px]`, комментарий `{/* Sticky 4: Артикул (left 400, width 112 → 512) */}`

**Tbody ячейки (td):**
- Фото td: `w-32` → `min-w-[128px] w-[128px]`, sticky `left-0`
- Сводка td: `left-32 ... w-60` → `left-[128px] ... min-w-[200px] w-[200px]`
- Ярлык td: `left-[368px] ... w-20` → `left-[328px] ... min-w-[72px] w-[72px]`
- Артикул td: `left-[448px] ... w-28` → `left-[400px] ... min-w-[112px] w-[112px]`

**НЕ трогали:**
- Классы `z-index`, `bg-background`, `border-r`, `padding`, `text-alignment`, `align-top`
- Картинка товара внутри td Фото (`w-28 h-[150px]`, 112×150) — помещается в 128px td с p-2
- 26 расчётных колонок (auto-распределяются как раньше)

### `components/prices/GlobalRatesBar.tsx`

**L97:** `<div className="grid grid-cols-3 md:grid-cols-6 gap-4">` → `<div className="flex flex-wrap gap-4">`

**НЕ трогали:**
- `Card className="p-4 bg-muted/30 border"` (внешний контейнер)
- `flex flex-col gap-1` (внутренний layout каждого поля)
- `Input className="h-8 w-20 text-sm"` (сам инпут остаётся `w-20`)

## Sticky offsets arithmetic

| Колонка  | Было (offset/width)     | Стало (offset/width) |
|----------|-------------------------|----------------------|
| Фото     | left-0 / w-32 (128px)   | left-0 / 128px       |
| Сводка   | left-32 / w-60 (240px)  | left-[128px] / 200px |
| Ярлык    | left-[368px] / w-20     | left-[328px] / 72px  |
| Артикул  | left-[448px] / w-28     | left-[400px] / 112px |
| Конец    | 560px                   | 512px                |

## Проблема до правки (диагностика Chrome MCP)

- Фото: фактическая ширина 47px вместо заявленных 128px — картинка товара сжата до 30×150
- Сводка: фактическая ширина 112px вместо 240px
- Ярлык: 63px вместо 80px
- Артикул: 76px вместо 112px

**Причина:** `<table>` без явного `table-layout: fixed` использует auto-layout, который распределяет ширину по содержимому. Классы `w-32`/`w-60` на `<th>`/`<td>` работают только как hint, но не как constraint. Решение — `min-w-[...]` (минимальная ширина не даёт сжиматься ниже порога) + `w-[...]` (preferred width для auto-layout).

**Почему не `table-layout: fixed`:** Требует явных ширин всех 30 колонок (включая 26 расчётных), иначе они делят остаток поровну. `min-w-[...]` на конкретных th/td — минимальное вмешательство, 26 расчётных колонок продолжают auto-распределяться по содержимому.

## Верификация

- `npx tsc --noEmit` — **прошёл без ошибок** (таймаут 180s, фактически ~60s)
- grep по старым значениям (`left-[368px]`, `left-[448px]`, `left-32`, `w-60`, `w-32`) — **no matches** в PriceCalculatorTable.tsx
- Коммит содержит только 2 файла (`components/prices/PriceCalculatorTable.tsx`, `components/prices/GlobalRatesBar.tsx`)

## Деплой на VPS

**НЕ ВЫПОЛНЕН.** По указанию оркестратора: production деплой на https://zoiten.pro требует явного подтверждения пользователя. Executor остановился после локального коммита. Команда для деплоя (выполнит оркестратор после одобрения):

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

После деплоя проверка:
```bash
ssh root@85.198.97.89 "systemctl is-active zoiten-erp && curl -sI https://zoiten.pro/prices/wb | head -3"
```

## Визуальная проверка

**Отложена до деплоя.** План содержит checkpoint Task 4 (human-verify) с инструкциями Chrome MCP:
- Проверка `getBoundingClientRect` для 4 sticky колонок (ожидания: 128/200/72/112)
- Проверка размера картинки товара (ожидание: 112×150)
- Проверка наличия `flex-wrap` класса в GlobalRatesBar
- Скриншоты для финального подтверждения пользователем

Все Chrome MCP snippets находятся в PLAN.md раздел Task 4.

## Deviations from Plan

Нет — план выполнен точь-в-точь как написан, за исключением явного указания оркестратора пропустить deploy-шаги (Task 3 шаги 3-5) и Task 4 (human verification checkpoint).

## Коммит

- Hash: `142c62d`
- Message: `fix(prices-wb): починить ширины колонок таблицы + собрать GlobalRatesBar слева`
- Файлы: 2 (PriceCalculatorTable.tsx + GlobalRatesBar.tsx)
- Push: **НЕ выполнен** (требует одобрения пользователя на prod deploy)

## Self-Check: PASSED

- FOUND: components/prices/PriceCalculatorTable.tsx (изменён — все 4 пары th/td)
- FOUND: components/prices/GlobalRatesBar.tsx (изменён — L97 flex-wrap)
- FOUND: commit 142c62d
- FOUND: .planning/quick/260410-leh-wb-globalratesbar/260410-leh-SUMMARY.md
- VERIFIED: `npx tsc --noEmit` passed
- VERIFIED: grep подтверждает отсутствие старых offsets/widths
