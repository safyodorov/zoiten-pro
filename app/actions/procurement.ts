// app/actions/procurement.ts
// Server Actions для MVP «План закупок»: upsert per-product заказа из Китая
"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

type ActionResult = { ok: true } | { ok: false; error: string }

const UpsertIncomingSchema = z.object({
  productId: z.string().min(1),
  orderedQty: z
    .number()
    .int()
    .min(0)
    .max(10_000_000)
    .optional(),
  expectedDate: z.union([z.string(), z.null()]).optional(),
})

export async function upsertProductIncoming(
  input: z.infer<typeof UpsertIncomingSchema>,
): Promise<ActionResult> {
  await requireSection("PROCUREMENT", "MANAGE")

  const parsed = UpsertIncomingSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: "Невалидные данные" }
  }
  const { productId, orderedQty, expectedDate } = parsed.data

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
        orderedQty: orderedQty ?? 0,
        expectedDate: expected ?? null,
      },
      update: {
        ...(orderedQty !== undefined ? { orderedQty } : {}),
        ...(expected !== undefined ? { expectedDate: expected } : {}),
      },
    })

    revalidatePath("/purchase-plan")
    return { ok: true }
  } catch (err) {
    console.error("[upsertProductIncoming]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}
