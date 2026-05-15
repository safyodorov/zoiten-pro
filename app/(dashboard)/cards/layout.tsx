import { requireSection } from "@/lib/rbac"
import { CardsTabs } from "@/components/cards/CardsTabs"

export default async function CardsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSection("PRODUCTS")

  return (
    <div className="h-full flex flex-col gap-4">
      <CardsTabs />
      <div className="flex-1 min-h-0 flex flex-col gap-4">
        {children}
      </div>
    </div>
  )
}
