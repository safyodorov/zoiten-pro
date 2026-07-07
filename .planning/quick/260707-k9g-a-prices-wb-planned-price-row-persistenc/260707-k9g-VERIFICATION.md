---
quick_id: 260707-k9g
verified: 2026-07-07T15:10:00Z
status: passed
score: 6/6 must-haves verified
---

# Quick Task 260707-k9g Verification Report

**Task Goal:** Фаза A — Плановые цены в /prices/wb: WbCard.plannedSellerPrice/plannedSellerDiscountPct + миграция; строка «Плановая» после «Текущей» (по умолчанию = текущей, оранжевая плашка + бейдж); редактирование+сохранение через savePlannedPrice (RBAC MANAGE, null=сброс); интеграция базовой цены в план продаж (avgPriceRub ← plannedProductPrice ?? avgPriceRub, engine/types не тронуты). Фаза B (std-комиссия/хранение/логистика/тарифы/коэффициенты/ИЛ) вне scope.

**Verified:** 2026-07-07T15:10:00Z
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Под «Текущая» появляется строка «Плановая» с жёлто-оранжевой плашкой + бейджем | ✓ VERIFIED | `page.tsx:637-648` пушит `{ type: "planned", label: "Плановая", ... }` сразу после current-push; `PriceCalculatorTable.tsx:1000-1001` stripClass `border-l-orange-500 bg-orange-100/50`; badge `row.type === "planned"` at line 1272-1279 |
| 2 | По умолчанию плановая = текущей (цена, скидка, весь расчёт) | ✓ VERIFIED | `page.tsx:627-631`: `plannedSellerDiscountPct = card.plannedSellerDiscountPct ?? currentSellerDiscountPct`; `plannedPriceBeforeDiscount = card.plannedSellerPrice != null ? deriveBefore(...) : currentPriceBeforeDiscount` — при обоих полях null строка идентична current |
| 3 | Клик по плановой строке → модалка → правка цены/скидки → persist на WbCard | ✓ VERIFIED | `PricingCalculatorDialog.tsx:358-373` `onSavePlanned` вызывает `savePlannedPrice(card.id, values.sellerPrice, values.sellerDiscountPct)`; `pricing.ts:499-528` `savePlannedPrice` — RBAC MANAGE, `prisma.wbCard.update` на оба поля, `revalidatePath`. Row-click wiring подтверждена (`PriceCalculatorTableWrapper.tsx:91,102`) |
| 4 | Сброс (пусто) → строка возвращается к текущей (поля → null) | ✓ VERIFIED | `PricingCalculatorDialog.tsx:374-385` `onResetPlanned` вызывает `savePlannedPrice(card.id, null, null)`; сервер пишет `plannedSellerPrice: null, plannedSellerDiscountPct: null` |
| 5 | План продаж использует плановую цену как базу (plannedSellerPrice ?? текущую) | ✓ VERIFIED | `lib/sales-plan/data.ts:138` select `+= plannedSellerPrice`; `:372-376` агрегат `plannedOrCurrent = card.plannedSellerPrice ?? card.price`; `:424-427` `avgPriceRub = plannedProductPrice` если есть; `engine.ts:185` `getPriceRub` (`level?.priceRub ?? product.avgPriceRub`) не тронут |
| 6 | tsc чист; golden pricing-math + sales-plan engine/plan-fact тесты зелёные | ✓ VERIFIED | `npx tsc --noEmit` → 0 errors (проверено повторно). `npx vitest run tests/pricing-math.test.ts tests/sales-plan-engine.test.ts tests/sales-plan-plan-fact.test.ts` → 3 files, 49/49 passed. Полный `npm run test` → 933/975 (42 предсуществующих fail в support/CRM/WB-sync доменах, не связаны с этой задачей) |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `prisma/schema.prisma` | `WbCard.plannedSellerPrice Float?`, `plannedSellerDiscountPct Int?` | ✓ VERIFIED | Lines 328-330, nullable, comment present |
| `prisma/migrations/20260707_wb_card_planned_price/migration.sql` | 2× `ADD COLUMN` nullable | ✓ VERIFIED | `ALTER TABLE "WbCard" ADD COLUMN "plannedSellerPrice" DOUBLE PRECISION;` + `"plannedSellerDiscountPct" INTEGER;` — applied on prod (confirmed via `\d "WbCard"` over SSH) |
| `app/(dashboard)/prices/wb/page.tsx` | Строка `type='planned'` после `current` | ✓ VERIFIED | Lines 626-648, exact match to plan spec |
| `components/prices/PriceCalculatorTable.tsx` | `PriceRowType += 'planned'`, stripClass + badge | ✓ VERIFIED | Line 56 type union; line 1000 stripClass; line 1272 badge |
| `app/actions/pricing.ts` | `savePlannedPrice(wbCardId, sellerPrice, sellerDiscountPct)` RBAC MANAGE | ✓ VERIFIED | Lines 499-528, exact match: validation, null→reset, revalidatePath |
| `components/prices/PricingCalculatorDialog.tsx` | Кнопки «Сохранить плановую цену»/«Сбросить плановую» для `type='planned'` | ✓ VERIFIED | Lines 617-635, `isPlannedRow` gate, calls `savePlannedPrice` |
| `lib/sales-plan/data.ts` | Базовая цена = `plannedProductPrice ?? avgPriceRub` + select `plannedSellerPrice` | ✓ VERIFIED | Lines 138, 349-350, 372-376, 420-427 |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `PricingCalculatorDialog.tsx` | `WbCard.plannedSellerPrice` | `savePlannedPrice` server action | ✓ WIRED | Import at line 43, called in `onSavePlanned`/`onResetPlanned`, server action does `prisma.wbCard.update` |
| `page.tsx` | `WbCard.plannedSellerPrice` | `card.plannedSellerPrice ?? currentPriceBeforeDiscount` at planned-row build | ✓ WIRED | Confirmed lines 627-631; `WbCard.findMany` has no `select` clause so new columns auto-available post-`prisma generate` |
| `lib/sales-plan/data.ts` | engine `getPriceRub` base | `avgPriceRub = plannedProductPrice ?? avgPriceRub` | ✓ WIRED | Confirmed lines 424-427; `avgPriceRub` flows unchanged into `ProductPlanInput` push (line ~502) → `engine.ts:185` consumes as-is |
| `PriceCalculatorTable.tsx` row click | `PricingCalculatorDialog` | `onRowClick` → `PriceCalculatorTableWrapper.tsx` | ✓ WIRED | `handleRowClick` passed to table (line 91), dialog rendered with selected row (line 102) — pre-existing pattern, `planned` type flows through unchanged |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| Planned row (page.tsx) | `card.plannedSellerPrice` | `WbCard` DB column (real Prisma query, no static fallback) | Yes | ✓ FLOWING |
| Sales-plan base price | `plannedProductPrice` | Aggregated from `card.plannedSellerPrice ?? card.price` across real `WbCard` rows fetched via `cardByNmId` select | Yes | ✓ FLOWING |
| `savePlannedPrice` | `plannedSellerPrice`/`plannedSellerDiscountPct` | `prisma.wbCard.update` — real DB write, confirmed via prod `\d "WbCard"` showing columns present | Yes | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| tsc type-check clean | `npx tsc --noEmit` | exit 0, no output | ✓ PASS |
| Golden pricing-math + sales-plan tests | `npx vitest run tests/pricing-math.test.ts tests/sales-plan-engine.test.ts tests/sales-plan-plan-fact.test.ts` | 3 files / 49 tests passed | ✓ PASS |
| Full test suite regression | `npm run test` | 933/975 passed; 42 pre-existing failures in unrelated support/CRM/WB-sync domains (verified file list matches SUMMARY's claim exactly — appeal-actions, customer-actions, merge-customers, messenger-ticket, response-templates, support-sync-*, wb-sync-route, wb-token-validate) | ✓ PASS |
| Migration applied on prod | `ssh ... sudo -u postgres psql -d zoiten_erp -c '\d "WbCard"'` | `plannedSellerPrice \| double precision`, `plannedSellerDiscountPct \| integer` present | ✓ PASS |
| Production service healthy | `curl -s -o /dev/null -w "%{http_code}" https://zoiten.pro` | 200 | ✓ PASS |
| Production systemd service active | `systemctl is-active zoiten-erp.service` | active | ✓ PASS |

### Requirements Coverage

Quick task (not phase-based) — no formal REQUIREMENTS.md entries expected. Plan-declared requirement tags (A1-schema, A2-row, A3-strip-badge, A4-edit-persist, A5-sales-plan) map 1:1 to the artifacts/truths verified above; all satisfied.

### Anti-Patterns Found

None. Scanned all 6 modified files (`app/actions/pricing.ts`, `components/prices/PricingCalculatorDialog.tsx`, `components/prices/PriceCalculatorTable.tsx`, `lib/sales-plan/data.ts`, `app/(dashboard)/prices/wb/page.tsx`, `prisma/schema.prisma`) for TODO/FIXME/placeholder/stub patterns — no matches (excluding legitimate `<Input placeholder=...>` UI hints).

### Phase B Scope Check

Confirmed NOT implemented (as required): no `WbBoxTariff` model in schema, no `calculatePricingStandard` function anywhere in codebase. Scope boundary respected.

### Human Verification Required

None blocking. Optional recommended UAT (per SUMMARY's own note, non-blocking since code-level wiring and production deployment are both confirmed):

1. **Visual color check in browser**
   **Test:** Open `/prices/wb`, locate a product's card rows.
   **Expected:** Row directly below «Текущая» is labeled «Плановая» with orange-tinted background/left-border, visually distinct from the amber calculated-price rows.
   **Why human:** Exact visual perception of color distinction (orange vs amber) is subjective; code-level classes are correct (`orange-500`/`orange-100` vs `amber-500`/`amber-50`) but final visual confirmation benefits from a human eye.

2. **End-to-end save/reset flow**
   **Test:** Click a «Плановая» row → modal opens → change seller price → click «Сохранить плановую цену» → page refresh confirms persisted value → click «Сбросить плановую» → row reverts to match «Текущая».
   **Why human:** Full browser interaction (dialog open/close, form state, toast messages) is code-verified but not executed in a live browser session during this check.

### Gaps Summary

No gaps found. All 6 must-have truths verified against actual code (not summary claims), all 7 artifacts present and substantive, all 4 key links wired, data-flow traced to real DB columns (not stubs/static), tsc clean, golden + sales-plan tests green, migration confirmed applied on production via direct SSH/psql inspection, production service active and responding 200. Phase B scope correctly excluded. No anti-patterns detected in any modified file.

---

_Verified: 2026-07-07T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
