import { requireSection } from "@/lib/rbac"
import { StockTabs } from "@/components/stock/StockTabs"

export default async function StockLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSection("STOCK")

  return (
    <div className="h-full flex flex-col p-6 gap-4">
      <StockTabs />
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        {children}
      </div>
    </div>
  )
}
