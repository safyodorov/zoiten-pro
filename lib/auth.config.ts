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
    // JWT callbacks MUST be here too — middleware runs on Edge and needs role/sections
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.allowedSections = (user as any).allowedSections
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.allowedSections = (token.allowedSections as string[]) ?? []
      }
      return session
    },
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
