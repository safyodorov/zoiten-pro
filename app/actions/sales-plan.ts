// app/actions/sales-plan.ts
// Server Actions для /sales-plan — пользовательские корректировки baseline.
// Хранятся в UserPreference (key=salesPlan.baselineOverrides) как
// JSON-объект { [productId]: ordersPerDayOverride }.

"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { auth } from "@/lib/auth"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

const PREF_KEY = "salesPlan.baselineOverrides"

type ActionResult = { ok: true } | { ok: false; error: string }

const OverridesSchema = z.record(
  z.string().min(1),
  z.number().min(0).max(100_000),
)

export async function saveBaselineOverrides(
  overrides: Record<string, number>,
): Promise<ActionResult> {
  await requireSection("SALES")
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHORIZED" }

  const parsed = OverridesSchema.safeParse(overrides)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }

  try {
    // Пустой объект — удаляем запись (равноценно сбросу к базовым)
    const filtered = Object.fromEntries(
      Object.entries(parsed.data).filter(
        ([, v]) => Number.isFinite(v) && v >= 0,
      ),
    )
    if (Object.keys(filtered).length === 0) {
      await prisma.userPreference.deleteMany({
        where: { userId: session.user.id, key: PREF_KEY },
      })
    } else {
      await prisma.userPreference.upsert({
        where: { userId_key: { userId: session.user.id, key: PREF_KEY } },
        create: { userId: session.user.id, key: PREF_KEY, value: filtered },
        update: { value: filtered },
      })
    }
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[saveBaselineOverrides]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

export async function clearBaselineOverrides(): Promise<ActionResult> {
  await requireSection("SALES")
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHORIZED" }
  try {
    await prisma.userPreference.deleteMany({
      where: { userId: session.user.id, key: PREF_KEY },
    })
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[clearBaselineOverrides]", err)
    return { ok: false, error: "Не удалось сбросить" }
  }
}
