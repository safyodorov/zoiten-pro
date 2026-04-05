# Phase 1: Foundation & Auth - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Scaffold Next.js 15 project with TypeScript, Tailwind v4, shadcn/ui v4. Connect PostgreSQL via Prisma 6 with full schema for all core entities. Implement Auth.js v5 credentials login with JWT sessions carrying role and sections. Enforce RBAC at middleware AND API route levels. Seed superadmin account.

</domain>

<decisions>
## Implementation Decisions

### Session Strategy
- **D-01:** JWT sessions stored in httpOnly cookies. Stateless — no database session table needed at this scale (10 users).
- **D-02:** JWT payload carries: userId, email, role, allowedSections array.
- **D-03:** Role changes take effect after re-login (acceptable for internal tool).

### Post-Login Experience
- **D-04:** After login, redirect to `/dashboard` — a simple page with navigation cards to all ERP sections the user has access to.
- **D-05:** Sections the user doesn't have access to are hidden (not shown as disabled).

### Auth Error Handling
- **D-06:** Login errors (wrong password, user not found, deactivated) shown as inline alert on `/login` page. No toast — simple and clear.
- **D-07:** Unauthorized access to a section redirects to `/unauthorized` page with a message and link back to dashboard.

### RBAC Sections
- **D-08:** Sections defined as Prisma enum: PRODUCTS, PRICES, WEEKLY_CARDS, STOCK, COST, PROCUREMENT, SALES, SUPPORT, USER_MANAGEMENT
- **D-09:** User model has `allowedSections` field (array of section enums).
- **D-10:** Middleware checks session for authentication. Server Actions and API routes independently verify section access.
- **D-11:** Superadmin role bypasses section checks (access to everything).

### Claude's Discretion
- Project folder structure within App Router conventions
- Prisma schema field naming conventions (camelCase vs snake_case)
- Specific shadcn/ui components to install initially
- Error page design and styling

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Specs
- `.planning/PROJECT.md` — Project context, constraints, tech stack decisions
- `.planning/REQUIREMENTS.md` — FOUND-01..04, AUTH-01..08 requirements for this phase
- `.planning/ROADMAP.md` — Phase 1 details, success criteria, dependencies

### Research
- `.planning/research/STACK.md` — Validated stack: Next.js 15, Prisma 6, Auth.js v5, Tailwind v4
- `.planning/research/ARCHITECTURE.md` — App Router structure, RBAC pattern, service layer
- `.planning/research/PITFALLS.md` — NextAuth JWT callbacks, RBAC enforcement layers, Prisma singleton

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — this phase establishes the foundational patterns

### Integration Points
- Prisma schema will be the foundation for all subsequent phases
- Auth middleware will protect all future routes
- Dashboard layout will be reused across all ERP sections

</code_context>

<specifics>
## Specific Ideas

- Superadmin email: sergey.fyodorov@gmail.com, password: stafurovonet (seeded via prisma db seed)
- Next.js 15.2.4 (not 14), React 19, Tailwind v4, Auth.js v5 (not NextAuth v4)
- Prisma 6 (not 7 — documented issues with driver adapters)
- Use bcryptjs (pure JS) not native bcrypt (avoid binary compatibility issues on VPS)
- Prisma singleton pattern in lib/prisma.ts mandatory
- auth.config.ts / auth.ts split pattern for Edge middleware compatibility

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-foundation-auth*
*Context gathered: 2026-04-05*
