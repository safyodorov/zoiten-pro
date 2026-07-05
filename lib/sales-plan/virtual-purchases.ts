// lib/sales-plan/virtual-purchases.ts
//
// Pure генератор виртуальных закупок — «пора заказывать» (SP-08, opt-out).
//
// Алгоритм (§4.1 RESEARCH.md): итеративный roll-forward per товар.
// Источник скорости — плановая rateRequested (не WbCard.avgSalesSpeed7d).
// ИНВАРИАНТ «не прошлым числом»: orderDate ВСЕГДА ≥ today; expectedArrivalDate ВСЕГДА ≥ today + leadTimeDays.
//
// Pure — ноль импортов Prisma / React / Next.
// Phase 25 (План продаж v2, 2026-07)

import { addDays, eachDayIso } from "./dates"

// ── Входные типы ─────────────────────────────────────────────────────────────

/** Параметры генератора виртуальных закупок */
export interface VpParams {
  safetyStockDays: number        // default 14 — страховой запас (дней продаж)
  vpCoverDays: number            // default 60 — покрытие виртуальной закупки (дней)
  defaultLeadTimeDays: number    // default 45 — lead time заказ→приход (дни)
  minQty: number                 // default 10 — минимальная партия
  maxIterationsPerProduct: number // default 6
  today: string                  // "2026-07-01" — текущая дата (инвариант)
  horizonTo: string              // "2026-12-31" — конец горизонта
}

/** Виртуальная закупка в arrivals для симуляции */
export interface VpArrivalInput {
  id: string
  status: "SUGGESTED" | "ACCEPTED" | "DISMISSED" | "CONVERTED"
  orderDate: string
  expectedArrivalDate: string
  qty: number
  source: string
}

/** Упрощённый входной товар для suggestVirtualPurchases */
export interface VpProductInput {
  productId: string
  sku: string
  name: string
  stockNow: number
  baselineOrdersPerDay: number
  leadTimeDays?: number                       // берётся из SupplierProductLink; fallback defaultLeadTimeDays
  monthLevels: Array<{
    month: string                             // "2026-07-01"
    targetOrdersPerDay: number | null
    priceRub?: number | null
    buyoutPct?: number | null
  }>
  dayOverrides: Record<string, number>
  arrivals: Array<{ date: string; qty: number }>   // реальные партии (уже в формате ArrivalBatch)
  existingVirtualPurchases: VpArrivalInput[]       // ACCEPTED/DISMISSED/manual — не трогаются
  unitPrice?: number | null                        // из SupplierProductLink
}

/** Входной объект генератора */
export interface VpSuggestInput {
  params: VpParams
  products: VpProductInput[]
}

// ── Выходной тип ─────────────────────────────────────────────────────────────

export interface VpSuggestion {
  productId: string
  qty: number
  orderDate: string              // YYYY-MM-DD; ВСЕГДА ≥ today (инвариант)
  expectedArrivalDate: string    // YYYY-MM-DD; ВСЕГДА ≥ today + leadTimeDays (инвариант)
  leadTimeDaysUsed: number
  unitPrice?: number | null
  isLate: boolean                // true если arrival > breach (plan просядет, товар не успел)
}

// ── Вспомогательные функции ──────────────────────────────────────────────────

/** Выбор месячного уровня для дня d (ближайший снизу по month ≤ monthKey). */
function getMonthLevel(d: string, monthLevels: VpProductInput["monthLevels"]) {
  const monthKey = d.slice(0, 7) + "-01"
  let best: (typeof monthLevels)[0] | null = null
  for (const level of monthLevels) {
    if (level.month <= monthKey) {
      if (best === null || level.month > best.month) {
        best = level
      }
    }
  }
  return best
}

/** Плановая ставка заказов для дня d (dayOverrides > monthLevel > baseline). */
function getRateRequested(
  d: string,
  dayOverrides: Record<string, number>,
  monthLevels: VpProductInput["monthLevels"],
  baseline: number,
): number {
  if (dayOverrides[d] !== undefined) return dayOverrides[d]
  const level = getMonthLevel(d, monthLevels)
  if (level?.targetOrdersPerDay != null) return level.targetOrdersPerDay
  return baseline
}

/**
 * Мини-симуляция: возвращает projectedStock per день и rateRequested per день
 * для горизонта [today … horizonTo].
 *
 * Упрощена по сравнению с engine.ts: без T+3/T+6 (только сток-лимит),
 * arrivals применяются на следующий день (как в engine — inflow[date+1]).
 * Этого достаточно для нахождения breach и projectedStock(arrival).
 */
interface SimDay {
  date: string
  stockEnd: number
  rateRequested: number
}

function simulate(
  product: VpProductInput,
  arrivals: Array<{ date: string; qty: number }>,
  today: string,
  horizonTo: string,
): SimDay[] {
  // Inflow: arrivals[date+1] → qty (товар доступен со следующего дня после даты прихода)
  const inflowByDate = new Map<string, number>()
  for (const a of arrivals) {
    const inflowDate = addDays(a.date, 1)
    inflowByDate.set(inflowDate, (inflowByDate.get(inflowDate) ?? 0) + a.qty)
  }

  const days = eachDayIso(today, horizonTo)
  const result: SimDay[] = []
  let stockEnd = product.stockNow

  for (const d of days) {
    const rateRequested = getRateRequested(d, product.dayOverrides, product.monthLevels, product.baselineOrdersPerDay)
    const orders = Math.min(rateRequested, stockEnd)
    const inflow = inflowByDate.get(d) ?? 0
    stockEnd = Math.max(0, stockEnd - orders + inflow)
    result.push({ date: d, stockEnd, rateRequested })
  }

  return result
}

// ── SP-17: Roll-forward просроченных авто-ACCEPTED ────────────────────────────

/** Результат сдвига одной виртуальной закупки */
export interface RollForwardResult {
  id: string
  orderDate: string              // >= today (инвариант «не прошлым числом»)
  expectedArrivalDate: string    // >= today + leadTimeDays (инвариант)
  qty: number
  shifted: boolean               // true если даты были сдвинуты
}

/**
 * Сдвигает просроченные авто-ACCEPTED виртуальные закупки вперёд (SP-17, D-4).
 * Просроченная = source === "auto" && status === "ACCEPTED" && orderDate < today.
 * Сдвиг: orderDate -> today, expectedArrivalDate -> today + leadTimeDays.
 * source === "manual" НЕ трогается (пользователь управляет датой вручную).
 * Инвариант «не прошлым числом»: orderDate >= today, expectedArrivalDate >= today + leadTimeDays.
 *
 * @param items существующие VP (ACCEPTED/manual/…)
 * @param today ISO "YYYY-MM-DD"
 * @param leadTimeDays дней от заказа до прихода
 */
export function rollForwardAcceptedArrivals(
  items: Array<{ id: string; status: string; source: string; orderDate: string; expectedArrivalDate: string; qty: number }>,
  today: string,
  leadTimeDays: number,
): RollForwardResult[] {
  return items.map((vp) => {
    const isAutoAccepted = vp.source === "auto" && vp.status === "ACCEPTED"
    const overdue = vp.orderDate < today
    if (isAutoAccepted && overdue) {
      return {
        id: vp.id,
        orderDate: today,
        expectedArrivalDate: addDays(today, leadTimeDays),
        qty: vp.qty,
        shifted: true,
      }
    }
    return {
      id: vp.id,
      orderDate: vp.orderDate,
      expectedArrivalDate: vp.expectedArrivalDate,
      qty: vp.qty,
      shifted: false,
    }
  })
}

// ── Основная функция ─────────────────────────────────────────────────────────

/**
 * Генерирует предложения виртуальных закупок для всех товаров.
 *
 * Алгоритм (§4.1 RESEARCH.md):
 * - Для каждого товара — до maxIterationsPerProduct итераций (roll-forward).
 * - На каждой итерации: симуляция → нахождение breach → clamp orderDate к today →
 *   расчёт qty → добавление VpSuggestion + партии в arrivals → следующая итерация.
 * - ИНВАРИАНТ «не прошлым числом»: orderDate = max(today, breach − leadTimeDays);
 *   expectedArrivalDate = orderDate + leadTimeDays — НИКОГДА не раньше today + leadTimeDays.
 * - DISMISSED с совпадающим orderDate ± 14 дней подавляет повторное авто-предложение.
 *
 * Pure — ноль Prisma / React / Next.
 *
 * @returns Плоский массив VpSuggestion (все товары вместе).
 */
export function suggestVirtualPurchases(input: VpSuggestInput): VpSuggestion[] {
  const {
    safetyStockDays,
    vpCoverDays,
    defaultLeadTimeDays,
    minQty,
    maxIterationsPerProduct,
    today,
    horizonTo,
  } = input.params

  const allSuggestions: VpSuggestion[] = []

  for (const product of input.products) {
    const leadTimeDays = product.leadTimeDays ?? defaultLeadTimeDays

    // Начальный arrivals: реальные партии + ACCEPTED/manual виртуальные
    // (авто-SUGGESTED исключены — пересоздаются)
    const workArrivals: Array<{ date: string; qty: number }> = [
      ...product.arrivals,
      ...product.existingVirtualPurchases
        .filter(
          (vp) =>
            (vp.status === "ACCEPTED" || vp.source === "manual") &&
            vp.status !== "DISMISSED" &&
            vp.status !== "CONVERTED",
        )
        .map((vp) => ({ date: vp.expectedArrivalDate, qty: vp.qty })),
    ]

    // DISMISSED — список подавленных окон (orderDate ± 14 дней)
    const dismissedDates = product.existingVirtualPurchases
      .filter((vp) => vp.status === "DISMISSED")
      .map((vp) => vp.orderDate)

    /** Проверяет, подавлено ли авто-предложение с данным orderDate */
    function isDismissed(candidateOrderDate: string): boolean {
      const ts = new Date(candidateOrderDate + "T00:00:00Z").getTime()
      for (const dismissedDate of dismissedDates) {
        const diff = Math.abs(ts - new Date(dismissedDate + "T00:00:00Z").getTime())
        const days = diff / (1000 * 60 * 60 * 24)
        if (days <= 14) return true
      }
      return false
    }

    for (let iteration = 0; iteration < maxIterationsPerProduct; iteration++) {
      // Симуляция с текущим набором arrivals
      const simDays = simulate(product, workArrivals, today, horizonTo)

      // Нахождение breach: первый день, где projectedStock < safetyStockDays × rate
      let breachIdx = -1
      for (let i = 0; i < simDays.length; i++) {
        const day = simDays[i]
        const safetyThreshold = safetyStockDays * day.rateRequested
        if (day.stockEnd < safetyThreshold) {
          breachIdx = i
          break
        }
      }

      // Если пробоя нет или он за горизонтом — стоп
      if (breachIdx === -1) break
      const breachDate = simDays[breachIdx].date
      if (breachDate > horizonTo) break

      // ИНВАРИАНТ «не прошлым числом»:
      // orderDate = max(today, breach − leadTimeDays)
      const idealOrderDate = addDays(breachDate, -leadTimeDays)
      const orderDate = idealOrderDate < today ? today : idealOrderDate

      // Флаг «поздний заказ»: arrival после breach → план проседает в окне [breach; arrival]
      const expectedArrivalDate = addDays(orderDate, leadTimeDays)
      const isLate = expectedArrivalDate > breachDate

      // DISMISSED-подавление: если предложение с близким orderDate уже отклонено → стоп
      if (isDismissed(orderDate)) break

      // Нахождение projectedStock на дату прихода (expectedArrivalDate)
      const arrivalSimDay = simDays.find((d) => d.date === expectedArrivalDate)
      const projectedStockAtArrival = arrivalSimDay?.stockEnd ?? 0

      // qty = ceil(Σ rate(d) за [arrival; min(arrival + vpCoverDays, horizonTo)]
      //           + safetyStockDays × rate(arrival) − projectedStock(arrival))
      const coverEnd = addDays(expectedArrivalDate, vpCoverDays)
      const coverEndClamped = coverEnd > horizonTo ? horizonTo : coverEnd
      const arrivalRate = arrivalSimDay?.rateRequested ?? simDays[0]?.rateRequested ?? 0

      // Σ rate(d) за [arrival; min(arrival + vpCoverDays, horizonTo)]
      let sumRateInCover = 0
      for (const d of simDays) {
        if (d.date >= expectedArrivalDate && d.date <= coverEndClamped) {
          sumRateInCover += d.rateRequested
        }
      }

      const qtyRaw = sumRateInCover + safetyStockDays * arrivalRate - projectedStockAtArrival
      const qty = Math.ceil(Math.max(0, qtyRaw))

      // Если qty < minQty → стоп
      if (qty < minQty) break

      // Добавляем предложение
      allSuggestions.push({
        productId: product.productId,
        qty,
        orderDate,
        expectedArrivalDate,
        leadTimeDaysUsed: leadTimeDays,
        unitPrice: product.unitPrice ?? null,
        isLate,
      })

      // Добавляем партию в workArrivals для следующей итерации (roll-forward)
      workArrivals.push({ date: expectedArrivalDate, qty })
    }
  }

  return allSuggestions
}
