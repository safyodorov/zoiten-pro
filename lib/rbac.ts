// lib/rbac.ts
// Server Action RBAC utilities — second enforcement layer after middleware
// Call at the top of every Server Action that reads/mutates protected data
import { auth } from "@/lib/auth"

/**
 * Require authentication and section access.
 * Call at the top of every Server Action that handles protected data.
 *
 * @param section - ERP_SECTION string value (e.g., "PRODUCTS")
 * @throws "UNAUTHORIZED" if not logged in
 * @throws "FORBIDDEN" if user lacks section access
 */
export async function requireSection(section: string): Promise<void> {
  const session = await auth()

  if (!session?.user) {
    throw new Error("UNAUTHORIZED")
  }

  // Superadmin bypasses all section checks (per D-11)
  if (session.user.role === "SUPERADMIN") return

  if (!session.user.allowedSections.includes(section)) {
    throw new Error("FORBIDDEN")
  }
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
