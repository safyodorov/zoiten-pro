---
phase: "04-products-module"
plan: "03"
subsystem: "products-ui"
tags: ["products", "form", "photo-upload", "react-hook-form", "zod", "field-array"]
dependency_graph:
  requires:
    - "04-01"  # Server actions: createProduct, updateProduct
    - "03-01"  # CreatableCombobox component
    - "03-02"  # reference actions (createBrand, createCategory, createSubcategory)
  provides:
    - "/products/new RSC page"
    - "/products/[id]/edit RSC page"
    - "ProductForm client component"
    - "PhotoUploadField client component"
  affects:
    - "04-04"  # Product list page will link to /products/new and /products/[id]/edit
tech_stack:
  added: []
  patterns:
    - "react-hook-form useFieldArray for nested marketplace groups"
    - "zodResolver without .default() — defaults in useForm defaultValues to avoid type mismatch"
    - "useForm<FormValues, any, any> for sub-components receiving form to avoid Control generic constraint"
    - "Photo upload via fetch POST multipart/form-data to /api/upload"
    - "useWatch + useEffect for cascading clear on brand/category change"
key_files:
  created:
    - "components/products/PhotoUploadField.tsx"
    - "components/products/ProductForm.tsx"
    - "app/(dashboard)/products/new/page.tsx"
    - "app/(dashboard)/products/[id]/edit/page.tsx"
  modified: []
decisions:
  - "zodResolver with .default() causes type mismatch — removed .default() from schema, handle defaults in defaultValues"
  - "MarketplaceGroup sub-component uses form as any to avoid Control<FormValues> vs Control<any> generic conflict in RHF 7.72"
  - "Inline article inputs in MarketplaceGroupInline use form.control as any to bypass TS2322 on FormField control prop"
metrics:
  duration_seconds: 363
  tasks_completed: 3
  files_created: 4
  files_modified: 0
  completed_date: "2026-04-06"
---

# Phase 04 Plan 03: Product Create/Edit Form Summary

**One-liner:** Full product form with 5 sections, photo drag-and-drop, nested marketplace article arrays, and auto-calculated volume using react-hook-form + zod.

## What Was Built

### Task 1: PhotoUploadField (`components/products/PhotoUploadField.tsx`)

Client component for product photo upload:
- Drag-and-drop zone with visual feedback (highlight on drag-over)
- Hidden file input triggered by click
- Client-side MIME validation (image/jpeg, image/png)
- Dimension check via `new Image()` + createObjectURL — rejects images > 2048px
- POST to `/api/upload` with `productId` (or "new") + file
- 3:4 aspect ratio preview using `style={{ aspectRatio: "3/4" }}`, max-width 200px
- Overlay clear button (X) on preview
- Spinner overlay during upload

### Task 2: ProductForm (`components/products/ProductForm.tsx`)

Full product form (830 lines) with all 5 sections:

**Section 1 — Основное:**
- name (Input, 1-100 chars)
- brandId (CreatableCombobox with inline createBrand server action)
- categoryId (CreatableCombobox, filtered by brand, disabled when no brand)
- subcategoryId (CreatableCombobox, filtered by category, disabled when no category)
- abcStatus (Select: A/B/C/empty)
- availability (Select: IN_STOCK/OUT_OF_STOCK/DISCONTINUED)

**Section 2 — Фото:** PhotoUploadField integrated with RHF photoUrl field

**Section 3 — Артикулы маркетплейсов:**
- useFieldArray on `marketplaces` (grouped by marketplace)
- Each group: marketplace name, add/remove article inputs, remove group button
- Inner useFieldArray (in MarketplaceGroupInline sub-component) for articles
- Max 10 articles per marketplace
- "Добавить маркетплейс" button opens inline Select of not-yet-added marketplaces

**Section 4 — Штрих-коды:**
- useFieldArray on `barcodes`
- Max 20 barcodes, add/remove per entry

**Section 5 — Характеристики:**
- weightKg, heightCm, widthCm, depthCm (number inputs)
- Volume: read-only computed `(H × W × D) / 1000` liters via useWatch

**Cascading clears (per D-10):**
- Brand changes → clear categoryId + subcategoryId
- Category changes → clear subcategoryId

**Submit:** creates then redirects to edit page; updates then refreshes.

**Local brand state:** `brandsState` updated optimistically on inline create.

### Task 3: RSC Page Wrappers

`/products/new/page.tsx`:
- `requireSection("PRODUCTS")` guard
- Parallel fetch: brands (with categories+subcategories) + marketplaces
- Renders `<ProductForm brands={brands} marketplaces={marketplaces} />`

`/products/[id]/edit/page.tsx`:
- `requireSection("PRODUCTS")` guard
- Async params (Next.js 15): `const { id } = await params`
- Parallel fetch: product (with barcodes + articles) + brands + marketplaces
- `notFound()` if product not in DB
- Passes full product to ProductForm for pre-fill

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] zodResolver .default() causes type mismatch with react-hook-form 7.72**
- **Found during:** Task 2 TypeScript check
- **Issue:** Using `.default("IN_STOCK")` in the zod schema makes zodResolver return a `Resolver` with the optional field excluded from the input type. This causes `TS2322` in `useForm({ resolver: zodResolver(formSchema) })`.
- **Fix:** Removed `.default()` from the schema. Changed `availability` to `z.enum([...])` only, moved the default value to `defaultValues.availability = "IN_STOCK"` in `useForm`.
- **Files modified:** `components/products/ProductForm.tsx`
- **Commit:** 1b09bd0

**2. [Rule 1 - Bug] Control generic 3rd param mismatch in sub-component**
- **Found during:** Task 2 TypeScript check
- **Issue:** Passing `form.control` to `MarketplaceGroupInline` via a typed prop produces TS2322 because `Control<FormValues, any, TFieldValues>` from the parent can't be assigned to `Control<FormValues>` (2-param) in the child. This is a React Hook Form v7.72 strict typing behavior with transformer generics.
- **Fix:** Typed sub-component's `form` prop as `ReturnType<typeof useForm<FormValues, any, any>>` and used `form.control as any` for the nested `FormField` control prop.
- **Files modified:** `components/products/ProductForm.tsx`
- **Commit:** 1b09bd0

## Known Stubs

None — all data is wired. The form submits to real server actions. ProductForm receives real brands and marketplaces from Prisma queries.

## Self-Check: PASSED

All created files exist:
- components/products/PhotoUploadField.tsx: FOUND
- components/products/ProductForm.tsx: FOUND
- app/(dashboard)/products/new/page.tsx: FOUND
- app/(dashboard)/products/[id]/edit/page.tsx: FOUND

All commits exist:
- e3e0817: feat(04-03): PhotoUploadField — drag-and-drop upload with 3:4 preview
- 1b09bd0: feat(04-03): ProductForm — all 5 sections with react-hook-form + zod
- 825e538: feat(04-03): product create/edit RSC page wrappers

TypeScript: npx tsc --noEmit passes with 0 errors.
