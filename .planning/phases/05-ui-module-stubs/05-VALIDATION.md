# Phase 5: UI & Module Stubs — Validation Checklist

**Phase:** 05-ui-module-stubs
**Created:** 2026-04-06
**Plans:** 2 (05-01, 05-02)

## Requirement Coverage

| Requirement | Plan | Task | Status |
|-------------|------|------|--------|
| LAND-01 — Landing page with logo, slogan, section nav | 05-01 | Task 1 + Task 2 | Planned |
| LAND-02 — motion animations (fade-in hero, stagger cards) | 05-01 | Task 1 | Planned |
| LAND-03 — Login button top-right → /login | 05-01 | Task 1 | Planned |
| LAND-04 — Responsive layout | 05-01 | Task 1 | Planned |
| STUB-01 — /prices stub page (Управление ценами) | 05-02 | Task 2 | Planned |
| STUB-02 — /weekly stub page (Недельные карточки) | 05-02 | Task 2 | Planned |
| STUB-03 — /inventory stub page (Управление остатками) | 05-02 | Task 2 | Planned |
| STUB-04 — /batches stub page (Себестоимость партий) | 05-02 | Task 2 | Planned |
| STUB-05 — /purchase-plan stub page (План закупок) | 05-02 | Task 2 | Planned |
| STUB-06 — /sales-plan stub page (Plan продаж) | 05-02 | Task 2 | Planned |
| SUPP-01 — Support placeholder with GitHub link | 05-02 | Task 2 | Planned (partial — full integration deferred per D-14) |
| SUPP-02 — /support protected by RBAC | 05-02 | Task 2 | Planned |

## Decision Compliance

| Decision | Plan | Compliant |
|----------|------|-----------|
| D-01: Full-screen hero — logo centered, slogan below | 05-01 | Yes |
| D-02: Grid of section cards below hero | 05-01 | Yes |
| D-03: Login button top-right | 05-01 | Yes |
| D-04: Route / (root, public) | 05-01 | Yes |
| D-05: motion fade-in hero, stagger cards | 05-01 | Yes |
| D-06: Dark theme on landing | 05-01 | Yes (bg-gray-950) |
| D-07: Desktop-first, mobile acceptable | 05-01 | Yes (responsive grid) |
| D-08: Single reusable ComingSoon component | 05-02 | Yes |
| D-09: ComingSoon shows name + "В разработке" | 05-02 | Yes |
| D-10: Stub routes /prices, /weekly, /inventory, /batches, /purchase-plan, /sales-plan | 05-02 | Yes (matches lib/sections.ts) |
| D-11: Each stub uses requireSection() | 05-02 | Yes |
| D-12/D-13/D-14: /support placeholder, RBAC protected, full integration deferred | 05-02 | Yes |

## Deferred Ideas (must NOT be planned)

- Full ai-cs-zoiten integration (requires deployment of support bot) — NOT in plans. /support is a placeholder only.

## Preconditions

- motion package NOT in package.json — Plan 05-01 Task 1 must `npm install motion` first.
- Stub page routes MUST match lib/sections.ts SECTION_PATHS exactly (middleware uses these for RBAC routing).

## Post-Execution Verification

After both plans execute:

```bash
# TypeScript clean
PATH=/usr/local/bin:$PATH npx tsc --noEmit

# Build succeeds
PATH=/usr/local/bin:$PATH npm run build

# All stub pages exist
ls app/\(dashboard\)/prices/page.tsx
ls app/\(dashboard\)/weekly/page.tsx
ls app/\(dashboard\)/inventory/page.tsx
ls app/\(dashboard\)/batches/page.tsx
ls app/\(dashboard\)/purchase-plan/page.tsx
ls app/\(dashboard\)/sales-plan/page.tsx
ls app/\(dashboard\)/support/page.tsx

# Landing components exist
ls components/landing/LandingHeader.tsx
ls components/landing/HeroSection.tsx
ls components/landing/SectionCards.tsx

# ComingSoon component exists
ls components/ui/ComingSoon.tsx

# motion installed
PATH=/usr/local/bin:$PATH node -e "require('motion')" && echo "motion OK"
```
