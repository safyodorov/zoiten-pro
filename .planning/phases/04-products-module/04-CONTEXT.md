# Phase 4: Products Module - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Full product CRUD: list with pagination/search/filter, create/edit form with all fields (name, photo, brand, category/subcategory, marketplace articles, barcodes, dimensions, ABC status, availability), duplicate, soft delete with 30-day auto-purge. Photo upload to VPS filesystem.

</domain>

<decisions>
## Implementation Decisions

### Product List
- **D-01:** Table layout with columns: фото (thumbnail 48x64), наименование, бренд, категория, ABC (badge A/B/C), наличие (badge), действия.
- **D-02:** Filter by availability status at top — tabs or button group: "Есть" (default), "Нет в наличии", "Выведен", "Удалено", "Все".
- **D-03:** Text search input above table — filters by product name, debounced.
- **D-04:** Pagination — server-side, 20 items per page.
- **D-05:** Click row → navigate to /products/[id]/edit.
- **D-06:** Action buttons per row: Копировать, Удалить (soft delete).

### Product Form
- **D-07:** Separate page, NOT modal — too many fields. Routes: /products/new and /products/[id]/edit.
- **D-08:** Form sections (visual groups with headings):
  1. Основное (наименование, бренд, категория/подкатегория, ABC, наличие)
  2. Фото
  3. Артикулы маркетплейсов
  4. Штрих-коды
  5. Характеристики (вес, габариты, авто-объём)
- **D-09:** Brand and category use CreatableCombobox from Phase 3.
- **D-10:** Subcategory combobox filters by selected category.

### Photo Upload
- **D-11:** Drag-n-drop zone + file select button. Preview in 3:4 aspect ratio.
- **D-12:** Client-side validation: JPEG/PNG only, max 2048x2048 pixels.
- **D-13:** Upload via Route Handler (POST /api/upload) — multipart/form-data, not Server Action.
- **D-14:** Store files at /var/www/zoiten-uploads/ (production) or /tmp/zoiten-uploads/ (dev).
- **D-15:** Filename: {productId}-{timestamp}.{ext} to avoid collisions.
- **D-16:** Nginx serves /uploads/ → /var/www/zoiten-uploads/ (configured in Phase 6).
- **D-17:** In dev, serve via Next.js API route /api/uploads/[...path].

### Marketplace Articles
- **D-18:** Grouped by marketplace. Each marketplace section shows its articles.
- **D-19:** "Добавить артикул" button per marketplace. Input = integer, max 10 per marketplace.
- **D-20:** "Добавить маркетплейс" button at bottom to add articles for a new marketplace.
- **D-21:** Stored in MarketplaceArticle table (normalized, not JSON).

### Barcodes
- **D-22:** Simple dynamic list. "Добавить штрих-код" button. Min 1, max 20.
- **D-23:** Each barcode is a text input + delete button.

### Dimensions & Volume
- **D-24:** Weight (kg), Height (cm), Width (cm), Depth (cm) — number inputs.
- **D-25:** Volume auto-calculated: (H × W × D) / 1000 liters — displayed read-only.

### Duplicate Product
- **D-26:** Server Action copies all fields except: id, photo, createdAt, updatedAt.
- **D-27:** Duplicated product name prefixed with "Копия — ".
- **D-28:** Redirect to edit page of the new product.

### Soft Delete
- **D-29:** Server Action sets deletedAt = now() and availability = DISCONTINUED.
- **D-30:** Soft-deleted products hidden from default list view (filter = "Есть").
- **D-31:** "Удалено" tab shows soft-deleted products with deletion date.
- **D-32:** Auto-purge: /api/cron/purge-deleted endpoint deletes products where deletedAt < 30 days ago.
- **D-33:** Purge endpoint protected by API key (CRON_SECRET env var).
- **D-34:** systemd timer calls purge endpoint daily (configured in Phase 6).

### Partial Unique Indexes
- **D-35:** Barcode uniqueness: partial index WHERE deletedAt IS NULL (in raw SQL migration).
- **D-36:** MarketplaceArticle uniqueness: per-marketplace partial index WHERE deletedAt IS NULL.

### Claude's Discretion
- Exact form layout and spacing
- Loading skeletons for product list
- Image compression/resizing (Sharp optional — defer to Phase 6 if complex)
- Form autosave vs explicit save button (recommend explicit save)

</decisions>

<canonical_refs>
## Canonical References

### Prior Phase Code
- `prisma/schema.prisma` — Product, MarketplaceArticle, Barcode models
- `components/combobox/CreatableCombobox.tsx` — Inline category/brand creation
- `app/actions/reference.ts` — Reference data Server Action pattern
- `lib/rbac.ts` — requireSection("PRODUCTS")
- `lib/prisma.ts` — Prisma singleton

### Project Specs
- `.planning/REQUIREMENTS.md` — PROD-01..14
- `.planning/ROADMAP.md` — Phase 4 success criteria
- `.planning/research/PITFALLS.md` — Photo storage outside /public, partial unique indexes

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- CreatableCombobox for brand/category selection
- All shadcn/ui components: table, form, input, button, badge, card, dialog, select, tabs, switch, checkbox
- Server Action pattern with error handling and toast
- Sonner for notifications

### Established Patterns
- RSC pages with server-side data fetch
- Server Actions with Zod validation + requireSection()
- react-hook-form + zod for complex forms
- Inline editing (from settings page)

### Integration Points
- /products route under (dashboard) layout
- Sidebar — add "Товары" link (PRODUCTS section)
- Product model references Brand, Category, Subcategory, Marketplace

</code_context>

<specifics>
## Specific Ideas

- Photo upload via Route Handler, NOT Server Action (binary data needs Web Request API)
- Partial unique indexes require raw SQL in migration — Prisma doesn't generate these
- Volume = H × W × D / 1000 (computed field, not stored)
- Dev photo serving via /api/uploads/[...path] catch-all route

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 04-products-module*
*Context gathered: 2026-04-05*
