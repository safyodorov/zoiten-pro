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
            sectionRoles: {
              select: { section: true, role: true },
            },
          },
        })

        if (!user) throw new InvalidCredentialsError()

        if (!user.isActive) throw new AccountDisabledError()

        const passwordsMatch = await bcrypt.compare(password, user.password)
        if (!passwordsMatch) throw new InvalidCredentialsError()

        // Превращаем массив ролей в map { section: role }
        const sectionRoles: Record<string, string> = {}
        for (const sr of user.sectionRoles) {
          sectionRoles[sr.section] = sr.role
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          allowedSections: user.allowedSections,
          sectionRoles,
        }
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      // On sign-in (user is populated), copy custom fields to token
      if (user) {
        token.id = user.id
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.role = (user as any).role
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.allowedSections = (user as any).allowedSections
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        token.sectionRoles = (user as any).sectionRoles
        token.rolesRefreshedAt = Date.now()
        return token
      }

      // Периодический refresh прав из БД (не чаще раза в 60 сек на сессию).
      // Зачем: гранты/отзывы через /admin/users и блокировка аккаунта применяются
      // без перелогина (лаг ≤ 1 мин). Запрос — lookup по PK + sectionRoles (индекс по userId).
      const REFRESH_INTERVAL_MS = 60_000
      const lastRefresh = (token.rolesRefreshedAt as number | undefined) ?? 0
      const tokenId = token.id as string | undefined
      if (tokenId && Date.now() - lastRefresh > REFRESH_INTERVAL_MS) {
        try {
          const fresh = await prisma.user.findUnique({
            where: { id: tokenId },
            select: {
              role: true,
              allowedSections: true,
              isActive: true,
              sectionRoles: { select: { section: true, role: true } },
            },
          })

          // Аккаунт удалён или отключён → инвалидируем сессию (форсим разлогин)
          if (!fresh || !fresh.isActive) return null

          const sectionRoles: Record<string, string> = {}
          for (const sr of fresh.sectionRoles) sectionRoles[sr.section] = sr.role

          token.role = fresh.role
          token.allowedSections = fresh.allowedSections
          token.sectionRoles = sectionRoles
          token.rolesRefreshedAt = Date.now()
        } catch {
          // БД недоступна — не трогаем токен и НЕ разлогиниваем (без ложных вылетов).
          // Следующий запрос попробует снова (rolesRefreshedAt не обновлён).
        }
      }

      return token
    },
    async session({ session, token }) {
      // Forward token fields to session for client access
      if (token) {
        session.user.id = token.id as string
        session.user.role = token.role as string
        session.user.allowedSections = (token.allowedSections as string[]) ?? []
        session.user.sectionRoles = (token.sectionRoles as Record<string, string>) ?? {}
      }
      return session
    },
  },
})
