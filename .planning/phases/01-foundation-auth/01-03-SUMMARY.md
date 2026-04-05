---
phase: 01-foundation-auth
plan: 03
subsystem: auth
tags: [auth, nextauth, jwt, rbac, typescript, edge-runtime]
dependency_graph:
  requires: [01-02]
  provides: [auth-config-split, jwt-sessions, rbac-utilities, session-types]
  affects: [01-04-middleware-login, all-future-phases]
tech_stack:
  added: []
  patterns:
    - Auth.js v5 mandatory config split (auth.config.ts Edge-safe, auth.ts Node.js-only)
    - JWT session strategy with role and allowedSections propagation through callbacks
    - TypeScript module augmentation for next-auth Session and JWT interfaces
    - Custom CredentialsSignin subclasses for specific error codes (D-06)
    - SUPERADMIN bypass pattern in requireSection() (D-11)
key_files:
  created:
    - lib/auth.config.ts
    - lib/auth.ts
    - lib/rbac.ts
    - lib/sections.ts
    - types/next-auth.d.ts
    - app/api/auth/[...nextauth]/route.ts
  modified: []
decisions:
  - auth.config.ts has no Prisma/bcrypt imports — mandatory for Edge runtime (middleware.ts)
  - Using string types in next-auth.d.ts instead of Prisma enums to avoid circular dependency
  - CredentialsSignin subclasses (InvalidCredentialsError, AccountDisabledError) for D-06 inline errors
metrics:
  duration: 5 minutes
  tasks_completed: 2
  files_created: 6
  files_modified: 0
  completed_date: "2026-04-05"
---

# Phase 01 Plan 03: Auth.js v5 JWT Sessions and RBAC Foundation Summary

Auth.js v5 credentials provider with mandatory Edge-safe config split, JWT callbacks propagating role and allowedSections, TypeScript session augmentation, and requireSection() RBAC utility with SUPERADMIN bypass.

## What Was Built

### lib/auth.config.ts — Edge-Compatible Config

- No Prisma or bcrypt imports — safe for Edge runtime (middleware.ts)
- `pages.signIn = "/login"` — configures Auth.js redirect target
- `authorized()` callback: redirects logged-in users away from /login, blocks unauthenticated access to protected routes
- Uses `satisfies NextAuthConfig` for type safety

### lib/auth.ts — Full Node.js Auth Config

- Spreads `authConfig` then adds credentials provider
- `session: { strategy: "jwt" }` — stateless JWT sessions (D-01)
- `InvalidCredentialsError` and `AccountDisabledError` extend `CredentialsSignin` with specific error codes (D-06)
- `authorize()` function: queries Prisma for user, checks `isActive`, compares bcrypt hash
- `jwt()` callback: copies `role` and `allowedSections` from user object to token on sign-in (D-02)
- `session()` callback: forwards `id`, `role`, `allowedSections` from token to session

### app/api/auth/[...nextauth]/route.ts

- Simple re-export of `{ GET, POST }` from handlers
- All logic lives in `lib/auth.ts`, not in the route file

### types/next-auth.d.ts — TypeScript Augmentation

- Augments `Session.user` with `id: string`, `role: string`, `allowedSections: string[]`
- Augments `User` interface with optional `role` and `allowedSections`
- Augments `JWT` interface with `id?`, `role?`, `allowedSections?`
- Uses `string` types (not Prisma enums) to avoid circular dependency and keep Edge-safe

### lib/sections.ts — Edge-Safe Section Path Map

- Maps 8 URL path prefixes to ERP_SECTION string values
- Zero Prisma imports — safe for middleware.ts (Edge runtime)
- Paths: /products, /prices, /weekly, /inventory, /batches, /purchase-plan, /sales-plan, /support

### lib/rbac.ts — Server Action RBAC Utilities

- `requireSection(section)`: throws UNAUTHORIZED (no session) or FORBIDDEN (no access); bypasses for SUPERADMIN (D-11)
- `requireSuperadmin()`: throws UNAUTHORIZED or FORBIDDEN if not superadmin
- `getCurrentUser()`: non-throwing, returns session user or null for RSC use

## Verification Results

- `lib/auth.config.ts` has no actual Prisma/bcrypt import statements: PASSED
- `lib/auth.ts` jwt() callback sets `token.role` and `token.allowedSections`: PASSED
- `lib/auth.ts` session() callback sets `session.user.role` and `session.user.allowedSections`: PASSED
- `types/next-auth.d.ts` augments Session with id/role/allowedSections: PASSED
- `lib/sections.ts` has no `@prisma/client` import statements: PASSED
- `lib/rbac.ts` exports `requireSection()` with SUPERADMIN bypass: PASSED
- `npx tsc --noEmit` produces zero errors on all new files: PASSED

## Deviations from Plan

None - plan executed exactly as written.

The assertion in the plan's verify step was overly broad (`cfg.includes('bcrypt')` catches comments).
Actual verification confirmed no import statements for bcrypt or Prisma in Edge files.

## Known Notes for Future Plans

- **Plan 01-04 (Middleware + Login UI)**: Import `authConfig` from `lib/auth.config.ts` in `middleware.ts`; import `{ auth, signIn, signOut }` from `lib/auth.ts` in Server Actions
- **All Server Actions**: Call `requireSection("SECTION_NAME")` at top of every mutating action
- **AUTH_SECRET env var**: Must be set in `.env.local` and VPS environment for JWT signing (Auth.js v5 naming)

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | f4cbc65 | feat(01-03): Auth.js v5 config split — auth.config.ts and auth.ts |
| 2 | 1eb0f6c | feat(01-03): TypeScript session augmentation, sections constants, and RBAC utility |

## Self-Check: PASSED
