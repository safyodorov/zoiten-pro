---
phase: 21-credits
plan: "02"
subsystem: navigation-wiring
tags: [nav, rbac, sections, sidebar, credits]
dependency_graph:
  requires: [21-01]
  provides: [CREDITS section routing, sidebar entry, header titles]
  affects: [middleware.ts, DashboardShell, Sidebar, Header]
tech_stack:
  added: []
  patterns: [ERP_SECTION routing pattern, section-titles pattern, nav-items pattern]
key_files:
  created: []
  modified:
    - lib/sections.ts
    - components/layout/section-titles.ts
    - components/layout/nav-items.ts
decisions:
  - "Landmark icon chosen for Credits sidebar entry (bank/institution semantic)"
  - "Position: after SALES (/sales-plan) — logical grouping with financial sections"
  - "Route /credits/schedule mapped before /credits/[id] before /credits (specific→general order)"
  - "RBAC guard for /credits activates ONLY after prisma migrate deploy on VPS (Plan 21-08)"
metrics:
  duration: 60s
  completed: "2026-06-09T09:46:42Z"
  tasks_completed: 2
  files_changed: 3
---

# Phase 21 Plan 02: Navigation & RBAC Wiring for /credits Summary

URL→section mapping, sidebar nav entry, and Header titles wired for the new `/credits` section (middleware RBAC guard + Sidebar «Кредиты» with Landmark icon + 3 title rules).

## Objective

Подключить новый раздел `/credits` к инфраструктуре навигации и RBAC: URL→section mapping (middleware), заголовки раздела (Header), пункт в Sidebar.

## Tasks Completed

| # | Name | Commit | Files |
|---|------|--------|-------|
| 1 | lib/sections.ts + section-titles.ts | d66fc87 | lib/sections.ts, components/layout/section-titles.ts |
| 2 | nav-items.ts — пункт «Кредиты» + иконка Landmark | 6c1c900 | components/layout/nav-items.ts |

## Changes Made

### lib/sections.ts
Added `"/credits": "CREDITS"` to `SECTION_PATHS` after `/ads`. This enables the middleware Edge RBAC guard to recognize `/credits/*` URLs and require `ERP_SECTION.CREDITS` access.

### components/layout/section-titles.ts
Added 3 title rules in correct specific→general order (inserted after `/sales-plan`):
```
/credits/schedule  →  "Кредиты — сводный график"
/credits/[^/]+     →  "Кредит"
/credits           →  "Кредиты"
```
Order ensures `/credits/schedule` is matched before the `[id]` pattern and the general `/credits` rule.

### components/layout/nav-items.ts
- Added `Landmark` to lucide-react import
- Added NAV_ITEMS entry: `{ section: "CREDITS", href: "/credits", label: "Кредиты", icon: "Landmark" }` after SALES
- Added `Landmark` to ICON_MAP

## Deviations from Plan

None — plan executed exactly as written.

## Key Decisions

1. **Landmark icon** — confirms plan decision; bank/institution semantic appropriate for credit management.
2. **Sidebar position** — immediately after «План продаж» (SALES), before «Финансовые модели» — groups financial sections together.
3. **RBAC activation caveat** — `"/credits": "CREDITS"` is wired now, but the `ERP_SECTION.CREDITS` enum value exists in DB only after `prisma migrate deploy` on VPS (Plan 21-08). Until then, `/credits` returns 403 — this is expected behavior, not a bug.

## RBAC Reminder

After granting CREDITS rights through `/admin/users`, the recipient MUST logout/login — JWT does not self-update (documented in MEMORY.md).

## Known Stubs

None — this plan is pure wiring (no UI rendering, no data). The actual `/credits` page routes are created in Plans 21-03 through 21-07.

## Self-Check: PASSED

- `lib/sections.ts` modified — verified: `"/credits": "CREDITS"` present
- `components/layout/section-titles.ts` modified — verified: 3 title rules present in correct order
- `components/layout/nav-items.ts` modified — verified: Landmark import + NAV_ITEMS entry + ICON_MAP entry
- Commits d66fc87 and 6c1c900 exist
- `npx tsc --noEmit` — passed with no errors
