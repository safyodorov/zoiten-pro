---
phase: quick-260710-evz
plan: W2a
verified: 2026-07-10T11:08:00Z
status: passed
score: 6/6 must-haves verified
re_verification: null
human_verification:
  - test: "GET /finance/weekly as FINANCE user (post-deploy)"
    expected: "200; «Понедельный» tab active; rollup (Universe→Brand→Article) + «Водопад затрат» visible; ?week=2026-06-29 recomputes"
    why_human: "Runtime HTTP render of an RSC route — not exercisable without the running server; deferred to orchestrator post-deploy smoke per plan"
  - test: "MANAGE vs VIEW editor visibility + save persistence"
    expected: "MANAGE user sees the 7-field pools editor and Save persists to AppSetting financeWeekly.pools.<weekISO> + page revalidates; VIEW user sees no editor"
    why_human: "Depends on live session role + DB round-trip; canManage gate is code-verified but the visual/persist path needs a real login"
---

# Phase quick-260710-evz Plan W2a: /finance/weekly Scaffold + Rollup Verification Report

**Goal:** Build `/finance/weekly` page scaffold + rollup table on LIVE data, consuming the pure engine `lib/finance-weekly/engine.ts` (`computeWeeklyFinReport`). Deliver data loader, save action, RSC page + table/controls, and registration. NO drill-down modal, NO plan-fact, NO Prisma schema change.
**Verified:** 2026-07-10T11:08:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| - | ----- | ------ | -------- |
| 1 | GET /finance/weekly (FINANCE user) returns 200 and shows «Понедельный» tab active | ✓ VERIFIED | `page.tsx` `requireSection("FINANCE")` gate + `force-dynamic` + renders `<FinanceTabs/>`; `FinanceTabs.TABS` has `{href:"/finance/weekly", label:"Понедельный"}`; active-state via `pathname.startsWith`. Runtime 200 flagged for post-deploy smoke (non-blocking). |
| 2 | Rollup groups Universe→Brand→Article with Выручка / Прибыль ИУ / Re ИУ / Прибыль Оферта / Re Оферта + per-universe subtotals + grand total | ✓ VERIFIED | `WeeklyFinReportTable.buildRows` emits universe/brand/article/subtotal/grand rows; header cols exactly `["Выручка","Прибыль ИУ","Re ИУ","Прибыль Оферта","Re Оферта"]`; subtotals from `rollup.byUniverse`, grand from `rollup.grand`. |
| 3 | «Водопад затрат» block renders summed cost buckets from engine result | ✓ VERIFIED | `WATERFALL_BUCKETS` (13 keys: cost/ad/review/logistics/delivery/credit/overhead/acceptance/storage/defect/jem/tax/acquiring) rendered dual ИУ/Оферта from `waterfall.iu`/`waterfall.std` + «Итого затрат» sum row. |
| 4 | ?week=YYYY-MM-DD recomputes for that ISO week (Mon–Sun); no param = current ISO week | ✓ VERIFIED | `page.tsx`: `ISO_DATE_RE`-validated `sp.week` → `normalizeToIsoMonday` else `currentIsoMonday`; `weekStart = new Date(mondayISO+"T00:00:00Z")` → `loadWeeklyFinReportInputs`; loader `weekEnd = weekStart + 6d`. Controls push `/finance/weekly?week=<monday>`. |
| 5 | MANAGE user edits+saves manual pools → persist to AppSetting financeWeekly.pools.<weekISO> + revalidate; VIEW cannot see editor | ✓ VERIFIED | `WeeklyFinReportControls` editor gated by `canManage`; `saveWeeklyPools` guarded `requireSection("FINANCE","MANAGE")`, sanitizes, `upsert` key `financeWeekly.pools.<iso>`, `revalidatePath("/finance/weekly")`. Live role visual deferred to human smoke. |
| 6 | Numbers are live: orders/revenue WbCardFunnelDaily, ad WbAdvertStatDaily, cost ProductCost, commissions WbCard, credit interest (appliances) from loan schedule | ✓ VERIFIED | `data.ts`: funnel `groupBy` Σ ordersCount/ordersSumRub; ad `groupBy` Σ sum; cost `product.cost.costPrice`; comm `commFbwIu??commFbsIu` / `commFbwStd??commFbsStd`; credit via `loadSummarySchedule("week",…)` Зойтен group, appliances-only. No hardcoded data paths. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `lib/finance-weekly/data.ts` | loader + ManualPools + key helper + defaults | ✓ VERIFIED | 401 lines. Exports `loadWeeklyFinReportInputs`, `ManualPools`, `financeWeeklyPoolsKey`, `DEFAULT_MANUAL_POOLS`, `WeeklyFinReportPageData`. |
| `app/actions/finance-weekly.ts` | saveWeeklyPools (FINANCE MANAGE) + upsert + revalidate | ✓ VERIFIED | `"use server"`; `requireSection("FINANCE","MANAGE")`; ISO regex guard; sanitize; upsert; `revalidatePath`. |
| `app/(dashboard)/finance/weekly/page.tsx` | RSC gate, week resolve, load→compute→render | ✓ VERIFIED | Contains `computeWeeklyFinReport`; `force-dynamic`; RBAC + `getSectionRole` canManage. |
| `components/finance/WeeklyFinReportTable.tsx` | sticky rollup + waterfall (solid bg) | ✓ VERIFIED | Contains «Водопад затрат»; plain `<table border-separate>`, `<thead bg-background>`, no shadcn Table header. |
| `components/finance/WeeklyFinReportControls.tsx` | week picker + MANAGE-only editor | ✓ VERIFIED | Native `<input>`/`<button>`; editor behind `canManage`; `useTransition` + sonner toast. |
| `components/finance/FinanceTabs.tsx` | «Понедельный» tab → /finance/weekly | ✓ VERIFIED | Tab present at index 2 (after ОДДС, before ОПиУ). |
| `components/layout/section-titles.ts` | `/^\/finance\/weekly/` before `/finance-models` | ✓ VERIFIED | Line 42 (before line 44 `/finance-models`) → «Финансы — Понедельный». |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| page.tsx | data.ts + engine.ts | loadWeeklyFinReportInputs → computeWeeklyFinReport | ✓ WIRED | Both imported and called (6 refs); engine consumed, not reimplemented. |
| data.ts | pricing-math.ts | logisticsStdPerUnit = calculatePricingStandard(...).logisticsEffAmount | ✓ WIRED | Imported + invoked with `?? 0` coalesce (4 refs). |
| data.ts | credits-schedule-data.ts | creditInterest = Зойтен weekly interest (appliances only) | ✓ WIRED | `loadSummarySchedule("week",…)`, Зойтен group Σ columns (2 refs). |
| Controls | finance-weekly.ts | editor submit → saveWeeklyPools upsert | ✓ WIRED | Imported + called in `useTransition` (2 refs). |

### Two-Universe Pool Encoding (§2.2) — Focused Check

| Pool | appliances | clothing | Status |
| ---- | ---------- | -------- | ------ |
| deliveryToMp | `{ manualPools.delivery, combinedBase }` | `{ manualPools.delivery, combinedBase }` (SHARED, identical) | ✓ CORRECT |
| creditInterest | `{ zoitenWeekInterest, applBase }` | `{ 0, 0 }` (clothing carries no credit) | ✓ CORRECT |
| overhead | `{ overheadAppl, applBase }` | `{ overheadCloth, clothBase }` | ✓ CORRECT |
| acceptance | `{ acceptanceAppl, applBase }` | `{ acceptanceCloth, clothBase }` | ✓ CORRECT |
| storage | `{ storageAppl, applBase }` | `{ storageCloth, clothBase }` | ✓ CORRECT |
| manual source | AppSetting `financeWeekly.pools.<weekISO>` parsed+merged onto defaults | ✓ CORRECT |

### RBAC

| Surface | Requirement | Status |
| ------- | ----------- | ------ |
| page read | `requireSection("FINANCE")` | ✓ VERIFIED (page.tsx:46) |
| saveWeeklyPools | `requireSection("FINANCE","MANAGE")` | ✓ VERIFIED (finance-weekly.ts:30) |
| route guard | `lib/sections.ts` maps `/finance/` → FINANCE (covers sub-route) | ✓ VERIFIED |

### Registration / Scope Guards

| Check | Result |
| ----- | ------ |
| FinanceTabs `{href:"/finance/weekly"}` | ✓ present |
| section-titles `/finance/weekly` entry before `/finance-models` | ✓ present (L42 < L44) |
| NO new ERP_SECTION enum value | ✓ confirmed (only pre-existing `WEEKLY_CARDS`; no schema edits in W2a commits) |
| NO prisma migration | ✓ confirmed (no prisma/schema/migration files in 0d26c19/9cf3d10/ee4fd4c) |

### Sticky-Table Compliance (WeeklyFinReportTable.tsx)

| Check | Result |
| ----- | ------ |
| Plain `<table border-separate border-spacing-0>` | ✓ |
| `<thead className="bg-background">` + direct `<tr>`/`<th sticky ... bg-background>` | ✓ |
| NO shadcn `<Table>`/`<TableHeader>`/`<TableRow>`/`<TableHead>` in header | ✓ (grep: no matches) |
| NO `/NN` alpha on sticky cells | ✓ Only matches are `hover:bg-muted/20` on non-sticky `<tr>` (L241 rollup row covered by solid sticky `<td>`; L316 waterfall table has no sticky cells) — both safe per CLAUDE.md. Border alpha `border-r-border/40` is the sanctioned intra-group border pattern, not a background. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Whole-project type safety | `npx tsc --noEmit` | exit 0 | ✓ PASS |
| Engine golden + pricing untouched | `npx vitest run tests/finance-weekly-engine.test.ts tests/pricing-math.test.ts` | 2 files, 63 tests passed | ✓ PASS |
| Route HTTP render | GET /finance/weekly | — (RSC needs running server) | ? SKIP → human (post-deploy) |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ----------- | ----------- | ------ | -------- |
| W2a | W2a-PLAN | /finance/weekly scaffold + rollup on live data via engine | ✓ SATISFIED | All 6 truths + 7 artifacts + 4 key links verified; tsc + tests green. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| lib/finance-weekly/data.ts | 306 | `logisticsStdPerUnit = 0` when `volumeLiters <= 0` + `TODO(W1)` | ℹ️ Info | Intentional per plan scope (W1 replaces modeled N_std with actual delivery_rub from WbRealizationWeekly). NOT a gap. |
| lib/finance-weekly/data.ts | 54–62 | `DEFAULT_MANUAL_POOLS` all zeros | ℹ️ Info | Intentional placeholder until W3 bank classifier auto-fill; MANAGE user hand-enters. NOT a gap. |
| lib/finance-weekly/data.ts | 180–225 | early-return empty articles/zeroed pools | ℹ️ Info | Defensive guards (no WB marketplace / no linked articles), not stubs. |

No blocker or warning anti-patterns. The two known stubs (manual pools default 0, N_std TODO(W1)) are expected W2a scope per task instructions.

### Human Verification Required (non-blocking, post-deploy)

1. **Route smoke** — GET /finance/weekly as FINANCE user → 200; «Понедельный» tab active; rollup + «Водопад затрат» visible; `?week=2026-06-29` recomputes.
2. **MANAGE/VIEW editor** — MANAGE sees the 7-field pools editor and Save persists (AppSetting `financeWeekly.pools.<weekISO>`) + revalidate; VIEW sees no editor.

These are standard runtime smoke checks deferred to the orchestrator post-deploy per the plan's own verification section; all supporting code is verified at levels 1–4.

### Gaps Summary

None. The phase goal is achieved in code: `/finance/weekly` assembles live inputs (funnel orders/revenue, advert spend, ProductCost, WbCard commissions, Зойтен weekly credit interest, modeled N_std), encodes the two non-overlapping cost universes exactly per §2.2 (delivery shared, credit appliances-only with clothing {0,0}, overhead/acceptance/storage per-universe, manual pools from AppSetting), consumes the pure engine `computeWeeklyFinReport` (not a reimplementation), and renders the Universe→Brand→Article rollup + cost waterfall behind correct FINANCE / FINANCE-MANAGE RBAC. Registration is complete with no new ERP_SECTION enum and no Prisma migration. tsc clean; engine + pricing-math suites green (63 tests). The only remaining items are standard post-deploy route/role smoke tests, which are non-blocking.

---

_Verified: 2026-07-10T11:08:00Z_
_Verifier: Claude (gsd-verifier)_
