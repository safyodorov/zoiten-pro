---
phase: 22-bank-accounts
plan: "05"
subsystem: bank-ui
tags: [bank, sticky-table, filters, import-script, rsc-page, inline-edit]
dependency_graph:
  requires: ["22-01 (schema)", "22-02 (stub+RBAC stub)", "22-03 (parsers)", "22-04 (persist+action)"]
  provides: ["BankTransactionsTable", "BankFilters", "/bank RSC page", "import-bank-statements.ts"]
  affects: ["UAT Task 4 (pending deploy + RBAC provision + import run)"]
tech_stack:
  added: []
  patterns:
    - "CLAUDE.md sticky table: overflow-auto h-full / border-separate border-spacing-0 / thead bg-background / th sticky top-0 z-20 bg-background"
    - "CategoryCell: native <select> + useTransition + categorizeTx + value rollback"
    - "BankFilters: URL-driven cascade Компания→Счёт→Банк (mirror ProductFilters.tsx)"
    - "RSC page: requireSection + getSectionRole + Promise.all + Decimal→number mapping"
    - "Import script: detectFormat + parseStatement + persistParsedTransactions (no logic duplication)"
key_files:
  created:
    - lib/bank-labels.ts
    - components/bank/BankTransactionsTable.tsx
    - components/bank/BankFilters.tsx
    - scripts/import-bank-statements.ts
  modified:
    - app/(dashboard)/bank/page.tsx
decisions:
  - "BankTxRow: flat serializable object (Decimal→number, Date→ISO string on server) — RSC→client boundary"
  - "CategoryCell rollback pattern: prev value saved before optimistic update, restored on !result.ok"
  - "Cascading cleanup: setCompanies clears invalid accountIds + bankIds; setAccounts clears invalid bankIds"
  - "search input: defaultValue + onChange (not controlled) — avoids cursor jump on debounce"
  - "Import script uses importedById=null (system, not user-bound); re-run idempotent via fingerprint @unique"
  - "category filter: cast to TxCategory union literal (Prisma.EnumTxCategoryFilter not exported in this version)"
metrics:
  duration: "~18min"
  completed_date: "2026-06-10"
  tasks_total: 4
  tasks_completed: 3
  tasks_pending_uat: 1
  files_created: 4
  files_modified: 1
---

# Phase 22 Plan 05: /bank UI + Import Script Summary

**One-liner:** Sticky-таблица операций (11 колонок, inline CategoryCell с rollback) + URL-driven каскадные фильтры (Компания→Счёт→Банк + native select direction/category + date range + debounced search) + RSC /bank page заменяет заглушку + разовый import-скрипт через persistParsedTransactions.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | lib/bank-labels.ts + BankTransactionsTable | 24b2121 | lib/bank-labels.ts, components/bank/BankTransactionsTable.tsx |
| 2a | BankFilters (URL-driven каскадные) | b5d9084 | components/bank/BankFilters.tsx |
| 2b | RSC /bank page | 70407ac | app/(dashboard)/bank/page.tsx |
| 3 | scripts/import-bank-statements.ts | 16fabdb | scripts/import-bank-statements.ts |

## Pending

| Task | Name | Status |
|------|------|--------|
| 4 | UAT — deploy + RBAC + import + ручная проверка | **AWAITING CHECKPOINT** |

## Implementation Details

### lib/bank-labels.ts
Pure module, без серверных импортов. CATEGORY_LABELS (8 ключей), CATEGORY_OPTIONS, DIRECTION_LABELS. Безопасен для client-компонентов.

### components/bank/BankTransactionsTable.tsx
- **Sticky pattern (CLAUDE.md):** `overflow-auto h-full` → `table border-separate border-spacing-0` → `thead bg-background` → `tr` (прямой HTML, НЕ shadcn TableRow) → `th sticky top-0 z-20 bg-background border-b`. Нет `bg-background/NN` на sticky.
- **11 колонок:** Дата / Компания / Счёт / Банк / Направление / Сумма / Валюта / №doc / Контрагент / Назначение / Категория
- **CategoryCell:** native `<select>` (CLAUDE.md), `useState` + `useTransition`, при `!result.ok` → `toast.error` + откат на `prev`
- **canManage gate:** `!canManage` → `<span>` вместо select

### components/bank/BankFilters.tsx
- **URL-driven:** `useSearchParams` + `router.push(buildUrl(overrides))`
- **Каскад Компания→Счёт→Банк:** `setCompanies` очищает невалидные `accountIds` + `bankIds`; `setAccounts` очищает невалидные `bankIds`
- **MultiSelectDropdown** (inline copy, не из ui/) для companies/accounts/banks
- **Native `<select>`** для direction/category (CLAUDE.md)
- **2x `<input type="date">`** для dateFrom/dateTo
- **Debounced `<input type="search">`** (300ms, useRef timer) → URL `search` param

### app/(dashboard)/bank/page.tsx
- `requireSection("BANK")` + `getSectionRole("BANK")` → canManage
- `await searchParams` (Next.js 15 Promise)
- **6-мерный where-builder:** companies (`account.companyId`) / accounts (`accountId`) / banks (`account.bankId`) / direction / category / date range + `OR` search (purpose + counterpartyName, `mode: "insensitive"`)
- `Promise.all`: bankTransaction.findMany (include account.company/bank + counterparty) + company/bankAccount/bank для filter options
- `take: 500`, `orderBy: { date: "desc" }`
- Decimal→number: `Number(t.amount)`; date → ISO `t.date.toISOString().slice(0, 10)`

### scripts/import-bank-statements.ts
- Читает все `.xlsx` из `Выписки/` (untracked)
- Probe read → `detectFormat` → для sber: re-read `raw:false` (merged cells) → `parseStatement` → `persistParsedTransactions`
- `importedById: null` (системный скрипт)
- Per-file console report + итого
- Идемпотентен через fingerprint @unique + createMany skipDuplicates
- НЕ модифицирует Wave-3 файлы (route.ts, persist.ts)

**Запуск на VPS после деплоя:**
```bash
set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/import-bank-statements.ts
```

## Verification

- `npx tsc --noEmit` → CLEAN (EXIT:0)
- `npm run test -- bank-import` → 36/36 passing
- Pre-existing failures: 45 в `wb-sync-route.test.ts` (неизменные с 22-04)
- Sticky cells: `grep "bg-background/" BankTransactionsTable.tsx` → EMPTY (нет прозрачности)
- Wave-3 files untouched: `git diff` не показывает bank-import/route.ts или persist.ts

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma.EnumTxCategoryFilter не экспортируется в текущей версии Prisma**
- **Found during:** Task 2b (tsc error TS2694)
- **Issue:** `Prisma.EnumTxCategoryFilter` — не экспортируемый тип в установленной версии `@prisma/client`
- **Fix:** Явный union type `"UNCATEGORIZED" | "INTERNAL_TRANSFER" | ...` вместо Prisma namespace type
- **Files modified:** app/(dashboard)/bank/page.tsx
- **Commit:** 70407ac

## Known Stubs

None — все компоненты и page работают с реальными данными из БД. Таблица показывает реальные транзакции при наличии данных.

**UAT pending (Task 4):** До деплоя и импорта данных таблица пуста (нет транзакций в БД). Это ожидаемо — не стаб, а пустое состояние с корректным плейсхолдером «Нет операций. Загрузите выписку.»

## Self-Check

- [x] lib/bank-labels.ts exists with CATEGORY_OPTIONS (8 keys), DIRECTION_LABELS
- [x] components/bank/BankTransactionsTable.tsx exists with `border-separate border-spacing-0`
- [x] No `bg-background/` on sticky cells (grep CLEAN)
- [x] `categorizeTx` + `useTransition` + `<select>` found in BankTransactionsTable
- [x] components/bank/BankFilters.tsx exists with `useSearchParams` + `router.push` + `companyId` + `type="date"` + `type="search"` + `<select>`
- [x] app/(dashboard)/bank/page.tsx contains `requireSection("BANK")` + `getSectionRole("BANK")` + `bankTransaction.findMany` + `Number(` + `mode: "insensitive"` + `flex-1 min-h-0`
- [x] scripts/import-bank-statements.ts exists with `Выписки` + `detectFormat` + `persistParsedTransactions` + `raw: false`
- [x] Wave-3 files (route.ts, persist.ts) NOT modified
- [x] Commits 24b2121, b5d9084, 70407ac, 16fabdb all exist
- [x] `npx tsc --noEmit` → EXIT:0
- [x] `npm run test -- bank-import` → 36/36 passing

## Self-Check: PASSED
