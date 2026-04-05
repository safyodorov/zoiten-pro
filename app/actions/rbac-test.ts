// app/actions/rbac-test.ts
// AUTH-06: Server Action layer RBAC enforcement via requireSection()
// This file demonstrates the pattern. Future phase modules will follow this exact structure.
"use server"

import { requireSection } from "@/lib/rbac"

/**
 * Example: Server Action that requires PRODUCTS section access.
 * Every mutating Server Action in future phases MUST call requireSection() first.
 *
 * Usage:
 *   await getProductsAction() — throws "UNAUTHORIZED" if not logged in,
 *                               throws "FORBIDDEN" if not in allowedSections (SUPERADMIN bypasses)
 */
export async function getProductsAction(): Promise<{ ok: boolean }> {
  await requireSection("PRODUCTS") // AUTH-06: enforces RBAC at Server Action layer
  // Implementation goes here in Phase 2
  return { ok: true }
}

/**
 * Example: Server Action that requires SUPPORT section access.
 */
export async function getSupportAction(): Promise<{ ok: boolean }> {
  await requireSection("SUPPORT") // AUTH-06: enforces RBAC at Server Action layer
  return { ok: true }
}
