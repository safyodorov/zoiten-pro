// app/api/stock-wb-export/route.ts
// GET /api/stock-wb-export — выгрузка /stock/wb в Excel с фото товаров.
// Quick 260702. Принимает те же фильтры, что страница /stock/wb
// (directions/brands/categories/subcategories — comma-separated ids).
// Долгий запрос: качает фото с WB CDN (~1 мин на первый экспорт, дальше кэш).
export const runtime = "nodejs"
export const maxDuration = 300

import type { NextRequest } from "next/server"
import { requireSection } from "@/lib/rbac"
import { getStockWbData } from "@/lib/stock-wb-data"
import { buildStockWbExportBuffer } from "@/lib/stock-wb-export"

export async function GET(req: NextRequest): Promise<Response> {
  try {
    await requireSection("STOCK")
  } catch (e) {
    const forbidden = e instanceof Error && e.message === "FORBIDDEN"
    return new Response(forbidden ? "Forbidden" : "Unauthorized", {
      status: forbidden ? 403 : 401,
    })
  }

  const sp = req.nextUrl.searchParams
  const data = await getStockWbData({
    directionIds: sp.get("directions")?.split(",").filter(Boolean),
    brandIds: sp.get("brands")?.split(",").filter(Boolean),
    categoryIds: sp.get("categories")?.split(",").filter(Boolean),
    subcategoryIds: sp.get("subcategories")?.split(",").filter(Boolean),
  })

  const buf = await buildStockWbExportBuffer(data.groups)

  // sv-SE = YYYY-MM-DD; Moscow timezone (проектная конвенция)
  const dateStr = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Moscow",
  }).format(new Date())
  const filename = `Остатки WB склады ${dateStr}.xlsx`

  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="stock-wb-${dateStr}.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  })
}
