# Technology Stack

**Project:** Zoiten ERP
**Researched:** 2026-04-05
**Research mode:** Validation + current version check

---

## Summary Verdict

The chosen stack (Next.js + PostgreSQL + Prisma + shadcn/ui + NextAuth.js) is sound and actively maintained. However, one decision needs an immediate correction: **use Next.js 15, not Next.js 14**. Version 15.2.4 is the current stable release as of March 2026. Starting a greenfield project on 14 means starting on a version already superseded by one major release. The rest of the stack choices are validated below.

---

## Recommended Stack

### Core Framework

| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| Next.js | **15.2.4** (not 14) | Fullstack framework | Current stable. App Router is mature. Turbopack stable. React 19 required. Starting on 14 today is a deliberate downgrade. |
| React | **19.x** (required by Next.js 15) | UI runtime | Next.js 15 requires React 19 minimum. Not optional. |
| TypeScript | **5.x** | Type safety | Ships with Next.js. Use strict mode. |

**Why not Next.js 14:** Next.js 15 was released October 2024. It is stable, its codemod handles the breaking changes automatically, and all community tutorials and library examples are now written against v15. Starting greenfield on 14 in April 2026 creates unnecessary technical debt.

**Breaking changes from 14 → 15 that affect this project:**
- `cookies()`, `headers()` are now async — must be awaited in server components/actions.
- GET Route Handlers no longer cached by default — explicitly set `cache: 'force-cache'` where needed.
- React 19 minimum — `useFormState` renamed to `useActionState`.

Apply the official codemod on project init: `npx @next/codemod@canary upgrade latest`

---

### Database

| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| PostgreSQL | **16.x** | Primary database | Battle-tested, JSONB for flexible article data, supports partial indexes. Install on VPS. |
| Prisma ORM | **6.x** (NOT 7.x) | Database access, migrations | v6 is stable and has wide Next.js compatibility. v7 introduces breaking driver adapter requirement — unnecessary complexity for this project size. |

**Why Prisma 6, not 7:**
Prisma 7 moved to a mandatory driver adapter architecture (`@prisma/adapter-pg`). This is a significant breaking change: the datasource URL moves to `prisma.config.ts`, and the query engine is now TypeScript-only. Prisma 7 + Next.js 15 + Turbopack has documented module resolution issues. For a VPS deployment with a single PostgreSQL instance, Prisma 6 is the right choice — it has the stable direct connection model, full Next.js 15 compatibility, and no unnecessary abstraction layers.

**Prisma 6 install:**
```bash
npm install prisma@^6 @prisma/client@^6
```

**Singleton pattern required for Next.js (prevents connection exhaustion in dev):**
```typescript
// lib/prisma.ts
import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

---

### Authentication

| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| Auth.js (NextAuth.js) | **5.x (beta, stable enough)** | Session + RBAC | The v4 → v5 rename to Auth.js is complete. v5 has deep Next.js 15 App Router integration, middleware-based route protection, and JWT/database sessions. Credentials provider works for username/password. |
| bcryptjs | **^2.4.3** | Password hashing | Pure JS implementation, no native bindings. Safer than `bcrypt` (native) for VPS deploy where Node.js version may vary. |

**Why Auth.js v5 over v4:**
v4 predates App Router and has known middleware issues with Next.js 15. v5 was designed for App Router — auth config splits into `auth.config.ts` (edge-safe, used in middleware) and `auth.ts` (full config, used in server components). This split is required for RBAC in middleware to work correctly.

**RBAC implementation:** Store `role` on the `User` model in Prisma. Propagate via `jwt` callback → `session` callback. Check in `middleware.ts` using `auth()`. Protect routes by checking `session.user.role` against allowed roles per path prefix.

**Environment variable prefix change:** Auth.js v5 uses `AUTH_SECRET` not `NEXTAUTH_SECRET`. All env vars prefixed `AUTH_`.

```bash
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs
```

---

### UI Framework

| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| shadcn/ui | **CLI v4 (March 2026)** | Component library | Not a package — components are copied into the project. CLI v4 supports Tailwind v4, React 19, and Next.js 15. Copy-ownership model means no upstream breaking changes. |
| Tailwind CSS | **v4.x** | Styling | shadcn/ui now requires Tailwind v4. CSS-first configuration (no `tailwind.config.js`). All config in the main CSS file. |
| tw-animate-css | **^1.x** | Animation utilities | Replaces `tailwindcss-animate`. New shadcn/ui projects install this by default as of March 2025. |

**Tailwind v4 change that matters:** No `tailwind.config.js`. Configuration moves into `globals.css` using `@theme`. CSS variables for colors are in OKLCH format (not HSL).

**shadcn/ui init:**
```bash
npx shadcn@latest init
```
Select: Next.js, App Router, TypeScript, Tailwind v4, default style.

---

### Animations

| Technology | Version to Use | Purpose | Why |
|------------|----------------|---------|-----|
| motion (formerly framer-motion) | **12.x** | Page transitions, UI animations | Package renamed from `framer-motion` to `motion`. Both package names work but `motion` is the canonical current name. |

**Critical constraint:** Motion/Framer Motion components are client-side only. They require access to the DOM, which server components do not have. Every component using `motion.*` must either be in a file with `"use client"` at the top, or be wrapped in a client component boundary.

**Pattern for this project:** Create thin `"use client"` wrapper components (`AnimatedSection`, `FadeIn`, etc.) that can be imported into server components safely.

```bash
npm install motion
```

---

### Form Handling & Validation

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| react-hook-form | **^7.x** | Form state management | De facto standard. Minimal re-renders. Works with shadcn/ui Form components out of the box. |
| zod | **^3.x** | Schema validation | TypeScript-first. One schema used for both client validation and server action input validation. Integrates with react-hook-form via `@hookform/resolvers`. |
| @hookform/resolvers | **^3.x** | Bridge between RHF and Zod | Required to use Zod schemas as react-hook-form validators. |

```bash
npm install react-hook-form zod @hookform/resolvers
```

---

### File Upload (Product Photos)

No additional library needed. Use Next.js Server Actions with the native `FormData` API.

**Pattern:**
```typescript
// app/actions/upload.ts
"use server"
import fs from "node:fs/promises"
import path from "node:path"

export async function uploadProductPhoto(formData: FormData) {
  const file = formData.get("photo") as File
  const bytes = await file.arrayBuffer()
  const buffer = Buffer.from(bytes)
  const filename = `${Date.now()}-${file.name}`
  await fs.writeFile(path.join(process.cwd(), "public/uploads", filename), buffer)
  return `/uploads/${filename}`
}
```

Photos stored in `/public/uploads/` on VPS. Nginx serves static files directly (bypass Next.js). For 50-200 products at one photo each, this is entirely adequate.

**Nginx config needed:** Add `location /uploads/` block serving the static directory directly, bypassing Node.js process.

---

### Deployment

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Node.js | **22.x LTS** | Runtime | Current LTS. Next.js 15 supports Node.js 18.18+. |
| systemd | system | Process manager | Already chosen. Simpler than PM2 for single-app VPS, no extra daemon. |
| nginx | **1.24+** | Reverse proxy + static files | Handles SSL termination, static file serving, upload directory. |
| Let's Encrypt / certbot | latest | TLS certificates | Standard for VPS HTTPS. |

**Next.js standalone build required for VPS deployment:**

```javascript
// next.config.js
module.exports = {
  output: 'standalone',
}
```

The standalone output creates a self-contained server in `.next/standalone/`. Copy `public/` and `.next/static/` into standalone manually — they are not included automatically.

**systemd unit file pattern:**
```ini
[Unit]
Description=Zoiten ERP
After=network.target

[Service]
User=www-data
WorkingDirectory=/opt/zoiten-pro
ExecStart=/usr/bin/node server.js
Restart=always
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Framework | Next.js 15 | Remix, Nuxt | Stack is pre-decided. Remix lacks ecosystem breadth. Nuxt is Vue. |
| ORM | Prisma 6 | Drizzle ORM, Prisma 7, TypeORM | Drizzle is faster but requires raw SQL mental model; overkill for this scale. Prisma 7 has documented Next.js 15 issues. TypeORM is dated. |
| Auth | Auth.js v5 | Lucia Auth, custom JWT | Lucia is lower-level — more setup. Custom JWT is a security liability. Auth.js v5 handles edge cases correctly. |
| Animation | motion (Framer Motion) | CSS animations, React Spring | CSS animations lack the Spring physics model for premium feel. React Spring is viable but smaller community. motion is the most widely documented. |
| Password hashing | bcryptjs | bcrypt (native), argon2 | `bcrypt` (native) requires build tools matching VPS Node.js version. `argon2` is stronger but overkill for internal ERP. `bcryptjs` is pure JS, zero native dependency risk. |
| Process manager | systemd | PM2 | PM2 adds a daemon that needs management. systemd is already on every Linux server and handles restarts, logging, and boot starts natively. |
| Photo storage | VPS filesystem | S3, Cloudinary | 50-200 products = ~200 photos. S3 adds cost and complexity. VPS is sufficient and already paid for. |

---

## Full Installation

```bash
# Create project
npx create-next-app@latest zoiten-pro --typescript --tailwind --app --no-src-dir
cd zoiten-pro

# Database
npm install prisma@^6 @prisma/client@^6
npx prisma init

# Auth
npm install next-auth@beta bcryptjs
npm install -D @types/bcryptjs

# UI (shadcn init handles Tailwind v4 configuration)
npx shadcn@latest init
npm install motion

# Forms & validation
npm install react-hook-form zod @hookform/resolvers

# shadcn components you'll need
npx shadcn@latest add button input label form select table dialog sheet badge tabs avatar
```

---

## Environment Variables

```bash
# .env.local
DATABASE_URL="postgresql://user:pass@localhost:5432/zoiten_erp"
AUTH_SECRET="<generate: openssl rand -hex 32>"
AUTH_URL="https://zoiten.pro"
```

---

## Sources

- [Next.js 15 Release Blog](https://nextjs.org/blog/next-15)
- [Next.js Current Version March 2026](https://www.abhs.in/blog/nextjs-current-version-march-2026-stable-release-whats-new)
- [Next.js Version 15 Upgrade Guide](https://nextjs.org/docs/app/guides/upgrading/version-15)
- [Prisma ORM 7 Release Announcement](https://www.prisma.io/blog/announcing-prisma-orm-7-0-0)
- [Prisma Releases on GitHub](https://github.com/prisma/prisma/releases)
- [Auth.js RBAC Guide](https://authjs.dev/guides/role-based-access-control)
- [Auth.js Credentials Provider](https://authjs.dev/getting-started/providers/credentials)
- [shadcn/ui Tailwind v4 Docs](https://ui.shadcn.com/docs/tailwind-v4)
- [shadcn/ui CLI v4 Changelog](https://ui.shadcn.com/docs/changelog/2026-03-cli-v4)
- [Framer Motion + Next.js Server Components](https://www.hemantasundaray.com/blog/use-framer-motion-with-nextjs-server-components)
- [Next.js Self-Hosting Guide](https://nextjs.org/docs/app/guides/self-hosting)
- [Next.js File Upload Server Actions](https://akoskm.com/file-upload-with-nextjs-14-and-server-actions/)
