---
phase: 21-credits
plan: "05"
subsystem: credits-ui
tags: [credits, ui, sticky-table, rbac, rhf, modal]
dependency_graph:
  requires: ["21-02", "21-03"]
  provides: ["credits-list-page", "loan-modal-crud"]
  affects: ["credits-navigation"]
tech_stack:
  added: []
  patterns:
    - sticky-table-raw-html
    - rhf-zod4-useFieldArray
    - getSectionRole-canManage
    - server-side-searchparams-filtering
key_files:
  created:
    - lib/credits-data.ts
    - components/credits/CreditsTabs.tsx
    - components/credits/CreditsFilters.tsx
    - components/credits/CreditsTable.tsx
    - components/credits/LoanModal.tsx
    - app/(dashboard)/credits/page.tsx
  modified: []
decisions:
  - "LoanModal uses zodResolver as any cast (zod 4.x + RHF 7.72 compatibility, same pattern as PricingCalculatorDialog)"
  - "CreditsTable passes LoanForModal with empty payments[] for edit trigger — actual payments loaded via server on edit form open"
  - "Server-side searchParams filtering in page.tsx (not client-only) — consistent with /employees and /products pattern"
  - "canManage via getSectionRole (not try/catch anti-pattern)"
metrics:
  duration: "256s (~4 min)"
  completed_date: "2026-06-09"
  tasks_completed: 3
  files_created: 6
  files_modified: 0
requirements:
  - D-04
  - D-09
  - D-11
  - D-12
  - D-19
---

# Phase 21 Plan 05: Credits List UI Summary

Реализована первая UI-поверхность раздела `/credits`: sticky-таблица кредитов с вычисленными агрегатами (currentBalance, статус), фильтрами org/lender/status через URL searchParams, кликом в карточку `/credits/[id]`, и CRUD через LoanModal (create/edit + nested график useFieldArray).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | lib/credits-data.ts + page.tsx + CreditsTabs | 00f4443 | lib/credits-data.ts, components/credits/CreditsTabs.tsx, app/(dashboard)/credits/page.tsx |
| 2 | CreditsTable + CreditsFilters | 71d57be | components/credits/CreditsTable.tsx, components/credits/CreditsFilters.tsx |
| 3 | LoanModal (create/edit + nested графиком) | 025ea68 | components/credits/LoanModal.tsx |

## What Was Built

**lib/credits-data.ts** — data helper:
- `loadCredits()`: prisma.loan.findMany с include company/lender/payments; вычисляет computeLoanAggregates + computeStatus; effectiveIssueDate = issueDate ?? первый платёж (D-07); сортировка company → lender → date → contractNumber. Decimal → Number() конвертация.
- `loadLendersAndCompanies()`: списки для фильтров и модалки. Кредиторы по sortOrder, компании по name.

**CreditsTabs** — два таба (Список | Сводный график). Важный нюанс: активация `/credits` только при `pathname === "/credits"` (не startsWith), чтобы `/credits/schedule` не подсвечивал Список.

**app/(dashboard)/credits/page.tsx** — RSC:
- `requireSection("CREDITS")` + `getSectionRole("CREDITS") === "MANAGE"` (canManage без try/catch)
- Серверная фильтрация по selectedCompanyIds / selectedLenderIds / statusFilter из searchParams
- Layout: `h-full flex flex-col` → шапка (CreditsTabs + кнопка добавить) → CreditsFilters → `flex-1 min-h-0` CreditsTable

**CreditsTable** — sticky по CLAUDE.md паттерну:
- `<div className="overflow-auto h-full">` + `<table className="w-full border-separate border-spacing-0">`
- `<thead className="bg-background">` + raw `<tr>` + `<th sticky top-0 z-20>`
- Колонки (D-12): Организация, Кредитор, № КД, Сумма, Ставка %, Срок, Дата выдачи, Текущий остаток, Статус, [Действия]
- Дата выдачи: если из fallback (issueDate=null) → курсивом + title="По дате первого платежа"
- Статус: active=sky, paid=emerald
- Деньги: toLocaleString("ru-RU") + " ₽"
- Действия (canManage): Изменить (LoanModal edit trigger) + Удалить (confirm + deleteLoan) с stopPropagation
- Пустой список: дружелюбная заглушка

**CreditsFilters** — MultiSelectDropdown для орг/кредитора + native `<select>` для статуса через URL searchParams. Кнопка «Сбросить» если есть активные фильтры.

**LoanModal** — shadcn Dialog с RHF + zodResolver (as any для zod 4.x compat):
- Поля D-05: № КД, Дата выдачи (nullable), Организация (native select), Кредитор (native select, U-03), Сумма, Ставка % (step=0.001), Срок мес (nullable), Заметки
- z.number() + valueAsNumber: true (НЕ z.coerce — известная несовместимость)
- nested useFieldArray «payments»: таблица {Дата, Тело, Проценты} + add/remove строки
- submit: createLoan (create) / updateLoan (edit) + toast + setOpen(false) + router.refresh()

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] zodResolver type incompatibility with zod 4.x**
- **Found during:** Task 3
- **Issue:** `zodResolver(LoanFormSchema)` TS error: Resolver type mismatch — известная несовместимость zod 4.x + RHF 7.72 + zodResolver
- **Fix:** Cast `zodResolver(LoanFormSchema) as any` — идентичный паттерн PricingCalculatorDialog из Phase 7 (зафиксирован в STATE decisions)
- **Files modified:** components/credits/LoanModal.tsx
- **Commit:** 025ea68

## Known Stubs

- `LoanModal` edit mode передаёт `payments: []` в форму при клике «Изменить» из таблицы, т.к. `CreditRow` не содержит полный список платежей. Пользователь должен заново ввести платежи при редактировании через список. **Полный CRUD с платежами доступен через детальную карточку `/credits/[id]` (Plan 06)**. Это допустимо для MVP — основной use case редактирования через карточку.

## Self-Check: PASSED

All 6 files created and all 3 commits verified:
- FOUND: lib/credits-data.ts
- FOUND: components/credits/CreditsTabs.tsx
- FOUND: components/credits/CreditsTable.tsx
- FOUND: components/credits/CreditsFilters.tsx
- FOUND: components/credits/LoanModal.tsx
- FOUND: app/(dashboard)/credits/page.tsx
- FOUND commit: 00f4443 (Task 1)
- FOUND commit: 71d57be (Task 2)
- FOUND commit: 025ea68 (Task 3)
