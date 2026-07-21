---
phase: quick-260721-o4b
verified: 2026-07-21T18:00:00Z
status: passed
score: 5/5 must-haves verified
---

# Quick Task 260721-o4b: Понедельный фин-отчёт — Комиссия/хвосты/хранение-модель Verification Report

**Task Goal:** /finance/weekly — бакет «Комиссия» в водопаде (оба сценария, K−I на единицу × H, UI-строка), хвосты рекламы/отзывов в водопад (ad = updTotal недели, review = Σ reviewPointsRub недели; per-article строки не изменены), хранение Оферты = модель calculatePricingStandard.storageAmount (ИУ=0, volume<=0 → fallback пул), golden ИУ неизменен (523.6), golden Оферта пересчитана осознанно, engine.ts только аддитивно, снапшоты недель не пересчитываются.

**Verified:** 2026-07-21
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | В «Водопаде затрат» /finance/weekly появилась строка «Комиссия» в обоих столбцах (ИУ и Оферта) | VERIFIED | `CostWaterfall.commission` (types.ts:183), `addToWaterfall` accumulates `acc.commission += b.commissionPerUnit * H` for both `waterfall.iu`/`waterfall.std` (engine.ts:253,331-332); UI `WATERFALL_BUCKETS` includes `{ key: "commission", label: "Комиссия" }` (WeeklyFinReportTable.tsx:324), rendered via `WATERFALL_BUCKETS.map` (line 553) |
| 2 | Строка «Реклама» водопада = updTotal недели (хвост включён) | VERIFIED | `data.ts:726 adTail = Math.max(0, updTotal - attributedAd)`; propagated via `waterfallTails.ad` → engine applies lump-sum post-loop to both scenarios (engine.ts:338-343); golden test verifies tails mechanism (finance-weekly-engine.test.ts:190-...) |
| 3 | Строка «Отзывы» водопада = Σ reviewPointsRub недели (включая nmId вне candidates) | VERIFIED | `data.ts:728-732 totalReviews = realizationAccountLevel.reviewPointsRub + Σ realizationByNmId reviewPointsRub`; `reviewTail = hasRealization ? max(0, totalReviews - attributedReviews) : 0`; same lump-sum mechanism as ad |
| 4 | Оферта вычитает хранение по расчётной модели (storageAmount), ИУ хранение=0, volume<=0 → fallback пул | VERIFIED | `data.ts:630 storageStdPerUnit: number\|undefined = undefined`; set only `if (volumeLiters > 0)` (line 631,678) from `stdOut.storageAmount ?? 0`; passed as `article.storagePerUnit` (line 705); engine `resolveCommon` falls back to pool when `article.storagePerUnit` undefined (engine.ts:145-146); ИУ scenario always passes literal `0` (engine.ts:308) |
| 5 | Per-article строки и весь ИУ-сценарий (golden profit 523.6) не изменились | VERIFIED | golden test `ИУ: profit ≈ 523.6 ₽` unchanged (finance-weekly-engine.test.ts:97); Оферта golden consciously recomputed to `-2176.7 - S×4` with S=417.6 documented and justified (real product dimensions 38×26×44cm, V=43.5L) |

**Score:** 5/5 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/finance-weekly/types.ts` | `CostWaterfall.commission` + `WeeklyFinReportInputs.waterfallTails` | VERIFIED | Both fields present exactly as specified (lines 107, 183) |
| `lib/finance-weekly/engine.ts` | `commissionPerUnit`, waterfall accumulation, tails application | VERIFIED | `ScenarioBreakdown.commissionPerUnit` (line 80), computed as `K - cutPricePerUnit` (line 180), accumulated (line 253), tails loop (338-343) |
| `lib/finance-weekly/data.ts` | `storagePerUnit` from `calculatePricingStandard`, adTail/reviewTail, waterfallTails export | VERIFIED | `stdOut.storageAmount` captured (line 678), tails computed (725-732), exported in return + both early-returns (288,294,340,346,846) |
| `lib/finance-weekly/live.ts` | proxies `data.waterfallTails` into engine call | VERIFIED | line 35: `waterfallTails: data.waterfallTails` |
| `components/finance/WeeklyFinReportTable.tsx` | «Комиссия» row in WATERFALL_BUCKETS | VERIFIED | line 324 |

All artifacts VERIFIED at all 3 levels (exists, substantive, wired) — no stubs, no orphans.

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| data.ts | live.ts | `WeeklyFinReportPageData.waterfallTails` | WIRED | `data.ts:846 waterfallTails: { ad: adTail, review: reviewTail }` → `live.ts:35 waterfallTails: data.waterfallTails` |
| live.ts | engine.ts | `computeWeeklyFinReport({ ..., waterfallTails })` | WIRED | confirmed by grep, param passed through to `computeWeeklyFinReport` call |
| data.ts | engine.ts | `calculatePricingStandard(...).storageAmount → article.storagePerUnit` | WIRED | `data.ts:678 storageStdPerUnit = stdOut.storageAmount ?? 0` → `data.ts:705 storagePerUnit: storageStdPerUnit` → engine `resolveCommon` (engine.ts:145-146) and per-scenario application (engine.ts:308,315) |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | -------------- | ------ | ------------------- | ------ |
| WeeklyFinReportTable «Комиссия» row | `waterfall.iu.commission` / `waterfall.std.commission` | `computeWeeklyFinReport` engine output, derived from real per-article `K - cutPricePerUnit` (real prices/commissions from DB via data.ts) | Yes | FLOWING |
| Water­fall ad/review tails | `adTail`/`reviewTail` | Real WB `/adv/v1/upd` total (`updAgg._sum.updSum`) and `WbRealizationWeekly` reviewPointsRub aggregates | Yes | FLOWING |
| Оферта storage | `storageStdPerUnit` | `calculatePricingStandard` fed with real product dimensions (`product.heightCm/widthCm/depthCm`) from Prisma | Yes | FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| tsc type-check clean (aditive changes don't break types) | `npx tsc --noEmit` | No output (clean) | PASS |
| Targeted vitest (finance-weekly + pricing-math) | `npx vitest run finance-weekly pricing-math` | 11 files, 160 tests passed | PASS |
| Full test suite — no new failures beyond documented baseline | `npm run test` | 41 failed / 1166 passed, 11 failed files — matches documented pre-existing baseline exactly (deferred-items.md) | PASS |
| Commits exist and match documented scope | `git show --stat 87f78bf/55668f6/4ab6b97` | 3 commits present, file diffs match SUMMARY claims exactly (engine.ts +16/-0 lines — purely additive) | PASS |
| Snapshot immutability (WK-06) | `git show <3 commits> --stat \| grep -i snapshot` | No output — no snapshot-related files touched | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ------------ | ------ | -------- |
| WK-01-commission-bucket | 260721-o4b-PLAN.md | Commission bucket in waterfall, both scenarios | SATISFIED | types.ts, engine.ts, UI row |
| WK-02-ad-review-tails | 260721-o4b-PLAN.md | Ad/review tails reconciled with WB ground truth | SATISFIED | data.ts adTail/reviewTail + waterfallTails plumbing |
| WK-03-storage-offer-modeled | 260721-o4b-PLAN.md | Offer-scenario storage = calculatePricingStandard model | SATISFIED | data.ts storageStdPerUnit capture + fallback logic |
| WK-04-golden-recompute | 260721-o4b-PLAN.md | Golden IU unchanged, Offer consciously recomputed | SATISFIED | test file assertions with documented S=417.6 |
| WK-05-gates | 260721-o4b-PLAN.md | tsc + vitest gates pass | SATISFIED | tsc clean, targeted vitest 160/160, full suite baseline unchanged (41) |
| WK-06-snapshots-immutable | 260721-o4b-PLAN.md | WeeklyFinReportSnapshot not recomputed | SATISFIED | no snapshot files touched in the 3 commits |

No orphaned requirements found — all 6 IDs declared in PLAN frontmatter are addressed.

### Anti-Patterns Found

None found. No TODO/FIXME/placeholder markers, no empty stub returns, no hardcoded-empty data flowing to render in the modified files. All additions are substantive and wired end-to-end.

### Human Verification Required

### 1. Manual reconciliation against WB cabinet (week 13–19.07)

**Test:** Open /finance/weekly for week 13–19.07 after deploy, check waterfall rows «Реклама» = 145 340 ₽ and «Отзывы» = 51 167 ₽ against WB seller cabinet.
**Expected:** Both totals match documented reconciliation figures exactly.
**Why human:** Requires live production data query against WB API/cabinet — cannot be verified from static code inspection; explicitly deferred to orchestrator/user per SUMMARY ("остаётся на усмотрение пользователя — вне scope исполнителя").

### 2. Visual check of «Комиссия» row placement and totals invariant in UI

**Test:** Open /finance/weekly UI, visually confirm the «Комиссия» row appears directly after «Закупка», and that «Итого затрат» = Выручка − Прибыль for both ИУ and Оферта columns.
**Expected:** Row renders correctly, sums are internally consistent.
**Why human:** Visual rendering/layout verification, not inspectable via static analysis (though the underlying data-flow and invariant are covered by golden tests).

### Gaps Summary

No gaps found. All 5 must-have truths verified, all 5 required artifacts pass all 3 verification levels (exist/substantive/wired) plus Level 4 data-flow trace, all 3 key links wired, engine.ts confirmed purely additive (+16/-0 lines in commit 87f78bf), snapshot immutability confirmed (no snapshot files touched), tsc clean, targeted tests 160/160 passing, and full test suite shows exactly the pre-existing documented baseline of 41 failures (no new failures introduced). Two items remain for human verification: live WB cabinet reconciliation (explicitly deferred, out of scope for this task per plan) and a visual UI spot-check — neither blocks goal achievement, both are expected follow-ups per the plan's own verification section.

---

_Verified: 2026-07-21_
_Verifier: Claude (gsd-verifier)_
