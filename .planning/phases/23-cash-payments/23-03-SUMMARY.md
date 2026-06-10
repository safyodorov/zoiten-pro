---
phase: 23-cash-payments
plan: "03"
subsystem: cash-import
tags: [cash, import, xlsx, categorize, normalize, fingerprint, vitest, pure-functions]
dependency_graph:
  requires: [23-01]
  provides: [lib/cash-import, scripts/import-cash-budget.ts]
  affects: [23-05]
tech_stack:
  added: []
  patterns:
    - PrismaClient-arg persist pattern (mirror of lib/bank-import/persist.ts)
    - TDD RED→GREEN for pure functions
    - Re-export shared helpers (excelSerialToDate/parseBalanceAmount/normalizePurpose from bank-import)
    - First-match ordered keyword rule-list with Пополнение кассы BEFORE Зарплата/авансы
key_files:
  created:
    - lib/cash-import/types.ts
    - lib/cash-import/normalize.ts
    - lib/cash-import/categorize.ts
    - lib/cash-import/fingerprint.ts
    - lib/cash-import/parse.ts
    - lib/cash-import/persist.ts
    - lib/cash-import/index.ts
    - tests/cash-import.test.ts
    - scripts/import-cash-budget.ts
  modified: []
decisions:
  - "categorize() match-order is independent of display sortOrder: Пополнение кассы placed before Зарплата/авансы in CATEGORY_MATCH_RULES to prevent 'аванс на склад' being shadowed by 'аванс' keyword"
  - "normalizeResponsibleSurname: ё→е applied ONLY to SURNAME_FIXES lookup key, return value preserves ё (Королёва→Королёва); empty→Иванова default"
  - "persist.ts uses (prisma as any).cashCategory / .cashEntry — type-only PrismaClient import avoids vitest breakage while the Prisma schema (23-01) provides the actual models"
  - "Офис Бюджет.xlsx already in .gitignore before this plan"
metrics:
  duration: "~10 minutes"
  completed: "2026-06-10"
  tasks_completed: 2
  tasks_total: 2
  files_created: 9
  files_modified: 0
---

# Phase 23 Plan 03: Cash Import Pure Functions Summary

**One-liner:** SHA-256-deduped cash budget parser (Юля+Павел XLSX sheets, 2024-2026) with ordered keyword categorizer (24 categories, «Пополнение кассы» before «Зарплата/авансы»), ё-preserving responsible normalizer, PrismaClient-arg persist pipeline, 23 vitest golden tests.

## What Was Built

### lib/cash-import/ (7 files, fully pure / vitest-safe)

- **types.ts** — `ParsedCashEntry` interface + `CashDir` type
- **normalize.ts** — re-exports `excelSerialToDate`, `parseDateCell`, `parseBalanceAmount`, `normalizePurpose` from `lib/bank-import/normalize`; adds `normalizeDepartment` (empty→null, «офис+ склад»→«офис+склад»), `normalizeResponsibleSurname` (strip 1+ trailing initials, SURNAME_FIXES with ё→е lookup-only, ё preserved in return value, empty→Иванова)
- **categorize.ts** — `CATEGORY_MATCH_RULES` ordered list (23 explicit categories + «Прочее» fallback); match order differs from display sortOrder: «Пополнение кассы» rule is 7th in match order but 23rd in display; prevents "аванс на склад" shadowing by "аванс"
- **fingerprint.ts** — `computeCashFingerprint` SHA-256 over `sheet|date|direction|amount|purpose|responsible`
- **parse.ts** — `parseYulyaSheet` (columns 0/1/2/3/5/6, INCOME/EXPENSE split), `parsePavelSheet` (columns 0/1/2, all EXPENSE), `parseBudget` dispatcher; year filter 2024-2026; bad dates/amounts skipped
- **persist.ts** — `persistCashEntries(prisma, entries)` — PrismaClient-arg (no singleton import); upsert CashCategory by name; ё-insensitive Employee lastName match; intra-batch fingerprint dedup; `createMany skipDuplicates`
- **index.ts** — re-exports all public API

### tests/cash-import.test.ts (23 tests, all GREEN)

Key coverage:
- `аванс на склад → Пополнение кассы` (not Зарплата/авансы)
- `аванс → Зарплата/авансы` (plain keyword still works)
- `юля фонд → Пополнение кассы`
- `заправка картриджей → Канцелярия/оргтехника` (before Такси/транспорт in match order)
- `Королёва → Королёва` (ё preserved)
- `Иванова Н. В. → Иванова` (strip 2 initials)
- `Федоров → Фёдоров` (SURNAME_FIXES)
- fingerprint determinism + SHA-256 length 64

### scripts/import-cash-budget.ts

One-shot VPS script: reads «Офис Бюджет.xlsx» from cwd, preflight `Employee.findFirst({where:{lastName:"Иванова"}})` with `console.warn` if missing, parses Юля+Павел, delegates to `persistCashEntries`. Idempotent (re-run → imported=0).

Run on VPS (Phase 23-05): `set -a; . /etc/zoiten.pro.env; set +a; npx tsx scripts/import-cash-budget.ts`

## Deviations from Plan

**1. [Rule 1 - Bug] persist.ts uses `(prisma as any)` cast for cashCategory/cashEntry**
- **Found during:** Task 2 implementation
- **Issue:** `import type { PrismaClient }` is type-only, so TypeScript doesn't know about `cashCategory`/`cashEntry` models added in plan 23-01. Full `PrismaClient` import would pull in Prisma singleton transitively, breaking vitest.
- **Fix:** Cast `(prisma as any)` on the two model calls. The actual PrismaClient passed at runtime (from script or API route) will have the real models. This is the same pattern used elsewhere when new models are added.
- **Files modified:** lib/cash-import/persist.ts
- **Commit:** 42ebe8a

None of the other plan spec was deviated from. The plan executed exactly as written.

## Known Stubs

None — all functions are wired and complete. `scripts/import-cash-budget.ts` requires the actual `Офис Бюджет.xlsx` file + live DB (available in Phase 23-05 via scp + VPS run). The script itself is structurally complete.

## Commits

| Hash | Message |
|------|---------|
| f75932b | test(23-03): cash-import golden tests RED→GREEN (categorize + normalize + fingerprint) |
| 42ebe8a | feat(23-03): cash-import parse+persist+index + import-cash-budget script |

## Self-Check

Files exist:
- lib/cash-import/types.ts ✓
- lib/cash-import/normalize.ts ✓
- lib/cash-import/categorize.ts ✓
- lib/cash-import/fingerprint.ts ✓
- lib/cash-import/parse.ts ✓
- lib/cash-import/persist.ts ✓
- lib/cash-import/index.ts ✓
- tests/cash-import.test.ts ✓
- scripts/import-cash-budget.ts ✓

Tests: 23/23 PASS

## Self-Check: PASSED
