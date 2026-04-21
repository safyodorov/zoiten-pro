# Architecture Patterns

**Domain:** Marketplace ERP / Product Management System
**Project:** Zoiten ERP
**Researched:** 2026-04-05
**Confidence:** HIGH (Next.js official docs, Auth.js official docs, Prisma official docs)

---

## Recommended Architecture

A monolithic Next.js 14 fullstack app with clear internal layer separation. No microservices — the scale (50-200 products, ~10 users) does not warrant it. One process, one database, one deploy unit.

```
Browser (React Client Components)
       │
       ▼
Next.js App (port 3000)
  ├─ Pages & Layouts       (React Server Components — read-only views)
  ├─ Server Actions         (mutations: create, update, delete)
  ├─ Route Handlers         (file upload endpoint, future API consumers)
  └─ Middleware             (auth guard, RBAC enforcement)
       │
       ▼
Service Layer (lib/services/)
  ├─ product.service.ts
  ├─ brand.service.ts
  ├─ category.service.ts
  ├─ user.service.ts
  └─ upload.service.ts
       │
       ▼
Prisma ORM
       │
       ▼
PostgreSQL (localhost:5432 on VPS)

Static Files (uploads/)
  └─ public/uploads/products/{id}/photo.jpg
```

---

## Project Folder Structure

```
zoiten-pro/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx              ← shared sidebar/nav, auth guard
│   │   ├── page.tsx                ← home/landing
│   │   ├── products/
│   │   │   ├── page.tsx            ← product list with filters
│   │   │   ├── new/page.tsx        ← create product form
│   │   │   ├── [id]/
│   │   │   │   ├── page.tsx        ← product detail / edit
│   │   │   │   └── _components/    ← product-specific components
│   │   │   └── _lib/
│   │   │       ├── products.actions.ts   ← Server Actions
│   │   │       ├── products.loader.ts    ← data fetch for RSC
│   │   │       └── products.schema.ts    ← Zod validation schemas
│   │   ├── prices/page.tsx         ← stub
│   │   ├── weekly/page.tsx         ← stub
│   │   ├── inventory/page.tsx      ← stub
│   │   ├── batches/page.tsx        ← stub
│   │   ├── purchase-plan/page.tsx  ← stub
│   │   ├── sales-plan/page.tsx     ← stub
│   │   └── support/page.tsx        ← ai-cs-zoiten integration
│   ├── api/
│   │   ├── auth/[...nextauth]/
│   │   │   └── route.ts            ← NextAuth.js handler
│   │   └── uploads/
│   │       └── route.ts            ← multipart/form-data file handler
│   └── layout.tsx                  ← root layout, providers
│
├── lib/
│   ├── prisma.ts                   ← PrismaClient singleton
│   ├── auth.ts                     ← NextAuth config (callbacks, providers)
│   ├── services/
│   │   ├── product.service.ts
│   │   ├── brand.service.ts
│   │   ├── category.service.ts
│   │   ├── marketplace.service.ts
│   │   ├── user.service.ts
│   │   └── upload.service.ts
│   └── utils/
│       ├── volume.ts               ← auto-calculate volume from dimensions
│       └── soft-delete.ts          ← 30-day purge logic
│
├── components/
│   ├── ui/                         ← shadcn/ui primitives (auto-generated)
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   ├── Header.tsx
│   │   └── NavItem.tsx
│   └── shared/
│       ├── ProductCard.tsx
│       ├── StatusBadge.tsx
│       └── ConfirmDialog.tsx
│
├── middleware.ts                   ← RBAC route guard
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── public/
    └── uploads/
        └── products/               ← photo storage
```

---

## Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| RSC Pages (app/\*\*/page.tsx) | Data fetching at render time, no interactivity | Service layer (direct import), Client Components via props |
| Client Components (use client) | Interactive UI: forms, modals, optimistic updates | Server Actions, Route Handlers via fetch |
| Server Actions (\_lib/\*.actions.ts) | Mutations: validate input, call service, revalidate cache | Service layer only — never Prisma directly |
| Route Handlers (app/api/\*\*/route.ts) | File upload, future external API consumers | Service layer, filesystem |
| Service Layer (lib/services/) | Business logic, DB queries via Prisma | Prisma, upload.service, other services |
| Middleware (middleware.ts) | Auth guard, RBAC enforcement before request | NextAuth session, no business logic |
| Prisma ORM | Type-safe DB access, migrations | PostgreSQL only |

**Key rule:** Business logic lives only in `lib/services/`. Pages and Server Actions call services. Services call Prisma. Nothing else touches the DB directly.

---

## Data Flow

### Read Path (Product List)

```
Browser → GET /products
  → page.tsx (RSC, server-rendered)
    → products.loader.ts
      → product.service.ts
        → prisma.product.findMany(...)
          ← PostgreSQL rows
        ← typed Product[]
      ← data
    ← page renders with data
  → HTML streamed to browser
```

### Write Path (Create Product)

```
Browser fills form (Client Component)
  → submits FormData to Server Action (products.actions.ts)
    → Zod schema validation
    → product.service.ts.create(data)
      → prisma.product.create(...)
        ← new Product row
      ← Product
    → revalidatePath('/products')
  ← redirect or success state to client
```

### File Upload Path

```
Browser selects photo (Client Component)
  → POST /api/uploads (FormData, multipart)
    → route.ts: request.formData()
    → upload.service.ts
      → validate: JPEG/PNG, max 2MB, aspect ratio 3:4
      → write to /public/uploads/products/{productId}/{filename}
      ← { url: '/uploads/products/...' }
    ← { url } JSON response
  ← Client Component stores url, passes to product form
```

### Auth / RBAC Flow

```
Browser → any /dashboard route
  → middleware.ts runs first
    → auth() from NextAuth
    → if no session → redirect /login
    → if session but wrong role → redirect /unauthorized
    → else → request continues
  → layout.tsx wraps in session provider
  → RSC page checks session.user.role for fine-grained UI decisions
```

---

## Prisma Schema Design

### Core models

```prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String
  password  String   // bcrypt hash
  role      String   @default("viewer") // superadmin | manager | viewer
  sections  String[] // allowed ERP sections e.g. ["products", "prices"]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Marketplace {
  id       String              @id @default(cuid())
  name     String              @unique  // "WB", "Ozon", "ДМ", "ЯМ"
  articles MarketplaceArticle[]
}

model Brand {
  id         String      @id @default(cuid())
  name       String      @unique
  categories Category[]
  products   Product[]
}

model Category {
  id          String    @id @default(cuid())
  name        String
  brandId     String
  brand       Brand     @relation(fields: [brandId], references: [id])
  subcategories Subcategory[]
  products    Product[]
  @@unique([name, brandId])
}

model Subcategory {
  id         String    @id @default(cuid())
  name       String
  categoryId String
  category   Category  @relation(fields: [categoryId], references: [id])
  products   Product[]
  @@unique([name, categoryId])
}

model Product {
  id             String   @id @default(cuid())
  name           String   @db.VarChar(100)
  photoUrl       String?
  brandId        String
  brand          Brand    @relation(fields: [brandId], references: [id])
  categoryId     String?
  category       Category? @relation(fields: [categoryId], references: [id])
  subcategoryId  String?
  subcategory    Subcategory? @relation(fields: [subcategoryId], references: [id])
  abcStatus      String?  // "A" | "B" | "C"
  availability   String   @default("in_stock") // "in_stock" | "out_of_stock" | "discontinued"
  weightKg       Float?
  heightCm       Float?
  widthCm        Float?
  depthCm        Float?
  // volume is computed: heightCm * widthCm * depthCm / 1000 (liters)
  articles       MarketplaceArticle[]
  barcodes       Barcode[]
  deletedAt      DateTime?  // soft delete — null = active
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
}

model MarketplaceArticle {
  id            String      @id @default(cuid())
  productId     String
  product       Product     @relation(fields: [productId], references: [id])
  marketplaceId String
  marketplace   Marketplace @relation(fields: [marketplaceId], references: [id])
  article       String
  @@unique([productId, marketplaceId, article])
  // Up to 10 articles per marketplace per product enforced in service layer
}

model Barcode {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id])
  value     String  @unique
  // 1-20 barcodes per product enforced in service layer
}
```

### Schema design decisions

- Volume is a computed property, not stored — calculated on-the-fly from dimensions to prevent drift.
- Marketplace articles use a junction table, not a JSON column — enables indexed lookup by WB article, add/remove without full row update, and supports future marketplace integrations.
- Soft delete uses `deletedAt` nullable DateTime. All queries add `WHERE deletedAt IS NULL`. A cron/background job (or Prisma middleware) purges rows older than 30 days.
- RBAC sections stored as String[] on User model — simple, no separate permission table needed at this scale. Expand to a Permission model if roles grow complex.

---

## Authentication / RBAC Architecture

### NextAuth.js configuration

```typescript
// lib/auth.ts
export const authOptions = {
  providers: [CredentialsProvider({ ... })],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.sections = user.sections;
      }
      return token;
    },
    async session({ session, token }) {
      session.user.role = token.role;
      session.user.sections = token.sections;
      return session;
    },
  },
  session: { strategy: "jwt" },
};
```

### Middleware enforcement (route-level)

```typescript
// middleware.ts
export async function middleware(req: NextRequest) {
  const token = await getToken({ req });
  const { pathname } = req.nextUrl;

  if (!token) return NextResponse.redirect('/login');

  // Map URL segments to section names
  const sectionMap: Record<string, string> = {
    '/products': 'products',
    '/prices': 'prices',
    // ...
  };
  const section = Object.keys(sectionMap).find(k => pathname.startsWith(k));
  if (section && !token.sections?.includes(sectionMap[section])) {
    return NextResponse.redirect('/unauthorized');
  }
  return NextResponse.next();
}
export const config = { matcher: ['/((?!api|_next|login|public).*)'] };
```

### Permission layers

| Layer | Enforcement | Purpose |
|-------|------------|---------|
| middleware.ts | Before request — full redirect | Route-level section access |
| Server Action | Inside mutation | Prevent API-level bypass |
| UI Components | Client-side only | Hide buttons/links (UX, not security) |

Superadmin (role = "superadmin") bypasses section checks and can create/edit users via a dedicated `/admin/users` route protected by role check, not section check.

---

## File Upload Architecture

Storage: `/public/uploads/products/{productId}/photo.jpg` on VPS filesystem.

The `/public` directory is served directly by Next.js (Node.js server) as static files, with nginx proxying `/uploads` as a static location for performance.

```
# nginx config snippet
location /uploads/ {
    root /opt/zoiten-pro/public;
    expires 7d;
    add_header Cache-Control "public, immutable";
}
```

Upload flow in `app/api/uploads/route.ts`:
1. Receive `multipart/form-data` via `request.formData()`.
2. Validate MIME type (JPEG/PNG only), size (max 2MB), presence of productId.
3. Sharp library: resize to max 2000px tall, enforce 3:4 crop if needed, convert to JPEG.
4. Write to `public/uploads/products/{productId}/photo.jpg` (overwrite existing).
5. Return `{ url: '/uploads/products/{productId}/photo.jpg' }`.
6. Client stores URL in product form state, saves to DB on product submit.

**Why Route Handler (not Server Action) for uploads:** Server Actions use JSON serialization by default — binary file data requires a Route Handler that accepts `multipart/form-data` natively via the Web Request API.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Prisma calls in page.tsx / Server Actions directly
**What:** Importing `prisma` directly into page files or Server Actions.
**Why bad:** Bypasses service layer, scatters business logic, untestable, leads to duplicated query logic.
**Instead:** All Prisma calls go through `lib/services/*.service.ts`.

### Anti-Pattern 2: Client Components for all pages
**What:** Adding `"use client"` to product list pages to use hooks.
**Why bad:** Sends all product data-fetching JS to the browser, loses RSC streaming benefits, larger JS bundle.
**Instead:** Keep pages as RSC, use Client Components only for interactive islands (forms, modals, search input).

### Anti-Pattern 3: JSON column for marketplace articles
**What:** Storing `{ "WB": ["123", "456"], "Ozon": ["789"] }` in a JSON column on Product.
**Why bad:** Cannot index individual articles, cannot enforce uniqueness, cannot add per-article metadata later.
**Instead:** Separate `MarketplaceArticle` table (already in schema above).

### Anti-Pattern 4: Client-only RBAC
**What:** Hiding UI elements based on session role, but not enforcing in Server Actions.
**Why bad:** Any user who knows the Server Action endpoint can call it directly from DevTools.
**Instead:** Check role/sections at the start of every Server Action that mutates data.

### Anti-Pattern 5: Storing photos in database (BLOB/bytea)
**What:** Saving image binary data as a bytea field in PostgreSQL.
**Why bad:** Bloats DB, slows backups, no CDN caching, PostgreSQL not optimized for binary streaming.
**Instead:** Filesystem path (already decided in PROJECT.md).

---

## Suggested Build Order

Dependencies determine order. Later phases rely on foundations from earlier ones.

### Phase 1: Foundation
**Build:** Prisma schema + migrations, PrismaClient singleton, NextAuth credentials + JWT session, RBAC middleware skeleton, root layout, sidebar navigation shell.

**Why first:** Everything else depends on auth working and the DB schema being in place. Schema migrations are expensive to change once data exists.

**Delivers:** Can log in, see empty dashboard, routing works.

### Phase 2: Admin — User Management
**Build:** Superadmin user CRUD (`/admin/users`), bcrypt password hashing, section assignment UI, role-based sidebar filtering.

**Why second:** Needed before adding real team members. Superadmin must exist before other users.

**Delivers:** sergey.fyodorov@gmail.com can create team accounts.

### Phase 3: Reference Data
**Build:** Brand CRUD, Category/Subcategory CRUD (per-brand), Marketplace management (seed WB/Ozon/ДМ/ЯМ + add custom).

**Why third:** Products depend on brands and categories. These are lookup tables — create them before the main entity.

**Delivers:** Data dictionaries populated.

### Phase 4: Products Module (Core)
**Build:** Product CRUD (list, create, edit, delete), photo upload (Route Handler + Sharp), marketplace articles (up to 10 per MP), barcodes (1-20), soft delete, auto-volume calculation, copy product action, filters by availability/category/ABC.

**Why fourth:** The core ERP value. Depends on all prior phases.

**Delivers:** MVP — the primary stated value of the system.

### Phase 5: Module Stubs + Home Page
**Build:** Animated landing page (Framer Motion), stub pages for Prices/Weekly/Inventory/Batches/Purchase Plan/Sales Plan, Support section integration from ai-cs-zoiten.

**Why last:** Pure UI with no new data dependencies. Support integration is external code — treat as last-mile integration risk.

**Delivers:** Product feels complete even before future modules are built.

---

## Scalability Considerations

This system is purposefully scoped for 10 users and 50-200 products. These decisions hold at that scale. Notes for growth:

| Concern | At current scale (50-200 products) | At 10x scale (2000+ products) |
|---------|-------------------------------------|-------------------------------|
| Photos | Local filesystem, served by Next.js | Move to S3/Cloudflare R2 (change only `upload.service.ts`) |
| Auth | JWT sessions, 10 concurrent users | No change needed |
| DB | Single Postgres on VPS | Add read replica, connection pooling (PgBouncer) |
| API | No external API needed | Add versioned Route Handlers if mobile app needed |
| RBAC | sections[] on User | Extract to Permission model + policy table |

---

## Sources

- [Building APIs with Next.js (Official, Feb 2025)](https://nextjs.org/blog/building-apis-with-nextjs) — HIGH confidence
- [Auth.js Role-Based Access Control (Official)](https://authjs.dev/guides/role-based-access-control) — HIGH confidence
- [Next.js Project Structure (Official)](https://nextjs.org/docs/app/getting-started/project-structure) — HIGH confidence
- [Next.js 16 App Router Project Structure — Makerkit](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure) — MEDIUM confidence
- [Enterprise Patterns with the Next.js App Router — Medium](https://medium.com/@vasanthancomrads/enterprise-patterns-with-the-next-js-app-router-ff4ca0ef04c4) — MEDIUM confidence
- [Feature-Driven Architecture with Next.js — DEV Community](https://dev.to/rufatalv/feature-driven-architecture-with-nextjs-a-better-way-to-structure-your-application-1lph) — MEDIUM confidence
