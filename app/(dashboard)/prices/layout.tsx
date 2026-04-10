import { requireSection } from "@/lib/rbac"
import { PricesTabs } from "@/components/prices/PricesTabs"

export default async function PricesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSection("PRICES")

  return (
    <div className="space-y-4">
      <PricesTabs />
      {children}
    </div>
  )
}
