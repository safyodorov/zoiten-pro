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
const PRICE_KEY = "salesPlan.priceOverrides"
const LEAD_TIMES_KEY = "salesPlan.leadTimes"

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

const PriceOverridesSchema = z.record(
  z.string().min(1),
  z.number().min(0).max(10_000_000),
)

/** Сохраняет per-user корректировки цены выкупа (productId → ₽). Пусто → удаляет запись. */
export async function savePriceOverrides(
  overrides: Record<string, number>,
): Promise<ActionResult> {
  await requireSection("SALES")
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHORIZED" }

  const parsed = PriceOverridesSchema.safeParse(overrides)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }

  try {
    const filtered = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => Number.isFinite(v) && v > 0),
    )
    if (Object.keys(filtered).length === 0) {
      await prisma.userPreference.deleteMany({
        where: { userId: session.user.id, key: PRICE_KEY },
      })
    } else {
      await prisma.userPreference.upsert({
        where: { userId_key: { userId: session.user.id, key: PRICE_KEY } },
        create: { userId: session.user.id, key: PRICE_KEY, value: filtered },
        update: { value: filtered },
      })
    }
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[savePriceOverrides]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

export async function clearBaselineOverrides(): Promise<ActionResult> {
  await requireSection("SALES")
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHORIZED" }
  try {
    await prisma.userPreference.deleteMany({
      where: {
        userId: session.user.id,
        key: { in: [PREF_KEY, PRICE_KEY, LEAD_TIMES_KEY] },
      },
    })
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[clearBaselineOverrides]", err)
    return { ok: false, error: "Не удалось сбросить" }
  }
}

// ── Lead times ────────────────────────────────────────────────────

const LeadTimesSchema = z.object({
  deliveryDays: z.number().int().min(0).max(60),
  returnDays: z.number().int().min(0).max(60),
})

export async function saveLeadTimes(
  payload: { deliveryDays: number; returnDays: number },
): Promise<ActionResult> {
  await requireSection("SALES")
  const session = await auth()
  if (!session?.user?.id) return { ok: false, error: "UNAUTHORIZED" }
  const parsed = LeadTimesSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные сроки" }
  try {
    await prisma.userPreference.upsert({
      where: { userId_key: { userId: session.user.id, key: LEAD_TIMES_KEY } },
      create: {
        userId: session.user.id,
        key: LEAD_TIMES_KEY,
        value: parsed.data,
      },
      update: { value: parsed.data },
    })
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[saveLeadTimes]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

// ── Bulk обновление дат прихода (глобально, в ProductIncoming) ──
// Меняет дату глобально для всех пользователей. НЕ откатывается через
// clearBaselineOverrides — это не override, а изменение БД.

const ArrivalDatesSchema = z.record(
  z.string().min(1), // productId
  z.union([z.string().regex(/^\d{4}-\d{2}-\d{2}$/), z.null()]),
)

export async function bulkUpdateArrivalDates(
  payload: Record<string, string | null>,
): Promise<ActionResult> {
  await requireSection("PROCUREMENT", "MANAGE")
  const parsed = ArrivalDatesSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные даты" }
  try {
    // Для каждой пары (productId → date) — upsert ProductIncoming
    for (const [productId, dateStr] of Object.entries(parsed.data)) {
      const date = dateStr === null ? null : new Date(dateStr + "T00:00:00Z")
      if (date !== null && Number.isNaN(date.getTime())) continue
      // Существует ли уже incoming-row?
      const existing = await prisma.productIncoming.findUnique({
        where: { productId },
      })
      if (existing) {
        await prisma.productIncoming.update({
          where: { productId },
          data: { expectedDate: date },
        })
      } else {
        // Создаём только если есть какие-то осмысленные данные (нельзя
        // оставить orderedQty=0 без даты вообще).
        if (date !== null) {
          await prisma.productIncoming.create({
            data: { productId, expectedDate: date, orderedQty: 0 },
          })
        }
      }
    }
    revalidatePath("/sales-plan")
    revalidatePath("/purchase-plan")
    return { ok: true }
  } catch (err) {
    console.error("[bulkUpdateArrivalDates]", err)
    return { ok: false, error: "Не удалось обновить даты" }
  }
}
