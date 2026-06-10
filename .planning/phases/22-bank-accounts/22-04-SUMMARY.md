---
phase: 22-bank-accounts
plan: "04"
subsystem: bank-import
tags: [bank, import, persist, server-action, upload-button, api-route]
dependency_graph:
  requires: ["22-01 (schema)", "22-03 (parsers)"]
  provides: ["persistParsedTransactions", "/api/bank-import route", "categorizeTx action", "BankImportButton"]
  affects: ["22-05 (seed script uses persist.ts)", "22-06 (bank page uses BankImportButton + categorizeTx)"]
tech_stack:
  added: []
  patterns: ["OWNING_BANK constant with real BICs", "intra-batch fingerprint dedup", "createMany skipDuplicates idempotency", "probe+reread for sber merged cells", "mirror WbUploadIuButton pattern"]
key_files:
  created:
    - lib/bank-import/persist.ts
    - app/api/bank-import/route.ts
    - app/actions/bank.ts
    - components/bank/BankImportButton.tsx
  modified: []
decisions:
  - "OWNING_BANK constant determines owning Bank deterministically per sourceBank (real head-office BICs: vtb 044525411, psb 044525555, sber 044525225) — no guessing from file headers"
  - "Counterparty banks upserted by their own BIC from parsed counterpartyBic field — populate Bank справочник only, NOT used for BankAccount.bankId"
  - "Intra-batch dedup via Map<fingerprint, row> before createMany — prevents silent failures when the same tx appears twice in one file"
  - "Sber probe+reread pattern: first XLSX.read(buffer) for detectFormat, then XLSX.read(buffer, {raw:false}) for Sber merged cells — avoids double-read for VTB/PSB"
  - "persist.ts has zero next-auth/next/* imports — usable from seed script 22-05 with its own PrismaClient"
metrics:
  duration: "202s"
  completed_date: "2026-06-10"
  tasks_total: 2
  tasks_completed: 2
  files_created: 4
  files_modified: 0
---

# Phase 22 Plan 04: Import Pipeline Summary

**One-liner:** Import pipeline with `persistParsedTransactions(prisma, parsed, opts)` — deterministic owning-bank via OWNING_BANK constant (real BICs), upserts 5 entity types, `createMany skipDuplicates` + intra-batch fingerprint dedup, `ImportBatch` report; API route + categorizeTx action + BankImportButton UI.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | persist.ts + /api/bank-import route | ec46be2 | lib/bank-import/persist.ts, app/api/bank-import/route.ts |
| 2 | categorizeTx action + BankImportButton | 4277dd6 | app/actions/bank.ts, components/bank/BankImportButton.tsx |

## Implementation Details

### lib/bank-import/persist.ts

Pure-ish module (no next-auth/next/* imports). Pipeline:

1. **Owning Bank** — `OWNING_BANK[sourceBank]` constant with real head-office BICs. Single upsert, same for entire batch. This is the ONLY source for `BankAccount.bankId`.
2. **Counterparty Banks** — upsert each unique `counterpartyBic` from parsed transactions. Populates Bank справочник only; NOT used for `BankAccount.bankId`.
3. **Company** — upsert by INN (preferred) or findFirst/create by name (fallback). Cached by (inn ?? name) key.
4. **BankAccount** — upsert by account number. `bankId = owningBank.id`, `companyId` from Company cache.
5. **Counterparty** — upsert by INN when present; `counterpartyId = null` when INN absent (denormalized fields written to `BankTransaction` regardless).
6. **ImportBatch** — created before `createMany` with `rowsImported/Skipped = 0`, updated after with real counts.
7. **Intra-batch dedup** — `Map<fingerprint, row>` before `createMany` (skipDuplicates handles cross-import dedup, map handles same-tx-twice-in-one-file edge case).
8. **createMany skipDuplicates** — returns `.count` = actually inserted.
9. **ImportBatch update** — `rowsImported = result.count`, `rowsSkipped = parsed.length - result.count`.

### app/api/bank-import/route.ts

- `export const runtime = "nodejs"` — xlsx requires Node.js
- Auth: `await auth()` (API route pattern, not requireSection)
- Sber probe+reread: `const probe = XLSX.read(buffer, {type:"buffer"})` → `detectFormat` → if sber: `XLSX.read(buffer, {type:"buffer", raw:false})` else probe
- Delegates entirely to `persistParsedTransactions` — no upsert logic in route
- Returns `{ imported, skipped, total, format }`

### app/actions/bank.ts

- `"use server"` + `requireSection("BANK", "MANAGE")` + `handleAuthError` + P2025 check
- `VALID_CATEGORIES: TxCategory[]` guard before update
- `revalidatePath("/bank")` after update

### components/bank/BankImportButton.tsx

- Mirror of WbUploadIuButton: hidden input + `ref.current?.click()`, `e.target.value = ""` reset
- `toast.success` shows `FORMAT: импортировано N, пропущено дублей M`
- `router.refresh()` on success

## Verification

- `npx tsc --noEmit` → CLEAN (no errors)
- `npm run test -- bank-import` → 36/36 passing (unchanged from 22-03)
- `grep -E "^import.*next-auth|^import.*from \"next/" lib/bank-import/persist.ts` → CLEAN
- Pre-existing test failures (45 in wb-sync-route.test.ts) are unrelated to this plan

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — `persistParsedTransactions` returns real counts; `categorizeTx` saves real data; `BankImportButton` calls real endpoint.

## Self-Check

- [x] lib/bank-import/persist.ts exists
- [x] `export async function persistParsedTransactions` found
- [x] OWNING_BANK with 044525411/044525555/044525225 found
- [x] `skipDuplicates: true` found
- [x] `computeFingerprint` used
- [x] `importBatch.create` found
- [x] No next-auth/next/* imports (grep CLEAN)
- [x] app/api/bank-import/route.ts exists
- [x] `export const runtime = "nodejs"` found
- [x] detectFormat + parseStatement + persistParsedTransactions found
- [x] `raw: false` found for Sber
- [x] app/actions/bank.ts exists with requireSection("BANK","MANAGE") + revalidatePath("/bank")
- [x] components/bank/BankImportButton.tsx exists with /api/bank-import + router.refresh + e.target.value=""
- [x] commits ec46be2 and 4277dd6 exist
- [x] tsc --noEmit CLEAN
- [x] npm run test -- bank-import 36/36 passing

## Self-Check: PASSED
