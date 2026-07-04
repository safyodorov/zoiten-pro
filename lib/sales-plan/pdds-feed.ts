// lib/sales-plan/pdds-feed.ts
//
// Контракт ПДДС (ПДДС = Платёжный и Денежный ДС) для следующей фазы (/finance/cashflow).
//
// Разделение pure-ядро / loader-обёртка:
//   - buildVirtualPurchasePayments — синхронная, без Prisma/React/Next
//   - getPlannedRevenueSeries — async, Prisma-coupled loader (притоки)
//   - getPlannedVirtualPayments — async, Prisma-coupled loader (оттоки с live-сверкой)
//
// Phase 25 (Plan 25-09, Этап 6)
// SP-12: контракт ПДДС (притоки + оттоки, live-сверка CONVERTED/DISMISSED, forward-fill курса)

import {
  computeDepositDueDate,
  computeBalanceDueDate,
} from "@/lib/procurement-math"
import { getRateForDate } from "@/lib/balance-data"
import type { PrismaClient } from "@prisma/client"

// ── Типы ─────────────────────────────────────────────────────────────────────

/** Минимальный VP-снапшот (из paramsJson версии) */
export interface VpSnapshot {
  id: string
  productId: string
  qty: number
  orderDate: string              // "YYYY-MM-DD"
  expectedArrivalDate?: string   // "YYYY-MM-DD"
  leadTimeDaysUsed?: number      // срок производства (дни), default 45
  unitPrice: number | null       // цена в валюте закупки (CNY/USD)
  currency?: string              // "CNY" | "USD" | "RUB" (default "CNY")
  depositPct?: number | null     // % аванса (default 30)
  balancePct?: number | null     // % остатка (default 70)
  status?: string                // "SUGGESTED" | "ACCEPTED" | "DISMISSED" | "CONVERTED"
  supplierId?: string | null
  source?: string
}

/** Плановый платёж VP (результат buildVirtualPurchasePayments) */
export interface VpPayment {
  type: "DEPOSIT" | "BALANCE"
  dueDate: string    // "YYYY-MM-DD"
  amount: number     // в валюте закупки (НЕ конвертируется в ₽ в pure-ядре)
  currency: string   // "CNY" | "USD" | "RUB"
}

/** Платёж с конвертацией в ₽ (результат getPlannedVirtualPayments) */
export interface VpPaymentRub extends VpPayment {
  amountRub: number    // сконвертировано в ₽ через forward-fill курса
  rateUsed: number     // курс CNY→₽ на dueDate (forward-fill)
  rateApproximate: boolean  // true — последний известный (будущее)
  vpId: string         // исходный VP id
  productId: string    // для группировок
}

/** Строка дневного ряда плановых выкупов (притоки ПДДС) */
export interface PlannedRevenueDay {
  date: string          // "YYYY-MM-DD"
  buyoutsRub: number    // Σ buyoutsRub по всем товарам
  buyoutsUnits: number  // Σ buyoutsUnits
  byProduct: Array<{
    productId: string
    buyoutsRub: number
    buyoutsUnits: number
  }>
}

/** Результат getPlannedVirtualPayments */
export interface PlannedVirtualPaymentsResult {
  payments: VpPaymentRub[]
  /** Флаг: одна или более VP из снапшота имеет live status CONVERTED или DISMISSED.
   *  Означает, что версия устарела — реальная закупка уже создана или VP отклонена. */
  versionStale: boolean
  /** VP-ids из снапшота, которые в live-данных помечены CONVERTED */
  convertedVpIds: string[]
  /** VP-ids из снапшота, которые в live-данных помечены DISMISSED */
  dismissedVpIds: string[]
}

// ── PURE-ядро ──────────────────────────────────────────────────────────────

// Дефолты
const DEFAULT_DEPOSIT_PCT = 30
const DEFAULT_BALANCE_PCT = 70
const DEFAULT_LEAD_TIME_DAYS = 45

/**
 * Генерирует пару платежей (DEPOSIT + BALANCE) для VP-снапшота.
 *
 * PURE — без Prisma/React/Next. Синхронная.
 *
 * Формулы:
 *   DEPOSIT.dueDate = orderDate + 3 (computeDepositDueDate)
 *   BALANCE.dueDate = DEPOSIT.dueDate + leadTimeDays (computeBalanceDueDate)
 *   depositPct / balancePct: fallback 30 / 70
 *   amount = qty × unitPrice × pct / 100 (в валюте закупки, НЕ конвертируется)
 *
 * @returns [deposit, balance] — ровно 2 платежа
 */
export function buildVirtualPurchasePayments(vp: VpSnapshot): VpPayment[] {
  const {
    qty,
    orderDate,
    leadTimeDaysUsed = DEFAULT_LEAD_TIME_DAYS,
    unitPrice,
    currency = "CNY",
  } = vp

  const depositPct = vp.depositPct != null ? vp.depositPct : DEFAULT_DEPOSIT_PCT
  const balancePct = vp.balancePct != null ? vp.balancePct : DEFAULT_BALANCE_PCT

  // Дата депозита: orderDate + 3 календарных дня
  const orderDateObj = new Date(orderDate + "T00:00:00Z")
  const depositDueDateObj = computeDepositDueDate(orderDateObj)
  const depositDueDate = depositDueDateObj.toISOString().slice(0, 10)

  // Дата баланса: depositDueDate + leadTimeDays
  const balanceDueDateObj = computeBalanceDueDate(depositDueDateObj, leadTimeDaysUsed)
  const balanceDueDate = balanceDueDateObj.toISOString().slice(0, 10)

  // Суммы в валюте закупки (НЕ конвертируются)
  const totalAmount = qty * (unitPrice ?? 0)
  const depositAmount = totalAmount * depositPct / 100
  const balanceAmount = totalAmount * balancePct / 100

  return [
    {
      type: "DEPOSIT",
      dueDate: depositDueDate,
      amount: depositAmount,
      currency,
    },
    {
      type: "BALANCE",
      dueDate: balanceDueDate,
      amount: balanceAmount,
      currency,
    },
  ]
}

// ── LOADER-обёртки (async, Prisma-coupled) ─────────────────────────────────

/**
 * Дневной ряд плановых выкупов из SalesPlanVersionDay (притоки ПДДС).
 *
 * Агрегирует SalesPlanVersionDay[versionId] по дате:
 *   buyoutsRub = Σ planBuyoutsRub per день
 *   buyoutsUnits = Σ planBuyoutsUnits per день
 *   byProduct: все товары с ненулевыми выкупами в этот день
 *
 * Net-to-seller (комиссия WB, эквайринг и т.п.) вычисляется самим ПДДС-модулем
 * на основе этого ряда + параметров из AppSetting.
 */
export async function getPlannedRevenueSeries(
  db: PrismaClient,
  versionId: string,
): Promise<PlannedRevenueDay[]> {
  const rows = await db.salesPlanVersionDay.findMany({
    where: { versionId },
    select: {
      date: true,
      productId: true,
      planBuyoutsRub: true,
      planBuyoutsUnits: true,
    },
    orderBy: { date: "asc" },
  })

  // Группировка по дате
  const byDate = new Map<string, {
    buyoutsRub: number
    buyoutsUnits: number
    byProduct: Array<{ productId: string; buyoutsRub: number; buyoutsUnits: number }>
  }>()

  for (const row of rows) {
    const dateStr = row.date.toISOString().slice(0, 10)
    let dayAgg = byDate.get(dateStr)
    if (!dayAgg) {
      dayAgg = { buyoutsRub: 0, buyoutsUnits: 0, byProduct: [] }
      byDate.set(dateStr, dayAgg)
    }
    if (row.planBuyoutsRub !== 0 || row.planBuyoutsUnits !== 0) {
      dayAgg.byProduct.push({
        productId: row.productId,
        buyoutsRub: row.planBuyoutsRub,
        buyoutsUnits: row.planBuyoutsUnits,
      })
      dayAgg.buyoutsRub += row.planBuyoutsRub
      dayAgg.buyoutsUnits += row.planBuyoutsUnits
    }
  }

  // Сортировка по дате
  const result: PlannedRevenueDay[] = []
  for (const [date, agg] of byDate) {
    result.push({ date, ...agg })
  }
  result.sort((a, b) => a.date.localeCompare(b.date))

  return result
}

/**
 * Плановые оттоки по виртуальным закупкам из версии (оттоки ПДДС).
 *
 * Алгоритм:
 * 1. Читает VP-снапшоты из version.paramsJson (поле virtualPurchases[]).
 * 2. Сверяет id с live VirtualPurchase.status:
 *    - CONVERTED → платежи исключаются (реальная закупка уже создана, PurchasePayment дублирует)
 *    - DISMISSED  → исключаются, флаг versionStale=true
 *    - id не найден live (SUGGESTED авто-регенерирован) → считать по snapshot-данным
 *    - SUGGESTED/ACCEPTED live → считать по snapshot-данным
 * 3. Для каждого активного VP → buildVirtualPurchasePayments (pure)
 * 4. Forward-fill курса: amount CNY→₽ через getRateForDate(dueDate)
 *
 * @returns payments (с конвертацией в ₽) + versionStale флаг
 */
export async function getPlannedVirtualPayments(
  db: PrismaClient,
  versionId: string,
): Promise<PlannedVirtualPaymentsResult> {
  // Читаем версию и snapshotted VP
  const version = await db.salesPlanVersion.findUnique({
    where: { id: versionId },
    select: { paramsJson: true },
  })

  if (!version) {
    return {
      payments: [],
      versionStale: false,
      convertedVpIds: [],
      dismissedVpIds: [],
    }
  }

  // Парсим snapshotted VP из paramsJson
  let snapshotVPs: VpSnapshot[] = []
  try {
    const params = version.paramsJson as {
      virtualPurchases?: VpSnapshot[]
    } | null
    if (params?.virtualPurchases && Array.isArray(params.virtualPurchases)) {
      snapshotVPs = params.virtualPurchases
    }
  } catch {
    // Если paramsJson не парсится — возвращаем пустой результат
  }

  if (snapshotVPs.length === 0) {
    return {
      payments: [],
      versionStale: false,
      convertedVpIds: [],
      dismissedVpIds: [],
    }
  }

  // Сверка с live-статусами: запрашиваем все VP из снапшота по id
  const snapshotIds = snapshotVPs.map((vp) => vp.id)
  const liveVPs = await db.virtualPurchase.findMany({
    where: { id: { in: snapshotIds } },
    select: { id: true, status: true },
  })

  // Карта live status по id
  const liveStatusById = new Map<string, string>()
  for (const lv of liveVPs) {
    liveStatusById.set(lv.id, lv.status)
  }

  // Классификация VP
  const convertedVpIds: string[] = []
  const dismissedVpIds: string[] = []
  const activeVPs: VpSnapshot[] = []

  for (const vp of snapshotVPs) {
    const liveStatus = liveStatusById.get(vp.id)

    if (liveStatus === "CONVERTED") {
      // Анти-двойной счёт: реальная PurchasePayment уже создана → исключить из виртуальных
      convertedVpIds.push(vp.id)
      continue
    }

    if (liveStatus === "DISMISSED") {
      // VP отклонена после фиксации → версия устарела, исключить
      dismissedVpIds.push(vp.id)
      continue
    }

    // SUGGESTED / ACCEPTED / not-found-live (авто-удалена при регенерации) → считаем
    activeVPs.push(vp)
  }

  const versionStale = convertedVpIds.length > 0 || dismissedVpIds.length > 0

  // Генерируем платежи для активных VP + конвертируем в ₽
  const payments: VpPaymentRub[] = []

  for (const vp of activeVPs) {
    const rawPayments = buildVirtualPurchasePayments(vp)

    for (const payment of rawPayments) {
      // Forward-fill курса: для будущих дат = последний известный курс
      let amountRub = payment.amount
      let rateUsed = 1
      let rateApproximate = false

      if (payment.currency === "CNY" || payment.currency === "USD") {
        const dueDateObj = new Date(payment.dueDate + "T00:00:00Z")
        const rateData = await getRateForDate(payment.currency, dueDateObj)

        if (rateData) {
          rateUsed = rateData.rateToRub
          rateApproximate = rateData.approximate
          amountRub = payment.amount * rateData.rateToRub
        } else {
          // Нет данных курса — оставляем в исходной валюте (rateUsed=1, approximate=true)
          rateApproximate = true
        }
      }

      payments.push({
        ...payment,
        amountRub,
        rateUsed,
        rateApproximate,
        vpId: vp.id,
        productId: vp.productId,
      })
    }
  }

  // Сортировка по dueDate
  payments.sort((a, b) => a.dueDate.localeCompare(b.dueDate))

  return {
    payments,
    versionStale,
    convertedVpIds,
    dismissedVpIds,
  }
}
