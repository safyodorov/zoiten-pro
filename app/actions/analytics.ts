"use server"

// app/actions/analytics.ts — server actions раздела «Аналитика» (Phase 30).
// startNicheRun — запуск фонового сбора через after() из next/server (D-02, не блокирует HTTP).
// saveMpstatsToken — токен в AppSetting KV (D-01). markNicheRunFailed — ручная пометка «завис».
// Все write-операции гейтятся requireSection("ANALYTICS","MANAGE").
import { after } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { requireSection, getCurrentUser } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { collectNicheRun } from "@/lib/analytics/collector"
import { deserializeWireData, type NicheRunWireData } from "@/lib/analytics/data"

const MAX_NM_ID = 2 ** 31
const nmIdSchema = z.number().int().positive().lt(MAX_NM_ID)

// Повторная валидация wire-данных (T-30-02: nmID из клиента ре-валидируются по диапазону).
const funnelDaySchema = z.object({
  nmId: nmIdSchema,
  dt: z.string().min(1),
  viewCount: z.number(),
  openCard: z.number(),
  addToCart: z.number(),
  orders: z.number(),
  ordersSum: z.number(),
  buyoutCount: z.number(),
  medianPrice: z.number(),
})
const monthTotalsSchema = z.object({
  viewCount: z.number(),
  orders: z.number(),
  ordersSum: z.number(),
})
const commonParamSchema = z.object({
  nmId: nmIdSchema,
  nmName: z.string(),
  mainPhoto: z.string(),
  subject: z.string(),
  item: z.string(),
  brandName: z.string(),
  nmRating: z.number().nullable(),
  feedbacksCount: z.number().nullable(),
  medianPrice: z.number().nullable(),
})
const wireSchema = z.object({
  skus: z.array(nmIdSchema).length(30, "Ожидается ровно 30 SKU"),
  byDay: z.array(funnelDaySchema).min(1),
  monthly: z.record(z.string(), monthTotalsSchema),
  commonParams: z.record(z.string(), commonParamSchema),
  dateFrom: z.string().min(1),
  dateTo: z.string().min(1),
})

type StartResult = { ok: boolean; runId?: string; error?: string }

function authError(e: unknown): string {
  return e instanceof Error && e.message === "FORBIDDEN" ? "Недостаточно прав" : "Не авторизован"
}

/**
 * Создаёт NicheRun(PENDING) и запускает сбор в фоне через after() (D-02).
 * Блокируется, если уже есть активный прогон (T-30-04) или не задан MPSTATS-токен.
 */
export async function startNicheRun(input: NicheRunWireData): Promise<StartResult> {
  try {
    await requireSection("ANALYTICS", "MANAGE")
  } catch (e) {
    return { ok: false, error: authError(e) }
  }

  const parsed = wireSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: `Некорректные данные прогона: ${parsed.error.issues[0]?.message ?? ""}` }
  }
  const w = parsed.data

  // Защита лимита MPSTATS — только один активный прогон одновременно.
  const active = await prisma.nicheRun.findFirst({
    where: { status: { in: ["PENDING", "COLLECTING"] } },
    select: { id: true },
  })
  if (active) return { ok: false, error: "Уже идёт сбор — дождитесь завершения текущего прогона" }

  const tokenRow = await prisma.appSetting.findUnique({ where: { key: "analytics.mpstatsToken" } })
  const mpstatsToken = tokenRow?.value?.trim() ?? ""
  if (!mpstatsToken) return { ok: false, error: "Укажите MPSTATS-токен в шапке раздела" }

  const user = await getCurrentUser()
  const run = await prisma.nicheRun.create({
    data: {
      status: "PENDING",
      dateFrom: new Date(w.dateFrom),
      dateTo: new Date(w.dateTo),
      skuCount: w.skus.length,
      createdById: user?.id ?? null,
    },
    select: { id: true },
  })

  const maps = deserializeWireData(w as NicheRunWireData)
  after(async () => {
    try {
      await collectNicheRun(run.id, {
        skus: w.skus,
        byDayByNmId: maps.byDayByNmId,
        monthlyTotalsByNmId: maps.monthlyTotalsByNmId,
        commonParamsByNmId: maps.commonParamsByNmId,
        dateFrom: w.dateFrom,
        dateTo: w.dateTo,
        mpstatsToken,
      })
    } catch (e) {
      await prisma.nicheRun
        .update({
          where: { id: run.id },
          data: { status: "FAILED", errorMessage: e instanceof Error ? e.message : "фоновая ошибка сбора" },
        })
        .catch(() => {})
    }
  })

  revalidatePath("/analytics")
  return { ok: true, runId: run.id }
}

/** Сохраняет MPSTATS-токен в AppSetting KV (D-01, MANAGE). */
export async function saveMpstatsToken(token: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireSection("ANALYTICS", "MANAGE")
  } catch (e) {
    return { ok: false, error: authError(e) }
  }
  const parsed = z.string().min(1, "Токен не может быть пустым").safeParse(token)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message }

  await prisma.appSetting.upsert({
    where: { key: "analytics.mpstatsToken" },
    create: { key: "analytics.mpstatsToken", value: parsed.data.trim() },
    update: { value: parsed.data.trim() },
  })
  revalidatePath("/analytics")
  return { ok: true }
}

/** Ручная пометка зависшего прогона как FAILED (MANAGE). */
export async function markNicheRunFailed(runId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireSection("ANALYTICS", "MANAGE")
  } catch (e) {
    return { ok: false, error: authError(e) }
  }
  await prisma.nicheRun.update({
    where: { id: runId },
    data: { status: "FAILED", errorMessage: "Помечен вручную (завис)", progressNote: null },
  })
  revalidatePath("/analytics")
  return { ok: true }
}
