// lib/sales-plan/arrivals.ts
//
// Резолвер дат приходов: resolveArrivalBatches()
// Pure (не async) — принимает уже загруженные данные.
// Ноль импортов Prisma / React / Next.
//
// Fallback-цепочка (§3.4 RESEARCH):
//   1. plannedArrivalDate (ручной план — приоритет) → dateSource "manual"
//   2. TRANSIT.date + transitDays (только qty>0 И date≠null) → "transit-eta"
//      Частичный TRANSIT → сплит на 2 партии (transit-eta + leadtime-eta)
//   3. createdAt + leadTimeDays → "leadtime-eta"
//   4. legacyIncoming.expectedDate → "legacy-expected" (одна открытая закупка)
//   5. null → партия не создаётся
//
// Phase 25 (План продаж v2, 2026-07)

import type { ArrivalBatch } from "./types"
import { addDays } from "./dates"
import { currentStageOf } from "@/lib/purchase-stages"

// ── Типы входа (не полный Prisma-объект, только нужные поля) ─────────────────

interface PurchaseInput {
  id: string
  plannedArrivalDate: string | null   // ISO "2026-08-15" или null
  createdAt: string | null            // ISO дата создания закупки
  qtyRemaining: number
  transitQty: number                  // кол-во в транзите (0 если нет)
  transitDate: string | null          // дата TRANSIT-этапа (null если нет)
  leadTimeDays: number | null         // lead time per SupplierProductLink; null → использовать default
  reachedStages: string[]             // ключи достигнутых этапов item'а (PurchaseItemStageProgress.stage)
}

interface VirtualPurchaseInput {
  id: string
  qty: number
  expectedArrivalDate: string
  status: "SUGGESTED" | "ACCEPTED" | "DISMISSED" | "CONVERTED"
}

interface LegacyIncoming {
  expectedDate: string
  qty: number
}

export interface ArrivalBatchesInput {
  productId: string
  purchases: PurchaseInput[]
  virtualPurchases: VirtualPurchaseInput[]
  legacyIncoming: LegacyIncoming | null
  wbInboundLagDays: number       // добавляется ко всем датам
  transitDays: number             // default 20 — транзит после TRANSIT.date
  defaultLeadTimeDays: number    // default 45 — fallback lead time заказ→Иваново
  today: string                  // ISO "YYYY-MM-DD" — для floor неотгруженных
}

// ── resolveArrivalBatches ─────────────────────────────────────────────────────

/**
 * Формирует массив ArrivalBatch для товара из загруженных данных.
 *
 * Порядок приоритетов per закупка:
 *   1. plannedArrivalDate → "manual"
 *   2. TRANSIT.date + transitDays → "transit-eta" (с возможным сплитом на остаток → "leadtime-eta")
 *   3. createdAt + leadTimeDays → "leadtime-eta"
 *   4. legacyIncoming.expectedDate → "legacy-expected" (только при одной открытой закупке без дат)
 *   5. нет даты → партия не создаётся
 *
 * Ко всем датам добавляется wbInboundLagDays.
 */
export function resolveArrivalBatches(input: ArrivalBatchesInput): ArrivalBatch[] {
  const {
    purchases,
    virtualPurchases,
    legacyIncoming,
    wbInboundLagDays,
    transitDays,
    defaultLeadTimeDays,
    today,
  } = input

  const result: ArrivalBatch[] = []

  // ── Реальные закупки ──────────────────────────────────────────────────────
  for (const pur of purchases) {
    const qtyRemaining = pur.qtyRemaining
    if (qtyRemaining <= 0) continue

    let resolved = false

    // Уровень 1: plannedArrivalDate (ручной план — приоритет)
    if (pur.plannedArrivalDate != null) {
      const date = applyLag(pur.plannedArrivalDate, wbInboundLagDays)
      result.push({
        date,
        qty: qtyRemaining,
        source: "purchase",
        refId: pur.id,
        dateSource: "manual",
      })
      resolved = true
    }

    if (resolved) continue

    // Уровень 2: TRANSIT.date + transitDays (только если transitQty > 0 И transitDate ≠ null)
    if (pur.transitQty > 0 && pur.transitDate != null) {
      const transitArrivalDate = applyLag(addDays(pur.transitDate, transitDays), wbInboundLagDays)

      if (pur.transitQty >= qtyRemaining) {
        // Весь остаток в транзите
        result.push({
          date: transitArrivalDate,
          qty: qtyRemaining,
          source: "purchase",
          refId: pur.id,
          dateSource: "transit-eta",
        })
        resolved = true
      } else {
        // Частичный TRANSIT: сплит на 2 партии
        const transitPart = pur.transitQty
        const remainderPart = qtyRemaining - pur.transitQty

        // Транзит-партия
        result.push({
          date: transitArrivalDate,
          qty: transitPart,
          source: "purchase",
          refId: pur.id,
          dateSource: "transit-eta",
        })

        // Остаток → уровень 3 (leadtime-eta)
        const leadtimeDate = resolveLeadtimeDate(pur, defaultLeadTimeDays, wbInboundLagDays, today, transitDays)
        if (leadtimeDate != null) {
          result.push({
            date: leadtimeDate,
            qty: remainderPart,
            source: "purchase",
            refId: pur.id,
            dateSource: "leadtime-eta",
          })
        }
        // Если leadtime тоже нет даты — остаток не моделируется
        resolved = true
      }
    }

    if (resolved) continue

    // TRANSIT.qty > 0 но date = null → пропустить уровень 2 целиком
    // (transitQty = 0 тоже пропускается — условие выше не выполнится)

    // Уровень 3: createdAt + leadTimeDays
    const leadtimeDate = resolveLeadtimeDate(pur, defaultLeadTimeDays, wbInboundLagDays, today, transitDays)
    if (leadtimeDate != null) {
      result.push({
        date: leadtimeDate,
        qty: qtyRemaining,
        source: "purchase",
        refId: pur.id,
        dateSource: "leadtime-eta",
      })
      resolved = true
    }

    if (resolved) continue

    // Уровень 4: legacyIncoming.expectedDate (только если одна открытая закупка)
    if (legacyIncoming != null && purchases.length === 1) {
      const date = applyLag(legacyIncoming.expectedDate, wbInboundLagDays)
      result.push({
        date,
        qty: qtyRemaining,
        source: "incoming-legacy",
        refId: pur.id,
        dateSource: "legacy-expected",
      })
      resolved = true
    }

    // Уровень 5: нет даты → партия не создаётся (resolved остаётся false, ничего не добавляем)
    void resolved
  }

  // ── Виртуальные закупки (SUGGESTED + ACCEPTED) ───────────────────────────
  for (const vp of virtualPurchases) {
    if (vp.status !== "SUGGESTED" && vp.status !== "ACCEPTED") continue
    const date = applyLag(vp.expectedArrivalDate, wbInboundLagDays)
    result.push({
      date,
      qty: vp.qty,
      source: "virtual",
      refId: vp.id,
      dateSource: "manual",
    })
  }

  return result
}

// ── Хелперы ─────────────────────────────────────────────────────────────────

/** Применяет wbInboundLagDays к дате (если lag = 0 — возвращает оригинал). */
function applyLag(date: string, lagDays: number): string {
  if (lagDays === 0) return date
  return addDays(date, lagDays)
}

/**
 * Пытается получить дату через уровень 3: createdAt + leadTimeDays.
 * Применяет floor по текущему этапу (D-1): неотгруженные не могут «прийти раньше today+transit/leadtime».
 * Возвращает null если createdAt отсутствует.
 *
 * Floor-логика:
 *   - SHIPMENT → floor = today + transitDays
 *   - PRODUCTION / INSPECTION / нет этапов («Заказано») → floor = today + defaultLeadTimeDays
 *   - plannedArrivalDate (уровень 1) → floor НЕ применяется (эта функция не вызывается).
 *   - max(createdAt+leadTime, floor) — берётся позднейшая дата.
 */
function resolveLeadtimeDate(
  pur: PurchaseInput,
  defaultLeadTimeDays: number,
  wbInboundLagDays: number,
  today: string,
  transitDays: number,
): string | null {
  if (pur.createdAt == null) return null
  const lt = pur.leadTimeDays ?? defaultLeadTimeDays
  const rawLeadtime = addDays(pur.createdAt, lt) // createdAt + leadTime

  // Floor по текущему этапу (currentStageOf по достигнутым этапам item'а):
  //   SHIPMENT → today + transitDays
  //   PRODUCTION / INSPECTION / нет этапов («Заказано») → today + defaultLeadTimeDays
  //   TRANSIT / WAREHOUSE → не попадают на практике (TRANSIT уровень 2, WAREHOUSE вычитается); fallback defaultLeadTimeDays
  const stage = currentStageOf(pur.reachedStages)
  const floor = stage === "SHIPMENT"
    ? addDays(today, transitDays)
    : addDays(today, defaultLeadTimeDays)

  // max(createdAt+leadTime, floor) — берём позднейшую (строковое сравнение ISO валидно)
  const chosen = rawLeadtime > floor ? rawLeadtime : floor
  return applyLag(chosen, wbInboundLagDays)
}
