// lib/auth.config.ts
// Edge-compatible auth config — NO Prisma, NO bcrypt imports
// This file is imported by middleware.ts which runs on Edge runtime
import type { NextAuthConfig } from "next-auth"

export default {
  providers: [],
  // Credentials provider lives in auth.ts only — not Edge-compatible
  pages: {
    signIn: "/login",
  },
  callbacks: {
    authorized({ auth, request: { nextUrl } }) {
      // Basic auth check — detailed RBAC is in middleware.ts
      const isLoggedIn = !!auth?.user
      const isAuthPage = nextUrl.pathname.startsWith("/login")

      if (isAuthPage) {
        if (isLoggedIn) return Response.redirect(new URL("/dashboard", nextUrl))
        return true
      }

      if (!isLoggedIn) return false // Redirect to signIn (pages.signIn = /login)

      return true
    },
  },
} satisfies NextAuthConfig
