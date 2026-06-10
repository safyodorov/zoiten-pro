---
phase: 22-bank-accounts
plan: "02"
subsystem: navigation / RBAC
tags: [erp-section, rbac, navigation, sidebar, stub-page]
dependency_graph:
  requires: [22-01]
  provides: [BANK-section-routing, BANK-rbac-guard, BANK-sidebar-entry, BANK-admin-toggle]
  affects: [lib/sections.ts, components/layout/nav-items.ts, lib/section-labels.ts, components/layout/section-titles.ts, app/(dashboard)/bank/page.tsx]
tech_stack:
  added: []
  patterns: [6-point ERP_SECTION checklist, requireSection RSC guard, sticky-ready flex layout]
key_files:
  created:
    - app/(dashboard)/bank/page.tsx
  modified:
    - lib/sections.ts
    - components/layout/section-titles.ts
    - components/layout/nav-items.ts
    - lib/section-labels.ts
decisions:
  - "Building2 icon used for BANK (Landmark already taken by CREDITS)"
  - "BANK stub page minimal — no data, no filters; full table deferred to 22-05"
  - "UserSectionRole provisioning for BANK deferred to 22-05 (after deploy migration) — ask user who needs access"
metrics:
  duration: ~3 minutes
  completed_date: "2026-06-10"
  tasks_completed: 2
  files_modified: 5
---

# Phase 22 Plan 02: ERP Section BANK wiring + stub page Summary

**One-liner:** Провёл ERP_SECTION.BANK через все 5 обязательных точек чеклиста (sections/titles/nav/labels + stub page с RBAC guard).

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | 6-точечный чеклист ERP_SECTION (точки 2-5) | 6e7ec9c | lib/sections.ts, section-titles.ts, nav-items.ts, section-labels.ts |
| 2 | RSC-заглушка app/(dashboard)/bank/page.tsx | 5fac295 | app/(dashboard)/bank/page.tsx |

## Decisions Made

1. **Building2 icon** — Landmark уже занят Credits; Building2 — здание банка, семантически точно.
2. **Minimal stub page** — RBAC guard + flex layout placeholder; полная таблица в 22-05.
3. **UserSectionRole provisioning** — отложено до 22-05 (после deploy миграции). Необходимо спросить пользователя кому нужен доступ BANK (memory: feedback_zoiten_new_section_rbac).

## Checklist Verification

| Точка | Файл | Статус |
|-------|------|--------|
| 1 — schema enum BANK | prisma/schema.prisma (22-01) | Уже есть |
| 2 — SECTION_PATHS | lib/sections.ts | ✓ "/bank": "BANK" |
| 3 — section-titles | components/layout/section-titles.ts | ✓ /^\/bank/ → "Банковские счета" |
| 4 — NAV_ITEMS + ICON_MAP | components/layout/nav-items.ts | ✓ Building2 import + NAV_ITEM + ICON_MAP |
| 5 — SECTION_OPTIONS | lib/section-labels.ts | ✓ { value: "BANK", label: "Банковские счета" } |
| 6 — dashboard card | (опционально, пропущено) | Пропущено по плану |

## Deviations from Plan

None — plan executed exactly as written.

## Known Stubs

- `app/(dashboard)/bank/page.tsx` — вся страница является заглушкой (intentional, документировано в плане). Данные появятся в 22-05.

## Self-Check: PASSED

- `lib/sections.ts` — FOUND: "/bank": "BANK"
- `components/layout/section-titles.ts` — FOUND: "Банковские счета"
- `components/layout/nav-items.ts` — FOUND: section: "BANK", Building2 (3 раза)
- `lib/section-labels.ts` — FOUND: value: "BANK"
- `app/(dashboard)/bank/page.tsx` — FOUND: requireSection("BANK"), flex-1 min-h-0
- Commits 6e7ec9c, 5fac295 — FOUND in git log
