// app/actions/sales-plan.ts
// Server Actions для /sales-plan.
// 2026-06-04: корректировки (заказы, цена, lead times) теперь ГЛОБАЛЬНЫЕ —
// хранятся в AppSetting (JSON-строкой), общие для всех пользователей
// (как общая таблица плана). Раньше были per-user (UserPreference).
//
// 2026-07-04 (Phase 25 wave 3): добавлены write-actions плана v2 (SALES MANAGE):
//   saveMonthLevels, scaleMonthLevels, saveDayOverrides, saveProductPlanParams, saveModelParams
//   + read-action getProductPlanDays (SALES VIEW).
//   Старые actions (saveBaselineOverrides, savePriceOverrides и др.) остаются до Wave 6 зачистки.

"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { loadSalesPlanInputs } from "@/lib/sales-plan/data"
import { computeSalesPlan } from "@/lib/sales-plan/engine"
import { suggestVirtualPurchases } from "@/lib/sales-plan/virtual-purchases"
import { getMskTodayIso, addDays } from "@/lib/sales-plan/dates"
import type { ProductPlanInput, PlanDayRow } from "@/lib/sales-plan/types"

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

/** Читает числовую настройку из AppSetting, возвращает число или null. */
async function getSettingNumber(key: string, defaultVal: number): Promise<number> {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  if (!row) return defaultVal
  const n = Number(row.value)
  return Number.isFinite(n) ? n : defaultVal
}

/** revalidatePath для всех трёх роутов плана продаж. */
function revalidateSalesPlanPaths() {
  revalidatePath("/sales-plan")
  revalidatePath("/sales-plan/products")
  revalidatePath("/sales-plan/purchases")
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

// ═══════════════════════════════════════════════════════════════════
// Phase 25 wave 3: новые actions плана продаж v2
// Все write — SALES MANAGE (фикс дыры VIEW-write, SP-13).
// ═══════════════════════════════════════════════════════════════════

// ── saveMonthLevels ────────────────────────────────────────────────

const MonthLevelItemSchema = z.object({
  productId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  targetOrdersPerDay: z.number().min(0).nullable(),
  priceRub: z.number().min(0).nullable(),
  buyoutPct: z.number().min(0).max(100).nullable(),
})

const SaveMonthLevelsSchema = z.array(MonthLevelItemSchema)

/**
 * Upsert помесячных плановых уровней per товар.
 * Если все три поля null — удаляем запись (нет уровня → fallback на baseline).
 */
export async function saveMonthLevels(
  payload: Array<{
    productId: string
    month: string
    targetOrdersPerDay: number | null
    priceRub: number | null
    buyoutPct: number | null
  }>,
): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  const parsed = SaveMonthLevelsSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }
  try {
    for (const item of parsed.data) {
      const monthDate = new Date(item.month + "T00:00:00Z")
      if (
        item.targetOrdersPerDay === null &&
        item.priceRub === null &&
        item.buyoutPct === null
      ) {
        // Удаляем уровень — возврат к baseline
        await prisma.salesPlanMonthLevel.deleteMany({
          where: { productId: item.productId, month: monthDate },
        })
      } else {
        await prisma.salesPlanMonthLevel.upsert({
          where: {
            productId_month: { productId: item.productId, month: monthDate },
          },
          create: {
            productId: item.productId,
            month: monthDate,
            targetOrdersPerDay: item.targetOrdersPerDay,
            priceRub: item.priceRub,
            buyoutPct: item.buyoutPct,
          },
          update: {
            targetOrdersPerDay: item.targetOrdersPerDay,
            priceRub: item.priceRub,
            buyoutPct: item.buyoutPct,
          },
        })
      }
    }
    // Регенерация виртуальных закупок после изменения месячных уровней (дыра критика №5)
    await regenerateVirtualPurchasesInternal()
    revalidateSalesPlanPaths()
    return { ok: true }
  } catch (err) {
    console.error("[saveMonthLevels]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

// ── scaleMonthLevels ───────────────────────────────────────────────

const ScaleMonthLevelsSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  factor: z.number().min(0.01).max(100),
  productIds: z.array(z.string().min(1)).optional(),
})

/**
 * Top-down масштабирование уровней месяца на коэффициент.
 * Для товаров с существующим targetOrdersPerDay → умножаем на factor.
 * Для товаров с targetOrdersPerDay=null → материализуем baseline × factor
 * (снапшот на момент масштабирования из baselineOrdersPerDay через funnel).
 * Day-overrides месяца не трогаем.
 * Возвращает { ok: true, materializedCount, scaledCount }.
 */
export async function scaleMonthLevels(payload: {
  month: string
  factor: number
  productIds?: string[]
}): Promise<ActionResult & { materializedCount?: number; scaledCount?: number }> {
  await requireSection("SALES", "MANAGE")
  const parsed = ScaleMonthLevelsSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }

  const { month, factor, productIds } = parsed.data
  const monthDate = new Date(month + "T00:00:00Z")

  try {
    // Загружаем существующие уровни этого месяца
    const existingLevels = await prisma.salesPlanMonthLevel.findMany({
      where: {
        month: monthDate,
        ...(productIds ? { productId: { in: productIds } } : {}),
      },
      select: { productId: true, targetOrdersPerDay: true },
    })

    const existingByProductId = new Map(existingLevels.map((l) => [l.productId, l]))

    // Для материализации baseline нужны все продукты в выборке
    const productWhere = productIds
      ? { id: { in: productIds }, deletedAt: null }
      : { deletedAt: null }

    const products = await prisma.product.findMany({
      where: productWhere,
      select: {
        id: true,
        articles: {
          select: { article: true },
        },
      },
    })

    // Собираем nmIds для baseline расчёта (последние 7 дней заказов)
    const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000)
    const todayMsk = nowMsk.toISOString().slice(0, 10)
    const sevenDaysAgo = new Date(todayMsk + "T00:00:00Z")
    sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7)
    const yesterday = new Date(todayMsk + "T00:00:00Z")
    yesterday.setUTCDate(yesterday.getUTCDate() - 1)

    // productId → baselineOrdersPerDay (из последних 7 дней funnel)
    const allNmIds: number[] = []
    const productNmIds = new Map<string, number[]>()
    for (const p of products) {
      const nmIds: number[] = []
      for (const a of p.articles) {
        const n = parseInt(a.article, 10)
        if (Number.isFinite(n)) nmIds.push(n)
      }
      productNmIds.set(p.id, nmIds)
      allNmIds.push(...nmIds)
    }

    // Funnel last-7d для baseline материализации
    const funnelRows =
      allNmIds.length > 0
        ? await prisma.wbCardFunnelDaily.findMany({
            where: {
              nmId: { in: allNmIds },
              date: { gte: sevenDaysAgo, lte: yesterday },
            },
            select: { nmId: true, ordersCount: true },
          })
        : []

    const ordersSum = new Map<number, number>()
    for (const f of funnelRows) {
      ordersSum.set(f.nmId, (ordersSum.get(f.nmId) ?? 0) + (f.ordersCount ?? 0))
    }

    let scaledCount = 0
    let materializedCount = 0

    for (const p of products) {
      const existing = existingByProductId.get(p.id)

      if (existing && existing.targetOrdersPerDay !== null) {
        // Масштабируем существующий уровень
        const newValue = existing.targetOrdersPerDay * factor
        await prisma.salesPlanMonthLevel.update({
          where: { productId_month: { productId: p.id, month: monthDate } },
          data: { targetOrdersPerDay: newValue },
        })
        scaledCount++
      } else {
        // Материализуем baseline × factor
        const nmIds = productNmIds.get(p.id) ?? []
        let baselineOrders = 0
        for (const nm of nmIds) {
          baselineOrders += ordersSum.get(nm) ?? 0
        }
        const baselineOrdersPerDay = baselineOrders / 7
        const materializedValue = baselineOrdersPerDay * factor

        await prisma.salesPlanMonthLevel.upsert({
          where: { productId_month: { productId: p.id, month: monthDate } },
          create: {
            productId: p.id,
            month: monthDate,
            targetOrdersPerDay: materializedValue,
            priceRub: null,
            buyoutPct: null,
          },
          update: {
            targetOrdersPerDay: materializedValue,
          },
        })
        materializedCount++
      }
    }

    revalidateSalesPlanPaths()
    return { ok: true, materializedCount, scaledCount }
  } catch (err) {
    console.error("[scaleMonthLevels]", err)
    return { ok: false, error: "Не удалось масштабировать" }
  }
}

// ── saveDayOverrides ───────────────────────────────────────────────

const SaveDayOverridesSchema = z.object({
  productId: z.string().min(1),
  overrides: z.record(
    z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    z.number().min(0).nullable(),
  ),
})

/**
 * Upsert дневных правок для товара.
 * null → удаляем запись (возврат к monthLevel/baseline).
 */
export async function saveDayOverrides(payload: {
  productId: string
  overrides: Record<string, number | null>
}): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  const parsed = SaveDayOverridesSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }
  try {
    const { productId, overrides } = parsed.data
    for (const [dateStr, value] of Object.entries(overrides)) {
      const dateObj = new Date(dateStr + "T00:00:00Z")
      if (value === null) {
        await prisma.salesPlanDayOverride.deleteMany({
          where: { productId, date: dateObj },
        })
      } else {
        await prisma.salesPlanDayOverride.upsert({
          where: { productId_date: { productId, date: dateObj } },
          create: { productId, date: dateObj, ordersPerDay: value },
          update: { ordersPerDay: value },
        })
      }
    }
    // Регенерация виртуальных закупок после изменения day overrides (дыра критика №5)
    await regenerateVirtualPurchasesInternal()
    revalidateSalesPlanPaths()
    return { ok: true }
  } catch (err) {
    console.error("[saveDayOverrides]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

// ── saveProductPlanParams ──────────────────────────────────────────

const SaveProductPlanParamsSchema = z.object({
  productId: z.string().min(1),
  month: z.string().regex(/^\d{4}-\d{2}-01$/),
  priceRub: z.number().min(0).nullable(),
  buyoutPct: z.number().min(0).max(100).nullable(),
})

/**
 * Обновляет только priceRub/buyoutPct месячного уровня (вкладка «Параметры» модалки).
 * targetOrdersPerDay НЕ трогает.
 */
export async function saveProductPlanParams(payload: {
  productId: string
  month: string
  priceRub: number | null
  buyoutPct: number | null
}): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  const parsed = SaveProductPlanParamsSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }
  try {
    const { productId, month, priceRub, buyoutPct } = parsed.data
    const monthDate = new Date(month + "T00:00:00Z")

    await prisma.salesPlanMonthLevel.upsert({
      where: { productId_month: { productId, month: monthDate } },
      create: {
        productId,
        month: monthDate,
        targetOrdersPerDay: null,
        priceRub,
        buyoutPct,
      },
      update: {
        priceRub,
        buyoutPct,
      },
    })

    revalidateSalesPlanPaths()
    return { ok: true }
  } catch (err) {
    console.error("[saveProductPlanParams]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

// ── saveModelParams ────────────────────────────────────────────────

const SaveModelParamsSchema = z.object({
  defaultLeadTimeDays: z.number().int().min(0).max(365).optional(),
  safetyStockDays: z.number().int().min(0).max(365).optional(),
  vpCoverDays: z.number().int().min(0).max(365).optional(),
  transitDays: z.number().int().min(0).max(365).optional(),
  wbInboundLagDays: z.number().int().min(0).max(365).optional(),
  deliveryDays: z.number().int().min(0).max(365).optional(),
  returnDays: z.number().int().min(0).max(365).optional(),
})

/**
 * Сохраняет параметры модели в AppSetting-ключи.
 * deliveryDays/returnDays → в salesPlan.leadTimes2 (JSON-объект).
 * Остальные → в индивидуальные ключи salesPlan.*.
 */
export async function saveModelParams(payload: {
  defaultLeadTimeDays?: number
  safetyStockDays?: number
  vpCoverDays?: number
  transitDays?: number
  wbInboundLagDays?: number
  deliveryDays?: number
  returnDays?: number
}): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  const parsed = SaveModelParamsSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }
  try {
    const data = parsed.data

    // Скалярные ключи (каждый отдельно через upsert)
    const scalarKeys: Array<[string, number | undefined]> = [
      ["salesPlan.defaultLeadTimeDays", data.defaultLeadTimeDays],
      ["salesPlan.safetyStockDays", data.safetyStockDays],
      ["salesPlan.vpCoverDays", data.vpCoverDays],
      ["salesPlan.transitDays", data.transitDays],
      ["salesPlan.wbInboundLagDays", data.wbInboundLagDays],
    ]

    for (const [key, val] of scalarKeys) {
      if (val === undefined) continue
      const value = String(val)
      await prisma.appSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      })
    }

    // deliveryDays/returnDays → salesPlan.leadTimes2 (JSON-объект)
    if (data.deliveryDays !== undefined || data.returnDays !== undefined) {
      const existingRow = await prisma.appSetting.findUnique({
        where: { key: "salesPlan.leadTimes2" },
      })
      const existing = existingRow ? JSON.parse(existingRow.value) as Record<string, number> : {}
      const updated: Record<string, number> = { ...existing }
      if (data.deliveryDays !== undefined) updated.deliveryDays = data.deliveryDays
      if (data.returnDays !== undefined) updated.returnDays = data.returnDays
      const value = JSON.stringify(updated)
      await prisma.appSetting.upsert({
        where: { key: "salesPlan.leadTimes2" },
        create: { key: "salesPlan.leadTimes2", value },
        update: { value },
      })
    }

    revalidateSalesPlanPaths()
    return { ok: true }
  } catch (err) {
    console.error("[saveModelParams]", err)
    return { ok: false, error: "Не удалось сохранить" }
  }
}

// ── getProductPlanDays ─────────────────────────────────────────────

/**
 * Read-action (SALES VIEW): дневной ряд + сериализуемый ProductPlanInput для товара.
 * Используется клиентом для realtime-пересчёта «Сток(расч)» локальным запуском simulateProductPlan.
 *
 * versionId (опц.): TODO Wave 7 — дни из SalesPlanVersionDay (read-only).
 * Сейчас всегда из драфта (computeSalesPlan).
 */
export async function getProductPlanDays(
  productId: string,
  month: string,
  versionId?: string,
): Promise<
  | { ok: true; days: PlanDayRow[]; productInput: ProductPlanInput }
  | { ok: false; error: string }
> {
  await requireSection("SALES")

  // TODO Wave 7: если versionId задан — читать из SalesPlanVersionDay (read-only)
  if (versionId) {
    // Placeholder: игнорируем versionId, возвращаем драфт
    console.warn("[getProductPlanDays] versionId игнорируется (Wave 7), используется драфт")
  }

  // Параметры модели из AppSetting
  const [deliveryDays, returnDays, wbInboundLagDays, transitDays, defaultLeadTimeDays] =
    await Promise.all([
      getLeadTimeDays("deliveryDays", 3),
      getLeadTimeDays("returnDays", 3),
      getSettingNumber("salesPlan.wbInboundLagDays", 0),
      getSettingNumber("salesPlan.transitDays", 20),
      getSettingNumber("salesPlan.defaultLeadTimeDays", 45),
    ])

  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const todayMsk = nowMsk.toISOString().slice(0, 10)

  // Горизонт H2-2026 (дефолт)
  const horizonRow = await prisma.appSetting.findUnique({ where: { key: "salesPlan.horizon" } })
  let horizonFrom = todayMsk
  let horizonTo = todayMsk.slice(0, 4) + "-12-31"
  if (horizonRow) {
    try {
      const h = JSON.parse(horizonRow.value) as { from?: string; to?: string }
      if (h.from) horizonFrom = h.from
      if (h.to) horizonTo = h.to
    } catch {
      // Используем defaults
    }
  }

  try {
    const inputs = await loadSalesPlanInputs(prisma, {
      today: todayMsk,
      horizonFrom,
      horizonTo,
      deliveryDays,
      returnDays,
      wbInboundLagDays,
      transitDays,
      defaultLeadTimeDays,
      safetyStockDays: await getSettingNumber("salesPlan.safetyStockDays", 14),
      vpCoverDays: await getSettingNumber("salesPlan.vpCoverDays", 60),
    })

    const productInput = inputs.products.find((p) => p.productId === productId)
    if (!productInput) return { ok: false, error: "Товар не найден в плане продаж" }

    const result = computeSalesPlan({
      ...inputs,
      products: [productInput],
    })

    const productResult = result.products[0]
    const monthPrefix = month.slice(0, 7) // "2026-07"
    const days: PlanDayRow[] = productResult
      ? productResult.days.filter((d) => d.date.startsWith(monthPrefix))
      : []

    return { ok: true, days, productInput }
  } catch (err) {
    console.error("[getProductPlanDays]", err)
    return { ok: false, error: "Не удалось загрузить данные плана" }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 25 wave 6: Виртуальные закупки (VP-actions)
// Все write — SALES MANAGE. convertVirtualPurchase — + PROCUREMENT MANAGE.
// ═══════════════════════════════════════════════════════════════════

// ── Внутренний хелпер: загрузка параметров модели для regenerate ───

async function loadModelParamsForRegenerate() {
  const [
    deliveryDays,
    returnDays,
    wbInboundLagDays,
    transitDays,
    defaultLeadTimeDays,
    safetyStockDays,
    vpCoverDays,
  ] = await Promise.all([
    getLeadTimeDays("deliveryDays", 3),
    getLeadTimeDays("returnDays", 3),
    getSettingNumber("salesPlan.wbInboundLagDays", 0),
    getSettingNumber("salesPlan.transitDays", 20),
    getSettingNumber("salesPlan.defaultLeadTimeDays", 45),
    getSettingNumber("salesPlan.safetyStockDays", 14),
    getSettingNumber("salesPlan.vpCoverDays", 60),
  ])

  const nowMsk = new Date(Date.now() + 3 * 60 * 60 * 1000)
  const todayMsk = nowMsk.toISOString().slice(0, 10)

  const horizonRow = await prisma.appSetting.findUnique({ where: { key: "salesPlan.horizon" } })
  let horizonFrom = todayMsk
  let horizonTo = todayMsk.slice(0, 4) + "-12-31"
  if (horizonRow) {
    try {
      const h = JSON.parse(horizonRow.value) as { from?: string; to?: string }
      if (h.from) horizonFrom = h.from
      if (h.to) horizonTo = h.to
    } catch { /* defaults */ }
  }

  return {
    todayMsk, horizonFrom, horizonTo,
    deliveryDays, returnDays, wbInboundLagDays,
    transitDays, defaultLeadTimeDays, safetyStockDays, vpCoverDays,
  }
}

// ── regenerateVirtualPurchasesInternal (internal, вызывается из цепочек пересчёта) ───

/**
 * Внутренний хелпер: пересоздаёт авто-SUGGESTED виртуальные закупки.
 * Вызывается в конце saveMonthLevels И saveDayOverrides (дыра критика №5).
 * Транзакция: deleteMany(SUGGESTED+auto) + createMany(новые предложения).
 * ACCEPTED/DISMISSED/CONVERTED/manual неприкосновенны.
 */
async function regenerateVirtualPurchasesInternal(productIds?: string[]): Promise<void> {
  try {
    const modelParams = await loadModelParamsForRegenerate()
    const {
      todayMsk, horizonFrom, horizonTo,
      deliveryDays, returnDays, wbInboundLagDays,
      transitDays, defaultLeadTimeDays, safetyStockDays, vpCoverDays,
    } = modelParams

    const inputs = await loadSalesPlanInputs(prisma, {
      today: todayMsk,
      horizonFrom,
      horizonTo,
      deliveryDays,
      returnDays,
      wbInboundLagDays,
      transitDays,
      defaultLeadTimeDays,
      safetyStockDays,
      vpCoverDays,
    })

    // Загружаем existing ACCEPTED/DISMISSED/manual VPs для передачи в suggestVirtualPurchases
    const existingVPs = await prisma.virtualPurchase.findMany({
      where: {
        status: { in: ["ACCEPTED", "DISMISSED", "CONVERTED"] },
        ...(productIds ? { productId: { in: productIds } } : {}),
      },
      select: {
        id: true,
        productId: true,
        status: true,
        orderDate: true,
        expectedArrivalDate: true,
        qty: true,
        source: true,
      },
    })

    // Также загружаем manual VPs (source="manual", status может быть любым)
    const manualVPs = await prisma.virtualPurchase.findMany({
      where: {
        source: "manual",
        status: { notIn: ["DISMISSED", "CONVERTED"] },
        ...(productIds ? { productId: { in: productIds } } : {}),
      },
      select: {
        id: true,
        productId: true,
        status: true,
        orderDate: true,
        expectedArrivalDate: true,
        qty: true,
        source: true,
      },
    })

    // Сгруппируем existing по productId
    const existingByProduct = new Map<
      string,
      Array<{
        id: string
        status: string
        orderDate: string
        expectedArrivalDate: string
        qty: number
        source: string
      }>
    >()
    for (const vp of [...existingVPs, ...manualVPs]) {
      const arr = existingByProduct.get(vp.productId) ?? []
      arr.push({
        id: vp.id,
        status: vp.status,
        orderDate: vp.orderDate.toISOString().slice(0, 10),
        expectedArrivalDate: vp.expectedArrivalDate.toISOString().slice(0, 10),
        qty: vp.qty,
        source: vp.source,
      })
      existingByProduct.set(vp.productId, arr)
    }

    // Загружаем leadTimeDays и unitPrice из SupplierProductLink
    const supplierLinks = await prisma.supplierProductLink.findMany({
      where: productIds ? { productId: { in: productIds } } : undefined,
      select: { productId: true, leadTimeDays: true, unitPrice: true },
    })
    const minLeadTimeByProduct = new Map<string, number>()
    const unitPriceByProduct = new Map<string, number>()
    for (const link of supplierLinks) {
      if (!link.productId) continue
      if (link.leadTimeDays != null) {
        const cur = minLeadTimeByProduct.get(link.productId)
        if (cur == null || link.leadTimeDays < cur) {
          minLeadTimeByProduct.set(link.productId, link.leadTimeDays)
        }
      }
      if (link.unitPrice != null && !unitPriceByProduct.has(link.productId)) {
        unitPriceByProduct.set(link.productId, Number(link.unitPrice))
      }
    }

    // Подготавливаем VpProductInput для каждого ProductPlanInput
    const vpProducts = inputs.products.map((p) => ({
      productId: p.productId,
      sku: p.sku,
      name: p.name,
      stockNow: p.stockNow,
      baselineOrdersPerDay: p.baselineOrdersPerDay,
      leadTimeDays: minLeadTimeByProduct.get(p.productId),
      monthLevels: p.monthLevels.map((ml) => ({
        month: ml.month,
        targetOrdersPerDay: ml.targetOrdersPerDay,
        priceRub: ml.priceRub,
        buyoutPct: ml.buyoutPct,
      })),
      dayOverrides: p.dayOverrides,
      // Реальные приходы уже включены через resolveArrivalBatches в ProductPlanInput.arrivals
      arrivals: p.arrivals
        .filter((a) => a.source === "purchase" || a.source === "incoming-legacy")
        .map((a) => ({ date: a.date, qty: a.qty })),
      existingVirtualPurchases: (existingByProduct.get(p.productId) ?? []).map((vp) => ({
        ...vp,
        status: vp.status as "SUGGESTED" | "ACCEPTED" | "DISMISSED" | "CONVERTED",
      })),
      unitPrice: unitPriceByProduct.get(p.productId) ?? null,
    }))

    const suggestions = suggestVirtualPurchases({
      params: {
        safetyStockDays,
        vpCoverDays,
        defaultLeadTimeDays,
        minQty: 10,
        maxIterationsPerProduct: 6,
        today: todayMsk,
        horizonTo,
      },
      products: vpProducts,
    })

    // Транзакция: deleteMany(SUGGESTED+auto) + createMany(новые)
    await prisma.$transaction(async (tx) => {
      // Удаляем только авто-SUGGESTED (ACCEPTED/DISMISSED/CONVERTED/manual неприкосновенны)
      await tx.virtualPurchase.deleteMany({
        where: {
          status: "SUGGESTED",
          source: "auto",
          ...(productIds ? { productId: { in: productIds } } : {}),
        },
      })

      if (suggestions.length > 0) {
        await tx.virtualPurchase.createMany({
          data: suggestions.map((s) => ({
            productId: s.productId,
            qty: s.qty,
            orderDate: new Date(s.orderDate + "T00:00:00Z"),
            expectedArrivalDate: new Date(s.expectedArrivalDate + "T00:00:00Z"),
            leadTimeDaysUsed: s.leadTimeDaysUsed,
            unitPrice: s.unitPrice ?? null,
            source: "auto",
            status: "SUGGESTED",
          })),
        })
      }
    })
  } catch (err) {
    // Логируем, но не прерываем основную цепочку сохранения
    console.error("[regenerateVirtualPurchasesInternal]", err)
  }
}

// ── regenerateVirtualPurchases (public action) ─────────────────────

/**
 * Публичный server action: пересоздать авто-SUGGESTED виртуальные закупки.
 * Вызывается вручную пользователем или из UI.
 * productIds — опционально сузить до конкретных товаров.
 */
export async function regenerateVirtualPurchases(productIds?: string[]): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  try {
    await regenerateVirtualPurchasesInternal(productIds)
    revalidateSalesPlanPaths()
    return { ok: true }
  } catch (err) {
    console.error("[regenerateVirtualPurchases]", err)
    return { ok: false, error: "Не удалось регенерировать предложения" }
  }
}

// ── acceptVirtualPurchase ──────────────────────────────────────────

/**
 * SUGGESTED → ACCEPTED: предложение переживает регенерацию.
 */
export async function acceptVirtualPurchase(id: string): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  try {
    await prisma.virtualPurchase.update({
      where: { id },
      data: { status: "ACCEPTED" },
    })
    revalidateSalesPlanPaths()
    return { ok: true }
  } catch (err) {
    console.error("[acceptVirtualPurchase]", err)
    return { ok: false, error: "Не удалось подтвердить" }
  }
}

// ── updateVirtualPurchase ──────────────────────────────────────────

const UpdateVpSchema = z.object({
  id: z.string().min(1),
  qty: z.number().int().positive().optional(),
  orderDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  supplierId: z.string().optional().nullable(),
  expectedArrivalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  unitPrice: z.number().nonnegative().optional().nullable(),
})

/**
 * Правка виртуальной закупки. source остаётся, status → ACCEPTED.
 *
 * ИНВАРИАНТ «не прошлым числом» (серверный clamp — клиент можно обойти):
 * - orderDate = max(getMskTodayIso(), orderDate)
 * - expectedArrivalDate = max(orderDate + leadTimeDaysUsed, expectedArrivalDate)
 *
 * Виртуальная закупка НИКОГДА не размещается прошлым числом,
 * приход не раньше today + leadTimeDays от сегодня.
 */
export async function updateVirtualPurchase(
  payload: z.infer<typeof UpdateVpSchema>,
): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  const parsed = UpdateVpSchema.safeParse(payload)
  if (!parsed.success) return { ok: false, error: "Невалидные данные" }

  const { id, qty, orderDate: rawOrderDate, supplierId, expectedArrivalDate: rawArrivalDate, unitPrice } = parsed.data

  try {
    const existing = await prisma.virtualPurchase.findUnique({
      where: { id },
      select: { orderDate: true, expectedArrivalDate: true, leadTimeDaysUsed: true },
    })
    if (!existing) return { ok: false, error: "Запись не найдена" }

    const today = getMskTodayIso()
    const leadTimeDays = existing.leadTimeDaysUsed ?? 45

    // Серверный clamp — ИНВАРИАНТ «не прошлым числом»
    let orderDate: string | undefined
    if (rawOrderDate !== undefined) {
      orderDate = rawOrderDate < today ? today : rawOrderDate
    } else {
      // Используем существующий, но тоже clamp к today
      const existingOrderDate = existing.orderDate.toISOString().slice(0, 10)
      orderDate = existingOrderDate < today ? today : existingOrderDate
    }

    // expectedArrivalDate = max(orderDate + leadTimeDays, expectedArrivalDate)
    let expectedArrivalDate: string | undefined
    const minArrivalDate = addDays(orderDate, leadTimeDays)
    if (rawArrivalDate !== undefined) {
      expectedArrivalDate = rawArrivalDate < minArrivalDate ? minArrivalDate : rawArrivalDate
    } else {
      const existingArrival = existing.expectedArrivalDate.toISOString().slice(0, 10)
      expectedArrivalDate = existingArrival < minArrivalDate ? minArrivalDate : existingArrival
    }

    const updateData: Record<string, unknown> = {
      status: "ACCEPTED",
    }
    if (qty !== undefined) updateData.qty = qty
    if (orderDate !== undefined) updateData.orderDate = new Date(orderDate + "T00:00:00Z")
    if (supplierId !== undefined) updateData.supplierId = supplierId
    if (expectedArrivalDate !== undefined) updateData.expectedArrivalDate = new Date(expectedArrivalDate + "T00:00:00Z")
    if (unitPrice !== undefined) updateData.unitPrice = unitPrice

    await prisma.virtualPurchase.update({
      where: { id },
      data: updateData,
    })

    revalidateSalesPlanPaths()
    return { ok: true }
  } catch (err) {
    console.error("[updateVirtualPurchase]", err)
    return { ok: false, error: "Не удалось обновить" }
  }
}

// ── dismissVirtualPurchase ─────────────────────────────────────────

/**
 * → DISMISSED: исключён из arrivals, план честно проседает, lostRub виден.
 */
export async function dismissVirtualPurchase(id: string): Promise<ActionResult> {
  await requireSection("SALES", "MANAGE")
  try {
    await prisma.virtualPurchase.update({
      where: { id },
      data: { status: "DISMISSED" },
    })
    revalidateSalesPlanPaths()
    return { ok: true }
  } catch (err) {
    console.error("[dismissVirtualPurchase]", err)
    return { ok: false, error: "Не удалось отклонить" }
  }
}

// ── convertVirtualPurchase ─────────────────────────────────────────

type ConvertVpResult = { ok: true; redirectUrl: string } | { ok: false; error: string }

/**
 * Конвертация виртуальной закупки в реальную.
 * Требует SALES MANAGE + PROCUREMENT MANAGE.
 *
 * Возвращает redirectUrl для перехода на /procurement/purchases?create=1&from-virtual=<id>.
 * Финализация status=CONVERTED происходит в createPurchase при передаче fromVirtualId.
 *
 * Анти-двойной счёт: CONVERTED исключается из arrivals структурно
 * (resolveArrivalBatches фильтрует только SUGGESTED+ACCEPTED, CONVERTED не в этом множестве).
 */
export async function convertVirtualPurchase(id: string): Promise<ConvertVpResult> {
  await requireSection("SALES", "MANAGE")
  await requireSection("PROCUREMENT", "MANAGE")

  try {
    const vp = await prisma.virtualPurchase.findUnique({
      where: { id },
      select: { id: true, status: true },
    })
    if (!vp) return { ok: false, error: "Виртуальная закупка не найдена" }
    if (vp.status === "CONVERTED") return { ok: false, error: "Уже конвертирована" }
    if (vp.status === "DISMISSED") return { ok: false, error: "Отклонённую закупку нельзя конвертировать" }

    return {
      ok: true,
      redirectUrl: `/procurement/purchases?create=1&from-virtual=${id}`,
    }
  } catch (err) {
    console.error("[convertVirtualPurchase]", err)
    return { ok: false, error: "Ошибка сервера" }
  }
}

/**
 * Финализация CONVERTED статуса — вызывается из createPurchase при наличии fromVirtualId.
 * Обновляет VP в той же транзакции что и создание Purchase.
 */
export async function markVirtualPurchaseConverted(
  vpId: string,
  purchaseId: string,
): Promise<void> {
  await prisma.virtualPurchase.update({
    where: { id: vpId },
    data: {
      status: "CONVERTED",
      convertedPurchaseId: purchaseId,
    },
  })
  revalidateSalesPlanPaths()
}

/** Читает deliveryDays / returnDays из salesPlan.leadTimes2 (JSON) или old salesPlan.leadTimes. */
async function getLeadTimeDays(
  key: "deliveryDays" | "returnDays",
  defaultVal: number,
): Promise<number> {
  const row2 = await prisma.appSetting.findUnique({ where: { key: "salesPlan.leadTimes2" } })
  if (row2) {
    try {
      const obj = JSON.parse(row2.value) as Record<string, number>
      if (typeof obj[key] === "number" && Number.isFinite(obj[key])) return obj[key]
    } catch {
      // fallthrough
    }
  }
  // Fallback: старый ключ salesPlan.leadTimes
  const rowOld = await prisma.appSetting.findUnique({ where: { key: LEAD_TIMES_KEY } })
  if (rowOld) {
    try {
      const obj = JSON.parse(rowOld.value) as Record<string, number>
      if (typeof obj[key] === "number" && Number.isFinite(obj[key])) return obj[key]
    } catch {
      // fallthrough
    }
  }
  return defaultVal
}
