---
phase: 05-ui-module-stubs
plan: 01
subsystem: ui
tags: [motion, animation, landing-page, dark-theme, next.js]

requires:
  - phase: 01-foundation-auth
    provides: Auth.js v5 setup — login route at /login is available for the Login button target
  - phase: 04-products-module
    provides: lib/section-labels.ts with SECTION_OPTIONS for section card labels

provides:
  - Public landing page at / — dark themed, no auth required
  - LandingHeader component with Zoiten branding and Login button
  - HeroSection component with ZOITEN logo text, slogan, fade-in motion animation
  - SectionCards component with stagger-animated grid of ERP module cards
  - motion@12.38.0 package installed

affects:
  - 05-02 (integration stubs)
  - 06-deploy (nginx must serve / without auth)

tech-stack:
  added:
    - motion@^12.38.0 (canonical framer-motion package rename)
  patterns:
    - "Landing components use 'use client' for motion animations, assembled in RSC page.tsx"
    - "motion imported from 'motion/react' (not 'framer-motion')"
    - "Stagger animation via containerVariants/itemVariants pattern with motion.div"

key-files:
  created:
    - components/landing/LandingHeader.tsx
    - components/landing/HeroSection.tsx
    - components/landing/SectionCards.tsx
  modified:
    - app/page.tsx
    - package.json

key-decisions:
  - "motion@12.38.0 used as package name (not framer-motion) — canonical current name per CLAUDE.md"
  - "Landing page is a Server Component assembling three 'use client' sub-components — motion animations stay in leaf components"
  - "Section cards link directly to module paths but require auth — clicking navigates to login redirect from middleware"

patterns-established:
  - "motion components: 'use client' + import from 'motion/react'"
  - "Landing RSC assembles client components without needing 'use client' itself"

requirements-completed:
  - LAND-01
  - LAND-02
  - LAND-03
  - LAND-04

duration: 2min
completed: 2026-04-06
---

# Phase 05 Plan 01: Landing Page Summary

**Dark-themed public landing page at / with ZOITEN hero, fade-in motion animation, and 8-card stagger-animated ERP module grid using motion@12.38.0**

## Performance

- **Duration:** 2 min
- **Started:** 2026-04-06T04:50:41Z
- **Completed:** 2026-04-06T04:52:31Z
- **Tasks:** 2 completed
- **Files modified:** 5

## Accomplishments

- Replaced bare redirect('/login') with a branded animated landing page
- Installed motion@12.38.0 and established import pattern from "motion/react"
- Hero section fades in with opacity/y-transform animation on page load
- 8 ERP section cards stagger-animate in with 70ms delay between cards
- Login button in fixed header routes to /login; page itself needs no auth

## Task Commits

1. **Task 1: Install motion and create landing components** - `86d46ad` (feat)
2. **Task 2: Replace app/page.tsx with assembled landing page** - `a2440da` (feat)

**Plan metadata:** (docs commit — see below)

## Files Created/Modified

- `components/landing/LandingHeader.tsx` - Fixed top bar with Zoiten brand (violet-400) and Login button
- `components/landing/HeroSection.tsx` - Full-viewport hero with ZOITEN heading, slogan, fade-in motion
- `components/landing/SectionCards.tsx` - Grid of 8 ERP module cards with stagger animation and Lucide icons
- `app/page.tsx` - Server Component assembling the three landing client components; no auth redirect
- `package.json` - Added motion@^12.38.0 dependency

## Decisions Made

- motion@12.38.0 used as package name (not framer-motion) per CLAUDE.md instructions
- Landing page kept as Server Component (no "use client") — motion stays in leaf components
- Section cards are anchor tags linking directly to module routes; middleware handles RBAC redirects if not logged in
- USER_MANAGEMENT filtered from SectionCards — not a module in the ERP module grid

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None — TypeScript compiled clean, build passed on first attempt.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Landing page ready; / now shows branded content before login
- motion installed and pattern established for subsequent animation work
- No blockers for 05-02

## Self-Check: PASSED

- All 5 files confirmed present on disk
- Both task commits (86d46ad, a2440da) confirmed in git log
- Build passes cleanly
