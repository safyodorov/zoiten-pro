// app/actions/stock-wb.ts
// Quick 260422-oy5: per-user фильтр видимости WB-складов на /stock/wb.

"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { auth } from "@/lib/auth"
import { requireSection } from "@/lib/rbac"
import { revalidatePath } from "next/cache"

const InputSchema = z.object({
  ids: z.array(z.number().int()).max(500), // разумный верх для защиты от мусора
})

export type SaveStockWbHiddenWarehousesResult =
  | { ok: true }
  | { ok: false; error: string }

/**
 * Сохраняет массив warehouseId скрытых WB-складов для текущего пользователя.
 * RBAC: STOCK VIEW — user менять СВОЮ preference имеет право (не admin).
 * Дедупликация + сортировка для стабильности.
 */
export async function saveStockWbHiddenWarehouses(
  ids: number[],
): Promise<SaveStockWbHiddenWarehousesResult> {
  await requireSection("STOCK") // D-09: user preference, не MANAGE

  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { ok: false, error: "Не авторизован" }

  const parsed = InputSchema.safeParse({ ids })
  if (!parsed.success) return { ok: false, error: "Некорректные данные" }

  // dedupe + sort (stable)
  const clean = [...new Set(parsed.data.ids)].sort((a, b) => a - b)

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { stockWbHiddenWarehouses: clean },
    })
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "DB error" }
  }

  revalidatePath("/stock/wb")
  return { ok: true }
}
