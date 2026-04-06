---
phase: 04-products-module
plan: "02"
subsystem: products-ui
tags: [products, list-page, pagination, search, filter, rsc, client-components]
dependency_graph:
  requires:
    - 04-01  # server actions (duplicateProduct, softDeleteProduct)
  provides:
    - product-list-page  # /products RSC entry point
    - product-status-tabs  # availability filter component
    - product-search-input  # debounced search component
    - products-table  # paginated table with actions
  affects:
    - 04-03  # product form/edit page will link back from table rows
tech_stack:
  added: []
  patterns:
    - Next.js 15 async searchParams in RSC page
    - useTransition for server action progress state
    - URL-driven filter state (status + q params)
    - 300ms debounced search via useEffect + setTimeout
key_files:
  created:
    - app/(dashboard)/products/page.tsx
    - components/products/ProductsTable.tsx
    - components/products/ProductStatusTabs.tsx
    - components/products/ProductSearchInput.tsx
  modified: []
decisions:
  - useRouter from next/navigation (not react) — corrected import during TypeScript check
metrics:
  duration: "2m"
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_created: 4
---

# Phase 04 Plan 02: Product List Page Summary

Paginated product list at /products — RSC with server-side filtering by availability status, debounced name search, thumbnail display, and per-row duplicate + soft-delete actions with Sonner toast feedback.

## What Was Built

### Task 1: Product list RSC page (app/(dashboard)/products/page.tsx)
Async RSC that awaits searchParams (Next.js 15 required pattern). Builds a typed `where` clause mapping 5 URL status values to Prisma queries:
- `IN_STOCK` (default) → `{ deletedAt: null, availability: "IN_STOCK" }`
- `OUT_OF_STOCK` / `DISCONTINUED` → analogous active-only queries
- `DELETED` → `{ deletedAt: { not: null } }`
- `ALL` → `{ deletedAt: null }` (all active statuses)

Fetches paginated products (20/page) with `brand` and `category` includes via `Promise.all([findMany, count])`. Renders ProductStatusTabs, ProductSearchInput, ProductsTable, and the "Добавить товар" button as a styled Link.

### Task 2: Three client components (components/products/)

**ProductStatusTabs** — renders 5 filter buttons. On click: `router.push(/products?status=VALUE)`. Active tab gets `bg-primary text-primary-foreground`, inactive gets `bg-muted text-muted-foreground`.

**ProductSearchInput** — controlled input with `useState`. `useEffect` + `setTimeout(300ms)` debounces pushes to `/products?status={current}&q={value}`. Preserves current status param via `useSearchParams`.

**ProductsTable** — 7-column table (фото, наименование, бренд, категория, ABC badge, наличие badge, действия). Photo: `<img>` if photoUrl set, gray placeholder div otherwise (48×64px). Name cell wrapped in `<Link href="/products/[id]/edit">` with `hover:underline`. Action buttons use `useTransition` for `isPending` state: Копировать calls `duplicateProduct` → toast + redirect to new product edit; Удалить confirms then calls `softDeleteProduct` → toast + `router.refresh()`. Pagination rendered when `totalPages > 1`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong `useRouter` import**
- **Found during:** Task 2 — TypeScript check
- **Issue:** Plan example showed `import { useRouter, useTransition } from "react"` but `useRouter` is from `next/navigation` not `react`
- **Fix:** Corrected import to `import { useTransition } from "react"` + `import { useRouter } from "next/navigation"`
- **Files modified:** components/products/ProductsTable.tsx
- **Commit:** 249244d (inline fix before final commit)

## Known Stubs

None. All columns render real data from the database. Photo placeholder is intentional UX (products without photos show a gray box — not stub data).

## Self-Check: PASSED

Files exist:
- FOUND: app/(dashboard)/products/page.tsx
- FOUND: components/products/ProductsTable.tsx
- FOUND: components/products/ProductStatusTabs.tsx
- FOUND: components/products/ProductSearchInput.tsx

Commits exist:
- 14bc333: feat(04-02): product list RSC page with server-side pagination and filtering
- 249244d: feat(04-02): ProductsTable, ProductStatusTabs, ProductSearchInput components

TypeScript: npx tsc --noEmit — no errors
