---
phase: 20
slug: procurement
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-09
---

# Phase 20 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.x (already configured) |
| **Config file** | vitest.config.ts (root, `@` alias → project root) |
| **Quick run command** | `npm run test -- --run tests/procurement-math.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~5–15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- --run tests/procurement-math.test.ts`
- **After every plan wave:** Run `npm run test`
- **Before `/gsd:verify-work`:** Full suite must be green
- **Max feedback latency:** ~15 seconds

---

## Per-Task Verification Map

| Decision | Behavior | Wave | Test Type | Automated Command | File Exists | Status |
|----------|----------|------|-----------|-------------------|-------------|--------|
| D-08 deposit date | depositDueDate = createdAt + 3 calendar days | 1 | unit | `npm run test -- --run tests/procurement-math.test.ts` | ❌ W0 | ⬜ pending |
| D-08 balance date | balanceDueDate = depositDueDate + leadTimeDays | 1 | unit | same | ❌ W0 | ⬜ pending |
| D-08 percent→amount | amount = totalAmount × pct / 100 | 1 | unit | same | ❌ W0 | ⬜ pending |
| D-08 amount→percent | percent = amount / totalAmount × 100 | 1 | unit | same | ❌ W0 | ⬜ pending |
| D-09 CBR parsing | fetchCbrRates() parses Valute, ratePerUnit = Value/Nominal | 1 | unit (mocked) | `npm run test -- --run tests/cbr-rates.test.ts` | ❌ W0 | ⬜ pending |
| D-09 CBR fallback | getLatestRate returns most-recent stored rate when today missing | 1 | unit | same | ❌ W0 | ⬜ pending |
| D-02 isPrimary | Only one isPrimary=true per (supplierId, type) | 1 | unit (mock tx) | `npm run test -- --run tests/supplier-actions.test.ts` | ❌ W0 | ⬜ pending |
| D-03 partial unique | SupplierProductLink unique only per non-null productId | 1 | manual SQL verify | — | Manual | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/procurement-math.test.ts` — golden test for D-08 date/amount/percent formulas (`lib/procurement-math.ts`)
- [ ] `tests/cbr-rates.test.ts` — D-09 CBR parsing + ratePerUnit + getLatestRate fallback (mocked fetch)
- [ ] `tests/supplier-actions.test.ts` — D-02 isPrimary constraint enforcement (mock prisma $transaction)

*Existing vitest config, `@` alias, and mock patterns cover infrastructure — no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Decision | Why Manual | Test Instructions |
|----------|----------|------------|-------------------|
| Partial unique index `WHERE productId IS NOT NULL` | D-03 | DB-level constraint, not exercisable in unit test | After migration: `psql` insert two links with same supplierId + null productId (should succeed); two with same supplierId + same non-null productId (should fail) |
| CBR daily cron fires at scheduled MSK time | D-09 | Time/dispatcher integration | Trigger dispatcher manually, confirm CurrencyRate rows inserted + `cbrRateSyncLastRun` AppSetting updated |
| Deposit/balance UI percent↔amount recompute | D-08 | Interactive form behavior | In purchase form: edit percent → amount updates; edit amount → percent updates; supplier record unchanged |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
