# Phase 1: Foundation & Auth — Research

**Researched:** 2026-04-05
**Domain:** Next.js 15 App Router, Auth.js v5, Prisma 6, PostgreSQL, shadcn/ui v4, Tailwind v4
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**D-01:** JWT sessions stored in httpOnly cookies. Stateless — no database session table needed at this scale (10 users).

**D-02:** JWT payload carries: userId, email, role, allowedSections array.

**D-03:** Role changes take effect after re-login (acceptable for internal tool).

**D-04:** After login, redirect to `/dashboard` — a simple page with navigation cards to all ERP sections the user has access to.

**D-05:** Sections the user doesn't have access to are hidden (not shown as disabled).

**D-06:** Login errors (wrong password, user not found, deactivated) shown as inline alert on `/login` page. No toast — simple and clear.

**D-07:** Unauthorized access to a section redirects to `/unauthorized` page with a message and link back to dashboard.

**D-08:** Sections defined as Prisma enum: `PRODUCTS, PRICES, WEEKLY_CARDS, STOCK, COST, PROCUREMENT, SALES, SUPPORT, USER_MANAGEMENT`

**D-09:** User model has `allowedSections` field (array of section enums).

**D-10:** Middleware checks session for authentication. Server Actions and API routes independently verify section access.

**D-11:** Superadmin role bypasses section checks (access to everything).

### Claude's Discretion

- Project folder structure within App Router conventions
- Prisma schema field naming conventions (camelCase vs snake_case)
- Specific shadcn/ui components to install initially
- Error page design and styling

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.

</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| FOUND-01 | Next.js 15 project initialized with TypeScript, Tailwind v4, shadcn/ui v4 | Exact `create-next-app@15` command + `npx shadcn@latest init` flow documented |
| FOUND-02 | PostgreSQL database connected via Prisma 6 with migration system | Prisma 6.19.3 install, `prisma init`, `.env` DATABASE_URL, `prisma migrate dev` locally |
| FOUND-03 | Prisma schema covers all core entities (User, Product, Brand, Category, Marketplace, MarketplaceArticle, Barcode) | Full schema with enums in Architecture Patterns section |
| FOUND-04 | Prisma singleton pattern implemented (lib/prisma.ts) | Singleton code example in Code Examples section |
| AUTH-01 | User can log in with email/password using Auth.js v5 credentials provider | `auth.config.ts` + `auth.ts` split + authorize function documented |
| AUTH-02 | User session persists across browser refresh (JWT strategy) | `session: { strategy: "jwt" }` in `auth.ts`, JWT stored in httpOnly cookie |
| AUTH-03 | User can log out from any page | `signOut()` from `next-auth` called in Server Action or form action |
| AUTH-04 | Passwords hashed with bcryptjs before storage | `bcryptjs@^2.4.3` — `bcrypt.hash()` on create, `bcrypt.compare()` on verify |
| AUTH-05 | Superadmin (sergey.fyodorov@gmail.com) seeded on first deploy | `prisma/seed.ts` with `upsert`, `package.json` prisma.seed script |
| AUTH-06 | RBAC enforced at middleware level (route redirect) AND in API routes/Server Actions | `middleware.ts` uses edge-compatible `auth`, Server Actions call `requireSection()` utility |
| AUTH-07 | JWT carries user role and allowed sections array | `jwt()` callback sets `token.role` and `token.allowedSections`; `session()` forwards both |
| AUTH-08 | next-auth.d.ts type augmentation for role/sections in session | Module augmentation pattern for `Session` and `JWT` interfaces documented |

</phase_requirements>

---

## Summary

Phase 1 is a greenfield foundation phase with no existing code. The full stack is pre-decided and locked: Next.js 15 (latest stable: 15.5.14 as of registry check April 2026), Prisma 6 (latest: 6.19.3), Auth.js v5 (`next-auth@beta` = 5.0.0-beta.30), shadcn/ui v4, Tailwind v4. All versions verified against npm registry.

The critical architectural insight for this phase is the **auth.config.ts / auth.ts split** — mandatory for Auth.js v5 with Prisma in Next.js middleware (which runs on the Edge runtime). The credentials provider and Prisma adapter cannot both be in the same file used by middleware; the edge-compatible config lives in `auth.config.ts` (no Prisma), the full config lives in `auth.ts` (includes Prisma adapter if needed — but since we use JWT strategy, Prisma adapter is NOT needed; Prisma is used only in the `authorize` function).

RBAC must be enforced in two places: `middleware.ts` (page-level redirect) and individually inside every Server Action or Route Handler that mutates protected data. Middleware alone is not sufficient — it only guards navigation, not direct API calls.

**Primary recommendation:** Init project with `create-next-app@15.5.14`, split auth config correctly from day 1, use Prisma enums for all status/section fields, and implement the Prisma singleton immediately to prevent connection pool exhaustion in development.

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | **15.5.14** | Fullstack framework with App Router | Latest stable in 15.x series (registry-verified April 2026). Locked to 15.x per decisions. |
| react | **19.2.4** | UI runtime | Required by Next.js 15. |
| typescript | **5.x** | Type safety | Ships with `create-next-app`. Use `strict: true`. |
| prisma | **6.19.3** | ORM + migration CLI | Latest Prisma 6 (registry-verified). v7 excluded per locked decision. |
| @prisma/client | **6.19.3** | Type-safe DB access | Must match prisma CLI version. |
| next-auth | **5.0.0-beta.30** (npm: `next-auth@beta`) | Auth sessions + RBAC | Auth.js v5 — only version with deep Next.js 15 App Router support. |
| bcryptjs | **^2.4.3** | Password hashing | Pure JS, no native bindings — safe for VPS with unknown Node.js toolchain. |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| tailwindcss | **4.2.2** | Styling | CSS-first, no `tailwind.config.js`. Config in `globals.css` via `@theme`. |
| tw-animate-css | **^1.4.0** | Animation utilities | Replaces `tailwindcss-animate`. Installed by shadcn/ui init. |
| motion | **12.38.0** | Animations | For page transitions and animated dashboard cards in Phase 5, not Phase 1. |
| react-hook-form | **^7.72.1** | Form state | Login form. Minimal re-renders, integrates with shadcn Form components. |
| zod | **^3.x** | Validation | Login schema shared between client and server action. |
| @hookform/resolvers | **^5.2.2** | RHF + Zod bridge | Required to use Zod schema in react-hook-form. |
| @types/bcryptjs | **^3.0.0** | TS types for bcryptjs | Dev dependency. |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| next-auth@beta (v5) | next-auth@4 | v4 has App Router middleware issues with Next.js 15. v5 required. |
| bcryptjs | bcrypt (native) | `bcrypt` requires native bindings — compilation issues on VPS. |
| Prisma 6 | Prisma 7 | v7 mandates driver adapter + has documented Next.js 15 Turbopack module issues. |
| JWT sessions | Database sessions | Database sessions require a Session table + adapter; unnecessary at 10 users. |

### Installation

```bash
# Step 1: Scaffold project (locks to Next.js 15.x)
npx create-next-app@15.5.14 zoiten-pro \
  --typescript \
  --tailwind \
  --app \
  --no-src-dir \
  --import-alias "@/*"

cd zoiten-pro

# Step 2: Database
npm install prisma@^6 @prisma/client@^6
npx prisma init

# Step 3: Auth
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs

# Step 4: UI (shadcn init configures Tailwind v4 automatically)
npx shadcn@latest init
# Select: Next.js, App Router, TypeScript, Tailwind v4, default style

# Step 5: shadcn components needed for Phase 1
npx shadcn@latest add button input label form card alert badge avatar

# Step 6: Forms & validation
npm install react-hook-form zod @hookform/resolvers
```

**Version verification (registry-checked 2026-04-05):**
- `next@15.5.14` — verified via `npm view next@15 version`
- `prisma@6.19.3` — verified via `npm view prisma@6 version`
- `next-auth@5.0.0-beta.30` — verified via `npm view next-auth@beta version`
- `motion@12.38.0` — verified via `npm view motion version`
- `tailwindcss@4.2.2` — verified via `npm view tailwindcss version`

---

## Architecture Patterns

### Recommended Project Structure

```
zoiten-pro/
├── app/
│   ├── (auth)/
│   │   ├── login/
│   │   │   └── page.tsx            # Login form page
│   │   └── layout.tsx              # Unauthenticated layout (no sidebar)
│   ├── (dashboard)/
│   │   ├── layout.tsx              # Authenticated layout: sidebar + header
│   │   ├── dashboard/
│   │   │   └── page.tsx            # Section navigation cards
│   │   └── unauthorized/
│   │       └── page.tsx            # 403 page with back-to-dashboard link
│   ├── api/
│   │   └── auth/
│   │       └── [...nextauth]/
│   │           └── route.ts        # Auth.js handler
│   └── layout.tsx                  # Root layout (SessionProvider)
│
├── lib/
│   ├── prisma.ts                   # PrismaClient singleton
│   ├── auth.config.ts              # Edge-compatible auth config (no Prisma)
│   ├── auth.ts                     # Full auth config (Prisma, callbacks)
│   └── rbac.ts                     # requireSection() utility
│
├── components/
│   ├── ui/                         # shadcn/ui primitives (auto-generated)
│   ├── layout/
│   │   ├── Sidebar.tsx             # Nav with section-based visibility
│   │   └── Header.tsx              # User avatar + logout
│   └── auth/
│       └── LoginForm.tsx           # Client component, uses react-hook-form
│
├── types/
│   └── next-auth.d.ts              # Session + JWT type augmentation
│
├── middleware.ts                   # RBAC route guard (Edge runtime)
├── prisma/
│   ├── schema.prisma               # Full schema with enums
│   ├── seed.ts                     # Superadmin seed
│   └── migrations/                 # Generated migration SQL
└── .env.local                      # Local development env vars
```

### Pattern 1: Auth.js v5 Config Split (Edge Compatibility)

**What:** Credentials provider + bcrypt can NOT run on Edge runtime. Prisma Client also cannot. Middleware runs on Edge. Split config to avoid Edge-incompatible code in middleware.

**When to use:** Always — this is mandatory for Auth.js v5 + Next.js 15 + Prisma.

```typescript
// lib/auth.config.ts — Edge-compatible (no Prisma, no bcrypt here)
import type { NextAuthConfig } from "next-auth"

export default {
  providers: [], // Credentials provider goes in auth.ts, not here
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user
      const isOnDashboard = nextUrl.pathname.startsWith("/dashboard")
      if (isOnDashboard) {
        if (isLoggedIn) return true
        return false // Redirect to login
      }
      return true
    },
  },
} satisfies NextAuthConfig
```

```typescript
// lib/auth.ts — Full config (Node.js only, has Prisma + bcrypt)
import NextAuth from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import authConfig from "./auth.config"
import { ERP_SECTION } from "@prisma/client"

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      async authorize(credentials) {
        const { email, password } = credentials as {
          email: string
          password: string
        }
        const user = await prisma.user.findUnique({ where: { email } })
        if (!user || !user.isActive) return null
        const passwordsMatch = await bcrypt.compare(password, user.password)
        if (!passwordsMatch) return null
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          allowedSections: user.allowedSections,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = user.role
        token.allowedSections = user.allowedSections
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.allowedSections = token.allowedSections as ERP_SECTION[]
      }
      return session
    },
  },
})
```

```typescript
// app/api/auth/[...nextauth]/route.ts
import { handlers } from "@/lib/auth"
export const { GET, POST } = handlers
```

### Pattern 2: TypeScript Session Augmentation

**What:** Auth.js v5 does NOT automatically expose custom fields on the session. Must explicitly augment the `Session` and `JWT` interfaces.

**When to use:** Before writing any code that reads `session.user.role` — do this first.

```typescript
// types/next-auth.d.ts
// Source: https://authjs.dev/getting-started/typescript
import { DefaultSession } from "next-auth"
import { ERP_SECTION, UserRole } from "@prisma/client"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: UserRole
      allowedSections: ERP_SECTION[]
    } & DefaultSession["user"]
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: UserRole
    allowedSections?: ERP_SECTION[]
  }
}
```

### Pattern 3: RBAC Middleware (Edge Runtime)

**What:** Route-level protection — redirects unauthenticated users to `/login`, unauthorized users to `/unauthorized`. Uses edge-compatible auth.

**When to use:** Runs before every request matching the `config.matcher`.

```typescript
// middleware.ts
// Source: https://authjs.dev/reference/nextjs
import NextAuth from "next-auth"
import authConfig from "@/lib/auth.config"
import { ERP_SECTION } from "@prisma/client"

const { auth } = NextAuth(authConfig)

// Map URL path prefixes to required section enum values
const SECTION_MAP: Record<string, ERP_SECTION> = {
  "/products": ERP_SECTION.PRODUCTS,
  "/prices": ERP_SECTION.PRICES,
  "/weekly": ERP_SECTION.WEEKLY_CARDS,
  "/inventory": ERP_SECTION.STOCK,
  "/batches": ERP_SECTION.COST,
  "/purchase-plan": ERP_SECTION.PROCUREMENT,
  "/sales-plan": ERP_SECTION.SALES,
  "/support": ERP_SECTION.SUPPORT,
}

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", nextUrl))
  }

  const role = req.auth?.user?.role
  const allowedSections = req.auth?.user?.allowedSections ?? []

  // Superadmin bypasses all section checks
  if (role === "SUPERADMIN") return

  // Check section access
  const matchedSection = Object.entries(SECTION_MAP).find(([prefix]) =>
    nextUrl.pathname.startsWith(prefix)
  )

  if (matchedSection) {
    const [, requiredSection] = matchedSection
    if (!allowedSections.includes(requiredSection)) {
      return Response.redirect(new URL("/unauthorized", nextUrl))
    }
  }
})

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
}
```

> **WARNING:** The middleware RBAC uses the edge-compatible `authConfig`, which does NOT have access to Prisma. Section enum values must be plain strings or re-exported from a shared constants file if Prisma enums cannot be imported on Edge. See Pitfall 1 below.

### Pattern 4: Server Action RBAC Enforcement

**What:** Second layer of protection. Prevents direct Server Action calls that bypass middleware.

**When to use:** Every Server Action and Route Handler that mutates or reads protected data.

```typescript
// lib/rbac.ts
import { auth } from "@/lib/auth"
import { ERP_SECTION, UserRole } from "@prisma/client"

export async function requireSection(section: ERP_SECTION): Promise<void> {
  const session = await auth()
  if (!session?.user) {
    throw new Error("UNAUTHORIZED")
  }
  if (session.user.role === UserRole.SUPERADMIN) return
  if (!session.user.allowedSections.includes(section)) {
    throw new Error("FORBIDDEN")
  }
}

// Usage in a Server Action:
// "use server"
// await requireSection(ERP_SECTION.PRODUCTS)
```

### Pattern 5: Prisma Singleton

**What:** PrismaClient singleton prevents connection pool exhaustion in Next.js development (hot-reload creates new instances on each module reload).

```typescript
// lib/prisma.ts
// Source: https://www.prisma.io/docs/guides/other/troubleshooting-orm/help-articles/nextjs-prisma-client-dev-practices
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

### Pattern 6: Prisma Seed Script

**What:** Seeds superadmin account on first deploy. Uses `upsert` so it is safe to re-run.

```typescript
// prisma/seed.ts
import { PrismaClient, UserRole } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
  const hashedPassword = await bcrypt.hash("stafurovonet", 12)

  await prisma.user.upsert({
    where: { email: "sergey.fyodorov@gmail.com" },
    update: {},
    create: {
      email: "sergey.fyodorov@gmail.com",
      name: "Sergey Fyodorov",
      password: hashedPassword,
      role: UserRole.SUPERADMIN,
      allowedSections: [], // Superadmin ignores this field
      isActive: true,
    },
  })

  console.log("Superadmin seeded successfully")
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

```json
// package.json — add this:
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

Run with: `npx prisma db seed`

### Prisma Schema (Full Phase 1 Schema)

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ──────────────────────────────
// Enums
// ──────────────────────────────

enum UserRole {
  SUPERADMIN
  MANAGER
  VIEWER
}

enum ERP_SECTION {
  PRODUCTS
  PRICES
  WEEKLY_CARDS
  STOCK
  COST
  PROCUREMENT
  SALES
  SUPPORT
  USER_MANAGEMENT
}

enum AbcStatus {
  A
  B
  C
}

enum Availability {
  IN_STOCK
  OUT_OF_STOCK
  DISCONTINUED
  DELETED
}

// ──────────────────────────────
// User
// ──────────────────────────────

model User {
  id              String      @id @default(cuid())
  email           String      @unique
  name            String
  password        String      // bcrypt hash
  role            UserRole    @default(VIEWER)
  allowedSections ERP_SECTION[] // Ignored when role = SUPERADMIN
  isActive        Boolean     @default(true)
  createdAt       DateTime    @default(now())
  updatedAt       DateTime    @updatedAt
}

// ──────────────────────────────
// Reference data
// ──────────────────────────────

model Marketplace {
  id       String               @id @default(cuid())
  name     String               @unique // "WB", "Ozon", "ДМ", "ЯМ"
  slug     String               @unique // "wb", "ozon", "dm", "ym"
  articles MarketplaceArticle[]
}

model Brand {
  id         String     @id @default(cuid())
  name       String     @unique
  categories Category[]
  products   Product[]
}

model Category {
  id            String        @id @default(cuid())
  name          String
  brandId       String
  brand         Brand         @relation(fields: [brandId], references: [id], onDelete: Restrict)
  subcategories Subcategory[]
  products      Product[]

  @@unique([name, brandId])
}

model Subcategory {
  id         String    @id @default(cuid())
  name       String
  categoryId String
  category   Category  @relation(fields: [categoryId], references: [id], onDelete: Cascade)
  products   Product[]

  @@unique([name, categoryId])
}

// ──────────────────────────────
// Product
// ──────────────────────────────

model Product {
  id            String               @id @default(cuid())
  name          String               @db.VarChar(100)
  photoUrl      String?
  brandId       String
  brand         Brand                @relation(fields: [brandId], references: [id], onDelete: Restrict)
  categoryId    String?
  category      Category?            @relation(fields: [categoryId], references: [id], onDelete: SetNull)
  subcategoryId String?
  subcategory   Subcategory?         @relation(fields: [subcategoryId], references: [id], onDelete: SetNull)
  abcStatus     AbcStatus?
  availability  Availability         @default(IN_STOCK)
  weightKg      Float?
  heightCm      Float?
  widthCm       Float?
  depthCm       Float?
  // Volume is NOT stored — computed at read time: (h * w * d) / 1000 liters
  articles      MarketplaceArticle[]
  barcodes      Barcode[]
  deletedAt     DateTime?            // Soft delete: null = active
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt
}

model MarketplaceArticle {
  id            String      @id @default(cuid())
  productId     String
  product       Product     @relation(fields: [productId], references: [id], onDelete: Cascade)
  marketplaceId String
  marketplace   Marketplace @relation(fields: [marketplaceId], references: [id])
  article       String      // Marketplace article number (integer as string)
  createdAt     DateTime    @default(now())

  // Max 10 articles per marketplace per product enforced in service layer
  @@unique([productId, marketplaceId, article])
}

model Barcode {
  id        String  @id @default(cuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  value     String  @unique
  // 1-20 barcodes per product enforced in service layer
  // NOTE: @unique here creates a full unique index — OK for Phase 1
  // Phase 4 must replace with partial unique index for soft-delete compatibility
  // See PITFALLS.md Pitfall 3
}
```

> **Schema note for Phase 4:** The `Barcode.value @unique` is a full unique index. Once soft delete is implemented in Phase 4, this MUST be replaced with a PostgreSQL partial unique index (`WHERE deletedAt IS NULL` on the parent). Document this as a migration task in Phase 4.

### Anti-Patterns to Avoid

- **Putting Prisma/bcrypt imports in auth.config.ts:** The file is loaded by middleware on the Edge runtime. Edge runtime does not support Node.js built-ins used by Prisma or bcrypt. It will silently fail or throw a runtime error.
- **Importing `auth` from `auth.ts` in middleware.ts:** `auth.ts` imports Prisma which is not Edge-compatible. Middleware MUST use `NextAuth(authConfig)` from `auth.config.ts`.
- **Checking role only in middleware:** Server Actions can be called directly. Always call `requireSection()` at the top of every mutating Server Action.
- **Not augmenting next-auth.d.ts:** Without augmentation, TypeScript will reject `session.user.role` as a type error. Add `types/next-auth.d.ts` before writing any RBAC check.
- **Using `prisma migrate dev` to deploy:** Only `prisma migrate deploy` in production. `migrate dev` can drop and recreate the database.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Session persistence | Custom JWT cookie logic | Auth.js v5 (handles signing, rotation, httpOnly cookie) | CSRF, signing, expiry, rotation — all handled |
| Password hashing | `crypto.createHash('sha256')` | `bcryptjs.hash(password, 12)` | SHA-256 is not a KDF. bcrypt adds cost factor + salt. |
| Route protection | Manual cookie parsing in each route | `middleware.ts` with `auth()` + `requireSection()` utility | Middleware runs before route, utility covers SA layer |
| DB connection pooling (dev) | New PrismaClient per module | `lib/prisma.ts` singleton pattern | Hot-reload creates hundreds of connections without singleton |
| TypeScript type safety for session | Generic `any` casts | `types/next-auth.d.ts` module augmentation | Compile-time guarantee that role/sections exist on session |
| Enum validation | String comparisons with typo risk | Prisma enums (`UserRole`, `ERP_SECTION`, `AbcStatus`, `Availability`) | TypeScript enforces valid values at compile time |

**Key insight:** Auth.js v5 handles the most dangerous parts of authentication (CSRF protection, secure cookie attributes, token rotation). Never replace it with custom logic.

---

## Common Pitfalls

### Pitfall 1: Prisma Enum Import in Middleware (Edge Runtime)

**What goes wrong:** You import `ERP_SECTION` from `@prisma/client` in `middleware.ts` for the section map. Prisma Client is not Edge-compatible — it uses Node.js built-ins. Middleware crashes with a module error at startup.

**Why it happens:** `@prisma/client` imports are fine in `auth.ts` (Node.js) but fail in `middleware.ts` (Edge).

**How to avoid:** Define the section map as plain string constants in a separate `lib/sections.ts` file that imports no external packages. Use `as const` with `satisfies` for type safety without Prisma imports.

```typescript
// lib/sections.ts — Edge-safe constants
export const SECTION_PATHS = {
  "/products": "PRODUCTS",
  "/prices": "PRICES",
  "/weekly": "WEEKLY_CARDS",
  // ...
} as const satisfies Record<string, string>
```

**Warning signs:** Middleware throws `Error: Module not found: Can't resolve 'fs'` or similar Node.js built-in errors.

### Pitfall 2: Role Not Propagated to Session JWT

**What goes wrong:** User logs in successfully. `session.user.role` is undefined. RBAC checks fail or throw TypeScript errors.

**Why it happens:** Auth.js v5 does NOT automatically copy custom User fields to the JWT. The `jwt()` callback must explicitly copy `user.role` and `user.allowedSections` on first sign-in (`if (user) { token.role = user.role }`). The `session()` callback must then forward from token to session. Both callbacks are required.

**How to avoid:** Implement both callbacks as shown in Pattern 1. Test immediately after implementing by logging `session` in a server component.

**Warning signs:** `session.user.role` is `undefined`; TypeScript error "Property 'role' does not exist on type 'User'".

### Pitfall 3: Auth.js v5 Error Handling Complexity

**What goes wrong:** The credentials provider's `authorize` function returns `null` for any failure. The error shown to the user is a generic "CredentialsSignin" error. The requirement is specific inline errors (wrong password, user not found, deactivated).

**Why it happens:** Auth.js v5 masks credential errors by default for security. Distinguishing between "user not found" and "wrong password" in the UI can hint to attackers about valid emails.

**How to avoid:** For this internal tool (not public-facing), use `CredentialsSignin` subclass with a `code` property:

```typescript
// In authorize:
import { CredentialsSignin } from "next-auth"

class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials"
}
class InactiveUserError extends CredentialsSignin {
  code = "account_disabled"
}

// In the login form action, catch the error code and display appropriate message
```

**Warning signs:** Login errors show "Configuration" error or generic message instead of the specific inline alert required by D-06.

### Pitfall 4: next-auth.d.ts Not Picked Up by TypeScript

**What goes wrong:** You create `types/next-auth.d.ts` but TypeScript still complains that `role` doesn't exist on `session.user`.

**Why it happens:** The declaration file must be included in `tsconfig.json`'s `include` array. The default `create-next-app` `tsconfig.json` includes `**/*.ts` — a `types/` folder at root is included. However, if you name the file differently or place it outside the include paths, it is silently ignored.

**How to avoid:** Place the file at `types/next-auth.d.ts` (not `src/types/`), verify it is picked up by checking `tsconfig.json` include paths. Alternatively, place the augmentation directly in `auth.ts` (same file as config).

### Pitfall 5: Middleware Matcher Blocking Auth API Routes

**What goes wrong:** Middleware matcher is too broad and intercepts `POST /api/auth/callback/credentials`. Auth.js cannot set the session cookie. Login returns 302 loop.

**Why it happens:** The matcher `/((?!api).*)` excludes ALL `/api` paths. But if you try to protect `/api` routes in middleware, you block the Auth.js internal routes too.

**How to avoid:** Use the exact matcher pattern that excludes `api/auth`:

```typescript
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
}
```

The `api` exclusion protects Auth.js routes. Server Actions and custom Route Handlers are protected inside their own code via `requireSection()`.

---

## Code Examples

### Environment Variables

```bash
# .env.local (development)
DATABASE_URL="postgresql://user:pass@localhost:5432/zoiten_erp"
AUTH_SECRET="<generate: openssl rand -hex 32>"
AUTH_URL="http://localhost:3000"

# Production (VPS systemd EnvironmentFile)
DATABASE_URL="postgresql://zoiten:pass@localhost:5432/zoiten_erp"
AUTH_SECRET="<production secret, different from dev>"
AUTH_URL="https://zoiten.pro"
```

> Auth.js v5 uses `AUTH_SECRET` (not `NEXTAUTH_SECRET`) and `AUTH_URL` (not `NEXTAUTH_URL`).

### Login Server Action

```typescript
// app/(auth)/login/actions.ts
"use server"
import { signIn } from "@/lib/auth"
import { AuthError } from "next-auth"

export async function loginAction(formData: FormData) {
  try {
    await signIn("credentials", {
      email: formData.get("email"),
      password: formData.get("password"),
      redirectTo: "/dashboard",
    })
  } catch (error) {
    if (error instanceof AuthError) {
      switch (error.type) {
        case "CredentialsSignin":
          return { error: "Неверный email или пароль" }
        default:
          return { error: "Ошибка входа. Попробуйте снова." }
      }
    }
    throw error // Re-throw redirect errors — they are not real errors
  }
}
```

### Logout

```typescript
// Can be called from any Server Action or form:
import { signOut } from "@/lib/auth"

export async function logoutAction() {
  await signOut({ redirectTo: "/login" })
}
```

### Dashboard Layout Pattern

```typescript
// app/(dashboard)/layout.tsx
import { auth } from "@/lib/auth"
import { redirect } from "next/navigation"
import { Sidebar } from "@/components/layout/Sidebar"

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const session = await auth()
  if (!session) redirect("/login")

  return (
    <div className="flex h-screen">
      <Sidebar
        userRole={session.user.role}
        allowedSections={session.user.allowedSections}
      />
      <main className="flex-1 overflow-auto p-6">{children}</main>
    </div>
  )
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `NEXTAUTH_SECRET` env var | `AUTH_SECRET` | Auth.js v5 (2024) | Old var name fails silently in v5 |
| `getServerSession(authOptions)` | `auth()` imported from `@/lib/auth` | Auth.js v5 | Cleaner API, same functionality |
| `tailwind.config.js` | CSS-first config in `globals.css` via `@theme` | Tailwind v4 (2025) | No more JS config file; CSS variables use OKLCH |
| `tailwindcss-animate` | `tw-animate-css` | shadcn/ui March 2025 | shadcn/ui installs `tw-animate-css` by default now |
| `framer-motion` package | `motion` package | 2024 rename | Both work; `motion` is canonical |
| `useFormState` (React 18) | `useActionState` (React 19) | React 19 | `useFormState` removed |
| `cookies()` synchronous | `await cookies()` | Next.js 15 | Must be awaited in Server Components/Actions |

**Deprecated/outdated:**
- `import { getServerSession } from "next-auth/next"`: Use `auth()` from your `lib/auth.ts` export in v5.
- `import { authOptions } from "..."`: v5 exports `{ auth, handlers, signIn, signOut }` — no `authOptions` object.
- `NEXTAUTH_URL` / `NEXTAUTH_SECRET`: Replaced by `AUTH_URL` / `AUTH_SECRET`.

---

## Environment Availability

Step 2.6: This phase is a **greenfield scaffold** — the Next.js project, PostgreSQL, and all npm packages must be installed from scratch. No external services are pre-existing on the development machine.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | npm install, Next.js dev | ✓ | v20.18.2 | — |
| npm | package management | ✓ | 10.8.2 | — |
| PostgreSQL | Prisma DATABASE_URL | ✗ (not checked on dev machine) | — | Install locally via Homebrew/apt or use Docker |
| Git | Source control | ✓ (project is git repo) | — | — |

**Node.js version note:** Node.js 20.x is installed on the dev machine. Next.js 15 requires Node.js 18.18+, so 20.x is fully compatible. Production VPS should run Node.js 22.x LTS for better long-term support.

**Missing dependencies with no fallback:**
- PostgreSQL: Must be available before running `prisma migrate dev`. Install via `brew install postgresql@16` (macOS) or `apt install postgresql-16` (Ubuntu/VPS).

**Missing dependencies with fallback:**
- PostgreSQL (development): Can use Docker temporarily: `docker run -e POSTGRES_PASSWORD=pass -p 5432:5432 postgres:16`

---

## Validation Architecture

nyquist_validation is enabled (config.json `workflow.nyquist_validation: true`).

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None yet installed — greenfield project |
| Config file | `jest.config.ts` or `vitest.config.ts` — Wave 0 creates |
| Quick run command | `npm test -- --testPathPattern=auth` |
| Full suite command | `npm test` |

**Recommended:** Vitest over Jest for Next.js 15 projects. Vitest uses Vite's transform pipeline, has native TypeScript support, and no `babel-jest` configuration needed.

```bash
# Wave 0 test setup
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom
```

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FOUND-01 | Project builds without errors | smoke | `npm run build` | ❌ Wave 0 |
| FOUND-02 | Prisma can connect to DB and run migration | integration | `npx prisma migrate status` | ❌ Wave 0 |
| FOUND-03 | Schema has all required models and fields | unit | `vitest tests/schema.test.ts` | ❌ Wave 0 |
| FOUND-04 | PrismaClient singleton returns same instance | unit | `vitest tests/prisma-singleton.test.ts` | ❌ Wave 0 |
| AUTH-01 | User with valid credentials gets session | integration | `vitest tests/auth.test.ts` | ❌ Wave 0 |
| AUTH-02 | Session survives simulated page refresh (JWT in cookie) | integration | `vitest tests/auth.test.ts` | ❌ Wave 0 |
| AUTH-03 | signOut clears session cookie | integration | `vitest tests/auth.test.ts` | ❌ Wave 0 |
| AUTH-04 | Password stored as bcrypt hash (not plaintext) | unit | `vitest tests/seed.test.ts` | ❌ Wave 0 |
| AUTH-05 | Superadmin exists in DB after seed runs | integration | `vitest tests/seed.test.ts` | ❌ Wave 0 |
| AUTH-06 | Unauthenticated request to /dashboard redirects to /login | integration | `vitest tests/middleware.test.ts` | ❌ Wave 0 |
| AUTH-07 | JWT token contains role and allowedSections | unit | `vitest tests/auth.test.ts` | ❌ Wave 0 |
| AUTH-08 | TypeScript accepts session.user.role without type error | build | `npm run type-check` (tsc --noEmit) | ❌ Wave 0 |

### Sampling Rate

- **Per task commit:** `npm run type-check` (fast, catches AUTH-08 and structural errors)
- **Per wave merge:** `npm test` (full suite)
- **Phase gate:** Full suite green + `npm run build` succeeds before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `tests/auth.test.ts` — covers AUTH-01, AUTH-02, AUTH-03, AUTH-07
- [ ] `tests/seed.test.ts` — covers AUTH-04, AUTH-05
- [ ] `tests/middleware.test.ts` — covers AUTH-06
- [ ] `tests/schema.test.ts` — covers FOUND-03
- [ ] `tests/prisma-singleton.test.ts` — covers FOUND-04
- [ ] `vitest.config.ts` — framework config
- [ ] `tests/setup.ts` — test database setup/teardown
- [ ] Framework install: `npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom`

---

## Open Questions

1. **Prisma enum vs String[] for `allowedSections` on User model**
   - What we know: D-09 locks in `allowedSections` as an array. D-08 locks in the specific enum values.
   - What's unclear: PostgreSQL supports native enum arrays (`ERP_SECTION[]`). Prisma 6 supports this but the generated type for the array field may require explicit casting in some query patterns.
   - Recommendation: Use `ERP_SECTION[]` (Prisma enum array). Test the generated TypeScript types after first migration. If enum array causes issues, fall back to `String[]` with a Zod enum validator at the service layer.

2. **`ts-node` for Prisma seed script**
   - What we know: `prisma db seed` requires a Node.js runner for `.ts` files.
   - What's unclear: `ts-node` may need to be installed as a dev dependency; alternatively `tsx` or `@swc-node/register` can run TypeScript faster without the full ts-node startup overhead.
   - Recommendation: Use `tsx` (`npm install -D tsx`) and set seed command to `"tsx prisma/seed.ts"`. Simpler and faster than ts-node with CommonJS flag workarounds.

---

## Project Constraints (from CLAUDE.md)

All directives extracted from `/Users/macmini/zoiten.pro/CLAUDE.md`:

| Directive | Source | Impact on Phase 1 |
|-----------|--------|-------------------|
| Framework: Next.js 15 (App Router, TypeScript) | CLAUDE.md Stack | Use `create-next-app@15.5.14` |
| Database: PostgreSQL + Prisma ORM | CLAUDE.md Stack | Use `prisma@^6`, `@prisma/client@^6` |
| UI: shadcn/ui + Tailwind CSS + Framer Motion | CLAUDE.md Stack | `npx shadcn@latest init`, `npm install motion` |
| Auth: NextAuth.js (credentials provider) | CLAUDE.md Stack | `npm install next-auth@beta` (v5) |
| Deploy: systemd + nginx reverse proxy → localhost:3000 | CLAUDE.md Deploy | Not in scope for Phase 1, but `output: 'standalone'` in `next.config.ts` must be set now |
| Superadmin: sergey.fyodorov@gmail.com / stafurovonet | CLAUDE.md Auth | Seed script must use these exact credentials |
| RBAC — ролевой доступ к разделам | CLAUDE.md Auth | Enforce at middleware AND Server Action levels |
| Security: bcrypt для паролей | CLAUDE.md Constraints | Use `bcryptjs` (pure JS), salt rounds 12 |
| Photos: VPS filesystem, not cloud | CLAUDE.md Constraints | Phase 1 schema includes `photoUrl String?`, actual upload in Phase 4 |

---

## Sources

### Primary (HIGH confidence)

- [Auth.js TypeScript Docs](https://authjs.dev/getting-started/typescript) — Module augmentation for Session/JWT, verified by direct fetch
- [Auth.js RBAC Guide](https://authjs.dev/guides/role-based-access-control) — jwt/session callbacks, role propagation pattern
- [Auth.js v5 Migration Guide](https://authjs.dev/getting-started/migrating-to-v5) — auth.config.ts/auth.ts split, env var renames
- [Auth.js Credentials Provider](https://authjs.dev/getting-started/providers/credentials) — authorize function, error handling
- npm registry `npm view next@15 version` — Next.js 15.5.14 as of 2026-04-05
- npm registry `npm view prisma@6 version` — Prisma 6.19.3 as of 2026-04-05
- npm registry `npm view next-auth@beta version` — Auth.js 5.0.0-beta.30 as of 2026-04-05
- `.planning/research/STACK.md` — Stack decisions and rationale (project-specific)
- `.planning/research/ARCHITECTURE.md` — Architecture patterns (project-specific)
- `.planning/research/PITFALLS.md` — Domain pitfalls (project-specific)

### Secondary (MEDIUM confidence)

- [Next.js Dashboard Auth Tutorial](https://nextjs.org/learn/dashboard-app/adding-authentication) — middleware.ts pattern for App Router
- [ReactHustle: Extend Next-Auth Session TypeScript](https://reacthustle.com/blog/extend-user-session-nextauth-typescript) — Practical augmentation examples

### Tertiary (LOW confidence)

- WebSearch: "Auth.js v5 auth.config.ts auth.ts split middleware 2025" — multiple blog posts confirming the split pattern is widely adopted

---

## Metadata

**Confidence breakdown:**
- Standard stack versions: HIGH — all verified against npm registry on 2026-04-05
- Auth.js v5 patterns: HIGH — verified against official authjs.dev docs (fetched directly)
- Architecture: HIGH — based on official Next.js + Auth.js docs + project's own ARCHITECTURE.md
- Prisma schema: HIGH — based on project's own ARCHITECTURE.md + Prisma 6 docs
- Test framework: MEDIUM — Vitest recommendation is best-practice for Next.js 15 but not verified against Vitest docs directly

**Research date:** 2026-04-05
**Valid until:** 2026-07-05 (90 days — stable stack, Auth.js v5 still in beta but stable enough)

**Note on Next.js version:** Registry shows Next.js latest at 16.2.2 but project decisions lock in Next.js 15 (CONTEXT.md, CLAUDE.md). Using `create-next-app@15.5.14` (latest in 15.x series) is the correct choice per locked decisions.
