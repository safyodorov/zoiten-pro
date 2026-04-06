// middleware.ts
// Edge-compatible route guard using auth.config.ts (NOT auth.ts — which imports Prisma)
// Handles: unauthenticated redirect, RBAC section checks, SUPERADMIN bypass
import NextAuth from "next-auth"
import authConfig from "@/lib/auth.config"
import { SECTION_PATHS } from "@/lib/sections"

const { auth } = NextAuth(authConfig)

export default auth((req) => {
  const { nextUrl } = req
  const isLoggedIn = !!req.auth

  // Landing page (/) is public — skip auth
  if (nextUrl.pathname === "/") return

  // Redirect unauthenticated users to /login
  if (!isLoggedIn) {
    return Response.redirect(new URL("/login", nextUrl))
  }

  const role = req.auth?.user?.role
  const allowedSections = req.auth?.user?.allowedSections ?? []

  // Superadmin bypasses all section checks (per D-11)
  if (role === "SUPERADMIN") return

  // Check if this path requires a specific section
  const matchedEntry = Object.entries(SECTION_PATHS).find(([prefix]) =>
    nextUrl.pathname.startsWith(prefix)
  )

  if (matchedEntry) {
    const [, requiredSection] = matchedEntry
    if (!allowedSections.includes(requiredSection)) {
      return Response.redirect(new URL("/unauthorized", nextUrl))
    }
  }
})

// Matcher excludes: API routes (Auth.js uses /api/auth/*), Next.js internals,
// static files, login page. Covers all dashboard and section routes.
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|login).*)"],
}
