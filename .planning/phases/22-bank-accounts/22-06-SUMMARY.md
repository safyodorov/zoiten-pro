---
phase: 22
plan: "06"
subsystem: bank
tags: [bank, dashboard, ui, aggregation, rsc]
dependency_graph:
  requires: [22-05]
  provides: [bank-dashboard-ui]
  affects: [bank-page]
tech_stack:
  added: []
  patterns: [rsc-server-component, prisma-aggregation-in-memory, sticky-opaque-bg]
key_files:
  created:
    - components/bank/BankDashboard.tsx
  modified:
    - app/(dashboard)/bank/page.tsx
decisions:
  - Anchor date = MAX(BankAccount.balanceDate) across all accounts; fallback to MAX(tx.date)
  - CNY income/expense ignored for v1 (balance shown, flows are RUR only)
  - Last 30d transactions fetched in one Prisma query; 7d split in-memory (avoids 2nd query)
  - BankDashboard is pure server component (no client state)
  - Dashboard data computed with separate queries from table filters (independent global summary)
metrics:
  duration: "15 minutes"
  completed: "2026-06-10"
  tasks_completed: 1
  files_changed: 2
---

# Phase 22 Plan 06: Bank Dashboard UI — Balances + Income/Expense 7/30d Summary

**One-liner:** Server-side bank dashboard showing per-company account balances by currency plus rolling 7-day and 30-day income/expense, anchored at MAX(balanceDate).

## What Was Built

Added `BankDashboard` server component integrated above filters and table in `/bank` page. The dashboard shows:

1. **Anchor date** — "Обновлено: DD.MM.YYYY" using MAX(BankAccount.balanceDate) across all accounts, falling back to MAX(BankTransaction.date) if no balanceDate exists.

2. **Summary cards row** — compact auto-fit grid of cards:
   - Total RUR balance (orange accent)
   - CNY balance (shown only if CNY accounts exist)
   - 30d total income (RUR, emerald)
   - 30d total expense (RUR, red)

3. **Per-company compact table** — rows are companies, columns are:
   - Компания | Остаток RUR | [Остаток CNY if exists] | Приход 7д | Расход 7д | Приход 30д | Расход 30д
   - Final **Итого** row with solid `bg-muted` (per CLAUDE.md sticky/opaque-bg rule — no transparency on solid rows)

## Data Flow

- `dashboardAccounts` query: all BankAccounts with closingBalance + company.name (for balances and anchor)
- `dashboardTxAnchor` query: most recent transaction date (anchor fallback)
- `recentTxs` query (sequential after anchor): last 30d RUR transactions → in-memory split to 7d vs 30d
- All three queries are fully independent of the URL filters applied to the operations table

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- components/bank/BankDashboard.tsx exists ✓
- app/(dashboard)/bank/page.tsx modified ✓
- `npx tsc --noEmit` clean ✓
- `npm run test tests/bank-import.test.ts` → 62 tests passed ✓
- Commit 72652c6 exists ✓
