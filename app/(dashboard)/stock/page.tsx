import { requireSection } from "@/lib/rbac"

export const metadata = {
  title: "Управление остатками",
}

export default async function StockPage() {
  await requireSection("STOCK")

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Раздел в разработке. Plan 14-06 реализует таблицу Product-level остатков.
      </p>
    </div>
  )
}
