import { requireSection } from "@/lib/rbac"

export default async function StockLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSection("STOCK")

  return (
    <div className="p-6 space-y-6">
      {/* StockTabs будет добавлен в Plan 14-07 */}
      {children}
    </div>
  )
}
