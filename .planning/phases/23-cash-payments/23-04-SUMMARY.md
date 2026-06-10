---
phase: 23-cash-payments
plan: "04"
subsystem: cash
tags: [server-actions, sticky-table, form, filters, RBAC]
dependency_graph:
  requires: [23-01, 23-02, 23-03]
  provides: [cash-server-actions, cash-ui]
  affects: [/cash]
tech_stack:
  added: []
  patterns: [sticky-table-CLAUDE-md, URL-driven-filters, inline-edit-cell, base-ui-dialog-render-prop]
key_files:
  created:
    - app/actions/cash.ts
    - lib/cash-labels.ts
    - components/cash/CashEntryForm.tsx
    - components/cash/CashFilters.tsx
    - components/cash/CashTable.tsx
  modified:
    - app/(dashboard)/cash/page.tsx
decisions:
  - "base-ui Dialog uses render= prop (not asChild) — fixed TS error on DialogTrigger"
  - "CashTable has totals block + truncation indicator above the sticky scroll container"
  - "Departments filter uses native select with static офис/склад/маркетинг/такси + dynamic DB extras"
metrics:
  duration: "~20 min"
  tasks_completed: 3
  files_created: 5
  files_modified: 1
  completed_date: "2026-06-10"
requirements: [CASH-08, CASH-09, CASH-10]
---

# Phase 23 Plan 04: Cash Server Actions + Form + Table Summary

**One-liner:** Server actions (5 CRUD+inline ops with MANAGE guard) + 8-field manual-add dialog (date=today, EXPENSE default, Иванова preselect) + sticky /cash RSC page with filters, totals/balance, and 1000-row truncation indicator.

## Tasks Completed

| # | Task | Commit | Key Files |
|---|------|--------|-----------|
| 1 | app/actions/cash.ts + lib/cash-labels.ts | deaf481 | app/actions/cash.ts, lib/cash-labels.ts |
| 2 | CashEntryForm (dialog) + CashFilters (URL-driven) | 08cc193 | components/cash/CashEntryForm.tsx, components/cash/CashFilters.tsx |
| 3 | CashTable (sticky) + RSC /cash page | 4181c91 | components/cash/CashTable.tsx, app/(dashboard)/cash/page.tsx |

## What Was Built

### app/actions/cash.ts
Five server actions, all protected by `requireSection("CASH", "MANAGE")`:
- `createCashEntry` — creates manual entry with `source="manual"`, `fingerprint=null`
- `updateCashEntry` — full edit with Zod validation
- `deleteCashEntry` — hard delete with P2025 guard
- `categorizeCashEntry` — inline category update (empty string → null)
- `updateCashComment` — inline comment update (empty → null)
All follow: handleAuthError + try/catch + revalidatePath("/cash").

### lib/cash-labels.ts
Pure client-safe module: `DIRECTION_LABELS` (INCOME/EXPENSE) + `DIRECTION_OPTIONS` (EXPENSE first as default for cash ops).

### components/cash/CashEntryForm.tsx
Dialog (base-ui render= prop pattern) triggered by «Добавить операцию» button. 8 fields:
1. Дата — `<input type="date">` default = today
2. Направление — native `<select>`, default = EXPENSE
3. Сумма — `<input type="number" step="0.01">`
4. Подразделение — native `<select>` (офис/склад/маркетинг/такси + extras from DB)
5. Категория — native `<select>` from CashCategory.sortOrder
6. Назначение — `<textarea>` required
7. Ответственный — native `<select>` with Иванова preselected (lastName match)
8. Комментарий — `<textarea>` optional
On submit → createCashEntry → toast.success + close dialog + reset form + router.refresh().

### components/cash/CashFilters.tsx
URL-driven filters mirroring BankFilters pattern:
- native `<select>`: год (DESC), направление, подразделение
- MultiSelectDropdown (inline, with Checkbox): категория, ответственный
- debounced search 300ms → param `search`
- «Сбросить» button when any filter active

### components/cash/CashTable.tsx
Sticky table per CLAUDE.md (border-separate, border-spacing-0, bg-background opaque on all sticky th):
- Totals bar above table: Приход (green) / Расход (red) / Баланс (sign-colored)
- Truncation indicator: «Показаны первые 1000 из N — уточните фильтры» when rows.length===1000 && totalCount>1000
- Columns: Дата · Направление (badge) · Сумма · Подразделение · Категория · Назначение · Ответственный · Комментарий
- CategoryCell: native `<select>` + useTransition + optimistic rollback + canManage
- CommentCell: input onBlur + Enter/Esc + optimistic rollback + canManage

### app/(dashboard)/cash/page.tsx
RSC page replacing the 23-02 stub:
- requireSection("CASH") + getSectionRole for canManage
- where-builder: year, direction, department, categoryIds, responsibleIds, search (insensitive)
- Promise.all loading: entries(take:1000), totalCount(count), categories, employees, departments(distinct), years(distinct by JS), totals(groupBy direction)
- Maps entries → CashRow[] with responsibleName fallback (FK employee → raw string)
- flex-1 min-h-0 layout for sticky header

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] base-ui DialogTrigger does not accept `asChild` prop**
- **Found during:** Task 2
- **Issue:** `components/ui/dialog.tsx` wraps `@base-ui/react/dialog` which uses `render=` prop pattern, not Radix `asChild`. TS error: Type `{ asChild: true }` not assignable.
- **Fix:** Changed `<DialogTrigger asChild><Button>...</Button></DialogTrigger>` to `<DialogTrigger render={<Button .../>} />` — matching the pattern in `components/settings/WbTokensTab.tsx`.
- **Files modified:** components/cash/CashEntryForm.tsx
- **Commit:** 08cc193

## Known Stubs

None — all data is wired to real DB. Form submits to createCashEntry, table reads from cashEntry.findMany, totals from cashEntry.groupBy, totalCount from cashEntry.count.

## Verification

- tsc clean (0 errors)
- cash-import tests: 23/23 passed
- All pre-existing test failures are unrelated (appeal-actions, customer-actions, wb-sync — pre-date this plan)
- Sticky table: bg-background (no /80 or /40 modifier on sticky cells)
- All 5 server actions have requireSection("CASH", "MANAGE")
- createCashEntry: source="manual", fingerprint=null
- Truncation indicator wired: totalCount prop flows from page.tsx count query → CashTable prop
- Totals groupBy uses same `where` as findMany (filter-reactive)

## Self-Check: PASSED
