// lib/finance-weekly/data.ts
//
// LIVE-загрузчик входов понедельного WB фин-отчёта (/finance/weekly, W2a).
// Собирает WeeklyArticleInput[] + пулы затрат за одну ISO-неделю (Пн–Вс)
// кабинета Zoiten WB из БД для pure-движка lib/finance-weekly/engine.ts.
//
// Источники (все LIVE, без WB API-вызовов):
//   заказы/выручка — WbCardFunnelDaily (Σ недели по nmId)
//   реклама        — WbAdvertStatDaily (Σ недели по nmId)
//   закупка        — ProductCost.costPrice
//   комиссии       — WbCard (ИУ / std с FBS-fallback)
//   проценты кредита — график кредитов Зойтен (только бытовая техника)
//   N_std          — модель calculatePricingStandard (объёмная логистика / ед)
//
// Ручные пулы (доставка до МП / общие / приёмка / хранение) — placeholder до W3
// (банк-классификатор). Хранятся в AppSetting financeWeekly.pools.<weekISO>,
// редактируются MANAGE-пользователем через WeeklyFinReportControls.
//
// Мир затрат (universe): brand.direction.hasSizes=true → одежда (clothing),
// иначе → бытовая техника (appliances). Кредит несёт ТОЛЬКО appliances (§2.2).
//
// Phase quick-260710-evz (W2a — /finance/weekly scaffold + rollup, 2026-07-10)

import { prisma } from "@/lib/prisma"
import {
  DEFAULT_WEEKLY_CONSTANTS,
  type UniversePools,
  type Universe,
  type WeeklyArticleInput,
  type WeeklyConstants,
} from "@/lib/finance-weekly/types"
import { calculatePricingStandard, type PricingInputs } from "@/lib/pricing-math"
import { loadSummarySchedule } from "@/lib/credits-schedule-data"

// ── Ручные пулы (placeholder до W3 банк-классификатора) ───────────────────────

export interface ManualPools {
  /** Доставка до МП — общая (baseRevenue = обе вселенные суммарно). */
  delivery: number
  /** Общие расходы — бытовая техника. */
  overheadAppl: number
  /** Платная приёмка / штрафы — бытовая техника. */
  acceptanceAppl: number
  /** Хранение — бытовая техника. */
  storageAppl: number
  /** Общие расходы — одежда. */
  overheadCloth: number
  /** Платная приёмка / штрафы — одежда. */
  acceptanceCloth: number
  /** Хранение — одежда. */
  storageCloth: number
}

export const DEFAULT_MANUAL_POOLS: ManualPools = {
  delivery: 0,
  overheadAppl: 0,
  acceptanceAppl: 0,
  storageAppl: 0,
  overheadCloth: 0,
  acceptanceCloth: 0,
  storageCloth: 0,
}

/** Ключ AppSetting для ручных пулов конкретной ISO-недели (Пн). */
export function financeWeeklyPoolsKey(weekStartISO: string): string {
  return `financeWeekly.pools.${weekStartISO}`
}

// ── Дефолты ставок (mirror /prices/wb DEFAULT_RATES / EFF_FALLBACK) ────────────

const RATE_DEFAULTS: {
  wbLocalizationIndex: number
  wbIrpPct: number
  wbReverseLogBaseRub: number
  wbReverseLogPerLiterRub: number
} = {
  wbLocalizationIndex: 1.11,
  wbIrpPct: 1.56,
  wbReverseLogBaseRub: 46,
  wbReverseLogPerLiterRub: 14,
}

interface EffCoefParsed {
  delivBaseLiter: number
  delivAddLiter: number
  storageBaseLiter: number
  storageAddLiter: number
}

// v2-хардкод (реальные типовые applied-ставки короба, recon 2026-07-08) — тот же
// EFF_FALLBACK, что и в app/(dashboard)/prices/wb/page.tsx. НЕ v1-дефолты (46/14/0.07).
const EFF_FALLBACK: EffCoefParsed = {
  delivBaseLiter: 94.3,
  delivAddLiter: 28.7,
  storageBaseLiter: 0.16,
  storageAddLiter: 0.16,
}

// ── Публичный тип страницы ────────────────────────────────────────────────────

export interface WeeklyFinReportPageData {
  weekStart: string
  weekEnd: string
  articles: WeeklyArticleInput[]
  meta: Record<number, { brandName: string | null; productName: string; productId: string }>
  pools: { appliances: UniversePools; clothing: UniversePools }
  constants: WeeklyConstants
  manualPools: ManualPools
}

// ── Хелперы ────────────────────────────────────────────────────────────────────

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function parseEffCoef(raw: string | undefined): EffCoefParsed {
  if (!raw) return EFF_FALLBACK
  try {
    const parsed = JSON.parse(raw)
    return {
      delivBaseLiter: parsed.delivBaseLiter ?? EFF_FALLBACK.delivBaseLiter,
      delivAddLiter: parsed.delivAddLiter ?? EFF_FALLBACK.delivAddLiter,
      storageBaseLiter: parsed.storageBaseLiter ?? EFF_FALLBACK.storageBaseLiter,
      storageAddLiter: parsed.storageAddLiter ?? EFF_FALLBACK.storageAddLiter,
    }
  } catch {
    return EFF_FALLBACK
  }
}

function parseManualPools(raw: string | undefined): ManualPools {
  const merged: ManualPools = { ...DEFAULT_MANUAL_POOLS }
  if (!raw) return merged
  try {
    const parsed = JSON.parse(raw) as Partial<ManualPools>
    for (const k of Object.keys(merged) as (keyof ManualPools)[]) {
      const n = Number(parsed?.[k])
      if (Number.isFinite(n)) merged[k] = n
    }
  } catch {
    // повреждённый JSON → дефолт-нули
  }
  return merged
}

// ── Загрузчик ──────────────────────────────────────────────────────────────────

const RATE_KEYS = [
  "wbLocalizationIndex",
  "wbIrpPct",
  "wbReverseLogBaseRub",
  "wbReverseLogPerLiterRub",
  "wbEffCoef.appliances",
  "wbEffCoef.clothing",
] as const

/**
 * Собирает входы движка понедельного фин-отчёта за ISO-неделю [weekStart, +6д].
 * weekStart ДОЛЖЕН быть UTC-понедельником 00:00:00Z (нормализуется на странице).
 */
export async function loadWeeklyFinReportInputs(
  weekStart: Date,
): Promise<WeeklyFinReportPageData> {
  // 1. Границы недели (воскресенье включительно)
  const weekEnd = new Date(weekStart.getTime() + 6 * 86_400_000)
  const weekStartISO = isoDate(weekStart)
  const weekEndISO = isoDate(weekEnd)

  const emptyPools = (): UniversePools => ({
    deliveryToMp: { total: 0, baseRevenue: 0 },
    creditInterest: { total: 0, baseRevenue: 0 },
    overhead: { total: 0, baseRevenue: 0 },
    acceptance: { total: 0, baseRevenue: 0 },
    storage: { total: 0, baseRevenue: 0 },
  })

  // 2. WB marketplace
  const wbMarketplace = await prisma.marketplace.findFirst({ where: { slug: "wb" } })
  if (!wbMarketplace) {
    return {
      weekStart: weekStartISO,
      weekEnd: weekEndISO,
      articles: [],
      meta: {},
      pools: { appliances: emptyPools(), clothing: emptyPools() },
      constants: DEFAULT_WEEKLY_CONSTANTS,
      manualPools: DEFAULT_MANUAL_POOLS,
    }
  }

  // 3. Привязанные WB-статьи с product-графом (dims через include product-скаляров)
  const linkedArticles = await prisma.marketplaceArticle.findMany({
    where: { marketplaceId: wbMarketplace.id },
    include: {
      product: {
        include: {
          cost: true,
          brand: { select: { name: true, direction: { select: { hasSizes: true } } } },
        },
      },
    },
  })

  type LinkedProduct = (typeof linkedArticles)[number]["product"]
  const productByNmId = new Map<number, LinkedProduct>()
  for (const a of linkedArticles) {
    const nmId = parseInt(a.article, 10)
    if (!Number.isNaN(nmId) && !productByNmId.has(nmId)) {
      productByNmId.set(nmId, a.product)
    }
  }
  const linkedNmIds = Array.from(productByNmId.keys())

  if (linkedNmIds.length === 0) {
    return {
      weekStart: weekStartISO,
      weekEnd: weekEndISO,
      articles: [],
      meta: {},
      pools: { appliances: emptyPools(), clothing: emptyPools() },
      constants: DEFAULT_WEEKLY_CONSTANTS,
      manualPools: DEFAULT_MANUAL_POOLS,
    }
  }

  // 4-8. Параллельная загрузка карточек / ставок / фактов / рекламы / кредита
  const poolsKey = financeWeeklyPoolsKey(weekStartISO)
  const [wbCards, appSettings, funnelRows, adRows, schedule] = await Promise.all([
    prisma.wbCard.findMany({ where: { nmId: { in: linkedNmIds }, deletedAt: null } }),
    prisma.appSetting.findMany({ where: { key: { in: [...RATE_KEYS, poolsKey] } } }),
    prisma.wbCardFunnelDaily.groupBy({
      by: ["nmId"],
      where: { nmId: { in: linkedNmIds }, date: { gte: weekStart, lte: weekEnd } },
      _sum: { ordersCount: true, ordersSumRub: true },
    }),
    prisma.wbAdvertStatDaily.groupBy({
      by: ["nmId"],
      where: { nmId: { in: linkedNmIds }, date: { gte: weekStart, lte: weekEnd } },
      _sum: { sum: true },
    }),
    // Проценты по кредиту — только Зойтен (бытовая техника). Одно недельное окно.
    loadSummarySchedule("week", weekStart, weekEnd),
  ])

  const cardByNmId = new Map<number, (typeof wbCards)[number]>()
  for (const c of wbCards) cardByNmId.set(c.nmId, c)

  const settingsMap = new Map(appSettings.map((s) => [s.key, s.value]))

  // 5. Ставки (fallback → RATE_DEFAULTS)
  const rates = { ...RATE_DEFAULTS }
  for (const k of ["wbLocalizationIndex", "wbIrpPct", "wbReverseLogBaseRub", "wbReverseLogPerLiterRub"] as const) {
    const parsed = parseFloat(settingsMap.get(k) ?? "")
    if (!Number.isNaN(parsed)) rates[k] = parsed
  }
  const appliancesEff = parseEffCoef(settingsMap.get("wbEffCoef.appliances"))
  const clothingEff = parseEffCoef(settingsMap.get("wbEffCoef.clothing"))

  // 6-7. Недельные факты по nmId
  const funnelByNmId = new Map<number, { H: number; sumRub: number }>()
  for (const r of funnelRows) {
    funnelByNmId.set(r.nmId, {
      H: r._sum.ordersCount ?? 0,
      sumRub: r._sum.ordersSumRub ?? 0,
    })
  }
  const adByNmId = new Map<number, number>()
  for (const r of adRows) adByNmId.set(r.nmId, r._sum.sum ?? 0)

  // 8. Проценты по кредиту Зойтен за неделю (Σ по всем недельным столбцам окна)
  const zoitenGroup = schedule.groups.find((g) =>
    g.companyName.toUpperCase().includes("ЗОЙТЕН"),
  )
  const zoitenWeekInterest = zoitenGroup
    ? schedule.columns.reduce(
        (acc, col) => acc + (zoitenGroup.subtotalInterestByPeriod[col.key] ?? 0),
        0,
      )
    : 0

  // 9. Сборка articles + meta
  const articles: WeeklyArticleInput[] = []
  const meta: Record<
    number,
    { brandName: string | null; productName: string; productId: string }
  > = {}

  for (const [nmId, funnel] of funnelByNmId) {
    const H = funnel.H
    if (H <= 0) continue // guard: заказов нет → строку пропускаем

    const product = productByNmId.get(nmId)
    if (!product) continue

    const card = cardByNmId.get(nmId)
    const K = funnel.sumRub / H
    const universe: Universe = product.brand?.direction?.hasSizes ? "clothing" : "appliances"

    const commIuPct = card?.commFbwIu ?? card?.commFbsIu ?? 0
    const commStdPct = card?.commFbwStd ?? card?.commFbsStd ?? 0
    const costPerUnit = product.cost?.costPrice ?? 0
    const adSpendTotal = adByNmId.get(nmId) ?? 0

    // N_std — модель объёмной логистики / ед (calculatePricingStandard).
    // TODO(W1): заменить modeled N_std на фактический delivery_rub из WbRealizationWeekly.
    const volumeLiters =
      ((product.heightCm ?? 0) * (product.widthCm ?? 0) * (product.depthCm ?? 0)) / 1000
    let logisticsStdPerUnit = 0
    if (volumeLiters > 0) {
      const effCoef = universe === "clothing" ? clothingEff : appliancesEff
      const pricingInputs: PricingInputs = {
        // Ценовая база — из карточки (fallback на восстановленную K)
        priceBeforeDiscount: card?.priceBeforeDiscount ?? K,
        sellerDiscountPct: card?.sellerDiscount ?? 0,
        buyoutPct: card?.buyoutPercent ?? 100,
        // std-параметры логистики
        commStdPct,
        volumeLiters,
        delivBaseLiter: effCoef.delivBaseLiter,
        delivAddLiter: effCoef.delivAddLiter,
        storageBaseLiter: effCoef.storageBaseLiter,
        storageAddLiter: effCoef.storageAddLiter,
        localizationIndex: rates.wbLocalizationIndex,
        irpPct: rates.wbIrpPct,
        reverseLogBaseRub: rates.wbReverseLogBaseRub,
        reverseLogPerLiterRub: rates.wbReverseLogPerLiterRub,
        daysInStock: 60,
        // Benign — не влияют на logisticsEffAmount
        wbDiscountPct: 0,
        clubDiscountPct: 0,
        commFbwPct: commStdPct,
        walletPct: 0,
        acquiringPct: 0,
        jemPct: 0,
        creditPct: 0,
        overheadPct: 0,
        taxPct: 0,
        drrPct: 0,
        defectRatePct: 0,
        deliveryCostRub: 0,
        costPrice: costPerUnit,
      }
      // logisticsEffAmount опционален в PricingOutputs → coalesce (advisory #1).
      logisticsStdPerUnit = calculatePricingStandard(pricingInputs).logisticsEffAmount ?? 0
    }

    articles.push({
      nmId,
      universe,
      qtyOrders: H,
      grossPricePerUnit: K,
      commIuPct,
      commStdPct,
      costPerUnit,
      adSpendTotal,
      reviewWriteoffTotal: 0, // W1 later
      logisticsIuPerUnit: 0, // логистика зашита в ИУ-комиссию
      logisticsStdPerUnit,
      // storagePerUnit НЕ задаём → движок берёт из пула хранения
    })
    meta[nmId] = {
      brandName: product.brand?.name ?? null,
      productName: product.name,
      productId: product.id,
    }
  }

  // 10. Базы распределения пулов
  let applBase = 0
  let clothBase = 0
  for (const a of articles) {
    const rev = a.grossPricePerUnit * a.qtyOrders
    if (a.universe === "appliances") applBase += rev
    else clothBase += rev
  }
  const combinedBase = applBase + clothBase

  // 11. Ручные пулы
  const manualPools = parseManualPools(settingsMap.get(poolsKey))

  // 12. Пулы per universe (§2.2): доставка общая, кредит только appliances
  const appliancesPools: UniversePools = {
    deliveryToMp: { total: manualPools.delivery, baseRevenue: combinedBase },
    creditInterest: { total: zoitenWeekInterest, baseRevenue: applBase },
    overhead: { total: manualPools.overheadAppl, baseRevenue: applBase },
    acceptance: { total: manualPools.acceptanceAppl, baseRevenue: applBase },
    storage: { total: manualPools.storageAppl, baseRevenue: applBase },
  }
  const clothingPools: UniversePools = {
    deliveryToMp: { total: manualPools.delivery, baseRevenue: combinedBase }, // SHARED
    creditInterest: { total: 0, baseRevenue: 0 }, // одежда кредит не несёт
    overhead: { total: manualPools.overheadCloth, baseRevenue: clothBase },
    acceptance: { total: manualPools.acceptanceCloth, baseRevenue: clothBase },
    storage: { total: manualPools.storageCloth, baseRevenue: clothBase },
  }

  // 13. Результат
  return {
    weekStart: weekStartISO,
    weekEnd: weekEndISO,
    articles,
    meta,
    pools: { appliances: appliancesPools, clothing: clothingPools },
    constants: DEFAULT_WEEKLY_CONSTANTS,
    manualPools,
  }
}
