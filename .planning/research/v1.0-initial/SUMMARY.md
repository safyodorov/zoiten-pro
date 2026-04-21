# Project Research Summary

**Project:** Zoiten ERP
**Domain:** Marketplace Seller ERP — Product Catalog Management (WB, Ozon, DM, YM)
**Researched:** 2026-04-05
**Confidence:** HIGH

## Executive Summary

Zoiten ERP is an internal product information management (PIM) system for a marketplace seller managing 50-200 SKUs across Wildberries, Ozon, Detsky Mir, and Yandex Market. At this scale, the right architecture is a monolithic Next.js fullstack app with a service layer, PostgreSQL, and VPS deployment — no microservices, no cloud storage, no API integrations in the MVP. The stack originally specified (Next.js 14) requires one correction: use Next.js 15.2.4 with Prisma 6 and Auth.js v5, as these versions are stable and specifically designed to work together with the App Router and middleware-based RBAC.

The recommended approach is to build in five sequential phases driven by hard dependencies: auth/DB foundation first, then admin user management, then reference data (brands, categories, marketplaces), then the core Products module, then polish (landing page, module stubs). The Products module is where almost all complexity lives — particularly around photo storage, soft delete, marketplace articles normalization, and RBAC enforcement. All five critical pitfalls are concentrated in Phase 3 (Products) and the two deployment decisions that must be made before Phase 3 begins.

The primary risk is making schema decisions that are expensive to change once data exists in production — specifically: storing uploads inside the Next.js project directory (causes file loss on redeploy), using JSONB for marketplace articles (blocks future API sync features), and missing partial unique indexes for soft-deleted barcodes (forces hard deletes). All three are schema/infrastructure decisions that must be locked before writing the first product query. Get these right in Phase 1-3 and Phase 4 is straightforward implementation.

---

## Key Findings

### Stack Recommendations

The pre-selected stack is sound with two version corrections. Use **Next.js 15.2.4** (not 14) — v15 has been stable since October 2024 and all community resources target it. Use **Prisma 6** (not 7) — Prisma 7 introduces a mandatory driver adapter that has documented compatibility issues with Next.js 15 and Turbopack. Use **Auth.js v5** (renamed from NextAuth v4) — v5 has native App Router middleware support that v4 lacks.

**Core technologies:**
- **Next.js 15.2.4 + React 19**: Fullstack framework — current stable, App Router mature, Turbopack stable
- **PostgreSQL 16**: Primary database — JSONB support, partial indexes required for soft delete
- **Prisma 6**: ORM + migrations — stable direct connection model, full Next.js 15 compatibility
- **Auth.js v5 beta**: Auth + RBAC — App Router native, JWT sessions, middleware enforcement
- **bcryptjs ^2.4.3**: Password hashing — pure JS, no native binding risk on VPS
- **shadcn/ui (CLI v4) + Tailwind v4**: UI components — CSS-first config, React 19 ready
- **motion 12.x** (formerly framer-motion): Animations — must be wrapped in `"use client"` boundaries
- **react-hook-form + zod**: Forms + validation — one schema for client and server action validation
- **Node.js 22 LTS + systemd + nginx**: Deployment — use `output: 'standalone'` in next.config.js

**Critical version notes:**
- Next.js 15: `cookies()` and `headers()` are now async; GET Route Handlers no longer cached by default
- Auth.js v5: env vars prefixed `AUTH_` (not `NEXTAUTH_`); `AUTH_SECRET` replaces `NEXTAUTH_SECRET`
- Tailwind v4: no `tailwind.config.js`; configuration lives in `globals.css` using `@theme`

### Expected Features

The MVP is the Products module. Every other module is a stub or future milestone.

**Must have (table stakes):**
- Auth + login/logout with session management
- RBAC: superadmin creates users, assigns section access per user
- Product CRUD: name, photo, articles (multi-value per marketplace), barcodes, dimensions, brand, category/subcategory, ABC status, availability
- Product list with text search and filter by availability status
- Copy product (deep copy, exclude photo)
- Soft delete with 30-day auto-purge cron job
- Brand CRUD + Category/Subcategory CRUD (per-brand, inline creation in product form)
- Marketplace list management (WB, Ozon, DM, YM + custom)
- Volume auto-calculation from dimensions (computed, not stored)

**Should have (differentiators):**
- ABC status field (manual A/B/C assignment — differentiates from basic catalog tools)
- Inline category creation inside product form (avoids context-switching)
- Per-brand category taxonomy (prevents cross-brand contamination)
- Animated landing page with Framer Motion (signals product quality)
- Placeholder tabs for future modules (reduces "when is pricing coming?" questions)

**Defer explicitly (v2+):**
- WB/Ozon API sync (OAuth, rate limiting, schema mapping — too complex for MVP)
- Bulk CSV import/export
- Multiple photos per product
- Audit log / change history
- Automated ABC classification (needs sales data that doesn't exist yet)
- Barcode scanner / camera capture

### Architecture Approach

A single-process Next.js monolith with strict internal layer separation: RSC pages fetch data via a service layer, Server Actions handle mutations through the same service layer, and middleware enforces RBAC before requests reach pages. All Prisma calls are confined to `lib/services/` — nothing else touches the database directly. Business logic lives in services; pages and Server Actions only orchestrate.

**Major components:**
1. **Middleware (`middleware.ts`)** — RBAC route guard before every request; redirects unauthenticated users to `/login`, unauthorized users to `/unauthorized`
2. **RSC Pages (`app/**/page.tsx`)** — server-rendered data fetching via loaders; no interactivity, no client bundle
3. **Server Actions (`*/_lib/*.actions.ts`)** — mutations with Zod validation, service calls, and `revalidatePath`; also enforce RBAC (middleware bypass prevention)
4. **Route Handlers (`app/api/`)** — file upload endpoint (multipart/form-data); future external API consumers
5. **Service Layer (`lib/services/`)** — all business logic and Prisma queries; the only layer that talks to the DB
6. **Prisma ORM + PostgreSQL** — type-safe DB access; `deletedAt` soft delete pattern with Prisma Client Extension

**Key Prisma schema decisions:**
- `MarketplaceArticle` as a normalized junction table (not JSONB) — enables indexed lookup, uniqueness enforcement, future API sync
- `deletedAt` nullable DateTime on Product — use Prisma Client Extension (not deprecated middleware) to inject `deletedAt: null` globally
- Partial unique indexes for Barcode and MarketplaceArticle — manual SQL in migration file since Prisma doesn't generate these
- Enums for `AbcStatus` (A/B/C) and `Availability` (IN_STOCK/OUT_OF_STOCK/DISCONTINUED) — TypeScript compile-time enforcement
- Volume is not stored — computed from dimensions at read time

### Critical Pitfalls

1. **Photos stored in `/public/uploads/`** — Files written to the Next.js project directory are wiped on redeploy and not included in standalone builds. Store photos at `/var/www/zoiten-uploads/` and serve via nginx `alias` directive. Decision must be made before writing the first upload route.

2. **Soft delete filter omission in nested queries** — Prisma has no built-in global soft delete. The deprecated middleware approach fails on nested `include` queries. Use a Prisma Client Extension to inject `deletedAt: null` globally, plus a shared `activeProduct()` helper. Must be in place before writing any product queries.

3. **Unique constraint clash with soft delete** — PostgreSQL enforces `@unique` on all rows including soft-deleted ones. Barcodes and marketplace articles from deleted products block reassignment. Fix: partial unique indexes (`WHERE deletedAt IS NULL`) added manually to the migration SQL. Must be done before first production migration.

4. **NextAuth role not propagated to session** — Custom fields like `role` and `sections` are not automatically included in the JWT. Must explicitly forward through `jwt()` then `session()` callbacks and extend TypeScript types in `next-auth.d.ts`. Without this, all RBAC checks return undefined. Fix on Day 1 before writing any permission check.

5. **Middleware-only RBAC** — `middleware.ts` only protects page navigation; direct API calls to Route Handlers bypass it entirely. RBAC must be enforced in three places: middleware (page nav), Server Actions (mutation protection), and Route Handlers (API protection). Treat middleware as a UX optimization, not the security layer.

---

## Implications for Roadmap

Based on research, the dependency chain is clear: auth/DB must exist before users, reference data before products, products before UI polish. The suggested build order follows hard data dependencies, not feature priority.

### Phase 1: Foundation
**Rationale:** Everything depends on auth working and the DB schema being stable. Schema migrations are expensive once data exists. Prisma singleton, NextAuth v5 config split (auth.config.ts + auth.ts), and RBAC middleware must be correct from the start.
**Delivers:** Working login, empty dashboard, routing, RBAC middleware skeleton
**Addresses:** Auth + session management, RBAC route protection
**Avoids:** Pitfall 4 (role not in session — set up jwt/session callbacks here), Pitfall 5 (middleware-only RBAC — establish three-layer enforcement pattern here), Pitfall 14 (missing env vars — use `EnvironmentFile` in systemd)
**Research flag:** Standard patterns (Auth.js v5 official docs are clear)

### Phase 2: Admin — User Management
**Rationale:** Superadmin must exist and be able to create team accounts before the system is used by anyone other than the developer. Depends on Phase 1 auth being complete.
**Delivers:** `sergey.fyodorov@gmail.com` can create user accounts, assign section access, set passwords
**Addresses:** Superadmin CRUD, bcrypt password hashing, role-based sidebar filtering
**Avoids:** Pitfall 5 (double-check Server Actions enforce role, not just middleware)
**Research flag:** Standard patterns (bcryptjs, shadcn/ui form components)

### Phase 3: Reference Data
**Rationale:** Products depend on brands, categories, and marketplace definitions. These are lookup tables that must be seeded before the product form can function. Soft delete and partial index decisions for these entities must be finalized here.
**Delivers:** Brand CRUD, Category/Subcategory CRUD (per-brand), Marketplace management (WB/Ozon/DM/YM + custom)
**Addresses:** Per-brand category taxonomy, inline category creation
**Avoids:** Pitfall 10 (brand cascade delete — set `onDelete: Restrict`, add UI guard)
**Research flag:** Standard patterns

### Phase 4: Products Module (Core MVP)
**Rationale:** The core ERP value. Depends on all prior phases. This phase has the highest concentration of pitfalls — photo storage, soft delete, marketplace articles normalization, barcode uniqueness, and cron cleanup must all be handled correctly the first time.
**Delivers:** Full product CRUD (list, create, edit, delete, copy), photo upload, marketplace articles, barcodes, soft delete with 30-day cleanup cron, filters
**Addresses:** All table-stakes features from FEATURES.md
**Avoids:**
- Pitfall 1 (photos outside project tree — nginx alias to `/var/www/zoiten-uploads/`)
- Pitfall 2 (soft delete filter — Prisma Client Extension before first query)
- Pitfall 3 (partial unique indexes — edit migration SQL before pushing to production)
- Pitfall 8 (Server Action 1MB limit — `bodySizeLimit: '3mb'` + nginx `client_max_body_size 5m`)
- Pitfall 9 (JSONB for articles — normalized `MarketplaceArticle` table confirmed in schema)
- Pitfall 12 (missing cron — ship cleanup in same PR as soft delete)
**Research flag:** Needs careful implementation. Photo upload architecture (Route Handler, not Server Action) and soft delete extension are the two highest-risk implementation details.

### Phase 5: Landing Page + Module Stubs
**Rationale:** Pure UI work with no new data dependencies. Framer Motion animations, branded landing page, and stub pages for future modules complete the product feel. Support integration (ai-cs-zoiten repo) is treated as last-mile integration risk.
**Delivers:** Animated landing page, placeholder tabs for Prices/Weekly/Inventory/Batches/Purchase Plan/Sales Plan, Support section integration
**Addresses:** Differentiator features from FEATURES.md (animations, placeholder navigation)
**Avoids:** Framer Motion "use client" boundary — every `motion.*` component must be in a client component
**Research flag:** Standard patterns for animations. Support integration from external repo may need its own research spike.

### Phase Ordering Rationale

- Auth before everything: middleware guards, Server Action checks, and session propagation must be wired correctly before any feature is built on top of them.
- Reference data before products: the product form is unusable without brands, categories, and marketplace definitions populated.
- Schema decisions in Phase 1 and 4 are load-bearing: partial unique indexes, soft delete extension, and photo storage path must be correct before production data is written.
- UI polish last: Framer Motion and landing page have zero dependencies and zero risk — they should not block core functionality.

### Research Flags

Phases needing deeper research during planning:
- **Phase 4 (Products):** Photo upload Route Handler vs. Server Action distinction, Sharp integration for image processing, Prisma Client Extension syntax for soft delete global filter — these are specific enough to warrant reviewing official docs and examples at implementation time.
- **Phase 5 (Support integration):** The ai-cs-zoiten repository is external code with unknown API surface. Needs a discovery spike before committing to architecture.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** Auth.js v5 App Router setup is fully documented in official docs.
- **Phase 2 (User management):** bcryptjs + shadcn/ui form is a standard pattern.
- **Phase 3 (Reference data):** Simple CRUD with relational constraints — no novel patterns.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | All recommendations drawn from official docs and changelogs. Version numbers verified as of March 2026. |
| Features | HIGH | Table stakes drawn from explicit spec + PIM domain standards. Anti-features are clear scope decisions. |
| Architecture | HIGH | Official Next.js, Auth.js, and Prisma docs are primary sources. Service layer pattern is well-established. |
| Pitfalls | HIGH | Each pitfall references the specific GitHub issue or official doc confirming the behavior. All are reproducible. |

**Overall confidence:** HIGH

### Gaps to Address

- **Sharp integration for image processing:** ARCHITECTURE.md recommends Sharp for resize/crop on upload but STACK.md doesn't include it in the install list. Confirm Sharp works correctly on Node.js 22 LTS on VPS (native bindings — may need `--ignore-scripts` workaround or `sharp@latest` which includes pre-built binaries).
- **Photo storage outside project tree during development:** Using `/var/www/zoiten-uploads/` works on VPS but on local dev the path won't exist. Need a dev/prod configuration strategy — either environment variable for upload path or a local fallback directory.
- **Auth.js v5 TypeScript session augmentation:** The `next-auth.d.ts` module augmentation syntax changed between v4 and v5. Confirm the exact interface extension pattern for `role` and `sections` fields before writing RBAC checks.
- **CantonFairBot nginx configuration:** PITFALLS.md correctly flags this risk but the existing nginx config on the VPS is unknown. Run `nginx -T` on the VPS before touching any config to understand the current state.

---

## Sources

### Primary (HIGH confidence)
- [Next.js 15 Release Blog](https://nextjs.org/blog/next-15) — version upgrade rationale
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting) — standalone output, VPS deployment
- [Auth.js Role-Based Access Control (Official)](https://authjs.dev/guides/role-based-access-control) — RBAC callbacks, middleware
- [Prisma ORM 7 Release Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0) — why to stay on v6
- [Prisma Migrate Workflows (Official)](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production) — `migrate deploy` vs `migrate dev`
- [Building APIs with Next.js (Official, Feb 2025)](https://nextjs.org/blog/building-apis-with-nextjs) — Route Handler architecture

### Secondary (MEDIUM confidence)
- [Soft Delete: Implementation Issues in Prisma — ZenStack](https://zenstack.dev/blog/soft-delete) — Prisma Client Extension approach
- [How to Implement Soft Delete with Prisma using Partial Indexes — ThisDot](https://www.thisdot.co/blog/how-to-implement-soft-delete-with-prisma-using-partial-indexes) — partial index migration pattern
- [shadcn/ui Tailwind v4 Docs](https://ui.shadcn.com/docs/tailwind-v4) — CLI v4, Tailwind v4 config
- [Next.js Current Version March 2026 — abhs.in](https://www.abhs.in/blog/nextjs-current-version-march-2026-stable-release-whats-new) — version confirmation
- [Next.js File Upload Server Actions — akoskm](https://akoskm.com/file-upload-with-nextjs-14-and-server-actions/) — upload pattern

### Tertiary (LOW confidence)
- [Enterprise Patterns with Next.js App Router — Medium](https://medium.com/@vasanthancomrads/enterprise-patterns-with-the-next-js-app-router-ff4ca0ef04c4) — folder structure patterns (validate against official docs)
- [RBAC in ERP Systems — Procuzy](https://procuzy.com/blog/role-based-access-control-in-erp-systems/) — section-based permission model rationale

---

*Research completed: 2026-04-05*
*Ready for roadmap: yes*
