// app/(dashboard)/stock/wb/page.tsx
// Phase 14 (STOCK-22, STOCK-25): RSC /stock/wb — nmId-level с кластерами.
// Quick 260422-oy5: per-user фильтр скрытых WB-складов (User.stockWbHiddenWarehouses).

import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getStockWbData } from "@/lib/stock-wb-data"
import { StockWbTable } from "@/components/stock/StockWbTable"

export const metadata = {
  title: "Управление остатками — WB склады",
}

export default async function StockWbPage() {
  await requireSection("STOCK")
  const [data, session] = await Promise.all([getStockWbData(), auth()])

  // Quick 260422-oy5: per-user фильтр скрытых WB-складов
  let hiddenWarehouseIds: number[] = []
  if (session?.user?.id) {
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { stockWbHiddenWarehouses: true },
    })
    hiddenWarehouseIds = user?.stockWbHiddenWarehouses ?? []
  }

  if (data.groups.length === 0) {
    return (
      <div className="flex-1 min-h-0 text-center py-16">
        <h3 className="text-sm font-medium">Остатки WB не загружены</h3>
        <p className="text-xs text-muted-foreground mt-1">
          Нажмите «Обновить из WB» на странице{" "}
          <a href="/stock" className="underline">Остатки</a>
          , чтобы загрузить актуальные данные по складам.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 min-h-0">
      <StockWbTable
        groups={data.groups}
        turnoverNormDays={data.turnoverNormDays}
        clusterWarehouses={data.clusterWarehouses}
        hiddenWarehouseIds={hiddenWarehouseIds}
      />
    </div>
  )
}
