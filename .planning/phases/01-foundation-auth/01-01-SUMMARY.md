---
phase: 01-foundation-auth
plan: 01
subsystem: scaffold
tags: [next.js, typescript, tailwind, shadcn, setup]
dependency_graph:
  requires: []
  provides: [next.js-project, tailwind-v4, shadcn-ui, typescript-strict]
  affects: [all-future-plans]
tech_stack:
  added:
    - next@15.5.14
    - react@19.2.4
    - next-auth@5.0.0-beta.30
    - prisma@6.19.3
    - "@prisma/client@6.19.3"
    - bcryptjs@3.0.3
    - react-hook-form@7.72.1
    - zod@4.3.6
    - "@hookform/resolvers@5.2.2"
    - tailwindcss@4.2.2
    - "@tailwindcss/postcss@4.2.2"
    - tw-animate-css@1.4.0
    - "@base-ui/react@1.3.0"
    - clsx@2.1.1
    - tailwind-merge@3.5.0
    - lucide-react@1.7.0
  patterns:
    - App Router with route groups (auth) and (dashboard)
    - Tailwind v4 CSS-first config (no tailwind.config.js)
    - shadcn/ui v4 base-nova style with @base-ui/react primitives
key_files:
  created:
    - package.json
    - tsconfig.json
    - next.config.ts
    - .env.example
    - .gitignore
    - postcss.config.mjs
    - components.json
    - app/layout.tsx
    - app/globals.css
    - app/page.tsx
    - lib/utils.ts
    - components/ui/button.tsx
    - components/ui/input.tsx
    - components/ui/label.tsx
    - components/ui/form.tsx
    - components/ui/card.tsx
    - components/ui/alert.tsx
    - components/ui/badge.tsx
    - components/ui/avatar.tsx
  modified: []
decisions:
  - shadcn v4 uses base-nova style with @base-ui/react instead of radix-ui
  - form.tsx manually created (not in shadcn v4 registry) using react-hook-form without Radix Slot
  - typedRoutes removed from next.config.ts (moved in Next.js 15.5.x, no longer experimental)
  - bcryptjs@3.0.3 installed instead of 2.4.3 (newer compatible release)
  - zod@4.3.6 installed instead of 3.x (newer major, compatible API)
metrics:
  duration: 7 minutes
  tasks_completed: 2
  files_created: 19
  completed_date: "2026-04-05"
---

# Phase 01 Plan 01: Project Scaffold Summary

Next.js 15.5.14 project scaffolded with TypeScript strict mode, Tailwind v4 CSS-first config, shadcn/ui v4 base-nova style, and all Phase 1 dependencies installed.

## What Was Scaffolded

**Next.js version:** 15.5.14
**React version:** 19.2.4
**Auth:** next-auth@beta (5.0.0-beta.30)
**Database ORM:** prisma@6.19.3 + @prisma/client@6.19.3
**UI:** tailwindcss@4.2.2 + shadcn/ui v4 (base-nova) + @base-ui/react@1.3.0

### Key Dependency Versions

| Package | Version | Notes |
|---------|---------|-------|
| next | ^15.5.14 | Latest 15.x stable |
| react | ^19.2.4 | Required by Next.js 15 |
| next-auth | ^5.0.0-beta.30 | Auth.js v5 beta |
| prisma + @prisma/client | ^6.19.3 | Prisma 6 (not 7) |
| bcryptjs | ^3.0.3 | Pure JS password hashing |
| react-hook-form | ^7.72.1 | Form state |
| zod | ^4.3.6 | Schema validation |
| @hookform/resolvers | ^5.2.2 | RHF + Zod bridge |
| tailwindcss | ^4.2.2 | CSS-first, no tailwind.config.js |
| @base-ui/react | ^1.3.0 | shadcn v4 primitive (replaced radix-ui) |

### Folder Structure Created

```
/Users/macmini/zoiten.pro/
├── app/
│   ├── (auth)/login/
│   ├── (dashboard)/dashboard/
│   ├── (dashboard)/unauthorized/
│   ├── api/auth/[...nextauth]/
│   ├── actions/
│   ├── globals.css         # Tailwind v4 full theme config
│   ├── layout.tsx          # Root layout with Geist font
│   └── page.tsx            # Redirects /login
├── components/
│   ├── auth/
│   ├── layout/
│   └── ui/                 # 8 shadcn components
│       ├── alert.tsx
│       ├── avatar.tsx
│       ├── badge.tsx
│       ├── button.tsx
│       ├── card.tsx
│       ├── form.tsx
│       ├── input.tsx
│       └── label.tsx
├── lib/
│   ├── services/
│   └── utils.ts            # cn() function
├── prisma/
├── tests/
├── types/
├── components.json
├── next.config.ts          # standalone output
├── package.json
├── postcss.config.mjs
└── tsconfig.json           # strict mode, @/* alias
```

## Verification Results

- TypeScript strict mode: PASSED (no compile errors)
- `next.config.ts` has `output: "standalone"`: PASSED
- `tsconfig.json` has `"strict": true`: PASSED
- shadcn components (8): PASSED
- `lib/utils.ts` with `cn()`: PASSED
- Dev server starts: PASSED (ready in 1315ms)
- `.env.local` with DATABASE_URL and AUTH_SECRET: PASSED (not committed)
- `.env.example` committed: PASSED

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed deprecated `experimental.typedRoutes` in next.config.ts**
- **Found during:** Task 2 (dev server test)
- **Issue:** Next.js 15.5.x moved `typedRoutes` out of `experimental` — caused a warning on startup
- **Fix:** Removed `experimental: { typedRoutes: false }` from next.config.ts
- **Files modified:** next.config.ts

### Deviations (Not Bugs)

**2. shadcn v4 uses base-nova style with @base-ui/react**
- shadcn/ui CLI v4 (4.1.2) defaults to `base-nova` style and `@base-ui/react` instead of radix-ui
- This is newer than described in STACK.md (which referenced earlier shadcn v4)
- `base-nova` is the current default style; components API is compatible for our use case

**3. form.tsx manually created**
- The `form` component is not in the shadcn v4 `base-nova` registry (it was specific to radix-ui style)
- Created manually using standard react-hook-form patterns without `@radix-ui/react-slot`
- Uses `<div>` wrapper for `FormControl` instead of Slot passthrough

**4. bcryptjs@3.0.3 installed (plan specified ^2.4.3)**
- npm resolved to 3.0.3 which is a newer compatible release
- API is identical: `bcrypt.hash()` and `bcrypt.compare()` work the same

**5. zod@4.3.6 installed (STACK.md referenced ^3.x)**
- npm resolved to 4.3.6; zod v4 is a new major but schema API is compatible for our use case
- No breaking changes in schema definition patterns used in this project

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 07945ae | Scaffold Next.js 15 with all core dependencies |
| 2 | 4cb58c1 | Initialize shadcn/ui v4 with Tailwind v4 and Phase 1 components |

## Self-Check: PASSED
