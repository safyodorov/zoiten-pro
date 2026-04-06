"use server"

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { revalidatePath } from "next/cache"

type ActionResult = { ok: true } | { ok: false; error: string }

const CostSchema = z.object({
  productId: z.string().min(1),
  costPrice: z.number().nonnegative("Себестоимость не может быть отрицательной"),
})

function handleAuthError(e: unknown): ActionResult | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED")
      return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN")
      return { ok: false, error: "Нет доступа" }
  }
  return null
}

export async function updateProductCost(
  productId: string,
  costPrice: number
): Promise<ActionResult> {
  try {
    await requireSection("COST")
    const parsed = CostSchema.parse({ productId, costPrice })

    await prisma.productCost.upsert({
      where: { productId: parsed.productId },
      update: { costPrice: parsed.costPrice },
      create: {
        productId: parsed.productId,
        costPrice: parsed.costPrice,
      },
    })

    revalidatePath("/batches")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.errors[0]?.message ?? "Ошибка валидации" }
    }
    console.error("updateProductCost error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
