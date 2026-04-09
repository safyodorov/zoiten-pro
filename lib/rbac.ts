// lib/rbac.ts
// Server Action RBAC utilities — second enforcement layer after middleware
// Call at the top of every Server Action that reads/mutates protected data
import { auth } from "@/lib/auth"

export type SectionRole = "VIEW" | "MANAGE"

/**
 * Require authentication and section access.
 * Call at the top of every Server Action that handles protected data.
 *
 * @param section - ERP_SECTION string value (e.g., "PRODUCTS")
 * @param minRole - минимальная требуемая роль (VIEW по умолчанию). MANAGE для write-операций.
 * @throws "UNAUTHORIZED" if not logged in
 * @throws "FORBIDDEN" if user lacks section access или роль ниже minRole
 */
export async function requireSection(
  section: string,
  minRole: SectionRole = "VIEW"
): Promise<void> {
  const session = await auth()

  if (!session?.user) {
    throw new Error("UNAUTHORIZED")
  }

  // Superadmin bypasses all section checks (per D-11)
  if (session.user.role === "SUPERADMIN") return

  const sectionRoles = session.user.sectionRoles ?? {}
  const userRole = sectionRoles[section] as SectionRole | undefined

  if (!userRole) {
    // Fallback на legacy allowedSections для обратной совместимости
    if (session.user.allowedSections?.includes(section)) return
    throw new Error("FORBIDDEN")
  }

  // MANAGE покрывает оба уровня, VIEW — только чтение
  if (minRole === "MANAGE" && userRole !== "MANAGE") {
    throw new Error("FORBIDDEN")
  }
}

/**
 * Получить роль текущего пользователя в разделе (или null если нет доступа).
 * Для conditional UI — например, скрыть кнопку "Удалить" если роль VIEW.
 */
export async function getSectionRole(section: string): Promise<SectionRole | null> {
  const session = await auth()
  if (!session?.user) return null
  if (session.user.role === "SUPERADMIN") return "MANAGE"

  const sectionRoles = session.user.sectionRoles ?? {}
  const userRole = sectionRoles[section] as SectionRole | undefined
  if (userRole) return userRole

  // Fallback на legacy allowedSections
  if (session.user.allowedSections?.includes(section)) return "MANAGE"
  return null
}

/**
 * Require superadmin role specifically (for user management routes).
 * @throws "UNAUTHORIZED" if not logged in
 * @throws "FORBIDDEN" if not superadmin
 */
export async function requireSuperadmin(): Promise<void> {
  const session = await auth()

  if (!session?.user) {
    throw new Error("UNAUTHORIZED")
  }

  if (session.user.role !== "SUPERADMIN") {
    throw new Error("FORBIDDEN")
  }
}

/**
 * Get current session user or return null. Non-throwing.
 * Use in RSC pages to conditionally render UI.
 */
export async function getCurrentUser() {
  const session = await auth()
  return session?.user ?? null
}
