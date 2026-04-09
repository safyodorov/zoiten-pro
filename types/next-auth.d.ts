// types/next-auth.d.ts
// TypeScript module augmentation for Auth.js v5 session and JWT types
// Source: https://authjs.dev/getting-started/typescript
// Using string instead of Prisma enum types to avoid circular dependency
// and keep this file Edge-safe (imported implicitly by TypeScript everywhere)
import { DefaultSession } from "next-auth"

declare module "next-auth" {
  interface Session {
    user: {
      id: string
      role: string // "SUPERADMIN" | "MANAGER" | "VIEWER"
      allowedSections: string[] // DEPRECATED, legacy fallback
      sectionRoles: Record<string, string> // { "PRODUCTS": "MANAGE" | "VIEW", ... }
    } & DefaultSession["user"]
  }

  interface User {
    role?: string
    allowedSections?: string[]
    sectionRoles?: Record<string, string>
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string
    role?: string
    allowedSections?: string[]
    sectionRoles?: Record<string, string>
  }
}
