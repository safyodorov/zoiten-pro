// lib/auth.ts
// Full auth config with Node.js-only dependencies (Prisma + bcrypt)
// NEVER import this file from middleware.ts — it's not Edge-compatible
import NextAuth, { CredentialsSignin } from "next-auth"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import authConfig from "@/lib/auth.config"

// Custom error classes for specific inline error messages (per D-06)
class InvalidCredentialsError extends CredentialsSignin {
  code = "invalid_credentials"
}

class AccountDisabledError extends CredentialsSignin {
  code = "account_disabled"
}

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string
        const password = credentials?.password as string

        if (!email || !password) return null

        const user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            role: true,
            allowedSections: true,
            isActive: true,
          },
        })

        if (!user) throw new InvalidCredentialsError()

        if (!user.isActive) throw new AccountDisabledError()

        const passwordsMatch = await bcrypt.compare(password, user.password)
        if (!passwordsMatch) throw new InvalidCredentialsError()

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
      // On sign-in (user is populated), copy custom fields to token
      if (user) {
        token.id = user.id
        token.role = (user as any).role
        token.allowedSections = (user as any).allowedSections
      }
      return token
    },
    async session({ session, token }) {
      // Forward token fields to session for client access
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.allowedSections = (token.allowedSections as string[]) ?? []
      }
      return session
    },
  },
})
