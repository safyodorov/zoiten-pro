// lib/finance-snapshot.ts
// Phase 24 Plan 24-06: ежедневный снапшот остатков (D-01/D-10/D-11/D-13) и дебиторки WB (D-14).
//
// computeStockSnapshotRows — PURE агрегатор Product × 4 локации (тестируется без prisma,
// см. tests/finance-snapshot.test.ts). runFinanceSnapshot — оркестратор (prisma +
// lib/wb-finance-api), degraded mode при падении WB Finance API (m5).
//
// Дата снапшота = «вчера МСК» (D-02): cron в 06:00 дня D фиксирует конец дня D-1 и пишет
// date=D-1 (⚠ m6 — консистентно с 24-05/24-09: date снапшота = состояние на КОНЕЦ этого дня).
//
// forPay-хвост якорится на понедельник ДАТЫ СНАПШОТА, а не даты запуска (M2) — иначе
// воскресный/понедельничный запуск диспетчера теряет неделю дебиторки. Верхняя граница окна —
// конец календарного дня snapshotDate (23:59:59.999), иначе продажи самого дня снапшота
// (после полуночи UTC-представления @db.Date) отсекались бы фильтром saleDt<=snapshotTime.

import { prisma } from "@/lib/prisma"
import { fetchAccountBalance, fetchWeeklyForPayTail } from "@/lib/wb-finance-api"

export type FinanceStockLocationName =
  | "WB_WAREHOUSE"
  | "WB_IN_WAY_TO_CLIENT"
  | "WB_IN_WAY_FROM_CLIENT"
  | "IVANOVO"

export interface StockSnapshotRowInput {
  productId: string
  sku: string
  name: string
  location: FinanceStockLocationName
  qty: number
  costPriceAtDate: number | null
  valueRub: number | null
}

export interface StockSnapshotProductInput {
  id: string
  sku: string
  name: string
  ivanovoStock: number | null
  costPrice: number | null
  nmIds: number[]
}

export interface WbCardStockInput {
  stockQty: number | null
  inWayToClient: number | null
  inWayFromClient: number | null
}

/**
 * PURE — агрегирует остатки Product × 4 локации (WB_WAREHOUSE / WB_IN_WAY_TO_CLIENT /
 * WB_IN_WAY_FROM_CLIENT / IVANOVO). Суммирует stockQty/inWayToClient/inWayFromClient по
 * всем nmIds товара (nmId без карточки в Map трактуется как 0 — не падает). Строка с
 * qty<=0 не создаётся (экономия объёма). costPrice=null → costPriceAtDate=null,
 * valueRub=null (D-11 — «без оценки»).
 */
export function computeStockSnapshotRows(
  products: StockSnapshotProductInput[],
  wbCardsByNmId: Map<number, WbCardStockInput>,
): StockSnapshotRowInput[] {
  const rows: StockSnapshotRowInput[] = []

  for (const product of products) {
    let wbWarehouseQty = 0
    let inWayToClientQty = 0
    let inWayFromClientQty = 0
    for (const nmId of product.nmIds) {
      const card = wbCardsByNmId.get(nmId)
      if (!card) continue
      wbWarehouseQty += card.stockQty ?? 0
      inWayToClientQty += card.inWayToClient ?? 0
      inWayFromClientQty += card.inWayFromClient ?? 0
    }
    const ivanovoQty = product.ivanovoStock ?? 0

    const locations: Array<[FinanceStockLocationName, number]> = [
      ["WB_WAREHOUSE", wbWarehouseQty],
      ["WB_IN_WAY_TO_CLIENT", inWayToClientQty],
      ["WB_IN_WAY_FROM_CLIENT", inWayFromClientQty],
      ["IVANOVO", ivanovoQty],
    ]

    for (const [location, qty] of locations) {
      if (qty <= 0) continue
      const costPriceAtDate = product.costPrice ?? null
      const valueRub =
        costPriceAtDate != null ? Math.round(qty * costPriceAtDate * 100) / 100 : null
      rows.push({
        productId: product.id,
        sku: product.sku,
        name: product.name,
        location,
        qty,
        costPriceAtDate,
        valueRub,
      })
    }
  }

  return rows
}

/** "YYYY-MM-DD" вчерашнего дня МСК (D-02 — «утром за вчера»). Паттерн wb-funnel-daily mskDateMinusDays. */
function getMskYesterdayDateString(now?: Date): string {
  const ms = (now ?? new Date()).getTime() + 3 * 3600_000 - 24 * 3600_000
  return new Date(ms).toISOString().split("T")[0]
}

/** Понедельник ISO-недели, содержащей date (паттерн lib/loan-math.ts getIsoWeek isoDay). */
function mondayOfWeek(date: Date): Date {
  const jsDay = date.getUTCDay()
  const isoDay = jsDay === 0 ? 7 : jsDay
  return new Date(date.getTime() - (isoDay - 1) * 24 * 3600_000)
}

/** Конец календарного дня date (23:59:59.999) — верхняя граница окна forPay-хвоста (M2). */
function endOfDay(date: Date): Date {
  return new Date(date.getTime() + 24 * 3600_000 - 1)
}

export interface RunFinanceSnapshotResult {
  date: string
  stockRows: number
  receivables: "ok" | "degraded" | "skipped" | "error"
}

/**
 * Оркестратор ежедневного снапшота: пишет FinanceStockSnapshot (остатки + себестоимость на
 * дату) и FinanceReceivablesSnapshot (дебиторка WB) на дату «вчера МСК» (D-02).
 *
 * m5 — РАЗДЕЛЬНЫЕ try/catch для balance и tail:
 * - Остатки уже записаны ДО обращения к WB Finance API — падение дебиторки их не роняет.
 * - Падение fetchAccountBalance() → дебиторка не пишется вовсе (receivables="skipped" если
 *   токен WB_FINANCE_TOKEN не настроен, иначе "error").
 * - Падение ТОЛЬКО fetchWeeklyForPayTail() (balance получен) → пишем снапшот с tail=0 и
 *   receivables="degraded" (частичный успех лучше, чем полное отсутствие данных).
 */
export async function runFinanceSnapshot(): Promise<RunFinanceSnapshotResult> {
  const dateStr = getMskYesterdayDateString()
  const snapshotDate = new Date(dateStr)

  // 1. Остатки ---------------------------------------------------------------
  const products = await prisma.product.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      sku: true,
      name: true,
      ivanovoStock: true,
      cost: { select: { costPrice: true } },
      articles: { select: { article: true, marketplace: { select: { name: true } } } },
    },
  })

  const productInputs: StockSnapshotProductInput[] = products.map((p) => {
    const nmIds: number[] = []
    for (const a of p.articles) {
      if (a.marketplace.name.toLowerCase() !== "wb") continue
      const nmId = parseInt(a.article, 10)
      if (!isNaN(nmId)) nmIds.push(nmId)
    }
    return {
      id: p.id,
      sku: p.sku,
      name: p.name,
      ivanovoStock: p.ivanovoStock,
      costPrice: p.cost?.costPrice ?? null,
      nmIds,
    }
  })

  const allNmIds = [...new Set(productInputs.flatMap((p) => p.nmIds))]
  const wbCards =
    allNmIds.length > 0
      ? await prisma.wbCard.findMany({
          where: { nmId: { in: allNmIds } },
          select: { nmId: true, stockQty: true, inWayToClient: true, inWayFromClient: true },
        })
      : []
  const wbCardsByNmId = new Map(wbCards.map((c) => [c.nmId, c]))

  const rows = computeStockSnapshotRows(productInputs, wbCardsByNmId)

  await prisma.$transaction([
    prisma.financeStockSnapshot.deleteMany({ where: { date: snapshotDate } }),
    prisma.financeStockSnapshot.createMany({
      data: rows.map((r) => ({ ...r, date: snapshotDate })),
    }),
  ])

  // 2. Дебиторка WB (degraded mode, m5 — раздельные try/catch) ----------------
  let receivables: "ok" | "degraded" | "skipped" | "error" = "ok"
  let bal: { currency: string; current: number; forWithdraw: number } | null = null

  try {
    bal = await fetchAccountBalance()
  } catch (err) {
    console.error("[finance-snapshot] fetchAccountBalance failed:", err)
    const message = err instanceof Error ? err.message : String(err)
    receivables = message.includes("не настроен") ? "skipped" : "error"
  }

  if (bal) {
    const monday = mondayOfWeek(snapshotDate)
    const snapshotEnd = endOfDay(snapshotDate)
    let tail = 0
    try {
      tail = await fetchWeeklyForPayTail(monday, snapshotEnd)
    } catch (err) {
      console.error("[finance-snapshot] fetchWeeklyForPayTail failed:", err)
      tail = 0
      receivables = "degraded"
    }

    await prisma.financeReceivablesSnapshot.upsert({
      where: { date: snapshotDate },
      create: {
        date: snapshotDate,
        balanceCurrentRub: bal.current,
        balanceForWithdrawRub: bal.forWithdraw,
        weeklyTailRub: tail,
        totalRub: Math.round((bal.current + tail) * 100) / 100,
        rawJson: { ...bal, tailDegraded: receivables === "degraded" } as never,
      },
      update: {
        balanceCurrentRub: bal.current,
        balanceForWithdrawRub: bal.forWithdraw,
        weeklyTailRub: tail,
        totalRub: Math.round((bal.current + tail) * 100) / 100,
        rawJson: { ...bal, tailDegraded: receivables === "degraded" } as never,
      },
    })
  }

  return { date: dateStr, stockRows: rows.length, receivables }
}
