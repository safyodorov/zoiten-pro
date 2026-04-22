import { requireSection } from "@/lib/rbac"
import { StockTabs } from "@/components/stock/StockTabs"

export default async function StockLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSection("STOCK")

  return (
    <div className="p-6 space-y-6">
      <StockTabs />
      {children}
    </div>
  )
}
