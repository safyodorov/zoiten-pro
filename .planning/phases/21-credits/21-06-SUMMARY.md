---
phase: 21-credits
plan: "06"
subsystem: credits-detail
tags: [credits, loan, recharts, RSC, sticky-table]
dependency_graph:
  requires: [21-02, 21-03]
  provides: [credits-detail-page, loan-summary-cards, loan-schedule-table, loan-balance-chart]
  affects: [credits-list-navigation]
tech_stack:
  added: []
  patterns: [recharts-line-chart, ChartContainer, computeSchedule-RSC, sticky-thead-raw-html]
key_files:
  created:
    - app/(dashboard)/credits/[id]/page.tsx
    - components/credits/LoanSummaryCards.tsx
    - components/credits/LoanScheduleTable.tsx
    - components/credits/LoanBalanceChart.tsx
  modified: []
decisions:
  - LoanBalanceChart adds optional starting point (amount) before first payment for context
  - LoanScheduleTable uses max-h-480px scroll with sticky thead for long schedules (24+ rows)
  - LoanSummaryCards uses 6-column grid (xl:grid-cols-6) to fit all info on one row on wide screens
  - balance cells show Math.max(0, balance) to avoid negative display for fully-paid loans
metrics:
  duration: "~8 minutes"
  completed: "2026-06-09"
  tasks: 3
  files: 4
---

# Phase 21 Plan 06: Credits Detail Page Summary

**One-liner:** RSC детальная карточка кредита `/credits/[id]` с 6 summary cards, sticky-таблицей графика погашения и recharts line-chart кривой остатка основного долга.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | RSC page.tsx + LoanSummaryCards | 574f0c3 | app/(dashboard)/credits/[id]/page.tsx, components/credits/LoanSummaryCards.tsx |
| 2 | LoanScheduleTable (sticky + computed balance) | 343312c | components/credits/LoanScheduleTable.tsx |
| 3 | LoanBalanceChart (recharts line-chart) | 185c2ec | components/credits/LoanBalanceChart.tsx |

## What Was Built

### app/(dashboard)/credits/[id]/page.tsx
RSC страница детальной карточки кредита:
- `await requireSection("CREDITS")` + `const { id } = await params` (Next 15 async params)
- `prisma.loan.findFirst({ where: { id, deletedAt: null }, include: { company: true, lender: true, payments: ... } })`
- `notFound()` если loan не найден или deletedAt != null
- `computeSchedule` + `computeLoanAggregates` + `computeStatus` вызываются на сервере
- `effectiveIssueDate = issueDate ?? payments[0]?.date ?? null` (D-07)
- Заголовок: `← Назад к списку` + № КД + орг + lender.name + статус-бейдж
- Рендерит LoanSummaryCards → LoanBalanceChart → LoanScheduleTable

### components/credits/LoanSummaryCards.tsx
6 summary cards (паттерн SpendSummary):
1. Сумма кредита
2. Погашено тела (+ % от суммы)
3. Уплачено процентов
4. Текущий остаток (цвет: sky=active, emerald=paid)
5. Переплата (= сумма процентов)
6. Параметры: Кредитор / Ставка 28,0% / Срок / Дата выдачи (с fallback-пометкой)

U-03 соблюдён: нет упоминаний bank/Bank, только `lenderName` / «Кредитор».

### components/credits/LoanScheduleTable.tsx
Sticky таблица по CLAUDE.md паттерну:
- `border-separate border-spacing-0` + `<thead className="bg-card">` + `<tr>` raw HTML
- `<th>` с `sticky top-0 z-20 bg-card border-b` — НЕ shadcn TableHeader/TableRow
- `max-h-480px` scroll-контейнер для длинных графиков (24+ строк)
- Колонки: Дата (ДД.ММ.ГГГГ) / Тело (₽) / Проценты (₽) / Остаток осн. долга (balance, ₽)
- Итоговая строка: Σ тело + Σ проценты
- `text-right tabular-nums` для числовых колонок

### components/credits/LoanBalanceChart.tsx
recharts line-chart кривой остатка:
- `"use client"` (recharts требует браузер)
- `LineChart` с `XAxis` (ДД.ММ.ГГ) + `YAxis` (тысячи ru-RU) + `CartesianGrid`
- `Line type="monotone" dataKey="balance" stroke="var(--chart-1)" dot={{r:1.5}}`
- `ChartTooltip` с кастомным formatter: `N ₽` ru-RU
- Стартовая точка `balance=amount` (если передан) для полного контекста кривой
- Card-shape обёртка `rounded-md border bg-card p-3 max-w-[720px]`

## Deviations from Plan

None — план выполнен точно как написан.

## Known Stubs

None — все компоненты полностью связаны с данными через RSC props.

## Pre-existing Issues (out of scope)

TS errors в pre-existing файлах из Plan 05 (не запущен параллельно):
- `app/(dashboard)/credits/page.tsx`: missing `LoanModal` import
- `components/credits/CreditsTable.tsx`: missing `LoanModal` import
- `app/(dashboard)/credits/schedule/page.tsx`: missing `SummaryScheduleTable` import

Эти ошибки существовали до Plan 06 и будут исправлены при выполнении Plan 05.

## Self-Check: PASSED

- `app/(dashboard)/credits/[id]/page.tsx` — FOUND
- `components/credits/LoanSummaryCards.tsx` — FOUND
- `components/credits/LoanScheduleTable.tsx` — FOUND
- `components/credits/LoanBalanceChart.tsx` — FOUND
- Commit 574f0c3 — FOUND (Task 1)
- Commit 343312c — FOUND (Task 2)
- Commit 185c2ec — FOUND (Task 3)
- Plan 06 files: zero TS errors
