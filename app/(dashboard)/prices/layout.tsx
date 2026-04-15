import { requireSection } from "@/lib/rbac"
import { PricesTabs } from "@/components/prices/PricesTabs"

export default async function PricesLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSection("PRICES")

  return (
    // h-full flex-col — чтобы дочерняя /prices/wb/page.tsx могла реализовать
    // sticky шапку + таблицу с собственным внутренним скроллом (h-full не работает,
    // если цепочка прерывается обычным блоком без явной высоты).
    <div className="flex flex-col h-full gap-4">
      <PricesTabs />
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  )
}
