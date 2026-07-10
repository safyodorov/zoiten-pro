---
phase: quick-260710-evz
plan: W2a
type: execute
wave: 1
depends_on: []
files_modified:
  - lib/finance-weekly/data.ts
  - app/actions/finance-weekly.ts
  - components/finance/WeeklyFinReportTable.tsx
  - components/finance/WeeklyFinReportControls.tsx
  - app/(dashboard)/finance/weekly/page.tsx
  - components/finance/FinanceTabs.tsx
  - components/layout/section-titles.ts
autonomous: true
requirements: [W2a]
gap_closure: false

must_haves:
  truths:
    - "GET /finance/weekly (FINANCE user) returns 200 and shows the «Понедельный» tab active"
    - "Rollup table groups Universe(Бытовая техника/Одежда) → Brand → Article with columns Выручка / Прибыль ИУ / Re ИУ / Прибыль Оферта / Re Оферта, plus per-universe subtotals and grand total"
    - "A «Водопад затрат» block renders the summed cost buckets from the engine result"
    - "Passing ?week=YYYY-MM-DD recomputes the report for that ISO week (Mon–Sun); no param = current ISO week"
    - "A MANAGE user can edit the manual pools and save; values persist to AppSetting financeWeekly.pools.<weekISO> and the page revalidates; VIEW user does not see the editor"
    - "Numbers are live: orders/revenue from WbCardFunnelDaily, ad spend from WbAdvertStatDaily, cost from ProductCost, commissions from WbCard, credit interest (appliances only) from the loan schedule"
  artifacts:
    - path: "lib/finance-weekly/data.ts"
      provides: "loadWeeklyFinReportInputs(weekStart) — assembles engine inputs from live DB; ManualPools type + key helper + defaults"
      exports: ["loadWeeklyFinReportInputs", "ManualPools", "financeWeeklyPoolsKey", "DEFAULT_MANUAL_POOLS"]
      min_lines: 120
    - path: "app/actions/finance-weekly.ts"
      provides: "saveWeeklyPools server action (FINANCE MANAGE) upserting AppSetting + revalidatePath"
      exports: ["saveWeeklyPools"]
    - path: "app/(dashboard)/finance/weekly/page.tsx"
      provides: "RSC page: RBAC gate, week resolve, load → compute → render"
      contains: "computeWeeklyFinReport"
    - path: "components/finance/WeeklyFinReportTable.tsx"
      provides: "Sticky rollup table + waterfall block (project sticky pattern, solid bg)"
      contains: "Водопад затрат"
    - path: "components/finance/WeeklyFinReportControls.tsx"
      provides: "Week picker + manual-pools editor (client, MANAGE-only)"
    - path: "components/finance/FinanceTabs.tsx"
      provides: "«Понедельный» tab pointing at /finance/weekly"
      contains: "/finance/weekly"
    - path: "components/layout/section-titles.ts"
      provides: "Header title regex for ^/finance/weekly before /finance-models"
      contains: "finance\\\\/weekly"
  key_links:
    - from: "app/(dashboard)/finance/weekly/page.tsx"
      to: "lib/finance-weekly/data.ts + lib/finance-weekly/engine.ts"
      via: "loadWeeklyFinReportInputs → computeWeeklyFinReport"
      pattern: "loadWeeklyFinReportInputs|computeWeeklyFinReport"
    - from: "lib/finance-weekly/data.ts"
      to: "lib/pricing-math.ts calculatePricingStandard"
      via: "logisticsStdPerUnit = calculatePricingStandard(...).logisticsEffAmount"
      pattern: "calculatePricingStandard"
    - from: "lib/finance-weekly/data.ts"
      to: "lib/credits-schedule-data.ts loadSummarySchedule"
      via: "creditInterest.total = Зойтен weekly interest (appliances only)"
      pattern: "loadSummarySchedule"
    - from: "components/finance/WeeklyFinReportControls.tsx"
      to: "app/actions/finance-weekly.ts saveWeeklyPools"
      via: "editor form submit → upsert AppSetting"
      pattern: "saveWeeklyPools"
---

<objective>
Build **W2a**: the `/finance/weekly` page scaffold + rollup table on LIVE data, consuming
the already-built pure engine `lib/finance-weekly/engine.ts` (`computeWeeklyFinReport`).

Scope IN: data assembly for one ISO week (Mon–Sun) of the Zoiten WB cabinet, dual ИУ/Оферта
scenarios, two non-overlapping cost universes (appliances / clothing), rollup table + cost
waterfall, MANUAL pools stored in AppSetting with a MANAGE-only editor.

Scope OUT (later waves): NO drill-down modal (W2b), NO plan-fact columns (W2c),
NO Prisma schema change / migration, NO WB API calls, NO hybrid bank auto-fill (W3).

Purpose: give the user the понедельный фин-отчёт on real numbers now; pools that are not
auto-derivable are manual placeholders until W3 wires the bank classifier.
Output: `/finance/weekly` renders a live rollup for the selected week.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@docs/superpowers/specs/2026-07-08-weekly-finreport-design.md
@lib/finance-weekly/types.ts
@lib/finance-weekly/engine.ts
@tests/finance-weekly-engine.test.ts

<interfaces>
<!-- Engine contract (already built). data.ts assembles WeeklyFinReportInputs; page calls computeWeeklyFinReport. -->

lib/finance-weekly/types.ts — key shapes the executor uses directly:
```ts
type Universe = "appliances" | "clothing"

interface WeeklyArticleInput {
  nmId: number
  universe: Universe
  qtyOrders: number            // H
  grossPricePerUnit: number    // K
  commIuPct: number            // ИУ commission %
  commStdPct: number           // Оферта commission %
  costPerUnit: number          // O
  adSpendTotal: number         // L (weekly total per nmId)
  reviewWriteoffTotal: number  // M — pass 0 (W1 later)
  logisticsIuPerUnit: number   // N_iu — pass 0 (logistics baked into ИУ commission)
  logisticsStdPerUnit: number  // N_std — modeled from calculatePricingStandard
  storagePerUnit?: number      // LEAVE UNDEFINED → engine uses storage pool
}
interface WeeklyPool { total: number; baseRevenue: number }  // poolPerUnit = (K/baseRevenue)*total
interface UniversePools { deliveryToMp; creditInterest; overhead; acceptance; storage }  // all WeeklyPool
interface WeeklyConstants { taxPct; jemPct; defectPct; acquiringPct }
const DEFAULT_WEEKLY_CONSTANTS = { taxPct:8, jemPct:1, defectPct:2, acquiringPct:2.87 }
interface WeeklyFinReportInputs { articles: WeeklyArticleInput[]; pools: {appliances:UniversePools; clothing:UniversePools}; constants?: Partial<WeeklyConstants> }

// computeWeeklyFinReport(inputs) → { articles: ArticleResult[]; rollup: WeeklyRollup; waterfall: WeeklyWaterfall }
interface ArticleResult { nmId; universe; iu: ScenarioResult; std: ScenarioResult }
interface ScenarioResult { cutPricePerUnit; profitPerUnit; revenue; profit; rePct; roi }   // rePct is a fraction 0..1
interface WeeklyRollup { byUniverse: {universe; iu: ScenarioRollup; std: ScenarioRollup}[]; grand: {iu; std} }
interface ScenarioRollup { revenue; profit; rePct }
interface WeeklyWaterfall { iu: CostWaterfall; std: CostWaterfall }
interface CostWaterfall { cost; ad; review; logistics; delivery; credit; overhead; acceptance; storage; defect; jem; tax; acquiring }
```

lib/pricing-math.ts — for N_std (modeled logistics). `calculatePricingStandard(inputs: PricingInputs): PricingOutputs`.
`logisticsEffAmount` (the value we want) is computed purely from: `volumeLiters`, `buyoutPct`,
`priceBeforeDiscount`/`sellerDiscountPct` (→ sellerPriceForIrp), `delivBaseLiter`, `delivAddLiter`,
`localizationIndex`, `irpPct`, `reverseLogBaseRub`, `reverseLogPerLiterRub`. Other PricingInputs
fields must be present (full interface) but do not affect logisticsEffAmount. Mirror the stdParams
assembly at app/(dashboard)/prices/wb/page.tsx lines ~660-692 (effCoef = isClothing ? clothingEff : appliancesEff
from AppSetting.wbEffCoef.<u>; volumeLiters = heightCm*widthCm*depthCm/1000; localizationIndex/irpPct/reverse from rates).

lib/credits-schedule-data.ts — `loadSummarySchedule(granularity, from, to)` returns
`{ columns: {key,label}[]; groups: { companyName; subtotalInterestByPeriod: Record<string,number>; ... }[] }`.
Зойтен group = `groups.find(g => g.companyName.toUpperCase().includes("ЗОЙТЕН"))`.
Weekly interest = Σ over `schedule.columns` of `zoitenGroup.subtotalInterestByPeriod[col.key]` (robust to bucket-key format; window is one week).

lib/rbac.ts — `requireSection("FINANCE")` (read), `requireSection("FINANCE","MANAGE")` (write),
`getSectionRole("FINANCE")` → "MANAGE" | "VIEW" | null.

Prisma models (read-only; NO schema change):
- WbCardFunnelDaily { nmId, date @db.Date, ordersCount, ordersSumRub }
- WbAdvertStatDaily { nmId, date @db.Date, sum }
- WbCard { nmId, commFbwIu?, commFbwStd?, commFbsIu?, commFbsStd?, buyoutPercent? }
- ProductCost { productId @unique, costPrice }   Product { heightCm?, widthCm?, depthCm?, brand{ name, direction{ hasSizes } } }
- MarketplaceArticle { article, marketplaceId, product }   Marketplace{ slug:"wb" }
- AppSetting { key @id, value }  — keys reused: wbLocalizationIndex, wbIrpPct, wbReverseLogBaseRub,
  wbReverseLogPerLiterRub, "wbEffCoef.appliances", "wbEffCoef.clothing"; new manual key financeWeekly.pools.<weekISO>.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Data assembly + persistence layer</name>
  <files>lib/finance-weekly/data.ts, app/actions/finance-weekly.ts</files>
  <action>
Create the LIVE-data loader and the manual-pools persistence action. No UI here.

**lib/finance-weekly/data.ts** (imports prisma; mirror the nmId→Product join from
app/(dashboard)/prices/wb/page.tsx lines 137-357, but drop promotions/calc/reviews):

Exports:
- `export interface ManualPools { delivery: number; overheadAppl: number; acceptanceAppl: number; storageAppl: number; overheadCloth: number; acceptanceCloth: number; storageCloth: number }`
- `export const DEFAULT_MANUAL_POOLS: ManualPools` — all zeros.
- `export function financeWeeklyPoolsKey(weekStartISO: string): string` → `` `financeWeekly.pools.${weekStartISO}` ``.
- `export interface WeeklyFinReportPageData { weekStart: string; weekEnd: string; articles: WeeklyArticleInput[]; meta: Record<number,{ brandName: string | null; productName: string }>; pools: { appliances: UniversePools; clothing: UniversePools }; constants: WeeklyConstants; manualPools: ManualPools }`
- `export async function loadWeeklyFinReportInputs(weekStart: Date): Promise<WeeklyFinReportPageData>`

Loader steps:
1. `weekEnd = new Date(weekStart.getTime() + 6*86400000)` (Sunday, inclusive). Compute `weekStartISO = weekStart.toISOString().slice(0,10)`, `weekEndISO` likewise.
2. Find `prisma.marketplace.findFirst({ where:{ slug:"wb" } })`. If missing → return empty articles + zeroed pools (defensive).
3. Load linked WB articles with product graph:
   `prisma.marketplaceArticle.findMany({ where:{ marketplaceId }, include:{ product:{ include:{ cost:true, brand:{ select:{ name:true, direction:{ select:{ hasSizes:true } } } } } } } })`
   — also need product dimensions heightCm/widthCm/depthCm (they are Product scalars → present without extra select if you select the product or use `include`; if using `select` add them). Build `nmId → product` map (parseInt(article,10), first wins), and `linkedNmIds`.
4. Load `prisma.wbCard.findMany({ where:{ nmId:{ in:linkedNmIds }, deletedAt:null } })` → `cardByNmId` map (commissions + buyoutPercent).
5. Load AppSetting rows for keys `["wbLocalizationIndex","wbIrpPct","wbReverseLogBaseRub","wbReverseLogPerLiterRub","wbEffCoef.appliances","wbEffCoef.clothing", financeWeeklyPoolsKey(weekStartISO)]`. Parse a `rates` object with the same DEFAULT_RATES fallbacks used in prices/wb (wbLocalizationIndex 1.11, wbIrpPct 1.56, wbReverseLogBaseRub 46, wbReverseLogPerLiterRub 14). Parse `wbEffCoef.<u>` JSON → `{ delivBaseLiter, delivAddLiter, storageBaseLiter, storageAddLiter }` with the EFF_FALLBACK {94.3,28.7,0.16,0.16} used in prices/wb.
6. Weekly funnel aggregate: `prisma.wbCardFunnelDaily.groupBy({ by:["nmId"], where:{ nmId:{ in:linkedNmIds }, date:{ gte:weekStart, lte:weekEnd } }, _sum:{ ordersCount:true, ordersSumRub:true } })` → maps `nmId → {H, sumRub}`.
7. Weekly ad spend: `prisma.wbAdvertStatDaily.groupBy({ by:["nmId"], where:{ nmId:{ in:linkedNmIds }, date:{ gte:weekStart, lte:weekEnd } }, _sum:{ sum:true } })` → `nmId → adSpendTotal` (default 0).
8. Credit interest (appliances only): `const schedule = await loadSummarySchedule("week", weekStart, weekEnd)`; find Зойтен group; `zoitenWeekInterest = Σ over schedule.columns of (group?.subtotalInterestByPeriod[col.key] ?? 0)`. If no group → 0.
9. Build `articles: WeeklyArticleInput[]` + `meta`: for each nmId in the funnel map with `H > 0` (guard: skip H=0):
   - `K = sumRub / H`; `universe = product.brand?.direction?.hasSizes ? "clothing" : "appliances"`.
   - `commIuPct = card.commFbwIu ?? card.commFbsIu ?? 0`; `commStdPct = card.commFbwStd ?? card.commFbsStd ?? 0`.
   - `costPerUnit = product.cost?.costPrice ?? 0`.
   - `adSpendTotal` from step 7 map (0 if absent). `reviewWriteoffTotal = 0`. `logisticsIuPerUnit = 0`. Do NOT set storagePerUnit.
   - `logisticsStdPerUnit`: modeled. `volumeLiters = (h*w*d)/1000` from product dims (0 if any missing). If `volumeLiters <= 0` OR the effCoef came from EFF_FALLBACK-only path where you cannot model → set `logisticsStdPerUnit = 0` with a `// TODO(W1): replace modeled N_std with actual delivery_rub from WbRealizationWeekly` comment. Otherwise call `calculatePricingStandard(inputs).logisticsEffAmount` where `inputs` is a full PricingInputs assembled like prices/wb: seller price basis from card (`priceBeforeDiscount = card.priceBeforeDiscount ?? K`, `sellerDiscountPct = card.sellerDiscount ?? 0`), `buyoutPct = card.buyoutPercent ?? 100`, `commStdPct`, `volumeLiters`, effCoef `delivBaseLiter/delivAddLiter/storageBaseLiter/storageAddLiter`, `localizationIndex = rates.wbLocalizationIndex`, `irpPct = rates.wbIrpPct`, `reverseLogBaseRub`, `reverseLogPerLiterRub`, `daysInStock = 60`, plus benign values for the rest of PricingInputs (wbDiscountPct 0, clubDiscountPct 0, commFbwPct commStdPct, walletPct 0, acquiringPct 0, jemPct 0, creditPct 0, overheadPct 0, taxPct 0, drrPct 0, defectRatePct 0, deliveryCostRub 0, costPrice costPerUnit) — these do not affect logisticsEffAmount.
   - Push `{ nmId, universe, qtyOrders:H, grossPricePerUnit:K, commIuPct, commStdPct, costPerUnit, adSpendTotal, reviewWriteoffTotal:0, logisticsIuPerUnit:0, logisticsStdPerUnit }` and `meta[nmId] = { brandName: product.brand?.name ?? null, productName: product.name }`.
10. Bases: `applBase = Σ (K*H) for appliances articles`; `clothBase = Σ (K*H) for clothing`; `combinedBase = applBase + clothBase`.
11. Manual pools: parse AppSetting `financeWeeklyPoolsKey(weekStartISO)` JSON (try/catch) → `manualPools` merged onto `DEFAULT_MANUAL_POOLS`.
12. Build pools per spec §2.2:
    - appliances: deliveryToMp `{ total:manualPools.delivery, baseRevenue:combinedBase }`; creditInterest `{ total:zoitenWeekInterest, baseRevenue:applBase }`; overhead `{ total:manualPools.overheadAppl, baseRevenue:applBase }`; acceptance `{ total:manualPools.acceptanceAppl, baseRevenue:applBase }`; storage `{ total:manualPools.storageAppl, baseRevenue:applBase }`.
    - clothing: deliveryToMp `{ total:manualPools.delivery, baseRevenue:combinedBase }` (SHARED, identical); creditInterest `{ total:0, baseRevenue:0 }`; overhead `{ total:manualPools.overheadCloth, baseRevenue:clothBase }`; acceptance `{ total:manualPools.acceptanceCloth, baseRevenue:clothBase }`; storage `{ total:manualPools.storageCloth, baseRevenue:clothBase }`.
13. Return `{ weekStart:weekStartISO, weekEnd:weekEndISO, articles, meta, pools:{ appliances, clothing }, constants: DEFAULT_WEEKLY_CONSTANTS, manualPools }`.

Import `DEFAULT_WEEKLY_CONSTANTS` and types from `@/lib/finance-weekly/types`, `calculatePricingStandard` + `PricingInputs` from `@/lib/pricing-math`, `loadSummarySchedule` from `@/lib/credits-schedule-data`, `prisma` from `@/lib/prisma`.

**app/actions/finance-weekly.ts** ("use server"):
```ts
"use server"
import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { financeWeeklyPoolsKey, DEFAULT_MANUAL_POOLS, type ManualPools } from "@/lib/finance-weekly/data"

export async function saveWeeklyPools(weekStartISO: string, pools: ManualPools): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSection("FINANCE", "MANAGE")
    // sanitize: coerce to finite numbers, fall back to 0
    const clean: ManualPools = { ...DEFAULT_MANUAL_POOLS }
    for (const k of Object.keys(clean) as (keyof ManualPools)[]) {
      const n = Number(pools?.[k]); clean[k] = Number.isFinite(n) ? n : 0
    }
    const key = financeWeeklyPoolsKey(weekStartISO)
    await prisma.appSetting.upsert({ where: { key }, create: { key, value: JSON.stringify(clean) }, update: { value: JSON.stringify(clean) } })
    revalidatePath("/finance/weekly")
    return { ok: true }
  } catch (e) { return { ok: false, error: (e as Error).message } }
}
```
Validate the ISO string shape (`/^\d{4}-\d{2}-\d{2}$/`) before building the key; reject otherwise.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>data.ts exports loadWeeklyFinReportInputs + ManualPools + financeWeeklyPoolsKey + DEFAULT_MANUAL_POOLS; finance-weekly.ts exports saveWeeklyPools guarded by requireSection("FINANCE","MANAGE"); tsc clean.</done>
</task>

<task type="auto">
  <name>Task 2: Rollup table + cost waterfall component</name>
  <files>components/finance/WeeklyFinReportTable.tsx</files>
  <action>
Create the presentational sticky table. Model on `components/finance/CashflowMatrix.tsx` and honor
CLAUDE.md sticky-table pattern: `<div className="overflow-auto">` → `<table className="w-full border-separate border-spacing-0">` → `<thead className="bg-background">` with `<tr>`/`<th sticky top-0 z-... bg-background border-b>` (NO shadcn `<Table>`/`<TableHeader>`/`<TableRow>` in the header). Every sticky cell uses a SOLID `bg-background` / `bg-muted` (never `/NN` alpha). Mark `"use client"`.

Props:
```ts
interface Props {
  articles: ArticleResult[]                                  // from computeWeeklyFinReport
  rollup: WeeklyRollup
  waterfall: WeeklyWaterfall
  meta: Record<number, { brandName: string | null; productName: string }>
}
```
Import `ArticleResult, WeeklyRollup, WeeklyWaterfall` from `@/lib/finance-weekly/types`.

Rendering:
1. Group `articles` by universe ("appliances" → «Бытовая техника», "clothing" → «Одежда»), then by `meta[nmId].brandName ?? "—"`, then article rows. Stable order: appliances first, brands alphabetically (ru), articles by nmId.
2. Columns: sticky left label (Universe/Brand/Article name), then `Выручка` (article `iu.revenue`; iu.revenue === std.revenue = K·H, show once), `Прибыль ИУ` (iu.profit), `Re ИУ` (iu.rePct — format as `%`, value is a fraction so ×100), `Прибыль Оферта` (std.profit), `Re Оферта` (std.rePct×100).
3. Per-universe subtotal rows from `rollup.byUniverse` (match by universe): Выручка `iu.revenue`, Прибыль ИУ `iu.profit`, Re ИУ `iu.rePct`, Прибыль Оферта `std.profit`, Re Оферта `std.rePct`. Style with solid `bg-muted font-semibold`.
4. Grand total row from `rollup.grand` (solid `bg-muted`, bolder).
5. Below the table, a «Водопад затрат» block: render the Σ cost buckets. Show BOTH scenarios (waterfall.iu and waterfall.std side by side or two columns) for buckets: Закупка(cost), Реклама(ad), Отзывы(review), Логистика(logistics), Доставка до МП(delivery), Кредит(credit), Общие(overhead), Приёмка(acceptance), Хранение(storage), Брак(defect), Джем(jem), Налог(tax), Эквайринг(acquiring). Use a small table or definition list; solid backgrounds if sticky.
6. Number formatting: `new Intl.NumberFormat("ru-RU",{ maximumFractionDigits:0 })` for ₽; percents `maximumFractionDigits:1` with a `%` suffix (rePct fraction ×100). Use `tabular-nums text-right`.
7. Empty state: if `articles.length === 0` render a muted «Нет данных за выбранную неделю».

No interactivity, no drill-down, no modal.
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
  </verify>
  <done>WeeklyFinReportTable renders Universe→Brand→Article rows + per-universe subtotals + grand total + «Водопад затрат» block using the project sticky pattern (solid bg, no shadcn Table header); tsc clean.</done>
</task>

<task type="auto">
  <name>Task 3: RSC page + controls + registration</name>
  <files>app/(dashboard)/finance/weekly/page.tsx, components/finance/WeeklyFinReportControls.tsx, components/finance/FinanceTabs.tsx, components/layout/section-titles.ts</files>
  <action>
Wire everything into the route and register it.

**components/finance/WeeklyFinReportControls.tsx** ("use client") — week picker + manual-pools editor:
- Props: `{ weekStartISO: string; weekEndISO: string; manualPools: ManualPools; canManage: boolean }` (import `ManualPools` from `@/lib/finance-weekly/data`).
- Week picker (pattern from `components/sales-plan/PlanFactControls.tsx`): a native `<input type="date">` bound to `weekStartISO` + «‹ Пред.» / «След. ›» / «Тек. неделя» buttons. On change, normalize the chosen date to its ISO Monday (jsDay 0→7, subtract isoDay-1, all UTC — copy `startOfIsoWeek`/`addDaysToIso` helpers), then `router.push('/finance/weekly?week=' + monday)`. Use `useRouter` from `next/navigation`.
- Manual-pools editor: render ONLY when `canManage`. Seven number inputs — `delivery` (Доставка до МП, общая), `overheadAppl` / `acceptanceAppl` / `storageAppl` (Общие/Приёмка/Хранение — бытовая), `overheadCloth` / `acceptanceCloth` / `storageCloth` (Общие/Приёмка/Хранение — одежда). Local `useState` seeded from `manualPools`; «Сохранить» button in a `useTransition` calls `saveWeeklyPools(weekStartISO, state)`; on `{ok:false}` surface the error (toast via `sonner` if already used in project, else inline text). Note in a small caption: «Кредит (проценты) — авто из графика кредитов Зойтен, только бытовая».
- Native `<select>`/`<input>` only (CLAUDE.md: NOT base-ui). Keep it compact.

**app/(dashboard)/finance/weekly/page.tsx** (RSC):
```tsx
export const dynamic = "force-dynamic"
export const metadata = { title: "Финансы — Понедельный — Zoiten ERP" }
```
- `await requireSection("FINANCE")`; `const canManage = (await getSectionRole("FINANCE")) === "MANAGE"`.
- Resolve week: `searchParams: Promise<{ week?: string }>`. If `week` matches `/^\d{4}-\d{2}-\d{2}$/` use it, else compute current ISO Monday (MSK-today → UTC Monday, mirror `startOfIsoWeek` from PlanFactControls). Build `weekStart = new Date(mondayISO + "T00:00:00Z")`.
- `const data = await loadWeeklyFinReportInputs(weekStart)`.
- `const result = computeWeeklyFinReport({ articles: data.articles, pools: data.pools, constants: data.constants })`.
- Render: `<FinanceTabs />`, then `<WeeklyFinReportControls weekStartISO={data.weekStart} weekEndISO={data.weekEnd} manualPools={data.manualPools} canManage={canManage} />`, a small caption showing the week range (`{data.weekStart} — {data.weekEnd}`), then `<WeeklyFinReportTable articles={result.articles} rollup={result.rollup} waterfall={result.waterfall} meta={data.meta} />`. Wrap in `<div className="h-full flex flex-col gap-4">` (same shell as cashflow page).
- Imports: `requireSection, getSectionRole` from `@/lib/rbac`; `loadWeeklyFinReportInputs` from `@/lib/finance-weekly/data`; `computeWeeklyFinReport` from `@/lib/finance-weekly/engine`; the three components; `FinanceTabs` from `@/components/finance/FinanceTabs`.

**components/finance/FinanceTabs.tsx** (edit): add `{ href: "/finance/weekly", label: "Понедельный" }` to the `TABS` array (after ОДДС or ОПиУ — user-facing order is fine appended before/after ОПиУ; place after ОДДС).

**components/layout/section-titles.ts** (edit): add `{ match: /^\/finance\/weekly/, title: "Финансы — Понедельный" }` — MUST be placed BEFORE the `/^\/finance-models/` line (and it is naturally before it; keep it alongside the other `/finance/*` entries, before `/finance-models`).

NO new ERP_SECTION enum, NO migration — `/finance/weekly` is a sub-route under the existing FINANCE section (middleware route guard already covers `/finance` prefix; confirm `lib/sections.ts` maps `/finance` → FINANCE, no change needed).
  </action>
  <verify>
    <automated>npx tsc --noEmit</automated>
    <automated>npm run test -- finance-weekly-engine pricing-math</automated>
  </verify>
  <done>/finance/weekly page compiles and renders (tabs + controls + table); FinanceTabs shows «Понедельный»; section-titles resolves the header; finance-weekly-engine + pricing-math tests still pass; tsc clean.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` — clean across the whole project (all three tasks).
- `npm run test -- finance-weekly-engine pricing-math sales-plan` — these suites still pass (engine golden test untouched; no import cycle from new files). Full `npm run test` has ~42 KNOWN PRE-EXISTING unrelated failures (support/CRM/wb-sync, pool=vmForks) — confirm any failures are in those files and unrelated to this change; do NOT fix them.
- Manual/route smoke (orchestrator, post-deploy): GET /finance/weekly as a FINANCE user → 200, «Понедельный» tab active, rollup + waterfall visible; `?week=2026-06-29` recomputes; MANAGE user sees the pools editor and Save persists.
</verification>

<success_criteria>
- `/finance/weekly` renders a live понедельный rollup (Universe → Brand → Article) with dual ИУ/Оферта columns, per-universe subtotals, grand total, and a «Водопад затрат» block.
- Data is live: orders/revenue (WbCardFunnelDaily Σ week), ad spend (WbAdvertStatDaily Σ week), cost (ProductCost), commissions (WbCard ИУ/std with FBS fallback), credit interest (Зойтен weekly, appliances only), N_std modeled via calculatePricingStandard.
- Two non-overlapping cost universes honored (§2.2): delivery shared (baseRevenue=combined), credit appliances-only, overhead/acceptance/storage per universe; manual pools in AppSetting.
- MANAGE editor saves manual pools; VIEW cannot see it. No schema change, no migration, no WB API call, no drill-down modal.
- tsc clean; engine + pricing-math tests green.
</success_criteria>

<output>
Executor commits atomically with `git add -A` (NEW files present) and pushes to origin/main.
DEPLOY is required (new runtime page) but the ORCHESTRATOR performs it detached (nohup) AFTER
verification — the executor ONLY commits + pushes, does NOT deploy.

After completion, create `.planning/quick/260710-evz-w2a-finance-weekly/260710-evz-SUMMARY.md`.
</output>
