---
phase: 03-reference-data
plan: "01"
subsystem: reference-data
tags: [server-actions, prisma, seed, brands, categories, marketplaces]
dependency_graph:
  requires: []
  provides: [app/actions/reference.ts, prisma/seed.ts]
  affects: [03-02, 03-03]
tech_stack:
  added: []
  patterns: [ActionResult, CreateResult, requireSuperadmin, revalidatePath, zod-validation, upsert-idempotent]
key_files:
  created:
    - app/actions/reference.ts
  modified:
    - prisma/seed.ts
decisions:
  - "handleAuthError helper typed as { ok: false; error: string } | null (not ActionResult) to satisfy CreateResult return type in create functions"
  - "CreateResult type (ok: true; id: string) added for CreatableCombobox compatibility alongside ActionResult"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-05"
  tasks: 2
  files: 2
---

# Phase 03 Plan 01: Reference Data Server Actions + Seed Summary

**One-liner:** 12 Server Actions for brand/category/subcategory/marketplace CRUD with Zoiten and system marketplace protection guards, plus idempotent seed for Zoiten brand, 3 categories, and 4 marketplaces.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Server Actions for reference data CRUD | cce661c | app/actions/reference.ts |
| 2 | Extend prisma/seed.ts with reference data | 4762be3 | prisma/seed.ts |

## What Was Built

### app/actions/reference.ts

All 12 Server Actions for reference data CRUD:

- `createBrand`, `updateBrand`, `deleteBrand` — Brand CRUD; deleteBrand guards against Zoiten brand deletion
- `createCategory`, `updateCategory`, `deleteCategory` — Category CRUD; subcategories cascade-deleted via schema
- `createSubcategory`, `updateSubcategory`, `deleteSubcategory` — Subcategory CRUD
- `createMarketplace`, `updateMarketplace`, `deleteMarketplace` — Marketplace CRUD; deleteMarketplace guards wb/ozon/dm/ym slugs

All actions:
- Call `requireSuperadmin()` first
- Validate input with Zod schemas
- Call `revalidatePath("/admin/settings")` before returning
- Return `ActionResult` (`{ ok: true } | { ok: false; error: string }`)
- Create actions return `CreateResult` (`{ ok: true; id: string } | { ok: false; error: string }`)

Error handling covers: P2002 (unique violation), P2003 (FK constraint), P2025 (not found), auth errors, generic server errors.

### prisma/seed.ts

Extended with idempotent upserts after the existing superadmin seed:
- Zoiten brand via `prisma.brand.upsert({ where: { name: "Zoiten" } })`
- 3 categories ("Дом", "Кухня", "Красота и здоровье") via `prisma.category.upsert({ where: { name_brandId: { name, brandId } } })`
- 4 marketplaces (WB/wb, Ozon/ozon, ДМ/dm, ЯМ/ym) via `prisma.marketplace.upsert({ where: { slug } })`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript error in handleAuthError return type**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `handleAuthError` was typed as returning `ActionResult | null`, but create functions have `CreateResult` return type. TypeScript rejected `{ ok: true }` (without `id`) assigned to `CreateResult` inside the `catch` block.
- **Fix:** Changed `handleAuthError` return type to `{ ok: false; error: string } | null` — this type is compatible with both `ActionResult` and `CreateResult` on the error branch.
- **Files modified:** app/actions/reference.ts
- **Commit:** cce661c (fixed inline before commit)

## Known Stubs

None — this plan creates server-side actions and seed data only. No UI rendering involved.

## Self-Check: PASSED

- app/actions/reference.ts: FOUND
- prisma/seed.ts: FOUND (modified)
- Commit cce661c: FOUND
- Commit 4762be3: FOUND
- TypeScript: 0 errors
- All 12 exports present: createBrand, updateBrand, deleteBrand, createCategory, updateCategory, deleteCategory, createSubcategory, updateSubcategory, deleteSubcategory, createMarketplace, updateMarketplace, deleteMarketplace
