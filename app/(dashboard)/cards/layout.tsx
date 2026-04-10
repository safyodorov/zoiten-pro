import { requireSection } from "@/lib/rbac"
import { CardsTabs } from "@/components/cards/CardsTabs"

export default async function CardsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSection("PRODUCTS")

  return (
    <div className="space-y-4">
      <CardsTabs />
      {children}
    </div>
  )
}
