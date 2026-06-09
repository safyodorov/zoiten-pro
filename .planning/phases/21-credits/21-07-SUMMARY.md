---
phase: 21-credits
plan: "07"
subsystem: credits
tags: [ui, sticky-table, horizontal-scroll, bucketing, schedule, rbac]
dependency_graph:
  requires: [21-02, 21-03]
  provides: [lib/credits-schedule-data.ts, components/credits/SummaryScheduleTable.tsx, components/credits/ScheduleControls.tsx, app/(dashboard)/credits/schedule/page.tsx]
  affects: [21-08]
tech_stack:
  added: []
  patterns:
    - Horizontal sticky table — border-separate, 7 sticky left columns (position sticky + left offset accumulation)
    - D-03 bакетирование на лету через bucketKey/bucketLabel из loan-math.ts
    - Two rows per loan without rowSpan (CLAUDE.md mixed-rowSpan pattern)
    - URL-driven controls via useSearchParams + router.push (ScheduleControls)
    - RSC page with searchParams parsing + defaults
key_files:
  created:
    - lib/credits-schedule-data.ts
    - components/credits/ScheduleControls.tsx
    - app/(dashboard)/credits/schedule/page.tsx
    - components/credits/SummaryScheduleTable.tsx
  modified: []
decisions:
  - "Левый sticky-блок без rowSpan — 2 строки на кредит (Тело с инфо + % с плейсхолдерами) согласно CLAUDE.md mixed-rowSpan pattern"
  - "colSpan на org/lender/contract/amount/rate в subtotal rows упрощает разметку при сохранении sticky offsets"
  - "LoanGranularity реэкспортируется из credits-schedule-data.ts для use в ScheduleControls без циклической зависимости"
  - "generateBucketSequence: итерация по cursor с шагом день/неделю/месяц с дедупликацией через Set — правильный охват крайних бакетов при любой гранулярности"
  - "defaultScheduleWindow: UTC-расчёт от текущей даты (не МСК), т.к. даты платежей хранятся без времени в UTC"
metrics:
  duration: "~5 минут"
  completed: "2026-06-09"
  tasks: 3
  files: 4
---

# Phase 21 Plan 07: Сводный горизонтальный график выплат — SUMMARY

Центральная фишка Phase 21: горизонтальная sticky-таблица `/credits/schedule` с бакетированием платежей день/неделя/месяц, группировкой по организации, подытогами и Итого. Левый sticky-блок содержит Кредитора (U-03), правая часть — period-колонки с горизонтальным скроллом. Каждый кредит = 2 строки без rowSpan (CLAUDE.md).

## What Was Built

### Task 1: lib/credits-schedule-data.ts

Data-слой бакетирования и группировки:

- `loadSummarySchedule(granularity, from, to)`: загружает `prisma.loan.findMany` с `include: { company, lender, payments }`, бакетирует платежи в окне через `bucketKey` (из loan-math.ts), группирует по организации
- `generateBucketSequence(from, to, granularity)`: перечисляет все бакеты в окне — итерация cursor с дедупликацией через Set, шаг день/неделя/месяц
- Типы: `PeriodColumn`, `LoanScheduleRow` (с `lenderName = loan.lender.name` — U-03), `OrgGroup` (с subtotalPrincipal/InterestByPeriod), `SummarySchedule`
- Порядок орг: ПЕЛИКАН ХЭППИ ТОЙС → ЗОЙТЕН → СИКРЕТ ВЭЙ → ДРИМ ЛАЙН → прочие алфавитно
- `currentBalance` считается по ВСЕМ платежам через `computeLoanAggregates` (не только в окне)
- `defaultScheduleWindow()`: from = первый день прошлого месяца, to = последний день +6 месяцев (7 бакетов)

### Task 2: RSC page + ScheduleControls

- `app/(dashboard)/credits/schedule/page.tsx`: RSC с `requireSection("CREDITS")`, парсит searchParams (granularity/from/to) с fallback на дефолты, вызывает `loadSummarySchedule`
- `components/credits/ScheduleControls.tsx`: сегментированный переключатель День/Неделя/Месяц + date inputs «с/по» + кнопка «Сбросить» — всё через URL searchParams (shareable)

### Task 3: SummaryScheduleTable

Горизонтальная sticky-таблица (CLAUDE.md паттерн):

- `overflow-auto h-full` — единственный scroll-контейнер
- `border-separate border-spacing-0` — raw HTML table (не shadcn Table)
- 7 sticky left колонок с накопительными `left:` offset: Тип / Организация / **Кредитор** / № КД / Сумма / Ставка / Остаток
- Последняя sticky-колонка (Остаток) имеет `border-r border-r-border` — граница sticky/period
- **2 строки на кредит без rowSpan** (CLAUDE.md): строка «Тело» — полная информация; строка «%» — плейсхолдеры «—» в левом блоке. h-8 в обоих строках
- Intra-credit граница: `border-b-border/40`
- Per-org подытоги (2 строки с `bg-muted/40 font-medium`) — inter-group граница `border-b-2`
- Grand total (2 строки с `font-semibold`)
- Клик строки кредита → `router.push(/credits/${loanId})`
- Деньги: `toLocaleString("ru-RU") + " ₽"`, 0 → «—»

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing] CreditsTabs уже создан параллельным агентом (Plan 05)**
- **Found during:** Task 2
- **Issue:** Параллельный агент Plan 05 уже создал `components/credits/CreditsTabs.tsx` с правильной логикой
- **Fix:** Переиспользован существующий компонент без изменений (не создавался повторно)
- **Files modified:** нет

### Scope notes

- `rowSpan` встречается только в комментариях файла SummaryScheduleTable.tsx — JSX атрибут `rowSpan=` отсутствует (соответствует CLAUDE.md)
- Pre-existing TypeScript errors в credits/page.tsx и credits/[id]/page.tsx (от параллельных планов 05/06 в процессе) не мешают нашим файлам — `npx tsc --noEmit` проходит без ошибок

## Known Stubs

Данных нет до запуска seed (Plan 21-04 на VPS). Пустой список показывает заглушку «Нет кредитов для отображения». Это ожидаемо на стадии разработки (D-01, Plan 21-08 seed).

## Self-Check: PASSED

Files exist:
- lib/credits-schedule-data.ts: FOUND
- components/credits/ScheduleControls.tsx: FOUND
- app/(dashboard)/credits/schedule/page.tsx: FOUND
- components/credits/SummaryScheduleTable.tsx: FOUND

Commits:
- 40968d0: feat(21-07): add lib/credits-schedule-data.ts
- 4be89dd: feat(21-07): schedule page RSC + ScheduleControls URL-driven
- a6c6782: feat(21-07): SummaryScheduleTable — horizontal sticky schedule table
