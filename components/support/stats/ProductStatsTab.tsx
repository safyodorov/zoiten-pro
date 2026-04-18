// components/support/stats/ProductStatsTab.tsx
// Phase 13 — временный stub (наполняется в Task 2).

import type { ProductStatRow } from "@/lib/support-stats"

export interface ProductStatsTabProps {
  products: ProductStatRow[]
  topReasons: Array<{ reason: string; count: number }>
}

export function ProductStatsTab(_props: ProductStatsTabProps) {
  return null
}
