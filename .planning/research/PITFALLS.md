# Domain Pitfalls

**Domain:** Marketplace ERP — Next.js 14 + PostgreSQL + Prisma + NextAuth.js on VPS
**Project:** Zoiten ERP
**Researched:** 2026-04-05

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or security holes.

---

### Pitfall 1: Uploaded Photos Stored Inside `/public` Directory

**What goes wrong:** Developer writes product photos to `/public/uploads/` inside the Next.js project. After `npm run build`, only files present at build time are served. Any photo uploaded in production returns 404 because the new file was never part of the build artifact. On standalone builds this is worse — `.next/standalone` does not copy `/public` at all.

**Why it happens:** Next.js documentation says "the public directory isn't a real directory — it's a collection of routes created at build time." Developers assume it works like Apache's `htdocs`.

**Consequences:** Every photo upload works during manual testing but silently breaks in production or after any redeployment. Files accumulate in `/public` and get wiped on `git pull + build`.

**Prevention:**
- Store uploads in a directory **outside** the Next.js project tree, e.g. `/var/www/zoiten-uploads/`
- Serve uploads via nginx `location /uploads/` block pointing to that directory with an `alias` directive
- Never write runtime files into the Next.js project directory

**Nginx config pattern:**
```nginx
location /uploads/ {
    alias /var/www/zoiten-uploads/;
    expires 30d;
    access_log off;
}
```

**Detection:** Upload a photo in production, run `npm run build`, reload — photo disappears.

**Phase:** Products (MVP). Must be decided before writing the first upload route.

---

### Pitfall 2: Soft Delete Filter Omission on Every Query

**What goes wrong:** Developer adds `deletedAt DateTime?` to the Product model and remembers to add `WHERE deletedAt IS NULL` on the main list query. But forgets it on: the copy-product lookup, barcode uniqueness check, category product count, admin search, and every nested `include`. Deleted products silently reappear in related queries.

**Why it happens:** Prisma has no built-in "global soft delete" filter. The official middleware approach intercepts top-level queries but **fails on nested `include` and relational operators** (`every`, `some`, `none`). The ZenStack docs explicitly document this limitation.

**Consequences:** Deleted products show up in reports, barcode validation passes for "deleted" barcodes that were already in use, product counts are wrong.

**Prevention:**
- Use a Prisma Client Extension (not deprecated middleware) to inject `deletedAt: null` globally. Extension approach is more reliable than middleware for nested queries.
- Add a shared helper `activeProduct()` that always applies the filter and use it everywhere.
- Never query `Product` directly — always go through the helper or the extended client.
- Write a test that creates a soft-deleted product and verifies it does NOT appear in every query type used in the app.

**Detection:** Query `Product.findMany()` without filter — you see soft-deleted items.

**Phase:** Products (MVP). The schema decision must be made before writing any product queries.

---

### Pitfall 3: Unique Constraint Clash with Soft Delete

**What goes wrong:** Barcode and marketplace article fields have `@unique` constraints. A product is soft-deleted. The same barcode or WB article is assigned to a new product. PostgreSQL unique constraint fires even though the old record is logically deleted.

**Why it happens:** PostgreSQL enforces unique constraints on all rows, including those with `deletedAt IS NOT NULL`. Prisma does not natively support partial unique indexes (where uniqueness only applies when `deletedAt IS NULL`).

**Consequences:** Operators cannot reuse barcodes or article numbers from retired products. Workaround pressure leads to hard deletes instead of soft deletes, defeating the purpose.

**Prevention:**
- Use PostgreSQL partial unique indexes: `CREATE UNIQUE INDEX ON "Barcode"("code") WHERE "deletedAt" IS NULL`
- Add this manually to the Prisma migration SQL (edit the generated migration file after `prisma migrate dev --create-only`)
- Do NOT rely on `@unique` in the Prisma schema for these fields — use `@@index` plus manual migration instead
- Document the manually-managed migration so future developers don't overwrite it

**Detection:** Try to create a product with a barcode that was previously used on a soft-deleted product — it throws a unique constraint error.

**Phase:** Products (MVP). Schema design decision before first migration is pushed to production.

---

### Pitfall 4: NextAuth.js Role Not Propagated to Session

**What goes wrong:** Developer stores `roles` (array of section permissions) in the database User table. After login, `useSession()` returns a session object with no role data. The API routes and middleware cannot check permissions.

**Why it happens:** NextAuth.js credentials provider uses JWT sessions by default. Custom fields (like `roles`) are NOT automatically included in the JWT or the session. You must explicitly forward data through two callbacks: `jwt()` → `session()`. The official Auth.js docs state this explicitly. Many tutorials skip this step.

**Consequences:** All users appear to have no permissions. Developer adds temporary bypass, forgetting to remove it. Or developer re-fetches user from DB on every request (N+1 per page load).

**Prevention:**
```typescript
// In NextAuth config:
callbacks: {
  async jwt({ token, user }) {
    if (user) token.roles = user.roles  // Set on first sign-in only
    return token
  },
  async session({ session, token }) {
    session.user.roles = token.roles    // Must explicitly forward
    return session
  }
}
```
- Extend the `Session` and `JWT` TypeScript interfaces in `next-auth.d.ts`
- Roles are baked into the JWT at login time. **Role changes take effect only after the user re-logs in.** For this app (10 users, admin-assigned roles), this is acceptable. Document it.

**Detection:** Log in as non-admin, call `getServerSession()`, check if `session.user.roles` exists.

**Phase:** Authentication. Day 1 before writing any RBAC check.

---

### Pitfall 5: Middleware-Only RBAC (No Server-Side Double-Check)

**What goes wrong:** Developer protects routes in `middleware.ts` by checking session roles. Assumes this is sufficient. API routes at `/api/products` remain unprotected. A user inspects network requests, calls the API directly, bypasses the UI restriction entirely.

**Why it happens:** Next.js middleware runs on the Edge runtime and is the most visible place to add auth. It feels like it covers everything. But `middleware.ts` only protects page navigation — direct API calls skip it.

**Consequences:** Full security bypass. Any authenticated user can read/write any resource regardless of their assigned section permissions.

**Prevention:**
- Apply RBAC in THREE places: middleware (page nav), Server Components (server-side render), API Route Handlers (data operations)
- Create a shared `requireRole(section: string)` utility that can be called from both Server Components and Route Handlers
- Treat middleware as UX optimization (redirect to 403 page fast), not as the security layer

**Detection:** Log in as a user with no product access. Open DevTools, call `POST /api/products` with a valid session cookie — if it succeeds, the guard is missing.

**Phase:** Authentication and every subsequent feature phase.

---

## Moderate Pitfalls

---

### Pitfall 6: `prisma migrate dev` Run in Production

**What goes wrong:** Developer SSHes into VPS to "just quickly apply a migration" and runs `prisma migrate dev` instead of `prisma migrate deploy`. The `dev` command can reset the database ("shadow database" operations), prompt for reset on conflict, or drop tables.

**Why it happens:** `migrate dev` is the command developers use locally every day. On VPS it looks the same.

**Consequences:** Potential data loss. The Prisma docs explicitly warn: "Never run `migrate dev` or `migrate reset` in production."

**Prevention:**
- Production deployment script must only call `prisma migrate deploy`
- Add a guard to the systemd `ExecStartPre` or deploy script:
  ```bash
  NODE_ENV=production npx prisma migrate deploy
  ```
- Never run `prisma migrate reset` on the VPS without a full backup

**Phase:** Deployment setup.

---

### Pitfall 7: `next/image` Hostname Not Configured for Self-Hosted Images

**What goes wrong:** Developer uses `<Image src="/uploads/product-123.jpg" />`. This works locally but throws "hostname not configured" error in production when accessed via `zoiten.pro`, or Next.js image optimization is bypassed entirely.

**Why it happens:** `next/image` requires either a relative path for files in `/public` (which we're not using for uploads) or an explicit `remotePatterns` / `localPatterns` config for anything else.

**Consequences:** Images return 400 errors or bypass optimization pipeline.

**Prevention:**
- Since uploads are served by nginx at `/uploads/`, use a plain `<img>` tag for product photos — not `<Image>`. The file is served by nginx as a static asset, Next.js image optimization doesn't apply and isn't needed (images are already 2K JPEG/PNG from upload).
- Alternatively, configure `localPatterns` in `next.config.ts` if you need `<Image>` features (lazy load, blur placeholder).

**Phase:** Products (MVP) — photo display component.

---

### Pitfall 8: Server Action Body Size Limit for Photo Upload

**What goes wrong:** Developer uses a Next.js Server Action to handle photo uploads. Upload of a 2MB image fails with "Body exceeded 1MB limit" error. User sees a silent failure or cryptic error.

**Why it happens:** Server Actions have a default body size limit of 1MB. Product photos can be up to 2MB (spec says "up to 2K").

**Consequences:** All photo uploads above 1MB fail silently or with a poor error message.

**Prevention:**
- Set `serverActions.bodySizeLimit` in `next.config.ts`:
  ```typescript
  experimental: {
    serverActions: {
      bodySizeLimit: '3mb',  // Headroom above 2MB spec
    },
  }
  ```
- Also configure nginx `client_max_body_size 5m;` in the server block (nginx default is 1MB)
- Use `FormData` for upload, never base64 (base64 inflates size by 33%)

**Detection:** Try uploading a 1.5MB JPEG — it fails.

**Phase:** Products (MVP) — photo upload implementation.

---

### Pitfall 9: Multi-Marketplace Articles Stored as JSONB Instead of Normalized Table

**What goes wrong:** Developer stores marketplace articles as a JSON column: `articles: {"WB": ["12345", "67890"], "Ozon": ["ABC"]}`. This makes it easy to read back but impossible to: query "all products with WB article containing X", validate uniqueness per marketplace, add a new marketplace without a migration, or enforce per-marketplace article count limits.

**Why it happens:** JSONB is seductive for variable-length key-value data. The schema looks simpler.

**Consequences:** Future features (price sync, stock sync) that need to look up a product by marketplace article number require full-table scans or app-level filtering. Barcode uniqueness across marketplaces cannot be enforced at DB level.

**Prevention:**
- Use a normalized `MarketplaceArticle` table:
  ```
  MarketplaceArticle {
    id, productId, marketplaceId, articleNumber, createdAt
    @@unique([marketplaceId, articleNumber])
  }
  ```
- A separate `Marketplace` table with `id, name, slug` allows adding new marketplaces without migration
- This design supports the future API integration milestone cleanly

**Phase:** Products (MVP) — initial schema design.

---

### Pitfall 10: Category/Subcategory Coupled to Brand Without Cascade Guard

**What goes wrong:** Developer deletes a brand. All categories for that brand are cascade-deleted. All products referencing those categories now have null category (or error if NOT NULL). Products appear uncategorized or the deletion is blocked with a confusing FK error.

**Why it happens:** Prisma's default referential action on delete is `Restrict` (throws error), but many developers set `Cascade` without thinking through the consequences.

**Prevention:**
- Set `onDelete: Restrict` for Brand → Category and Category → Product relations explicitly
- Display a "You cannot delete this brand because it has X categories and Y products" message before deletion
- The only thing that should cascade is `Category → Subcategory` (deleting a category removes its subcategories)

**Phase:** Products (MVP) — brand and category CRUD.

---

## Minor Pitfalls

---

### Pitfall 11: Volume Auto-Calculation Stored as Computed Column vs Derived on Read

**What goes wrong:** Developer stores `volume` as a persisted column and manually recalculates it whenever dimensions change. The two get out of sync when someone directly updates the DB or a migration changes the calculation logic.

**Prevention:**
- Do not store `volume` in the database. Calculate `(height * width * depth / 1000)` in the Prisma `select` or in a TypeScript utility function at read time.
- If you need DB-level calculation for sorting/filtering, use a PostgreSQL generated column: `volume NUMERIC GENERATED ALWAYS AS (height * width * depth / 1000.0) STORED`

**Phase:** Products (MVP) — product schema.

---

### Pitfall 12: `deletedAt`-Based Auto-Cleanup Without a Cron Job

**What goes wrong:** The spec requires physical deletion of soft-deleted products after 30 days. Developer builds the soft-delete UI but ships without the cleanup mechanism. Deleted products accumulate forever.

**Why it happens:** The cleanup is "background work" that feels like a later concern.

**Prevention:**
- Implement cleanup as a Next.js Route Handler (`/api/cron/cleanup`) protected by a secret token
- Schedule it via a VPS cron job: `0 2 * * * curl -s -H "Authorization: Bearer $CRON_SECRET" https://zoiten.pro/api/cron/cleanup`
- Alternatively use a `pg_cron` PostgreSQL extension job directly in the DB
- Ship the cleanup mechanism in the same phase as soft delete — they are one feature

**Phase:** Products (MVP).

---

### Pitfall 13: nginx Config Breaks CantonFairBot

**What goes wrong:** Developer edits the global nginx config or the default server block while setting up the zoiten.pro reverse proxy. CantonFairBot stops responding because its nginx location block was in the same file or default server context.

**Why it happens:** VPS nginx is often configured with a single monolithic `nginx.conf`. Adding a `server {}` block in the wrong place disrupts existing virtual hosts.

**Prevention:**
- Use separate files in `/etc/nginx/sites-available/` for each app: `zoiten.pro` and `cantonfairbot` (or whatever domain it uses)
- Enable via `sites-enabled/` symlinks — never edit `/etc/nginx/nginx.conf` directly
- Run `nginx -t` to validate config before `systemctl reload nginx`
- Verify CantonFairBot is still accessible after every nginx change

**Phase:** Deployment.

---

### Pitfall 14: Missing `NEXTAUTH_URL` and `NEXTAUTH_SECRET` in Production

**What goes wrong:** App builds fine but all login attempts return "Error: Missing NEXTAUTH_URL" or sessions expire immediately. Or worse: sessions appear to work but are cryptographically insecure because `NEXTAUTH_SECRET` defaults to a dev value.

**Why it happens:** These env vars are required for NextAuth.js in production. They're easy to set locally (`.env.local`) but often forgotten in the VPS systemd service file.

**Prevention:**
- Create `/etc/zoiten.pro.env` (not in the project directory) with all production env vars
- Reference it in the systemd service: `EnvironmentFile=/etc/zoiten.pro.env`
- Required minimum:
  ```
  NEXTAUTH_URL=https://zoiten.pro
  NEXTAUTH_SECRET=<32+ random bytes, generate with: openssl rand -base64 32>
  DATABASE_URL=postgresql://...
  ```
- NEXTAUTH_URL must match the actual production domain exactly

**Phase:** Deployment / Authentication.

---

### Pitfall 15: ABC Status and Availability Status Stored as Raw Strings

**What goes wrong:** Developer stores `abcStatus` as `String` and `availability` as `String`. Code is littered with `if (product.abcStatus === 'A')` checks. A typo (`'a'` vs `'A'`) causes a silent bug. A migration to rename a status value requires a find-and-replace across all code.

**Prevention:**
- Use PostgreSQL enums via Prisma:
  ```
  enum AbcStatus { A B C }
  enum Availability { IN_STOCK OUT_OF_STOCK DISCONTINUED DELETED }
  ```
- TypeScript will enforce valid values at compile time

**Phase:** Products (MVP) — initial schema.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| Products — schema design | Soft delete unique constraint clash (Pitfall 3) | Partial index in migration SQL before first deploy |
| Products — photo upload | Photo stored in `/public`, lost after redeploy (Pitfall 1) | Nginx alias to `/var/www/zoiten-uploads/` |
| Products — photo upload | Server Action 1MB body limit (Pitfall 8) | `bodySizeLimit: '3mb'` + nginx `client_max_body_size 5m` |
| Products — queries | Soft-delete filter omission in nested queries (Pitfall 2) | Prisma Client Extension + shared helper |
| Products — marketplace articles | JSONB for articles makes future API sync impossible (Pitfall 9) | Normalized `MarketplaceArticle` table from day 1 |
| Products — categories | Brand cascade delete orphans products (Pitfall 10) | `onDelete: Restrict` + UI guard |
| Products — soft delete | No cron job for 30-day physical cleanup (Pitfall 12) | Ship cleanup in same PR as soft delete |
| Authentication | Role not in session JWT (Pitfall 4) | `jwt()` + `session()` callbacks, extend types |
| Authentication | Middleware-only RBAC (Pitfall 5) | Double-check in Route Handlers too |
| Deployment | `migrate dev` on production (Pitfall 6) | Deploy script uses `migrate deploy` only |
| Deployment | Nginx breaks CantonFairBot (Pitfall 13) | Separate `sites-available` file, `nginx -t` before reload |
| Deployment | Missing env vars (Pitfall 14) | `EnvironmentFile` in systemd unit |
| Deployment | File uploads lost after redeploy (Pitfall 1) | Storage outside project tree confirmed before first deploy |

---

## Sources

- [Soft Delete: Implementation Issues in Prisma and Solution in ZenStack](https://zenstack.dev/blog/soft-delete)
- [How to Implement Soft Delete with Prisma using Partial Indexes](https://www.thisdot.co/blog/how-to-implement-soft-delete-with-prisma-using-partial-indexes)
- [Prisma soft delete middleware (official docs)](https://www.prisma.io/docs/orm/prisma-client/client-extensions/middleware/soft-delete-middleware)
- [Prisma soft deletes GitHub issue #3398](https://github.com/prisma/prisma/issues/3398)
- [Auth.js Role Based Access Control guide](https://authjs.dev/guides/role-based-access-control)
- [NextAuth.js Credentials Provider + session callback issue #3970](https://github.com/nextauthjs/next-auth/issues/3970)
- [Next.js: Server Actions bodySizeLimit config](https://nextjs.org/docs/app/api-reference/config/next-config-js/serverActions)
- [Next.js: Access files uploaded to filesystem after build (Discussion #14769)](https://github.com/vercel/next.js/discussions/14769)
- [Next.js: Public folder doesn't update in production (Discussion #16417)](https://github.com/vercel/next.js/discussions/16417)
- [Prisma: Development and production migration workflows](https://www.prisma.io/docs/orm/prisma-migrate/workflows/development-and-production)
- [Common Data Loss Scenarios in Prisma Schema Changes](https://dev.to/vatul16/common-data-loss-scenarios-solutions-in-prisma-schema-changes-52id)
- [How to Increase File Upload Size in Next.js, Nginx](https://dev.to/nurulislamrimon/how-to-increase-file-upload-size-in-web-applications-nextjs-expressjs-nginx-apache-1be)
- [Why Polymorphic Associative Tables Don't Make Sense for Prisma](https://medium.com/@gaschecher/why-polymorphic-associative-tables-dont-make-sense-for-prisma-4c9470ce264c)
- [Nginx: Serving Static Content](https://docs.nginx.com/nginx/admin-guide/web-server/serving-static-content/)
- [Next.js: next/image Un-configured Host error](https://nextjs.org/docs/messages/next-image-unconfigured-host)
- [Nextjs Session Management: Solving NextAuth Persistence Issues in 2025](https://clerk.com/articles/nextjs-session-management-solving-nextauth-persistence-issues)
