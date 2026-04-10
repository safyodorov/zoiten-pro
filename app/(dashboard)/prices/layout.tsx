import { requireSection } from "@/lib/rbac"
import { PricesTabs } from "@/components/prices/PricesTabs"

export default async function PricesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSection("PRICES")

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-medium">Управление ценами</h1>
      <PricesTabs />
      {children}
    </div>
  )
}
