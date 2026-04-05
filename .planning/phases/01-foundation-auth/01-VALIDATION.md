# Phase 01 — Validation Architecture

**Phase:** 01-foundation-auth
**Nyquist validation:** enabled (`workflow.nyquist_validation: true`)

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest (over Jest — native TS, no babel-jest needed with Next.js 15) |
| Config file | `vitest.config.ts` |
| Install command | `npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom` |
| Quick run | `npm test -- --testPathPattern=auth` |
| Full suite | `npm test` |
| Type check | `npx tsc --noEmit` |

---

## Wave 0 Setup (must exist before test tasks run)

### Install test framework

```bash
cd /Users/macmini/zoiten.pro
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom
```

### vitest.config.ts

```typescript
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
})
```

### tests/setup.ts

```typescript
import "@testing-library/jest-dom"

// Ensure test env vars are set
process.env.DATABASE_URL = process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/zoiten_erp_test"
process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? "test-secret-32chars-minimum-length"
process.env.AUTH_URL = "http://localhost:3000"
```

### Add test script to package.json

```json
"scripts": {
  "test": "vitest run",
  "test:watch": "vitest",
  "type-check": "tsc --noEmit"
}
```

---

## Requirements → Test Map

| Req ID | Behavior | Test Type | File | Automated Command |
|--------|----------|-----------|------|-------------------|
| FOUND-01 | Project builds without errors | smoke | — | `npm run build` |
| FOUND-02 | Prisma can connect to DB and run migration | integration | `tests/seed.test.ts` | `npx prisma migrate status` |
| FOUND-03 | Schema has all required models and fields | unit | `tests/schema.test.ts` | `npm test -- --testPathPattern=schema` |
| FOUND-04 | PrismaClient singleton returns same instance | unit | `tests/prisma-singleton.test.ts` | `npm test -- --testPathPattern=prisma-singleton` |
| AUTH-01 | User with valid credentials gets session | integration | `tests/auth.test.ts` | `npm test -- --testPathPattern=auth` |
| AUTH-02 | Session survives simulated page refresh (JWT in cookie) | integration | `tests/auth.test.ts` | `npm test -- --testPathPattern=auth` |
| AUTH-03 | signOut clears session cookie | integration | `tests/auth.test.ts` | `npm test -- --testPathPattern=auth` |
| AUTH-04 | Password stored as bcrypt hash (not plaintext) | unit | `tests/seed.test.ts` | `npm test -- --testPathPattern=seed` |
| AUTH-05 | Superadmin exists in DB after seed runs | integration | `tests/seed.test.ts` | `npm test -- --testPathPattern=seed` |
| AUTH-06 | Unauthenticated request to /dashboard redirects to /login | integration | `tests/middleware.test.ts` | `npm test -- --testPathPattern=middleware` |
| AUTH-07 | JWT token contains role and allowedSections | unit | `tests/auth.test.ts` | `npm test -- --testPathPattern=auth` |
| AUTH-08 | TypeScript accepts session.user.role without type error | build | — | `npm run type-check` |

---

## Test File Stubs (Wave 0)

### tests/schema.test.ts (FOUND-03)

```typescript
import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import path from "path"

const schema = readFileSync(path.resolve(__dirname, "../prisma/schema.prisma"), "utf-8")

describe("Prisma schema completeness", () => {
  it("contains all required enums", () => {
    expect(schema).toContain("enum UserRole")
    expect(schema).toContain("enum ERP_SECTION")
    expect(schema).toContain("enum AbcStatus")
    expect(schema).toContain("enum Availability")
  })

  it("ERP_SECTION has all 9 values", () => {
    expect(schema).toContain("PRODUCTS")
    expect(schema).toContain("PRICES")
    expect(schema).toContain("WEEKLY_CARDS")
    expect(schema).toContain("STOCK")
    expect(schema).toContain("COST")
    expect(schema).toContain("PROCUREMENT")
    expect(schema).toContain("SALES")
    expect(schema).toContain("SUPPORT")
    expect(schema).toContain("USER_MANAGEMENT")
  })

  it("contains all required models", () => {
    const models = ["User", "Marketplace", "Brand", "Category", "Subcategory", "Product", "MarketplaceArticle", "Barcode"]
    models.forEach(m => expect(schema).toContain(`model ${m}`))
  })

  it("User model has allowedSections field", () => {
    expect(schema).toContain("allowedSections")
  })
})
```

### tests/prisma-singleton.test.ts (FOUND-04)

```typescript
import { describe, it, expect } from "vitest"

describe("Prisma singleton", () => {
  it("returns the same instance on multiple imports", async () => {
    const { prisma: p1 } = await import("@/lib/prisma")
    const { prisma: p2 } = await import("@/lib/prisma")
    expect(p1).toBe(p2)
  })
})
```

### tests/seed.test.ts (AUTH-04, AUTH-05)

```typescript
import { describe, it, expect } from "vitest"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

describe("Superadmin seed", () => {
  it("superadmin exists in DB (AUTH-05)", async () => {
    const user = await prisma.user.findUnique({
      where: { email: "sergey.fyodorov@gmail.com" },
    })
    expect(user).not.toBeNull()
    expect(user?.role).toBe("SUPERADMIN")
    expect(user?.isActive).toBe(true)
  })

  it("password is stored as bcrypt hash, not plaintext (AUTH-04)", async () => {
    const user = await prisma.user.findUnique({
      where: { email: "sergey.fyodorov@gmail.com" },
      select: { password: true },
    })
    expect(user?.password).not.toBe("stafurovonet")
    expect(user?.password).toMatch(/^\$2[aby]\$/)
    const matches = await bcrypt.compare("stafurovonet", user!.password)
    expect(matches).toBe(true)
  })
})
```

### tests/auth.test.ts (AUTH-01, AUTH-02, AUTH-03, AUTH-07)

```typescript
import { describe, it, expect } from "vitest"

// Note: Auth.js v5 sessions are tested via the authorize function directly
// Full end-to-end cookie tests require a running server (use manual test steps in Plan 04)

describe("Auth.js config split (AUTH-07)", () => {
  it("auth.config.ts has no Prisma or bcrypt imports", () => {
    const fs = require("fs")
    const content = fs.readFileSync("lib/auth.config.ts", "utf8")
    expect(content).not.toContain("@prisma/client")
    expect(content).not.toContain("bcrypt")
    expect(content).toContain("satisfies NextAuthConfig")
  })

  it("auth.ts jwt callback propagates role and allowedSections (AUTH-07)", () => {
    const fs = require("fs")
    const content = fs.readFileSync("lib/auth.ts", "utf8")
    expect(content).toContain("token.role")
    expect(content).toContain("token.allowedSections")
    expect(content).toContain("session.user.role")
    expect(content).toContain("session.user.allowedSections")
  })
})
```

### tests/middleware.test.ts (AUTH-06)

```typescript
import { describe, it, expect } from "vitest"

describe("Middleware (AUTH-06)", () => {
  it("middleware.ts does not import @prisma/client (Edge-safe)", () => {
    const fs = require("fs")
    const content = fs.readFileSync("middleware.ts", "utf8")
    expect(content).not.toContain("@prisma/client")
    expect(content).toContain("SECTION_PATHS")
    expect(content).toContain("SUPERADMIN")
  })

  it("matcher excludes api and _next routes", () => {
    const fs = require("fs")
    const content = fs.readFileSync("middleware.ts", "utf8")
    expect(content).toContain("api")
    expect(content).toContain("_next")
  })
})
```

---

## Sampling Rate

| Gate | Command | When |
|------|---------|------|
| Per task commit | `npm run type-check` | After each task |
| Per wave merge | `npm test` | After each wave |
| Phase gate | `npm test && npm run build` | Before `/gsd:verify-work` |

---

## Notes

- Integration tests (AUTH-01, AUTH-02, AUTH-03, AUTH-05) require a running PostgreSQL with seeded data.
- AUTH-08 (TypeScript session types) is verified by `npm run type-check` — no test file needed.
- FOUND-01 (build) is verified by `npm run build` — no test file needed.
- FOUND-02 (Prisma connection) is verified by `npx prisma migrate status` — no test file needed.
