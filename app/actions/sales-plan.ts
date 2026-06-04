// app/actions/sales-plan.ts
// Server Actions для /sales-plan.
// 2026-06-04: корректировки (заказы, цена, lead times) теперь ГЛОБАЛЬНЫЕ —
// хранятся в AppSetting (JSON-строкой), общие для всех пользователей
// (как общая таблица плана). Раньше были per-user (UserPreference).

"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

const BASELINE_KEY = "salesPlan.baselineOverrides"
const PRICE_KEY = "salesPlan.priceOverrides"
const LEAD_TIMES_KEY = "salesPlan.leadTimes"

type ActionResult = { ok: true } | { ok: false; error: string }

/** Записать (или удалить, если пусто) глобальную JSON-настройку. */
async function setGlobalJson(key: string, obj: Record<string, unknown>) {
  if (Object.keys(obj).length === 0) {
    await prisma.appSetting.deleteMany({ where: { key } })
  } else {
    const value = JSON.stringify(obj)
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    })
  }
}

const OverridesSchema = z.record(z.string().min(1), z.number().min(0).max(100_000))

export async function saveBaselineOverrides(
  overrides: Record<string, number>,
): Promise<ActionResult> {
  await requireSection("SALES")
  const parsed = OverridesSchema.safeParse(overrides)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }
  try {
    const filtered = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => Number.isFinite(v) && v >= 0),
    )
    await setGlobalJson(BASELINE_KEY, filtered)
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[saveBaselineOverrides]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

const PriceOverridesSchema = z.record(z.string().min(1), z.number().min(0).max(10_000_000))

/** Глобальные корректировки цены выкупа (productId → ₽). Пусто → удаляет запись. */
export async function savePriceOverrides(
  overrides: Record<string, number>,
): Promise<ActionResult> {
  await requireSection("SALES")
  const parsed = PriceOverridesSchema.safeParse(overrides)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }
  try {
    const filtered = Object.fromEntries(
      Object.entries(parsed.data).filter(([, v]) => Number.isFinite(v) && v > 0),
    )
    await setGlobalJson(PRICE_KEY, filtered)
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[savePriceOverrides]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

export async function clearBaselineOverrides(): Promise<ActionResult> {
  await requireSection("SALES")
  try {
    await prisma.appSetting.deleteMany({
      where: { key: { in: [BASELINE_KEY, PRICE_KEY, LEAD_TIMES_KEY] } },
    })
    revalidatePath("/sales-plan")
    return { ok: true }
  } catch (err) {
    console.error("[clearBaselineOverrides]", err)
    return { ok: false, error: "Не удалось сбросить" }
  }
}

// ── Lead times (глобальные) ────────────────────────────────────────

const LeadTimesSchema = z.object({
  deliveryDays: z.number().int().min(0).max(60),
  returnDays: z.number().int().min(0).max(60),
})

export async function saveLeadTimes(
  payload: { deliveryDays: number; returnDays: number },
): Promise<ActionResult> {
  await requireSection("SALES")
  const parsed = LeadTimesSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные сроки" }
  try {
    await setGlobalJson(LEAD_TIMES_KEY, parsed.data)
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
    for (const [productId, dateStr] of Object.entries(parsed.data)) {
      const date = dateStr === null ? null : new Date(dateStr + "T00:00:00Z")
      if (date !== null && Number.isNaN(date.getTime())) continue
      const existing = await prisma.productIncoming.findUnique({
        where: { productId },
      })
      if (existing) {
        await prisma.productIncoming.update({
          where: { productId },
          data: { expectedDate: date },
        })
      } else {
        if (date !== null) {
          await prisma.productIncoming.create({
            data: { productId, expectedDate: date, orderedQty: 0 },
          })
        }
      }
    }
    revalidatePath("/sales-plan")
    revalidatePath("/purchase-plan")
    revalidatePath("/stock")
    return { ok: true }
  } catch (err) {
    console.error("[bulkUpdateArrivalDates]", err)
    return { ok: false, error: "Не удалось обновить даты" }
  }
}
