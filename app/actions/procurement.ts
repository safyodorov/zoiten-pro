// app/actions/procurement.ts
// Server Actions для MVP «План закупок»: upsert per-product заказа из Китая.
// orderedQty machine-managed из закупок (lib/production-sync.ts, quick 260702-j52) —
// action редактирует только expectedDate + plannedSalesPerDay.
"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

type ActionResult = { ok: true } | { ok: false; error: string }

const UpsertIncomingSchema = z.object({
  productId: z.string().min(1),
  expectedDate: z.union([z.string(), z.null()]).optional(),
  // null чистит, undefined не трогает, число — устанавливает
  plannedSalesPerDay: z.union([z.number().min(0).max(1_000_000), z.null()]).optional(),
})

export async function upsertProductIncoming(
  input: z.infer<typeof UpsertIncomingSchema>,
): Promise<ActionResult> {
  await requireSection("PROCUREMENT", "MANAGE")

  const parsed = UpsertIncomingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Невалидные данные" }
  }
  const { productId, expectedDate, plannedSalesPerDay } = parsed.data

  let expected: Date | null | undefined = undefined
  if (expectedDate === null) {
    expected = null
  } else if (typeof expectedDate === "string" && expectedDate.length > 0) {
    const d = new Date(expectedDate)
    if (Number.isNaN(d.getTime())) {
      return { ok: false, error: "Невалидная дата" }
    }
    expected = d
  }

  try {
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, deletedAt: true },
    })
    if (!product || product.deletedAt) {
      return { ok: false, error: "Товар не найден" }
    }

    await prisma.productIncoming.upsert({
      where: { productId },
      create: {
        productId,
        // Количество поддерживает только production-sync — новая запись стартует с 0.
        orderedQty: 0,
        expectedDate: expected ?? null,
        plannedSalesPerDay: plannedSalesPerDay ?? null,
      },
      update: {
        ...(expected !== undefined ? { expectedDate: expected } : {}),
        ...(plannedSalesPerDay !== undefined ? { plannedSalesPerDay } : {}),
      },
    })

    // Производство в /stock = тот же ProductIncoming → ревалидируем связанные разделы
    revalidatePath("/purchase-plan")
    revalidatePath("/stock")
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[upsertProductIncoming]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}
