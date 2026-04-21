// lib/sections.ts
// Edge-safe: no imports from @prisma/client
// Maps URL path prefixes to ERP_SECTION enum string values
// Used by middleware.ts (Edge runtime) for RBAC route checks

export const SECTION_PATHS = {
  "/products": "PRODUCTS",
  "/cards": "PRODUCTS",
  "/prices": "PRICES",
  "/weekly": "WEEKLY_CARDS",
  "/stock": "STOCK",
  "/batches": "COST",
  "/purchase-plan": "PROCUREMENT",
  "/sales-plan": "SALES",
  "/support": "SUPPORT",
  "/employees": "EMPLOYEES",
} as const satisfies Record<string, string>

export type SectionPath = keyof typeof SECTION_PATHS
export type SectionValue = (typeof SECTION_PATHS)[SectionPath]
