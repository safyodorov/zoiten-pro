---
phase: 23-cash-payments
plan: "02"
subsystem: ui
tags: [rbac, navigation, section-routing, next-js]

# Dependency graph
requires:
  - phase: 23-01
    provides: ERP_SECTION.CASH enum added to schema (prerequisite for all section files)
provides:
  - SECTION_PATHS["/cash"]="CASH" middleware route guard
  - SECTION_OPTIONS CASH entry (VIEW/MANAGE toggle in /admin/users)
  - NAV_ITEMS CASH sidebar entry with Wallet icon
  - section-titles.ts "Наличные расчёты" header for /cash
  - app/(dashboard)/cash/page.tsx stub RSC guarded by requireSection("CASH")
affects: [23-03, 23-04, 23-05, middleware-rbac, sidebar-nav, admin-users]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "6-point ERP_SECTION checklist: schema enum (23-01) + sections.ts + section-labels.ts + nav-items.ts + section-titles.ts + stub page"

key-files:
  created:
    - app/(dashboard)/cash/page.tsx
  modified:
    - lib/sections.ts
    - lib/section-labels.ts
    - components/layout/nav-items.ts
    - components/layout/section-titles.ts

key-decisions:
  - "Wallet icon chosen for CASH sidebar entry (Landmark taken by Credits, Building2 by Bank)"
  - "Stub page minimal RSC — no data, just requireSection guard; replaced by full table in 23-04"

patterns-established:
  - "6-point checklist order: (1) schema enum [23-01], (2) sections.ts route guard, (3) section-titles.ts header, (4) nav-items.ts sidebar+icon, (5) section-labels.ts RBAC toggle, (6) stub page"

requirements-completed: [CASH-03]

# Metrics
duration: 2min
completed: 2026-06-10
---

# Phase 23 Plan 02: /cash Section Wiring Summary

**ERP_SECTION.CASH fully wired: middleware route guard, Header title, Sidebar Wallet entry, /admin/users VIEW/MANAGE toggle, and RBAC-guarded stub page at /cash**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-06-10T12:51:59Z
- **Completed:** 2026-06-10T12:53:18Z
- **Tasks:** 2 completed
- **Files modified:** 5 (4 section config + 1 new stub page)

## Accomplishments

- All 5 remaining points of the 6-point CLAUDE.md checklist wired (§1 enum done in 23-01)
- `lib/sections.ts`: `/cash` → `CASH` route guard enables middleware RBAC on all /cash/* routes
- `lib/section-labels.ts`: CASH entry enables VIEW/MANAGE toggle in /admin/users (most-often-forgotten point)
- `components/layout/nav-items.ts`: Wallet icon + NAV_ITEMS entry + ICON_MAP — sidebar shows "Наличные расчёты"
- `components/layout/section-titles.ts`: Header shows "Наличные расчёты" on /cash
- `app/(dashboard)/cash/page.tsx`: minimal stub RSC with `requireSection("CASH")` guard

## Task Commits

1. **Task 1: 6-point section wiring** - `a11c9a9` (feat)
2. **Task 2: stub /cash page** - `a9e5cd0` (feat)

## Files Created/Modified

- `lib/sections.ts` — added `"/cash": "CASH"` to SECTION_PATHS
- `lib/section-labels.ts` — added `{ value: "CASH", label: "Наличные расчёты" }` to SECTION_OPTIONS
- `components/layout/nav-items.ts` — Wallet import + CASH NAV_ITEM + ICON_MAP entry
- `components/layout/section-titles.ts` — added `/^\/cash/` pattern with "Наличные расчёты"
- `app/(dashboard)/cash/page.tsx` — new stub RSC with requireSection("CASH")

## Decisions Made

- Wallet icon for CASH (Landmark taken by Credits, Building2 by Bank — Wallet semantically correct for cash/petty cash)
- Stub page kept minimal — no placeholder components, just the RBAC guard + one line of text; full table arrives in 23-04

## Deviations from Plan

None — plan executed exactly as written.

## Issues Encountered

None — TypeScript clean, all grep checks pass.

## User Setup Required

None — no external service configuration required. RBAC provisioning for Ivanова Yulia deferred to 23-05 per plan notes.

## Next Phase Readiness

- 23-03 (lib/cash-import/ parser) can proceed independently — no dependency on stub page
- 23-04 (full table + form) will replace the stub page contents
- 23-05 will provision `UserSectionRole` CASH MANAGE for Иванова Юлия

---
*Phase: 23-cash-payments*
*Completed: 2026-06-10*
