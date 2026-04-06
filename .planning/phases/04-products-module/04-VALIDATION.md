# Phase 4: Products Module — Validation

**Phase:** 04-products-module
**Created:** 2026-04-06
**Status:** Ready for execution

---

## Automated Verification Commands

Run these after all plans complete to confirm the phase is done.

### TypeScript — zero errors across all Phase 4 files

```bash
cd /Users/macmini/zoiten.pro && PATH=/usr/local/bin:$PATH npx tsc --noEmit 2>&1 | head -30
```

Expected: No output (zero errors).

### Schema — partial indexes migration exists and @unique removed

```bash
# Barcode @unique must be gone
grep -n "@unique" /Users/macmini/zoiten.pro/prisma/schema.prisma | grep "Barcode" && echo "FAIL" || echo "PASS: Barcode @unique removed"

# MarketplaceArticle @@unique must be gone
grep -n "@@unique" /Users/macmini/zoiten.pro/prisma/schema.prisma | grep "MarketplaceArticle" && echo "FAIL" || echo "PASS: MarketplaceArticle @@unique removed"

# Migration file exists
test -f /Users/macmini/zoiten.pro/prisma/migrations/20260405_partial_indexes/migration.sql && echo "PASS: migration exists" || echo "FAIL: migration missing"
```

### Server Actions — all four exports present

```bash
grep -n "^export async function" /Users/macmini/zoiten.pro/app/actions/products.ts
```

Expected output contains: `createProduct`, `updateProduct`, `softDeleteProduct`, `duplicateProduct`.

### Route Handlers — files exist

```bash
for f in \
  "app/api/upload/route.ts" \
  "app/api/uploads/[...path]/route.ts" \
  "app/api/cron/purge-deleted/route.ts"; do
  test -f "/Users/macmini/zoiten.pro/$f" && echo "PASS: $f" || echo "FAIL: $f missing"
done
```

### Product pages — files exist

```bash
for f in \
  "app/(dashboard)/products/page.tsx" \
  "app/(dashboard)/products/new/page.tsx" \
  "app/(dashboard)/products/[id]/edit/page.tsx" \
  "components/products/ProductsTable.tsx" \
  "components/products/ProductStatusTabs.tsx" \
  "components/products/ProductSearchInput.tsx" \
  "components/products/ProductForm.tsx" \
  "components/products/PhotoUploadField.tsx" \
  "components/layout/NavLinks.tsx"; do
  test -f "/Users/macmini/zoiten.pro/$f" && echo "PASS: $f" || echo "FAIL: $f missing"
done
```

---

## Manual Verification Checklist

Complete these after automated checks pass. Log in as sergey.fyodorov@gmail.com.

### Product List (PROD-01, PROD-02, PROD-12)

- [ ] /products loads with no errors
- [ ] Filter tabs show: Есть (default), Нет в наличии, Выведен, Удалено, Все
- [ ] Search input is present; typing filters products by name
- [ ] Table shows columns: фото, наименование, бренд, категория, ABC, наличие, действия
- [ ] Pagination shows if more than 20 products; Prev/Next work
- [ ] "+ Добавить товар" link goes to /products/new

### Product Create (PROD-03, PROD-04, PROD-05, PROD-06, PROD-11)

- [ ] /products/new loads with empty form
- [ ] All 5 sections visible (Основное, Фото, Артикулы маркетплейсов, Штрих-коды, Характеристики)
- [ ] Brand combobox shows brands; typing shows create option
- [ ] Category combobox shows categories for selected brand
- [ ] Subcategory combobox filters by selected category; clears when category changes
- [ ] Photo zone accepts drag-and-drop and click-to-select; 3:4 preview renders
- [ ] "Добавить маркетплейс" adds a marketplace group
- [ ] "Добавить артикул" adds an article input within the group (max 10)
- [ ] "Добавить штрих-код" adds a barcode input (max 20)
- [ ] Filling H/W/D auto-calculates volume (read-only)
- [ ] Saving creates product → toast "Товар создан" → redirect to /products/[id]/edit

### Product Edit (PROD-07)

- [ ] /products/[id]/edit loads with existing values pre-filled
- [ ] Editing and saving shows toast "Товар сохранён"

### Duplicate (PROD-08)

- [ ] Clicking "Копировать" creates new product with "Копия — " prefix
- [ ] Redirects to edit page of new product
- [ ] New product has no photo (blank photo zone)
- [ ] New product has NO barcodes (barcodes are globally unique — not copied)
- [ ] New product has marketplace articles copied

### Soft Delete (PROD-09)

- [ ] Clicking "Удалить" removes product from "Есть" tab
- [ ] Product appears in "Удалено" tab with deletion date visible
- [ ] Deleted product's availability shows as "Удалён"

### Cron Purge (PROD-10)

- [ ] GET /api/cron/purge-deleted without header → returns 401
- [ ] GET /api/cron/purge-deleted with x-cron-secret: wrong-key → returns 401
- [ ] (Cannot test 30-day purge without aged data — logic verified in code review)

### Partial Indexes (PROD-13, PROD-14)

- [ ] Migration SQL file contains partial index on Barcode
- [ ] Migration SQL file contains partial index on MarketplaceArticle
- [ ] (Indexes applied to DB in Phase 6 deploy)

### Sidebar Active State

- [ ] Clicking "Товары" in sidebar highlights it with primary color
- [ ] Navigating to /products/* keeps sidebar "Товары" highlighted

---

## Requirement Coverage

| Requirement | Plan | Status |
|-------------|------|--------|
| PROD-01 — product list with pagination | 04-02 | verify above |
| PROD-02 — status filter tabs | 04-02 | verify above |
| PROD-03 — create product with all fields | 04-03 | verify above |
| PROD-04 — marketplace articles (max 10/mp) | 04-03 | verify above |
| PROD-05 — barcodes (1-20) | 04-03 | verify above |
| PROD-06 — dimensions + auto volume | 04-03 | verify above |
| PROD-07 — edit product from list | 04-02, 04-03 | verify above |
| PROD-08 — duplicate product | 04-01, 04-02 | verify above |
| PROD-09 — soft delete | 04-01, 04-02 | verify above |
| PROD-10 — 30-day auto-purge cron | 04-01 | verify above |
| PROD-11 — photo upload to VPS filesystem | 04-01, 04-03 | verify above |
| PROD-12 — text search by name | 04-02 | verify above |
| PROD-13 — marketplace article partial unique index | 04-01 | verify above |
| PROD-14 — barcode partial unique index | 04-01 | verify above |

---

*Phase 4 validation | Created 2026-04-06*
