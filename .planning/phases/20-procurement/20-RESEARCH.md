# Phase 20: Управление закупками — Research

**Researched:** 2026-06-09
**Domain:** Procurement management — Suppliers, Purchases, Payment schedules, CBR FX rates
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Database Schema (Поставщики)**
- D-01: `Supplier` — nameForeign, nameEnglish, buyerEmployeeId FK Employee (nullable), cooperationSummary, createdAt/updatedAt/deletedAt (soft delete). Quick-select UX: покупщики уже выбранные хотя бы у одного Supplier — сверху списка (distinct buyerEmployeeId query).
- D-02: `SupplierContact` — supplierId, type (SUPPLIER_MANAGER | SUPPLIER_BOSS), name, phone, preferredContact (ContactMethod enum: WECHAT | PHONE | ALIBABA | OTHER), preferredContactCustom, description, isPrimary. Constraint: один isPrimary=true per (supplierId, type) — enforce in server action.
- D-03: `SupplierProductLink` — supplierId, productId (nullable), productNameFallback; per-product: leadTimeDays, leadTimeComment, unitPrice Decimal(14,4), currency, deliveryType (CARGO | WHITE), deliveryComment, exclusivityStatus, exclusivityTerms, depositPct Decimal(5,2), balancePct Decimal(5,2), deferralPct Decimal(5,2), deferralTerms, inspectionCity, inspectionAddress, inspectionMapUrl. Partial unique: @@unique([supplierId, productId]) WHERE productId IS NOT NULL через manual migration SQL.
- D-04: `Negotiation` — supplierId, date, goals, summary?. `NegotiationProduct {negotiationId, productId}` (M:N). `NegotiationParticipant` — employeeId?, supplierContactId?, customName?, customRole? (exactly one of three populated — enforce in server action).

**Database Schema (Закупки)**
- D-05: `Purchase` — status (PLANNED|ACTIVE|COMPLETED), currency @default("CNY"), supplierId FK Supplier (one supplier per purchase), optionsDescription, optionsExtraCost Decimal?, logisticsCost Decimal?, logisticsComment.
- D-06: `PurchaseItem` — purchaseId, productId, quantity Int, unitPrice Decimal(14,4). unitPrice prefills from SupplierProductLink.unitPrice.
- D-07: One supplier per purchase — locked. Multi-supplier = separate Purchase records.
- D-08: `PurchasePayment` — purchaseId, type (DEPOSIT|BALANCE), ordinal Int, percent Decimal?(5,2), amount Decimal(14,2), currency, dueDate, paidDate?, status (PaymentStatus: PLANNED|PAID|OVERDUE — cached field). Auto-create on Purchase creation: 1 Deposit (dueDate = createdAt+3 days, percent from SupplierProductLink.depositPct) + 1 Balance (dueDate = deposit.dueDate + leadTimeDays, percent from SupplierProductLink.balancePct). User can add Deposit 2/3, Balance 2, etc. Percent↔amount bidirectional: edit percent → recompute amount; edit amount → recompute percent. No mutation of Supplier record.

**Currency Rates**
- D-09: `CurrencyRate` — date Date, code String, nominal Int, rateToRub Decimal(14,6), syncedAt. @@unique([date, code]). Source: https://www.cbr-xml-daily.ru/daily_json.js. Cron 12:00 MSK via dispatcher. Forward-only, no backfill. Helper lib/cbr-rates.ts.

**Routes & RBAC**
- D-10: Routes under /procurement/*. `/procurement` → redirect → `/procurement/suppliers`. Subs: suppliers, suppliers/[id], purchases, purchases/[id], plan. ERP_SECTION.PROCUREMENT already exists.
- D-11: Read requireSection("PROCUREMENT"), Write requireSection("PROCUREMENT","MANAGE").

**UI Patterns**
- D-12: Sticky data-tables (raw HTML, not shadcn Table).
- D-13: Cascading filters — suppliers: Закупщик/Бренд/Категория/Подкатегория; purchases: Статус/Период/Поставщик/Закупщик.
- D-14: Modal CRUD (not separate create pages).
- D-15: Supplier detail page — contacts + negotiations in tabs/accordion sections.
- D-16: Multi-payment UI — vertical card list, inline editing percent+amount+date, add buttons.

**Numeric & Locale**
- D-17: Decimal(14,2) money, Decimal(14,4) unit prices, Decimal(5,2) percents.
- D-18: ru-RU locale, thousands with space, currency code right of value.
- D-19: Dates — DateTime in DB, display MSK via getMskTodayString().

**Deletion Strategy**
- D-20: Soft delete Supplier (deletedAt). SupplierContact/SupplierProductLink/Negotiation preserved.
- D-21: Hard delete Purchase allowed only if status == PLANNED.

### Claude's Discretion
- Sidebar item order: between «Себестоимость партий» and «План продаж».
- Default sorts: suppliers → buyer ASC; purchases → createdAt DESC.
- Status colors: PLANNED=grey, ACTIVE=blue, COMPLETED=emerald. PaymentStatus: PLANNED=grey, PAID=emerald, OVERDUE=red.

### Deferred Ideas (OUT OF SCOPE)
1. Audit log for Supplier/Purchase/Payment changes
2. Payment due date notifications (cron email/Telegram)
3. Integration with sales/forecast for Plan
4. Google Maps embed (lat/lng) — only city + text address + URL
5. Purchase → ProductCost batch creation on completion
6. Multi-supplier purchases
7. Historical CBR rate backfill (v1: forward-only)
8. Print/export PDF/Excel
9. Multi-currency per item within one Purchase
</user_constraints>

---

## Summary

Phase 20 adds a full procurement cycle to Zoiten ERP: Suppliers (with contacts, per-product parameters, negotiations), Purchases (multi-item, multi-payment deposit/balance scheme), CBR FX rates cron, and a fresh /procurement/plan MVP. The existing /purchase-plan page and ProductIncoming model remain untouched — only the nav label changes to «План закупок (временный)».

The implementation closely mirrors existing patterns: Supplier schema maps to Employee (nested contacts → phones/emails pattern), Purchase payments use the same Decimal precision as Phase 21 Loan/LoanPayment, manual SQL migrations handle partial unique indexes (pattern established in Phase 4 for Barcode and MarketplaceArticle), and the CBR cron slots into the existing dispatcher without any architecture changes.

The CBR JSON feed (https://www.cbr-xml-daily.ru/daily_json.js) is a plain public HTTP endpoint — standard Node.js fetch works (no TLS fingerprint issues, unlike WB v4). Verified live: returns Date, Valute.{CharCode, Nominal, Value, Previous}. The dispatcher pattern requires adding two AppSetting keys (cbrRateSyncCronTime / cbrRateSyncLastRun) and one branch in route.ts.

**Primary recommendation:** Follow the Employee+Loan+dispatcher patterns directly — they are the canonical templates for every new aspect of Phase 20. Write a pure `lib/procurement-math.ts` helper for deposit/balance date+amount computation with a vitest golden test, mirroring lib/loan-math.ts and lib/pricing-math.ts.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.8.0 (npm) | ORM, manual SQL migrations | Project standard since Phase 1 |
| Next.js App Router RSC | 15.5.14 | Server components + server actions | Project standard |
| Zod | 4.x | Schema validation in server actions | Project standard |
| react-hook-form | 7.72 | Form state management | Project standard, zodResolver as any for Zod 4 compat |
| sonner | — | Toast notifications | Project standard |
| Lucide React | — | Icons (Truck for procurement nav) | Project standard |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vitest | 4.x | Unit tests for pure helpers | procurement-math.ts + cbr-rates.ts |
| Node.js native fetch | built-in | CBR rates API call | Standard HTTP, no TLS issues unlike WB v4 |

**Installation:** No new packages needed. All required libraries are already in the project.

**Version verification:** Prisma 7.8.0 confirmed via `npm view @prisma/client version`. Node.js 24.14.0 (native fetch available).

---

## Architecture Patterns

### Recommended Project Structure

```
app/(dashboard)/procurement/
├── page.tsx                        ← redirect to /procurement/suppliers
├── suppliers/
│   ├── page.tsx                    ← list + modal CRUD (RSC)
│   └── [id]/
│       └── page.tsx                ← detail page: contacts/products/negotiations tabs
├── purchases/
│   ├── page.tsx                    ← list + modal CRUD (RSC)
│   └── [id]/
│       └── page.tsx                ← detail: items + payments
└── plan/
    └── page.tsx                    ← MVP forecast view (new, fresh)

app/actions/
├── suppliers.ts                    ← CRUD Supplier + contacts + product links + negotiations
└── purchases.ts                    ← CRUD Purchase + items + payments

app/api/
└── cbr-rate-sync/
    └── route.ts                    ← GET handler (called by dispatcher)

lib/
├── cbr-rates.ts                    ← fetchCbrRates() + getLatestRate(code)
└── procurement-math.ts             ← pure: computeDepositDueDate, computeBalanceDueDate,
                                       recomputePaymentFromPercent, recomputePaymentFromAmount

components/procurement/
├── SuppliersTable.tsx              ← sticky table (raw HTML pattern)
├── SupplierModal.tsx               ← CRUD modal
├── SupplierContactsTab.tsx         ← contacts section on detail page
├── SupplierProductsTab.tsx         ← product links section
├── NegotiationsTab.tsx             ← negotiations section
├── PurchasesTable.tsx              ← sticky table
├── PurchaseModal.tsx               ← CRUD modal (items + auto-payments)
├── PurchasePaymentsCard.tsx        ← multi-payment UI
├── ProcurementPlanTable.tsx        ← /procurement/plan MVP
└── ProcurementFilters.tsx          ← cascading filters

tests/
└── procurement-math.test.ts        ← golden tests for date + amount computation
```

### Pattern 1: Manual SQL Migration (partial unique + new enums)

Prisma does not support partial unique indexes via `@@unique`. All partial uniques in this project use manual SQL migrations. The established pattern (from `20260405_partial_indexes/migration.sql` and `20260609_phase21_credits/migration.sql`):

```sql
-- New enums (Phase 20)
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'PROCUREMENT';
-- Note: PROCUREMENT already exists! Do NOT add it again.
-- But new PurchaseStatus, PaymentStatus, DeliveryType, ContactMethod,
-- SupplierContactType enums MUST be created as:
CREATE TYPE "PurchaseStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
CREATE TYPE "PaymentStatus" AS ENUM ('PLANNED', 'PAID', 'OVERDUE');
CREATE TYPE "DeliveryType" AS ENUM ('CARGO', 'WHITE');
CREATE TYPE "ContactMethod" AS ENUM ('WECHAT', 'PHONE', 'ALIBABA', 'OTHER');
CREATE TYPE "SupplierContactType" AS ENUM ('SUPPLIER_MANAGER', 'SUPPLIER_BOSS');

-- Partial unique for SupplierProductLink
CREATE UNIQUE INDEX "SupplierProductLink_supplierId_productId_key"
  ON "SupplierProductLink"("supplierId", "productId")
  WHERE "productId" IS NOT NULL;
```

Note: In `prisma/schema.prisma`, the enum values must be listed even though the `@@unique` partial predicate cannot be expressed — add `@@index` instead and document the manual index in a comment on the model.

### Pattern 2: Soft Delete (Supplier)

Identical to Product soft delete. Filter clause in all active queries:
```typescript
// Source: prisma/schema.prisma Product model
where: { deletedAt: null }
```
Server actions: `softDeleteSupplier` sets `deletedAt: new Date()`, does NOT cascade to child tables. `Purchase` records with this supplierId are preserved regardless.

### Pattern 3: Nested CRUD (Employee → Supplier template)

```typescript
// Source: app/actions/employees.ts — pattern for supplier contacts
// In createSupplier / updateSupplier:
await prisma.$transaction(async (tx) => {
  const supplier = await tx.supplier.upsert(...)
  
  // Delete removed contacts
  await tx.supplierContact.deleteMany({
    where: { supplierId: supplier.id, id: { notIn: keepIds } }
  })
  
  // Upsert remaining
  for (const contact of contacts) {
    await tx.supplierContact.upsert({
      where: { id: contact.id ?? "__new__" },
      create: { supplierId: supplier.id, ...contact },
      update: { ...contact },
    })
  }
})
```

isPrimary constraint (one per supplierId+type) — enforce in server action:
```typescript
// Before upsert, if setting isPrimary=true for a contact:
await tx.supplierContact.updateMany({
  where: { supplierId, type: contact.type, id: { not: contact.id } },
  data: { isPrimary: false },
})
```

### Pattern 4: CBR Rates Integration

```typescript
// lib/cbr-rates.ts — verified against live endpoint 2026-06-09
interface CbrValute {
  ID: string
  NumCode: string
  CharCode: string  // "CNY", "USD", "EUR", etc.
  Nominal: number   // e.g. 1 for USD, 10 for CNY
  Name: string
  Value: number     // rate for Nominal units, e.g. 73.2644 per 1 USD
  Previous: number  // previous business day rate
}

interface CbrResponse {
  Date: string        // "2026-06-09T11:30:00+03:00"
  PreviousDate: string
  Timestamp: string   // last update timestamp
  Valute: Record<string, CbrValute>
}

export async function fetchCbrRates(): Promise<CbrResponse> {
  // Plain Node.js fetch WORKS — no TLS fingerprint issues (unlike WB v4)
  const res = await fetch("https://www.cbr-xml-daily.ru/daily_json.js", {
    cache: "no-store",
  })
  if (!res.ok) throw new Error(`CBR fetch failed: ${res.status}`)
  return res.json() as Promise<CbrResponse>
}

// rateToRub = Valute[code].Value / Valute[code].Nominal
// e.g. CNY: Value=8.1, Nominal=10 → 0.81 RUB per 1 CNY
export function ratePerUnit(valute: CbrValute): number {
  return valute.Value / valute.Nominal
}

export async function getLatestRate(
  code: string,
  prismaClient: PrismaClient
): Promise<{ rateToRub: Decimal; date: Date } | null> {
  // Fallback to latest available stored rate with a warning if today missing
  const rate = await prismaClient.currencyRate.findFirst({
    where: { code },
    orderBy: { date: "desc" },
  })
  return rate ? { rateToRub: rate.rateToRub, date: rate.date } : null
}
```

### Pattern 5: Dispatcher Extension (CBR cron)

```typescript
// app/api/cron/dispatch/route.ts — add after advUpdSyncTime block
// New AppSetting keys: "cbrRateSyncCronTime" (default "12:00"), "cbrRateSyncLastRun"
// Add to the findMany where.key.in array:
"cbrRateSyncCronTime", "cbrRateSyncLastRun"

// Add cron block:
const cbrTime = settings.cbrRateSyncCronTime ?? "12:00"
const cbrLastRun = settings.cbrRateSyncLastRun ?? null
if (shouldFireCron({ currentHHMM, storedTime: cbrTime, lastRunDate: cbrLastRun, today })) {
  try {
    const { GET: cbrHandler } = await import("../cbr-rate-sync/route")
    const res = await cbrHandler(req)
    fired.push(`cbr:${res.status}`)
  } catch (e) {
    console.error("[dispatch] cbr error:", e)
    fired.push("cbr:error")
  }
}
```

The cbr-rate-sync route handler: fetch CBR JSON → upsert CurrencyRate per Valute entry → update AppSetting cbrRateSyncLastRun.

### Pattern 6: Pure Payment Math Helper

```typescript
// lib/procurement-math.ts — pure, no imports, vitest-safe

/** дата депозита = createdAt + 3 calendar days */
export function computeDepositDueDate(createdAt: Date): Date {
  const d = new Date(createdAt)
  d.setDate(d.getDate() + 3)
  return d
}

/** дата баланса = depositDueDate + leadTimeDays */
export function computeBalanceDueDate(depositDueDate: Date, leadTimeDays: number): Date {
  const d = new Date(depositDueDate)
  d.setDate(d.getDate() + leadTimeDays)
  return d
}

/**
 * Пользователь вводит percent (0-100) → вычислить amount.
 * totalAmount = sum(PurchaseItem.quantity * unitPrice).
 * amount = totalAmount * percent / 100, rounded to 2 decimal places.
 */
export function recomputeAmountFromPercent(
  totalAmount: number,
  percent: number
): number {
  return Math.round(totalAmount * percent) / 100
}

/**
 * Пользователь вводит amount → вычислить percent.
 * percent = amount / totalAmount * 100, rounded to 2 decimal places.
 * Guard: totalAmount === 0 → return 0.
 */
export function recomputePercentFromAmount(
  totalAmount: number,
  amount: number
): number {
  if (totalAmount === 0) return 0
  return Math.round((amount / totalAmount) * 10000) / 100
}

/** Сумма всех PurchaseItem (quantity * unitPrice). */
export function computePurchaseTotal(
  items: Array<{ quantity: number; unitPrice: number }>
): number {
  return items.reduce((sum, i) => sum + i.quantity * i.unitPrice, 0)
}
```

### Pattern 7: Quick-Select Buyer (UX, D-01)

```typescript
// In SupplierModal / supplier form — buyer employee selector
// Two-section UI: «Часто выбираемые» (distinct buyerEmployeeId from existing Suppliers)
// then «Все сотрудники»

// Server-side query:
const frequentBuyers = await prisma.supplier.findMany({
  where: { deletedAt: null, buyerEmployeeId: { not: null } },
  select: { buyerEmployeeId: true },
  distinct: ["buyerEmployeeId"],
})
const frequentBuyerIds = new Set(
  frequentBuyers.map((s) => s.buyerEmployeeId).filter(Boolean)
)
// Pass frequentBuyerIds to form component; UI sorts these to top
```

### Pattern 8: Existing nav mutation (Purchase-Plan rename)

Current state in `components/layout/nav-items.ts` line 42:
```typescript
{ section: "PROCUREMENT", href: "/purchase-plan", label: "План закупок", icon: "ShoppingCart" },
```

Phase 20 changes:
1. Rename this entry label to `"План закупок (временный)"`.
2. Add new nav group "Управление закупками" with:
   - `{ section: "PROCUREMENT", href: "/procurement/suppliers", label: "Поставщики", icon: "Truck" }`
   - `{ section: "PROCUREMENT", href: "/procurement/purchases", label: "Закупки", icon: "PackageCheck" }`
   - `{ section: "PROCUREMENT", href: "/procurement/plan", label: "План закупок", icon: "ShoppingCart" }`
3. The old `/purchase-plan` remains but its label changes. Position of the whole PROCUREMENT group: after COST (Себестоимость партий), before SALES (План продаж).

### Pattern 9: Decimal serialization (Prisma → client)

Prisma Decimal values are instances of `Decimal.js`. They do NOT serialize automatically to plain numbers when passed across RSC → client boundary. Established pattern in the project (Phase 21 Loan, Phase 7 ProductCost):

```typescript
// In RSC page or server action, convert before returning to client:
const amount = loan.amount.toNumber()       // Decimal → number
const rate = loan.annualRatePct.toFixed(3)  // Decimal → string with precision

// OR: pass as string and parse client-side with parseFloat()
// The project uses .toNumber() for numeric calculations (pricing-math.ts)
// and .toFixed(2) / toLocaleString for display.
```

For procurement: all Decimal fields (depositPct, balancePct, unitPrice, amount, rateToRub) must be converted to `number` before crossing the RSC→client boundary.

### Anti-Patterns to Avoid
- **Using shadcn `<Table>` in sticky tables:** Breaks sticky header (adds internal overflow container). Use raw `<table>` + `<thead className="bg-background">`.
- **Transparent bg on sticky cells:** `bg-muted/40` leaks scroll content through. Use solid `bg-muted` or `bg-background`.
- **`z.coerce.number()` with zodResolver RHF 7.72 + Zod 4:** Use `z.number()` + `valueAsNumber` in input registration.
- **`git commit -am` for new files:** Always `git add -A && git commit`.
- **Assuming PROCUREMENT section label covers new routes:** `/procurement/*` is NOT in `lib/sections.ts` yet — must add. Current only `/purchase-plan` maps to PROCUREMENT.
- **Forgetting `lib/section-labels.ts`:** SECTION_OPTIONS already has `PROCUREMENT` entry (label "План закупок") — update label to "Управление закупками".
- **Parallel purchases redirect:** `/procurement` must redirect to `/procurement/suppliers`, not render anything itself.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Cascading filters | Custom filter state machine | Pattern in ProcurementFilters.tsx from ProductFilters.tsx | Established pattern with URL searchParams |
| Hierarchical product sort | Custom sort comparator | `PRODUCT_HIERARCHY_ORDER_BY` / `compareProductsByHierarchy` from lib/product-order.ts | Already handles all nullable relations |
| Cron scheduling guard | Custom time-based gate | `shouldFireCron` / `getMskTodayString` from lib/wb-cron-schedule.ts | MSK timezone, daily dedup |
| Multi-select dropdowns | Custom multi-select | `MultiSelectDropdown` from components/ui/multi-select-dropdown.tsx | Project standard |
| Creatable combobox | Custom dropdown+create | `CreatableCombobox` from components/ui/creatable-combobox.tsx | Project standard for supplier/employee pickers |
| Decimal rounding | Custom math | Use `Math.round(n * 100) / 100` pattern (established in pricing-math.ts) | Avoids floating-point drift |
| Toast notifications | Custom toast | `toast` from `sonner` | Project standard |
| RBAC in server actions | Custom auth check | `requireSection("PROCUREMENT", "MANAGE")` from lib/rbac.ts | Covers SUPERADMIN bypass + sectionRoles |

**Key insight:** Every structural pattern in Phase 20 has a canonical implementation already in the codebase. Research found no need for new external libraries.

---

## Existing Purchase-Plan — What "Don't Touch" Means

The existing MVP at `/purchase-plan` consists of exactly:
1. `app/(dashboard)/purchase-plan/page.tsx` — RSC, uses `requireSection("PROCUREMENT")`, renders `ProcurementTable` with `ProductIncoming` data
2. `app/actions/procurement.ts` — `upsertProductIncoming` server action, calls `revalidatePath("/purchase-plan")`, `/stock`, `/sales-plan`
3. `prisma/schema.prisma` model `ProductIncoming` — `productId @unique`, `orderedQty Int`, `expectedDate Date?`, `plannedSalesPerDay Float?`
4. Migration `20260526_product_incoming/migration.sql` — applied to production
5. Components: `components/procurement/ProcurementTable.tsx`, `ProcurementFilters.tsx`, `ProcurementSearchInput.tsx`

**Phase 20 must NOT modify any of these files.** The only change is:
- `components/layout/nav-items.ts` line 42: change label from `"План закупок"` to `"План закупок (временный)"`.
- `components/layout/section-titles.ts` line 23: change `"План закупок"` to `"План закупок (временный)"` for the `/purchase-plan` match.

The new `/procurement/plan` is a fresh page using entirely new components. Future data migration from ProductIncoming to the new plan is deferred.

---

## New Section Checklist (from CLAUDE.md)

PROCUREMENT section already exists. However, new routes `/procurement/*` must be registered:

| Step | File | Change Required |
|------|------|----------------|
| 1 | `prisma/schema.prisma` | NO enum change needed (PROCUREMENT exists). New enums: PurchaseStatus, PaymentStatus, DeliveryType, ContactMethod, SupplierContactType. New models: Supplier, SupplierContact, SupplierProductLink, Negotiation, NegotiationProduct, NegotiationParticipant, Purchase, PurchaseItem, PurchasePayment, CurrencyRate. |
| 2 | `lib/sections.ts` | Add `"/procurement": "PROCUREMENT"` — middleware will protect all `/procurement/*` routes. Remove nothing (keep `/purchase-plan: "PROCUREMENT"`). |
| 3 | `components/layout/section-titles.ts` | Add entries for /procurement/suppliers, /procurement/suppliers/[id], /procurement/purchases, /procurement/purchases/[id], /procurement/plan. Also rename /purchase-plan title. |
| 4 | `components/layout/nav-items.ts` | Add Truck + PackageCheck icons import. Add 3 new PROCUREMENT nav items. Rename old "План закупок" → "План закупок (временный)". |
| 5 | `lib/section-labels.ts` | SECTION_OPTIONS PROCUREMENT entry exists with label "План закупок" — update label to "Управление закупками". |
| 6 | `app/(dashboard)/dashboard/page.tsx` | Optional: update PROCUREMENT card label/description. |
| 7 | RBAC provisioning | After deploy: provision PROCUREMENT access to relevant users (MANAGE for procurement team). See MEMORY.md feedback_zoiten_new_section_rbac.md. |

---

## Common Pitfalls

### Pitfall 1: ERP_SECTION.PROCUREMENT Already Exists
**What goes wrong:** Migration tries to `ALTER TYPE "ERP_SECTION" ADD VALUE 'PROCUREMENT'` → PostgreSQL error: duplicate enum value.
**Why it happens:** Phase 21 credits migration uses `IF NOT EXISTS` guard — but PROCUREMENT was there from the start (schema.prisma line 27). Phase 20 must NOT re-add it.
**How to avoid:** The Phase 20 manual migration SQL must NOT include any `ALTER TYPE "ERP_SECTION"`. Only new custom enums (PurchaseStatus etc.) need `CREATE TYPE`.
**Warning signs:** Migration file contains `ADD VALUE.*PROCUREMENT`.

### Pitfall 2: /procurement Routes Not in middleware RBAC
**What goes wrong:** `/procurement/*` pages render without auth check because `lib/sections.ts` only has `/purchase-plan`.
**How to avoid:** Add `"/procurement": "PROCUREMENT"` to `SECTION_PATHS` in lib/sections.ts. Middleware uses `startsWith` matching (checked at path `/procurement` → catches all sub-routes).
**Warning signs:** Visiting `/procurement/suppliers` without login doesn't redirect.

### Pitfall 3: Decimal Serialization Across RSC Boundary
**What goes wrong:** Passing `Decimal` instances from Prisma query directly as RSC props to client components → React throws "Only plain objects can be passed".
**How to avoid:** In RSC page.tsx, convert before spreading: `amount: row.amount.toNumber()`, `percent: row.depositPct?.toNumber() ?? null`. Pattern confirmed in Phase 21 credits/schedule/page.tsx.
**Warning signs:** TypeError at runtime "Only plain objects" when navigating to procurement pages.

### Pitfall 4: isPrimary Constraint Race Condition
**What goes wrong:** Two contacts of same type both set isPrimary=true if requests arrive in parallel.
**How to avoid:** In server action, do `updateMany({ isPrimary: false })` for siblings BEFORE upserting the target contact — all within the same `$transaction`.
**Warning signs:** Multiple isPrimary=true rows for same (supplierId, type) in DB.

### Pitfall 5: CBR Update Timing
**What goes wrong:** Cron at 12:00 MSK runs before CBR publishes (CBR updates ~11:30 MSK but may delay on holidays). Fetching returns PreviousDate data.
**How to avoid:** Check `response.Date` against MSK today. If `response.Date < today`, store the data anyway (it's the latest available) but set a `isStale: true` flag or log warning. The UI fallback (getLatestRate) already handles this by returning most recent stored rate.
**Warning signs:** `CurrencyRate.date` is yesterday's date even after noon sync.

### Pitfall 6: NegotiationParticipant Polymorphic Constraint
**What goes wrong:** Server action allows saving a participant with both `employeeId` and `supplierContactId` populated, violating the "exactly one of three" constraint.
**How to avoid:** Zod discriminated union or explicit validation: `if ([employeeId, supplierContactId, customName].filter(Boolean).length !== 1) return error`.
**Warning signs:** A participant joins with null employeeId AND null supplierContactId AND null customName.

### Pitfall 7: PurchaseItem unitPrice Float vs Decimal
**What goes wrong:** Using `Float` for unitPrice in PurchaseItem (as in Phase 7 pricing) loses precision for micro-prices (e.g. 0.0001 CNY). D-06 specifies `Decimal(14,4)`.
**How to avoid:** Use `@db.Decimal(14, 4)` in schema.prisma and `Decimal` in TypeScript. Convert to `.toNumber()` for arithmetic in procurement-math.ts.
**Warning signs:** Unit prices showing rounding errors in payment calculations.

### Pitfall 8: revalidatePath Scope for /procurement
**What goes wrong:** Server actions for purchases revalidate `/procurement/purchases` but not `/procurement/suppliers/[id]` — changes in purchases don't refresh supplier detail page payment summary.
**How to avoid:** Revalidate both `/procurement/purchases` and `/procurement/suppliers` after purchase mutations that affect a supplier's data.
**Warning signs:** Supplier detail page shows stale purchase count after creating a new purchase.

---

## CBR Rates — Detailed Integration Plan

### Endpoint Verification (HIGH confidence — verified live 2026-06-09)

```
URL: https://www.cbr-xml-daily.ru/daily_json.js
Method: GET, no auth, no API key
Response: Plain JSON (not JSONP despite .js extension)
Date field: "2026-06-09T11:30:00+03:00" (today's date = published today)
Timestamp: "2026-06-09T16:00:00+03:00"
CNY example: { CharCode: "CNY", Nominal: 10, Value: 8.1XXX, Previous: 8.0XXX }
USD example: { CharCode: "USD", Nominal: 1, Value: 73.2644, Previous: 73.4689 }
```

**Rate calculation:** `rateToRub = Value / Nominal`. For CNY: 8.1 / 10 = 0.81 RUB per 1 CNY.

**Node.js fetch compatibility:** Confirmed — plain HTTPS, no TLS fingerprint restriction. Standard `fetch()` works. No curl workaround needed (unlike WB v4 card.wb.ru).

**Update schedule:** Published each working day at approximately 11:30 MSK. Dispatcher cron at 12:00 MSK gives 30-minute buffer. On weekends/holidays, CBR does not publish — the dispatcher fires but CBR returns the previous business day's rates (same `Date` as yesterday). The cron handler should detect this and skip upsert (or upsert the same data idempotently via `@@unique([date, code])`).

**CurrencyRate schema:**
```sql
CREATE TABLE "CurrencyRate" (
  "id"         TEXT NOT NULL,
  "date"       DATE NOT NULL,          -- from response.Date parsed to date
  "code"       TEXT NOT NULL,          -- CharCode: "CNY", "USD", "EUR"
  "nominal"    INTEGER NOT NULL,       -- Valute.Nominal
  "rateToRub"  DECIMAL(14, 6) NOT NULL,  -- Valute.Value / Valute.Nominal
  "syncedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CurrencyRate_date_code_key" ON "CurrencyRate"("date", "code");
```

**Which currencies to store:** All from Valute object (≈34 currencies). Filtering to only CNY/USD/EUR is premature — store all, query by code. The upsert loop iterates Object.values(response.Valute).

---

## Partial Unique Indexes — Manual Migration Pattern

**Confirmed pattern** from `prisma/migrations/20260405_partial_indexes/migration.sql`:

```sql
-- Project established pattern for partial unique indexes:
-- 1. Create UNIQUE INDEX with WHERE clause (not @@unique in schema)
-- 2. In schema.prisma: use @@index (not @@unique) with a comment explaining the manual index
-- 3. Never add Prisma @@unique that would conflict with the manual partial index

-- For Phase 20 SupplierProductLink:
CREATE UNIQUE INDEX "SupplierProductLink_supplierId_productId_partial_key"
  ON "SupplierProductLink"("supplierId", "productId")
  WHERE "productId" IS NOT NULL;

-- In schema.prisma (comment-only, no @@unique):
// Partial unique index: @@unique([supplierId, productId]) WHERE productId IS NOT NULL
// Enforced by manual SQL index in migration — Prisma does not support partial @@unique
@@index([supplierId, productId])
```

For the isPrimary constraint (one per supplierId+type): NOT a partial unique index — enforced in server action (not in DB) because the constraint is conditional on a value, not null-predicate.

---

## Code Examples

### Procurement Math — Golden Test Setup

```typescript
// tests/procurement-math.test.ts
import { describe, it, expect } from "vitest"
import {
  computeDepositDueDate,
  computeBalanceDueDate,
  recomputeAmountFromPercent,
  recomputePercentFromAmount,
  computePurchaseTotal,
} from "@/lib/procurement-math"

describe("computeDepositDueDate", () => {
  it("adds exactly 3 calendar days", () => {
    const created = new Date("2026-06-09T10:00:00Z")
    const due = computeDepositDueDate(created)
    expect(due.toISOString().slice(0, 10)).toBe("2026-06-12")
  })

  it("crosses month boundary", () => {
    const created = new Date("2026-06-29T10:00:00Z")
    const due = computeDepositDueDate(created)
    expect(due.toISOString().slice(0, 10)).toBe("2026-07-02")
  })
})

describe("computeBalanceDueDate", () => {
  it("depositDue + 30 leadDays = 30 days later", () => {
    const deposit = new Date("2026-06-12")
    const balance = computeBalanceDueDate(deposit, 30)
    expect(balance.toISOString().slice(0, 10)).toBe("2026-07-12")
  })
})

describe("recomputeAmountFromPercent", () => {
  // totalAmount = 10 items × 500 CNY = 5000 CNY; deposit 30%
  it("30% of 5000 = 1500.00", () => {
    expect(recomputeAmountFromPercent(5000, 30)).toBe(1500)
  })

  it("handles non-round percent: 33.33% of 3000 ≈ 999.9", () => {
    const result = recomputeAmountFromPercent(3000, 33.33)
    expect(result).toBeCloseTo(999.9, 1)
  })
})

describe("recomputePercentFromAmount", () => {
  it("1500 / 5000 = 30.00%", () => {
    expect(recomputePercentFromAmount(5000, 1500)).toBe(30)
  })

  it("guard: totalAmount === 0 → 0", () => {
    expect(recomputePercentFromAmount(0, 100)).toBe(0)
  })
})
```

### Server Action — createPurchase with auto-payments

```typescript
// app/actions/purchases.ts (pattern)
"use server"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { revalidatePath } from "next/cache"
import {
  computeDepositDueDate,
  computeBalanceDueDate,
  recomputeAmountFromPercent,
  computePurchaseTotal,
} from "@/lib/procurement-math"

export async function createPurchase(input: CreatePurchaseInput) {
  await requireSection("PROCUREMENT", "MANAGE")
  
  return await prisma.$transaction(async (tx) => {
    const purchase = await tx.purchase.create({
      data: {
        supplierId: input.supplierId,
        currency: input.currency ?? "CNY",
        status: "PLANNED",
        // ...other fields
      },
    })

    // Create items
    const items = await Promise.all(
      input.items.map((item) =>
        tx.purchaseItem.create({
          data: {
            purchaseId: purchase.id,
            productId: item.productId,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
          },
        })
      )
    )

    // Total for payment computation
    const total = computePurchaseTotal(
      items.map((i) => ({
        quantity: i.quantity,
        unitPrice: Number(i.unitPrice),
      }))
    )

    // Deposit defaults from SupplierProductLink (first item's link or supplier default)
    const depositPct = input.depositPct ?? 30
    const balancePct = input.balancePct ?? 70
    const leadTimeDays = input.leadTimeDays ?? 45
    const createdAt = purchase.createdAt

    const depositDue = computeDepositDueDate(createdAt)
    const balanceDue = computeBalanceDueDate(depositDue, leadTimeDays)

    await tx.purchasePayment.createMany({
      data: [
        {
          purchaseId: purchase.id,
          type: "DEPOSIT",
          ordinal: 1,
          percent: depositPct,
          amount: recomputeAmountFromPercent(total, depositPct),
          currency: input.currency ?? "CNY",
          dueDate: depositDue,
          status: "PLANNED",
        },
        {
          purchaseId: purchase.id,
          type: "BALANCE",
          ordinal: 1,
          percent: balancePct,
          amount: recomputeAmountFromPercent(total, balancePct),
          currency: input.currency ?? "CNY",
          dueDate: balanceDue,
          status: "PLANNED",
        },
      ],
    })

    revalidatePath("/procurement/purchases")
    revalidatePath("/procurement/suppliers")
    return { ok: true, id: purchase.id }
  })
}
```

### CBR Rate Sync Route

```typescript
// app/api/cbr-rate-sync/route.ts
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getMskTodayString } from "@/lib/wb-cron-schedule"
import { fetchCbrRates, ratePerUnit } from "@/lib/cbr-rates"

export const runtime = "nodejs"
export const maxDuration = 60

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const data = await fetchCbrRates()
  const rateDate = new Date(data.Date)  // "2026-06-09T11:30:00+03:00"
  const syncedAt = new Date()

  let upserted = 0
  for (const valute of Object.values(data.Valute)) {
    await prisma.currencyRate.upsert({
      where: { date_code: { date: rateDate, code: valute.CharCode } },
      create: {
        date: rateDate,
        code: valute.CharCode,
        nominal: valute.Nominal,
        rateToRub: ratePerUnit(valute),
        syncedAt,
      },
      update: {
        nominal: valute.Nominal,
        rateToRub: ratePerUnit(valute),
        syncedAt,
      },
    })
    upserted++
  }

  await prisma.appSetting.upsert({
    where: { key: "cbrRateSyncLastRun" },
    create: { key: "cbrRateSyncLastRun", value: getMskTodayString() },
    update: { value: getMskTodayString() },
  })

  return NextResponse.json({ ok: true, upserted, rateDate: data.Date })
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Single payment fields in Purchase | Separate PurchasePayment table with ordinal | Phase 20 design | Supports Deposit 1/2/3 + Balance 1/2/3 |
| ProductIncoming as "plan" MVP | Renamed to временный; new /procurement/plan built fresh | Phase 20 | Data preserved, new plan independent |
| Manual enum management | `ALTER TYPE ... ADD VALUE IF NOT EXISTS` pattern | Phase 21 | Safe re-runs; PROCUREMENT already exists |

**Deprecated/outdated:**
- `/purchase-plan` nav label "План закупок": updating to "План закупок (временный)" in Phase 20 Wave 0.
- `lib/section-labels.ts` PROCUREMENT label "План закупок": updating to "Управление закупками".

---

## Open Questions

1. **New /procurement/plan scope**
   - What we know: D-10 says "light MVP/forecast, уточняется в research/planning". CONTEXT.md deferred full forecast to v2.
   - What's unclear: Does the MVP just show ProductIncoming data in a different view, or something new? Is there a minimum viable feature set beyond "a page with filters"?
   - Recommendation: Plan as a simple RSC table showing products with deficit (from stock data), their leadTimeDays from SupplierProductLink, and a computed "order by" date. No new DB writes needed for v1.

2. **PaymentStatus OVERDUE computation**
   - What we know: D-08 says "OVERDUE computed live (dueDate < now AND paidDate IS NULL), status stored as cached field".
   - What's unclear: When is the cached status updated? At every page load via server action? Daily cron?
   - Recommendation: Compute OVERDUE dynamically at read time in RSC (do not cache in DB unless queries become slow). The DB status field is used only for PAID (set by user action) and PLANNED (default). OVERDUE is a derived read-time label.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js fetch | CBR rates API | ✓ | Node.js 24.14.0 (native fetch) | — |
| PostgreSQL 16 | All DB models | ✓ | Production VPS | — |
| Prisma Client | ORM | ✓ | 7.8.0 | — |
| vitest | Unit tests | ✓ | 4.x (in project) | — |
| CBR XML daily feed | Currency rates | ✓ | Public, no auth | cbr.ru XML feed (requires xml2js) |

**Missing dependencies with no fallback:** None.

**Note:** CBR feed verified live on 2026-06-09 — returns current data, plain JSON, accessible via standard fetch.

---

## Validation Architecture

Nyquist validation is enabled (config.json: `nyquist_validation: true`).

### Test Framework
| Property | Value |
|----------|-------|
| Framework | vitest 4.x |
| Config file | vitest.config.ts (root, with `@` alias → project root) |
| Quick run command | `npm run test -- --run tests/procurement-math.test.ts` |
| Full suite command | `npm run test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| D-08 deposit date | depositDueDate = createdAt + 3 calendar days | unit | `npm run test -- --run tests/procurement-math.test.ts` | ❌ Wave 0 |
| D-08 balance date | balanceDueDate = depositDueDate + leadTimeDays | unit | same | ❌ Wave 0 |
| D-08 percent→amount | amount = totalAmount × pct / 100 | unit | same | ❌ Wave 0 |
| D-08 amount→percent | percent = amount / totalAmount × 100 | unit | same | ❌ Wave 0 |
| D-09 CBR parsing | fetchCbrRates() parses Valute structure, ratePerUnit = Value/Nominal | unit (mocked) | `npm run test -- --run tests/cbr-rates.test.ts` | ❌ Wave 0 |
| D-09 CBR fallback | getLatestRate returns most-recent stored rate when today missing | unit | same | ❌ Wave 0 |
| D-03 partial unique | SupplierProductLink only enforces unique per non-null productId | manual SQL verify | — | Manual |
| D-02 isPrimary | Only one isPrimary=true per (supplierId, type) | unit (mock tx) | `npm run test -- --run tests/supplier-actions.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `npm run test -- --run tests/procurement-math.test.ts`
- **Per wave merge:** `npm run test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `tests/procurement-math.test.ts` — covers D-08 date/amount/percent formulas (golden test)
- [ ] `tests/cbr-rates.test.ts` — covers D-09 CBR parsing + ratePerUnit + getLatestRate fallback (mocked fetch)
- [ ] `tests/supplier-actions.test.ts` — covers isPrimary constraint enforcement (mock prisma $transaction)

*(Existing test infrastructure covers vitest config, `@` alias, mock patterns — no framework install needed)*

---

## Sources

### Primary (HIGH confidence)
- Live verification: `https://www.cbr-xml-daily.ru/daily_json.js` — JSON structure confirmed 2026-06-09
- `C:\Users\User\zoiten-pro\prisma\schema.prisma` — confirmed PROCUREMENT enum exists (line 27), Employee/Loan model patterns
- `C:\Users\User\zoiten-pro\prisma\migrations\20260405_partial_indexes\migration.sql` — partial unique pattern
- `C:\Users\User\zoiten-pro\prisma\migrations\20260609_phase21_credits\migration.sql` — manual migration SQL pattern with CREATE TYPE AS ENUM
- `C:\Users\User\zoiten-pro\app\api\cron\dispatch\route.ts` — dispatcher extension point verified
- `C:\Users\User\zoiten-pro\lib\wb-cron-schedule.ts` — shouldFireCron + getMskTodayString
- `C:\Users\User\zoiten-pro\app\(dashboard)\purchase-plan\page.tsx` — existing MVP scope confirmed
- `C:\Users\User\zoiten-pro\app\actions\procurement.ts` — existing server action scope confirmed
- `C:\Users\User\zoiten-pro\components\layout\nav-items.ts` — current nav state, confirmed PROCUREMENT entry
- `C:\Users\User\zoiten-pro\lib\sections.ts` — confirms `/procurement` missing from SECTION_PATHS
- `C:\Users\User\zoiten-pro\lib\section-labels.ts` — confirms PROCUREMENT label needs updating
- `C:\Users\User\zoiten-pro\lib\pricing-math.ts` — pure helper pattern template
- `C:\Users\User\zoiten-pro\tests\loan-math.test.ts` — vitest golden test pattern

### Secondary (MEDIUM confidence)
- CLAUDE.md project instructions — sticky table pattern, cascading filters, new section checklist
- 20-CONTEXT.md decisions D-01 through D-21 — all locked decisions

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in project, versions verified
- Architecture: HIGH — all patterns have canonical implementations in codebase
- CBR API: HIGH — endpoint verified live with real response
- Partial unique migration: HIGH — exact pattern confirmed in existing migrations
- Pitfalls: HIGH — confirmed from CLAUDE.md and codebase inspection
- /procurement/plan MVP scope: LOW — CONTEXT.md deferred details to research/planning; Open Question #1 addresses this

**Research date:** 2026-06-09
**Valid until:** 2026-08-09 (stable domain — no external API changes expected)
