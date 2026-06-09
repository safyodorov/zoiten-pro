---
phase: 20-procurement
plan: 02
subsystem: app-shell
tags: [rbac, navigation, procurement]
requires: [20-01]
provides:
  - "/procurement/* route guard via PROCUREMENT section (prefix match)"
  - "Sidebar procurement group: Поставщики / Закупки / План закупок"
  - "Header titles for all /procurement/* pages"
  - "SECTION_OPTIONS PROCUREMENT VIEW/MANAGE toggle (relabeled Управление закупками)"
affects:
  - "lib/sections.ts (middleware RBAC)"
  - "components/layout/nav-items.ts (Sidebar)"
  - "components/layout/section-titles.ts (Header)"
tech-stack:
  added: []
  patterns:
    - "CLAUDE.md новый-раздел checklist applied to an enum that already exists (schema step done in 20-01)"
    - "More-specific-first ordering for section-title regex matches"
    - "Prefix-match route guard: single /procurement entry guards all sub-routes"
key-files:
  created: []
  modified:
    - lib/sections.ts
    - lib/section-labels.ts
    - app/(dashboard)/dashboard/page.tsx
    - components/layout/nav-items.ts
    - components/layout/section-titles.ts
decisions:
  - "Temp /purchase-plan renamed (label + title → «План закупок (временный)»), NOT deleted — remains a separate visible nav item until data migration (Defaults #6)"
  - "Single /procurement SECTION_PATHS entry relies on middleware prefix matching to guard suppliers/purchases/plan sub-routes"
metrics:
  duration: 1 min
  tasks: 2
  files: 5
  completed: "2026-06-09"
requirements: [D-10, D-11]
---

# Phase 20 Plan 02: Procurement App-Shell Wiring Summary

Wired the new `/procurement/*` routes into the app shell — middleware RBAC route guard, sidebar nav group (Поставщики / Закупки / План закупок), header titles, and the `/admin/users` VIEW/MANAGE toggle label — and renamed the existing temporary plan to «План закупок (временный)». No pages rendered yet (those arrive in 20-05/06/07); this plan only makes the routes guarded and navigable.

## What Was Built

**Task 1 — Route guard + section labels + dashboard** (commit `6f04dd5`)
- `lib/sections.ts`: added `"/procurement": "PROCUREMENT"` to `SECTION_PATHS`, kept existing `"/purchase-plan": "PROCUREMENT"`. Middleware prefix-matching guards all `/procurement/*` sub-routes (D-10/D-11).
- `lib/section-labels.ts`: relabeled PROCUREMENT `SECTION_OPTIONS` entry «План закупок» → «Управление закупками» — this is what makes the VIEW/MANAGE toggle appear in `/admin/users` (CLAUDE.md checklist step 5).
- `app/(dashboard)/dashboard/page.tsx`: PROCUREMENT card now points at `/procurement/suppliers` with title «Управление закупками» / description «Поставщики, закупки, платежи».

**Task 2 — Sidebar nav group + header titles** (commit `8bf037e`)
- `components/layout/nav-items.ts`: imported `Truck` and `PackageCheck` from lucide-react and added both to `ICON_MAP`; inserted 3 PROCUREMENT items after the COST (`/batches`) entry — Поставщики (`/procurement/suppliers`, Truck), Закупки (`/procurement/purchases`, PackageCheck), План закупок (`/procurement/plan`, ShoppingCart). Renamed existing `/purchase-plan` label to «План закупок (временный)» (kept in place).
- `components/layout/section-titles.ts`: added 6 `/procurement/*` matches (more-specific-first) before the `/purchase-plan` match; renamed temp title to «План закупок (временный)».

## Deviations from Plan

None — plan executed exactly as written.

(One mechanical note: the `Truck`/`PackageCheck` imports had to be added in two places — the lucide-react import block and `ICON_MAP` — because the plan correctly notes both need updating. No logic deviation.)

## Verification

- `npx tsc --noEmit -p tsconfig.json` — clean, no new errors (per-file grep and full-project run both clean).
- All 5 CLAUDE.md new-section checklist files updated (enum step was done in 20-01).
- RBAC guard for `/procurement/*` will be confirmed by 20-07 UAT (no pages to visit yet).

## Self-Check: PASSED

Files (all 5 modified files present and contain expected strings):
- FOUND: lib/sections.ts contains `"/procurement": "PROCUREMENT"` (and still `"/purchase-plan"`)
- FOUND: lib/section-labels.ts contains `label: "Управление закупками"` for PROCUREMENT
- FOUND: app/(dashboard)/dashboard/page.tsx references `/procurement/suppliers`
- FOUND: nav-items.ts imports Truck + PackageCheck (both in ICON_MAP) + hrefs /procurement/suppliers, /procurement/purchases, /procurement/plan + label «План закупок (временный)»
- FOUND: section-titles.ts contains «Поставщики», «Закупки», «Управление закупками» + temp title «План закупок (временный)»

Commits:
- FOUND: 6f04dd5 (Task 1)
- FOUND: 8bf037e (Task 2)
