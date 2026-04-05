---
phase: 01-foundation-auth
plan: 02
subsystem: database
tags: [prisma, postgresql, schema, migrations, seed, rbac]
dependency_graph:
  requires: [01-01]
  provides: [prisma-schema, prisma-singleton, superadmin-seed, db-models]
  affects: [01-03-auth, all-future-phases]
tech_stack:
  added:
    - tsx@4.21.0
  patterns:
    - PrismaClient singleton via globalThis to prevent hot-reload connection pool exhaustion
    - Prisma upsert pattern for idempotent seed scripts
    - Soft delete via deletedAt DateTime? field on Product
    - ERP_SECTION enum for RBAC allowedSections array on User
key_files:
  created:
    - prisma/schema.prisma
    - prisma/seed.ts
    - lib/prisma.ts
  modified:
    - package.json
decisions:
  - Migration marked pending (no local PostgreSQL); will run on VPS during Phase 6 deploy
  - tsx used as seed runner instead of ts-node (simpler, no CommonJS config needed)
  - Barcode.value uses @unique for MVP; Phase 4 must convert to partial unique index for soft-delete compatibility
metrics:
  duration: 8 minutes
  tasks_completed: 2
  files_created: 3
  files_modified: 1
  completed_date: "2026-04-05"
---

# Phase 01 Plan 02: Prisma Schema and Database Foundation Summary

Full Prisma schema with 8 models and 4 enums covering all ERP entities, PrismaClient singleton for Next.js hot-reload safety, and superadmin seed script using bcryptjs cost factor 12.

## What Was Built

### Prisma Schema (`prisma/schema.prisma`)

**4 enums:**
| Enum | Values |
|------|--------|
| `UserRole` | SUPERADMIN, MANAGER, VIEWER |
| `ERP_SECTION` | PRODUCTS, PRICES, WEEKLY_CARDS, STOCK, COST, PROCUREMENT, SALES, SUPPORT, USER_MANAGEMENT |
| `AbcStatus` | A, B, C |
| `Availability` | IN_STOCK, OUT_OF_STOCK, DISCONTINUED, DELETED |

**8 models:**
| Model | Key Fields |
|-------|-----------|
| `User` | id, email (unique), name, password (bcrypt), role (UserRole), allowedSections (ERP_SECTION[]), isActive |
| `Marketplace` | id, name (unique), slug (unique) |
| `Brand` | id, name (unique), categories[], products[] |
| `Category` | id, name, brandId → Brand; @@unique([name, brandId]) |
| `Subcategory` | id, name, categoryId → Category (Cascade); @@unique([name, categoryId]) |
| `Product` | id, name (VarChar 100), photoUrl?, brandId, categoryId?, subcategoryId?, abcStatus?, availability, weight/dimensions, deletedAt? |
| `MarketplaceArticle` | id, productId → Product (Cascade), marketplaceId → Marketplace, article; @@unique([productId, marketplaceId, article]) |
| `Barcode` | id, productId → Product (Cascade), value (@unique) |

### PrismaClient Singleton (`lib/prisma.ts`)

Uses `globalForPrisma` pattern on `globalThis` to prevent multiple PrismaClient instances during Next.js hot-reload in development. Production always creates a fresh instance.

### Superadmin Seed (`prisma/seed.ts`)

Idempotent `upsert` for `sergey.fyodorov@gmail.com` with:
- Role: `UserRole.SUPERADMIN`
- Password: bcryptjs hash of `stafurovonet` (cost factor 12)
- `allowedSections: []` (ignored for SUPERADMIN per RBAC rules)
- `isActive: true`

### Package Configuration

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

Scripts added: `db:migrate`, `db:seed`, `db:studio`

## Migration Status

**Status: PENDING** — PostgreSQL is not installed in the local development environment.

Migration must be run on the VPS after PostgreSQL installation (Phase 6):
```bash
npx prisma migrate dev --name init
npx prisma db seed
```

The schema is fully valid (`npx prisma validate` exits 0). Prisma Client was generated successfully from the schema.

## Verification Results

- `npx prisma validate` exits 0: PASSED
- `npx prisma generate` completed successfully: PASSED
- `lib/prisma.ts` contains `globalForPrisma` singleton pattern: PASSED
- `prisma/seed.ts` contains `sergey.fyodorov@gmail.com` with `UserRole.SUPERADMIN`: PASSED
- `package.json` has `"prisma": { "seed": "tsx prisma/seed.ts" }`: PASSED
- 4 enums in schema: PASSED
- 8 models in schema: PASSED
- Migration: PENDING (PostgreSQL unavailable locally)
- Seed run: PENDING (requires migration first)

## Deviations from Plan

**1. Skipped `npx prisma init`** — prisma/ directory already existed from Plan 01-01 scaffold (was empty). Wrote schema.prisma directly. No functional impact.

**2. Migration marked as PENDING** — No local PostgreSQL installation found. Per plan instructions: "If PostgreSQL is not available locally yet, skip the migration step and note it in the summary." Migration will run on VPS deployment in Phase 6.

**3. Prisma config deprecation warning** — Prisma 6 warns that `package.json#prisma` config will be removed in Prisma 7 (recommends `prisma.config.ts`). Since the project uses Prisma 6 (not 7), this is a non-issue. The `package.json` approach is the correct one for Prisma 6.

## Known Notes for Future Plans

- **Phase 4**: Barcode.value `@unique` must be converted to a partial unique index `WHERE deletedAt IS NULL` on parent Product for correct soft-delete behavior
- **Plan 01-03 (Auth)**: Can import `prisma` from `lib/prisma.ts` and use `UserRole`, `ERP_SECTION` from `@prisma/client`
- **VPS deploy (Phase 6)**: Run `npx prisma migrate dev --name init` then `npx prisma db seed` to initialize the database

## Task Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 4039aba | feat(01-02): initialize Prisma schema with all ERP models and enums |
| 2 | 11be269 | feat(01-02): add PrismaClient singleton, superadmin seed, and db scripts |

## Self-Check: PASSED
