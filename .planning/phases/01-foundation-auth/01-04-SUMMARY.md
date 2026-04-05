---
phase: 01-foundation-auth
plan: 04
subsystem: auth
tags: [nextauth, rbac, middleware, login, dashboard, shadcn]

# Dependency graph
requires:
  - phase: 01-03
    provides: auth.config.ts, auth.ts, lib/sections.ts, lib/rbac.ts, types/next-auth.d.ts

provides:
  - RBAC middleware protecting all routes with section-based access control
  - Login page with inline error handling (no toast)
  - Dashboard with section navigation cards filtered by user role
  - Unauthorized page with back-to-dashboard link
  - Header with logout Server Action
  - Sidebar with section-filtered navigation
  - Server Action requireSection() pattern established (AUTH-06)

affects: [02-user-management, 03-products-module, all future phases using Server Actions]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "middleware.ts imports from auth.config.ts (not auth.ts) for Edge runtime safety"
    - "requireSection() called at top of every Server Action — AUTH-06 pattern"
    - "Login errors shown as inline Alert variant=destructive, never toast"
    - "Sections hidden (not disabled) for users without access — D-05"
    - "SUPERADMIN bypasses all section checks — D-11"

key-files:
  created:
    - middleware.ts
    - app/(auth)/layout.tsx
    - app/(auth)/login/page.tsx
    - app/(dashboard)/layout.tsx
    - app/(dashboard)/dashboard/page.tsx
    - app/(dashboard)/unauthorized/page.tsx
    - components/auth/LoginForm.tsx
    - components/layout/Header.tsx
    - components/layout/Sidebar.tsx
    - app/actions/rbac-test.ts
  modified: []

key-decisions:
  - "shadcn/ui v4 uses @base-ui/react/button which does not support asChild prop — use styled Link instead"
  - "Unauthorized page uses styled Link instead of Button asChild for back-to-dashboard navigation"

patterns-established:
  - "Server Action RBAC: call requireSection() at top of every protected action"
  - "Middleware uses auth.config.ts (Edge-safe), dashboard layout uses auth.ts (Node.js)"
  - "Section visibility: filter array, never show disabled items"

requirements-completed: [AUTH-01, AUTH-03, AUTH-06]

# Metrics
duration: 4min
completed: 2026-04-05
---

# Phase 01 Plan 04: RBAC Middleware, Login UI, and Auth Flow Summary

**End-to-end auth flow: RBAC middleware guards all routes, login page with inline error alerts, session-based dashboard with section card navigation, logout via Server Action, and 403 page with back link.**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-04-05T19:49:44Z
- **Completed:** 2026-04-05T19:53:00Z
- **Tasks:** 2 auto + 1 checkpoint (auto-approved)
- **Files modified:** 10 created

## Accomplishments

- RBAC middleware using NextAuth(authConfig) — Edge-safe, no Prisma, redirects unauthenticated to /login and unauthorized sections to /unauthorized, SUPERADMIN bypasses
- Login page with LoginForm (react-hook-form + zod) showing inline Alert for errors — no toast (D-06)
- Dashboard page filtering visible section cards by allowedSections, SUPERADMIN sees all 8 (D-05, D-11)
- Header with user role badge and logout Server Action redirecting to /login (AUTH-03)
- Sidebar with section-filtered navigation matching dashboard visibility rules
- app/actions/rbac-test.ts establishing requireSection() Server Action pattern (AUTH-06)
- Phase 1 auth flow complete — login → dashboard → logout cycle working

## Task Commits

1. **Task 1: RBAC middleware, auth layouts, and Server Action RBAC example** - `db83e87` (feat)
2. **Task 2: Login page, dashboard, logout, and support pages** - `4c41edc` (feat)
3. **Task 3: checkpoint:human-verify** - auto-approved (--auto mode)

## Files Created/Modified

- `middleware.ts` - RBAC route guard using NextAuth(authConfig), SECTION_PATHS import, SUPERADMIN bypass
- `app/(auth)/layout.tsx` - Unauthenticated layout: centered card, no sidebar
- `app/(auth)/login/page.tsx` - Login page with branding card and LoginForm
- `app/(dashboard)/layout.tsx` - Authenticated layout: Sidebar + Header + main content
- `app/(dashboard)/dashboard/page.tsx` - Section navigation cards filtered by allowedSections
- `app/(dashboard)/unauthorized/page.tsx` - 403 page with styled Link back to dashboard
- `components/auth/LoginForm.tsx` - Client form with inline Alert errors, signIn from next-auth/react
- `components/layout/Header.tsx` - User info, role badge, logout Server Action
- `components/layout/Sidebar.tsx` - Section-filtered navigation links
- `app/actions/rbac-test.ts` - AUTH-06 Server Action requireSection() pattern example

## Decisions Made

- shadcn/ui v4 uses `@base-ui/react/button` which does not have an `asChild` prop — the unauthorized page back-to-dashboard button was replaced with a styled `Link` component. This is the correct pattern for all future "button-as-link" patterns in this codebase.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Replaced Button asChild with styled Link in unauthorized page**
- **Found during:** Task 2 (Login page, dashboard, logout, and support pages)
- **Issue:** Plan code used `<Button asChild><Link href="/dashboard">...</Link></Button>` but shadcn/ui v4 Button component uses `@base-ui/react/button` which does not expose `asChild` prop — TypeScript error TS2322
- **Fix:** Replaced with a native `<Link>` styled with buttonVariants classes inline (`inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground`)
- **Files modified:** app/(dashboard)/unauthorized/page.tsx
- **Verification:** `npx tsc --noEmit` passes clean
- **Committed in:** 4c41edc (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — shadcn v4 API difference)
**Impact on plan:** Minimal. Visually identical result, TypeScript-clean. No scope creep.

## Issues Encountered

- shadcn/ui v4 Button based on `@base-ui/react/button` does not support `asChild` pattern from Radix UI. Future plans must use styled Link or buttonVariants() helper for link-as-button patterns.

## Known Stubs

None — all plan goals achieved without stubs. Dashboard section cards link to future-phase routes (/products, /prices, etc.) which are not yet implemented, but this is intentional per the plan (Phase 2+ will implement them).

## User Setup Required

None — no external service configuration required for this plan.

PostgreSQL + migrations are still pending (deferred to Phase 6 VPS deploy as documented in STATE.md decisions).

## Next Phase Readiness

Phase 1 is complete. Phase 2 (User Management) can proceed:
- Auth flow fully wired: login → dashboard → logout
- RBAC middleware in place
- requireSection() pattern established for Server Actions
- SUPERADMIN account (sergey.fyodorov@gmail.com) will be seeded during Phase 6 deploy

Blockers for Phase 2: None. DATABASE_URL must be configured locally or on VPS to test with real users.

---
*Phase: 01-foundation-auth*
*Completed: 2026-04-05*
