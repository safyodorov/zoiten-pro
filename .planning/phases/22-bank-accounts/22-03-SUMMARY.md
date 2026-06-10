---
phase: 22-bank-accounts
plan: "03"
subsystem: bank-import
tags: [parsing, bank, xlsx, pure-functions, vitest, fingerprint]
dependency_graph:
  requires: ["22-01"]
  provides: ["lib/bank-import module", "ParsedTransaction type", "computeFingerprint", "detectFormat", "3 bank adapters"]
  affects: ["22-04 (server action import)"]
tech_stack:
  added: []
  patterns: ["SHA-256 fingerprint dedup", "header-driven column mapping", "aoa_to_sheet synthetic fixtures", "TDD red-green"]
key_files:
  created:
    - lib/bank-import/types.ts
    - lib/bank-import/normalize.ts
    - lib/bank-import/fingerprint.ts
    - lib/bank-import/vtb-adapter.ts
    - lib/bank-import/psb-adapter.ts
    - lib/bank-import/sber-adapter.ts
    - lib/bank-import/index.ts
    - tests/bank-import.test.ts
  modified: []
decisions:
  - "VTB adapter is header-driven via buildHeaderMap — not positional — handles both 10-col RUB and 12-col CNY sheets"
  - "PSB data starts at row index 8 (row 7 = Входящее сальдо skipped via fixed index)"
  - "Sber reads with raw:false for merged cells; date from Дата проводки NOT composite id in col 0"
  - "Fingerprint = sha256(accountNumber|date|direction|amount|docNumber|counterpartyInn|normalizePurpose(purpose))"
  - "All lib/bank-import/ modules import ONLY xlsx + crypto + local types — zero next-auth/Prisma/next/* imports"
  - "Golden tests use XLSX.utils.aoa_to_sheet inline synthetic fixtures — no real bank data committed"
metrics:
  duration: "5m 30s"
  completed_date: "2026-06-10"
  tasks_total: 2
  tasks_completed: 2
  files_created: 8
  files_modified: 0
  tests_added: 36
  tests_passing: 36
---

# Phase 22 Plan 03: lib/bank-import Pure Parsers Summary

**One-liner:** Pure `lib/bank-import/` module with VTB header-driven multi-sheet adapter, PSB index-8 adapter, Sber merged-cells adapter, SHA-256 fingerprint, and 36 golden + idempotency vitest tests — zero server imports.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 RED | TDD test file (failing) | d5e0654 | tests/bank-import.test.ts |
| 1 GREEN | Foundation: types + normalize + fingerprint | 7044a69 | lib/bank-import/types.ts, normalize.ts, fingerprint.ts |
| 2 GREEN | 3 adapters + detectFormat + index | 4b84150 | lib/bank-import/vtb-adapter.ts, psb-adapter.ts, sber-adapter.ts, index.ts |

## Module Structure

```
lib/bank-import/
├── index.ts           — detectFormat (filename + header fallback) + parseStatement dispatcher + re-exports
├── types.ts           — ParsedTransaction, ParseResult, BankFormat
├── vtb-adapter.ts     — parseVtbStatement: multi-sheet, header-driven, RUR/CNY auto-detect
├── psb-adapter.ts     — parsePsbStatement: row-2 account regex, data from index 8
├── sber-adapter.ts    — parseSberStatement: raw:false, extractBic, счёт\nИНН split
├── normalize.ts       — parseDDMMYYYY, parseAmount, normalizePurpose, extractBic, buildHeaderMap
└── fingerprint.ts     — computeFingerprint (SHA-256) + buildFingerprintFields
```

## Key Design Decisions

**VTB header-driven mapping:** Column indices differ between RUB (10 cols) and CNY (12 cols) sheets. `buildHeaderMap(rows[6])` maps column header text → index. Amount columns selected as `"Дебет CNY"/"Кредит CNY"` when present in map, else `"Дебет RUR"/"Кредит RUR"`. Test confirms re-ordered columns still parse correctly.

**PSB "Входящее сальдо" skip:** Row index 7 is always the balance row — data loop starts at `i = 8` (not `i = 7`), avoiding the balance row by fixed offset.

**Sber merged cells:** `raw: false` in `sheet_to_json` ensures merged cell values propagate. First data column is a serial float ID (e.g. `46024.18197`) — ignored; date sourced from `"Дата проводки"` column. Счёт column contains `"счёт\nИНН"` — split by `\n` and INN validated by `/^\d{7,12}$/`.

**Fingerprint formula:** `sha256(accountNumber | YYYY-MM-DD | direction | amount.toFixed(2) | docNumber | counterpartyInn | normalizePurpose(purpose))`. `normalizePurpose` = trim + collapse whitespace + lowercase → absorbs insignificant formatting differences between re-exports. No row position index (would break idempotency when file regenerated).

## Test Coverage (36 tests)

- `normalize helpers` (9): parseDDMMYYYY, parseAmount, normalizePurpose, extractBic, buildHeaderMap
- `computeFingerprint` (3): deterministic, SHA-256 length, purpose case-insensitive
- `parseVtbStatement` (7): RUB golden, CREDIT direction, ИТОГО skip, CNY 12-col, header-driven reorder, empty sheet, multi-sheet
- `parsePsbStatement` (3): DEBIT golden (КБ/ИНН/companyName/accountNumber), CREDIT, сальдо skip
- `parseSberStatement` (2): DEBIT golden (BIC regex + счёт\nИНН + date), CREDIT
- `detectFormat` (5): VTB filename, PSB filename, Sber filename, СБЕРБАНК header fallback, Банк ПСБ fallback
- `fingerprint dedup` (4): identical→same, docNumber differ→diff, whitespace→same, uppercase→same

## Verification

```
npm run test -- bank-import → 36 passed (0 failed)
grep "^import.*next-auth|@/lib/prisma|from \"next/" lib/bank-import/ → CLEAN
```

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None — all parsers return fully populated `ParsedTransaction[]`.

## Self-Check

- [x] lib/bank-import/ — 7 files exist
- [x] tests/bank-import.test.ts exists
- [x] `export function detectFormat` found in index.ts
- [x] `buildHeaderMap` used in vtb-adapter.ts
- [x] `extractBic` used in sber-adapter.ts
- [x] `createHash` in fingerprint.ts
- [x] commits d5e0654, 7044a69, 4b84150 exist in git log
- [x] `npm run test -- bank-import` → 36/36 passed
- [x] No server imports (grep CLEAN)

## Self-Check: PASSED
