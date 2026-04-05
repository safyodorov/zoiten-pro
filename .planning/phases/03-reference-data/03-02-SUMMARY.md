---
phase: 03-reference-data
plan: 02
subsystem: settings-ui
tags: [settings, tabs, accordion, brands, categories, marketplaces, rbac, inline-edit]
dependency_graph:
  requires: [03-01]
  provides: [settings-page, reference-data-ui]
  affects: [sidebar, admin-nav]
tech_stack:
  added: []
  patterns:
    - base-ui Tabs wrapper (data-selected: variant)
    - base-ui Accordion wrapper (data-open: variant)
    - inline-edit pattern (click pencil icon to edit in-place)
    - RSC page with requireSuperadmin() + parallel prisma fetch
key_files:
  created:
    - components/ui/tabs.tsx
    - components/ui/accordion.tsx
    - components/settings/BrandsTab.tsx
    - components/settings/CategoriesTab.tsx
    - components/settings/MarketplacesTab.tsx
    - components/settings/SettingsTabs.tsx
    - app/(dashboard)/admin/settings/page.tsx
  modified:
    - components/layout/Sidebar.tsx
decisions:
  - base-ui data-selected:/data-open: variants used throughout (not radix data-state=)
  - SEEDED_SLUGS constant duplicated in MarketplacesTab.tsx for UI guard (source of truth is server action)
  - Accordion component has AccordionTrigger wrapping both Header and Trigger internally for convenience
metrics:
  duration: ~7 minutes
  completed_date: "2026-04-05"
  tasks: 2
  files_created: 7
  files_modified: 1
---

# Phase 03 Plan 02: Settings UI Summary

Settings page at /admin/settings with three-tab interface for managing reference data (brands, categories, marketplaces) using base-ui Tabs/Accordion wrappers and inline-editing pattern, guarded by requireSuperadmin().

## What Was Built

### Task 1: Tabs and Accordion wrapper components

Created two thin shadcn-style wrappers around @base-ui/react primitives:

- `components/ui/tabs.tsx` — exports `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent`
  - Uses `data-selected:` Tailwind variant (base-ui, not radix `data-state=active`)
- `components/ui/accordion.tsx` — exports `Accordion`, `AccordionItem`, `AccordionTrigger`, `AccordionContent`
  - Uses `data-open:` variant (base-ui, not radix `data-state=open`)
  - AccordionTrigger wraps Header + Trigger + ChevronDown icon internally

### Task 2: Settings tab components, page, and sidebar link

- `components/settings/BrandsTab.tsx` — brand list with inline editing; Zoiten brand has no delete button (isProtected check); Add row at bottom
- `components/settings/CategoriesTab.tsx` — brand picker (defaults to Zoiten); accordion of categories with subcategories; inline editing at both levels; separate Add rows
- `components/settings/MarketplacesTab.tsx` — list of marketplaces with name+slug inline edit; seeded slugs (wb/ozon/dm/ym) have no delete button; Add row with slug auto-generation from name
- `components/settings/SettingsTabs.tsx` — orchestrates the three tabs; defaultValue="brands"
- `app/(dashboard)/admin/settings/page.tsx` — RSC; calls requireSuperadmin(); parallel fetch of brands (with nested categories+subcategories) and marketplaces
- `components/layout/Sidebar.tsx` — added Настройки link pointing to /admin/settings under USER_MANAGEMENT section (superadmin-only)

All mutations use Server Actions from Plan 01 (`app/actions/reference.ts`) and show `toast.success` / `toast.error` via Sonner.

## Decisions Made

- Used `data-selected:` and `data-open:` Tailwind variants per base-ui spec (not radix/shadcn `data-state=`)
- AccordionTrigger combines Header + Trigger primitives into single component for ergonomic API
- SEEDED_SLUGS array duplicated in MarketplacesTab for UI-only guard (delete button visibility); the authoritative guard is in the server action
- Brand picker in CategoriesTab uses native `<select>` (not shadcn Select) to avoid heavy dependency

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

None. All tab components are wired to real Server Actions. Data fetching is real (prisma). The page will render correctly once the database is seeded.

## Self-Check: PASSED

Files created verified:
- components/ui/tabs.tsx — exists
- components/ui/accordion.tsx — exists
- components/settings/BrandsTab.tsx — exists
- components/settings/CategoriesTab.tsx — exists
- components/settings/MarketplacesTab.tsx — exists
- components/settings/SettingsTabs.tsx — exists
- app/(dashboard)/admin/settings/page.tsx — exists
- components/layout/Sidebar.tsx — modified (Настройки link added)

Commits:
- 6845e8a: feat(03-02): add base-ui Tabs and Accordion wrapper components
- 9ad9026: feat(03-02): add /admin/settings page with Brands, Categories, Marketplaces tabs

TypeScript: no errors (npx tsc --noEmit returns empty output)
