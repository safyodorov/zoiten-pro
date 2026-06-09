---
phase: 20-procurement
plan: 04
subsystem: procurement / currency-rates
tags: [cbr, currency, cron, dispatcher, D-09]
requires: [20-00, 20-01]
provides:
  - "lib/cbr-rates.ts (fetchCbrRates, ratePerUnit, getLatestRate)"
  - "app/api/cbr-rate-sync/route.ts (GET cron handler upserting CurrencyRate)"
  - "dispatcher cbr-rate-sync branch (12:00 MSK, forward-only)"
  - "AppSetting cbrRateSyncCronTime default 12:00"
affects:
  - "app/api/cron/dispatch/route.ts"
  - "prisma/seed.ts"
tech-stack:
  added: []
  patterns:
    - "plain Node fetch for cbr-xml-daily.ru (no TLS workaround, unlike WB v4)"
    - "single dispatcher route + AppSetting-driven branch (no new systemd unit)"
    - "idempotent upsert via @@unique([date, code]) for weekend/holiday repeats"
key-files:
  created:
    - lib/cbr-rates.ts
    - app/api/cbr-rate-sync/route.ts
  modified:
    - app/api/cron/dispatch/route.ts
    - prisma/seed.ts
decisions:
  - "Dynamic import path is ../../cbr-rate-sync/route — cbr-rate-sync lives at app/api/ (per plan files spec), not app/api/cron/ like existing cron routes"
metrics:
  duration: ~2min
  completed: 2026-06-09
  tasks: 2
  files: 4
---

# Phase 20 Plan 04: CBR Currency-Rate Sync Summary

CBR daily currency-rate sync (D-09): pure-ish `lib/cbr-rates.ts` (plain Node fetch, `rateToRub = Value / Nominal`, `getLatestRate` fallback), a secured GET cron route that upserts every Valute row into `CurrencyRate`, and a dispatcher branch firing at 12:00 MSK forward-only. Turns the 20-00 RED `tests/cbr-rates.test.ts` GREEN (6/6).

## What Was Built

### Task 1 — lib/cbr-rates.ts (TDD GREEN)
- `CbrValute` / `CbrResponse` interfaces, copied verbatim from RESEARCH Pattern 4.
- `fetchCbrRates()`: `fetch("https://www.cbr-xml-daily.ru/daily_json.js", {cache:"no-store"})`; throws `CBR fetch failed: {status}` on `!res.ok`. Plain Node fetch — no curl/execSync (CBR has no TLS-fingerprint block).
- `ratePerUnit(valute) = Value / Nominal` (CNY 8.1/10 → 0.81; USD 73.2644/1 → 73.2644).
- `getLatestRate(code, prismaClient)`: `currencyRate.findFirst({where:{code}, orderBy:{date:"desc"}})` → `{rateToRub, date} | null`. Typed `rateToRub: Prisma.Decimal` to match the `@db.Decimal(14,6)` schema column.
- **Commit:** c40fb4c
- **Verify:** `npx vitest run tests/cbr-rates.test.ts` → 6/6 passed (was RED: "Cannot find package @/lib/cbr-rates").

### Task 2 — cbr-rate-sync route + dispatcher branch + seed
- `app/api/cbr-rate-sync/route.ts`: `runtime="nodejs"`, `maxDuration=60`, `x-cron-secret` guard → 403. Calls `fetchCbrRates()`, parses `rateDate = new Date(data.Date)`, loops `Object.values(data.Valute)` upserting `CurrencyRate` via `where:{date_code:{date, code}}` with `rateToRub = ratePerUnit(valute)`. Then upserts AppSetting `cbrRateSyncLastRun = getMskTodayString()`. Returns `{ok, upserted, rateDate}`. Idempotent on weekends/holidays (CBR returns prior business day's `Date`, same unique key).
- `app/api/cron/dispatch/route.ts`: added `cbrRateSyncCronTime` + `cbrRateSyncLastRun` to the `key.in` array; `cbrTime = settings.cbrRateSyncCronTime ?? "12:00"`, `cbrLastRun ?? null`; new `shouldFireCron` branch dynamic-importing the route and pushing `cbr:${status}` / `cbr:error`. Forward-only — no historical backfill.
- `prisma/seed.ts`: AppSetting `cbrRateSyncCronTime` default `"12:00"` via the existing upsert idiom (matches Phase 14 `stock.turnoverNormDays`). `cbrRateSyncLastRun` intentionally left unseeded (null).
- **Commit:** 48cbe1e
- **Verify:** `npx tsc --noEmit` exit 0 (full project clean); no type errors in edited files.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Dynamic import path corrected to `../../cbr-rate-sync/route`**
- **Found during:** Task 2 (tsc verification)
- **Issue:** Plan/RESEARCH specified `import("../cbr-rate-sync/route")`, mirroring existing dispatcher imports. But existing cron routes (`wb-adv-sync`, etc.) live under `app/api/cron/`, whereas the plan's `files` spec places `cbr-rate-sync` at `app/api/cbr-rate-sync/`. From `app/api/cron/dispatch/route.ts`, `../cbr-rate-sync` resolves to the non-existent `app/api/cron/cbr-rate-sync` → TS2307.
- **Fix:** Changed to `../../cbr-rate-sync/route`, which resolves to `app/api/cbr-rate-sync`.
- **Files modified:** app/api/cron/dispatch/route.ts
- **Commit:** 48cbe1e

## Known Stubs

None. All artifacts are wired end-to-end: dispatcher → route → CurrencyRate upsert + AppSetting lastRun.

## Verification

- `tests/cbr-rates.test.ts` GREEN (6/6).
- `npx tsc --noEmit -p tsconfig.json` exit 0 (full project).
- Manual end-to-end trigger (dispatcher with `x-cron-secret` → real CurrencyRate rows + `cbrRateSyncLastRun` set) deferred to 20-07 UAT — requires CRON_SECRET on a running server.

## Self-Check: PASSED
- FOUND: lib/cbr-rates.ts
- FOUND: app/api/cbr-rate-sync/route.ts
- FOUND commit c40fb4c
- FOUND commit 48cbe1e
