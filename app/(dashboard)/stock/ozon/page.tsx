// app/(dashboard)/stock/ozon/page.tsx
// Phase 14 (STOCK-21): Placeholder /stock/ozon — Ozon Stocks API milestone v1.3+ (STOCK-FUT-06).

import { requireSection } from "@/lib/rbac"
import { ComingSoon } from "@/components/ui/ComingSoon"

export const metadata = {
  title: "Управление остатками Ozon",
}

export default async function StockOzonPage() {
  await requireSection("STOCK")
  return <ComingSoon sectionName="Управление остатками Ozon" />
}
