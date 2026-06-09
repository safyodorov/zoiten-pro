---
phase: 20-procurement
plan: 05
subsystem: procurement-suppliers
tags: [suppliers, crud, server-actions, sticky-table, cascading-filters, tdd]
requires:
  - Phase 20-01 (Supplier/SupplierContact/SupplierProductLink/Negotiation schema + enums)
  - Phase 20-00 (tests/supplier-actions.test.ts RED stub)
provides:
  - lib/supplier-primary.ts (resolvePrimaryWrites pure helper, D-02)
  - app/actions/suppliers.ts (CRUD + nested + soft delete)
  - /procurement redirect + suppliers list + detail with 3 tabs
affects:
  - /procurement/suppliers (new)
  - /procurement/suppliers/[id] (new)
tech-stack:
  added: []
  patterns:
    - Pure import-free helper for vitest-safe enforcement (lib/supplier-primary.ts)
    - Employee nested-CRUD template (deleteMany notIn + upsert in $transaction)
    - CLAUDE.md sticky raw-HTML table (opaque bg-background, prefetch=false)
    - Cascading filters (ProductFilters template, URL-driven)
    - Decimal → string across RSC→client boundary
key-files:
  created:
    - lib/supplier-primary.ts
    - app/actions/suppliers.ts
    - app/(dashboard)/procurement/page.tsx
    - app/(dashboard)/procurement/suppliers/page.tsx
    - app/(dashboard)/procurement/suppliers/[id]/page.tsx
    - components/procurement/SupplierFilters.tsx
    - components/procurement/SuppliersTable.tsx
    - components/procurement/SupplierModal.tsx
    - components/procurement/SupplierContactsTab.tsx
    - components/procurement/SupplierProductsTab.tsx
    - components/procurement/NegotiationsTab.tsx
    - components/procurement/SupplierDetailTabs.tsx
  modified: []
decisions:
  - "isPrimary enforcement extracted into pure lib/supplier-primary.ts (resolvePrimaryWrites, last-wins) — vitest cannot load server action's next-auth chain"
  - "Supplier filters component named SupplierFilters (not ProcurementFilters) — name collision with existing /purchase-plan ProcurementFilters.tsx (do-not-touch MVP)"
  - "Contacts/product-links/negotiations edited on detail-page tabs; SupplierModal handles only base fields (name/buyer/cooperationSummary)"
  - "createSupplier runs resolvePrimaryWrites AFTER create (supplierId known); updateSupplier runs it before upsert"
metrics:
  duration: 8min
  tasks: 3
  files: 12
  completed: 2026-06-09
---

# Phase 20 Plan 05: Поставщики (Suppliers subsection) Summary

Supplier reference-data subsection: pure isPrimary helper (turns the 20-00 RED test GREEN), full Supplier CRUD server actions with nested contacts/product-links/negotiations and soft delete, the `/procurement` redirect, a sticky cascading-filter supplier list, and a detail page with Контакты / Товары / Переговоры tabs.

## What Was Built

**Task 1 — lib/supplier-primary.ts + app/actions/suppliers.ts**
- `resolvePrimaryWrites` — pure, import-free; per (supplierId, type) group keeps at most one `isPrimary=true` (last-wins). Satisfies `tests/supplier-actions.test.ts` (4/4 GREEN).
- `createSupplier` / `updateSupplier` — `$transaction`, requireSection("PROCUREMENT","MANAGE"), Zod validation (`preferredContactCustom` required when `preferredContact==="OTHER"` via `.refine`), nested contacts via deleteMany-notIn + upsert, isPrimary corrected through the helper.
- `saveSupplierProductLinks` — upsert SupplierProductLink (productId nullable, productNameFallback, Decimals as numbers), deleteMany-notIn.
- `saveNegotiation` / `deleteNegotiation` — upsert Negotiation + NegotiationProduct (M:N) + NegotiationParticipant; enforces exactly-one-of (employeeId | supplierContactId | customName) per participant (D-04).
- `softDeleteSupplier` / `restoreSupplier` — `deletedAt` toggle, no cascade to children, Purchases untouched (D-20).

**Task 2 — redirect + list page + filters + table + modal**
- `/procurement` → `redirect("/procurement/suppliers")`.
- `suppliers/page.tsx` — RSC, `requireSection("PROCUREMENT")`, `where.deletedAt: null`, filters wired (buyer via `buyerEmployeeId in`, brand/category/subcategory via `productLinks.some.product`), distinct `frequentBuyerIds`, buyer-ASC sort.
- `SupplierFilters` — cascading Закупщик/Бренд/Категория/Подкатегория, URL-driven, child outputs narrow + invalid children silently dropped on parent change.
- `SuppliersTable` — sticky raw-HTML table (`overflow-auto`, `border-separate`, `prefetch={false}`, opaque `bg-background` on sticky cells), rows link to detail, hosts «Новый поставщик» modal.
- `SupplierModal` — create/edit base fields; quick-select buyer via CreatableCombobox with ★ frequent buyers on top (D-01).

**Task 3 — detail page + 3 tabs**
- `suppliers/[id]/page.tsx` — RSC, loads contacts/productLinks→product/negotiations→products+participants, Decimal→string, renders header (name/buyer/cooperation) + `SupplierDetailTabs`.
- `SupplierContactsTab` — type, name (UTF-8), phone (E.164 `^\+[1-9]\d{6,14}$`), preferredContact select WECHAT/PHONE/ALIBABA/OTHER + conditional preferredContactCustom, description, isPrimary.
- `SupplierProductsTab` — product picker (CreatableCombobox + fallback text), leadTime, unitPrice + currency, deliveryType CARGO/WHITE, exclusivity, deposit/balance/deferral pct, inspection city/address/URL (no lat/lng, D-03).
- `NegotiationsTab` — list + inline editor: date, goals, summary, product checkboxes, participants (employee | supplierContact | custom) mirroring server's exactly-one-of rule.
- `SupplierDetailTabs` — client tab switcher + edit modal + soft-delete header action.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Filters component renamed to avoid file collision**
- **Found during:** Task 2
- **Issue:** Plan `files_modified` listed `components/procurement/ProcurementFilters.tsx`, but that file already exists and belongs to the `/purchase-plan` MVP (ProductIncoming UI), which 20-RESEARCH explicitly marks do-not-touch.
- **Fix:** Created the new supplier cascading filters as `components/procurement/SupplierFilters.tsx` instead, leaving the existing `ProcurementFilters.tsx` untouched.
- **Files:** components/procurement/SupplierFilters.tsx
- **Commit:** e9cf759

**2. [Rule 2 - Missing artifact] Added SupplierDetailTabs client wrapper**
- **Found during:** Task 3
- **Issue:** The detail page is RSC but tab switching + edit modal + delete require client state; the plan's artifact list did not include a tab-host component.
- **Fix:** Created `components/procurement/SupplierDetailTabs.tsx` (client) to hold tab state and header actions, keeping the page RSC.
- **Files:** components/procurement/SupplierDetailTabs.tsx
- **Commit:** 77f6836

Note: SupplierModal (listed under Task 3 in the plan) was created during Task 2 because the list table references it; it is shared by both the list create-button and the detail edit-button.

## Verification

- `tests/supplier-actions.test.ts` — 4/4 PASS (GREEN).
- `npx tsc --noEmit -p tsconfig.json` — clean (no errors).
- Manual UAT (deferred to 20-07): create supplier → add 2 manager contacts both primary → only one stays primary; add product link with unit price; add negotiation with custom participant.

## Requirements Completed

D-01, D-02, D-03, D-04, D-10, D-11, D-12, D-13, D-14, D-15, D-17, D-18, D-20

## Known Stubs

None. Negotiation editor, contacts, and product links are fully wired to server actions; no hardcoded empty data flows to UI beyond genuine empty-state placeholders.

## Self-Check: PASSED

All 12 created files verified present on disk. All 3 task commits (f882960, e9cf759, 77f6836) present in git log.
