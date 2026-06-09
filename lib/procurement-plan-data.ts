// lib/procurement-plan-data.ts
// Phase 20 (D-10, D-11, D-12): read-only forecast helper для /procurement/plan MVP.
//
// Назначение: собрать товары с дефицитом (Д > 0 по РФ-агрегату из stock-data)
// и обогатить их сроком готовности (leadTimeDays) из привязки поставщика
// (SupplierProductLink), вычислить рекомендованную дату заказа и ETA доставки.
//
// ВАЖНО: v1 — read-only forecast. НИКАКИХ записей в БД из этого помощника
// или страницы плана (RESEARCH Open Question #1 рекомендация).
//
// Архитектура (как в stock-data.ts):
// - buildProcurementPlanRows — pure-ish: принимает уже собранные deficit-строки
//   и карту lead-time per product, без обращения к Prisma.
// - getProcurementPlanData — RSC-обёртка: тянет stock-данные + SupplierProductLink,
//   считает дефицит через calculateStockMetrics, вызывает buildProcurementPlanRows.

import { getMskTodayString } from "@/lib/wb-cron-schedule"

// ──────────────────────────────────────────────────────────────────
// Types (публичный контракт для ProcurementPlanTable)
// ──────────────────────────────────────────────────────────────────

/** Источник: дефицитный товар (РФ-агрегат) + его lead-time от поставщика. */
export interface ProcurementPlanInput {
  productId: string
  sku: string
  name: string
  brandName: string
  categoryName: string | null
  subcategoryName: string | null
  /** Д дефицит в штуках (РФ-агрегат, до округления). */
  deficit: number
  /** Срок готовности (дней) — из primary SupplierProductLink (min leadTimeDays). */
  leadTimeDays: number | null
  /** Поставщик (nameEnglish) по выбранной привязке. null если нет привязки. */
  supplierName: string | null
}

export interface ProcurementPlanRow {
  productId: string
  sku: string
  name: string
  brandName: string
  categoryName: string | null
  subcategoryName: string | null
  /** Д дефицит, целое (Math.trunc per CLAUDE.md «Форматирование чисел»). */
  deficit: number
  leadTimeDays: number | null
  supplierName: string | null
  /** Рекомендованная дата заказа: сегодня (МСК), т.к. дефицит уже есть. ISO YYYY-MM-DD. */
  orderByDate: string
  /** ETA прихода: сегодня + leadTimeDays (МСК). null если leadTimeDays неизвестен. ISO YYYY-MM-DD. */
  deliveryEta: string | null
}

// ──────────────────────────────────────────────────────────────────
// Pure assembly helper
// ──────────────────────────────────────────────────────────────────

/** Прибавить N дней к ISO-дате YYYY-MM-DD (UTC-арифметика, безопасно для дат). */
function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map((s) => parseInt(s, 10))
  const base = Date.UTC(y, m - 1, d)
  const next = new Date(base + days * 86_400_000)
  const yy = next.getUTCFullYear()
  const mo = String(next.getUTCMonth() + 1).padStart(2, "0")
  const dd = String(next.getUTCDate()).padStart(2, "0")
  return `${yy}-${mo}-${dd}`
}

/**
 * Собирает строки плана закупок из дефицитных товаров.
 * Pure: не обращается к Prisma. Принимает уже посчитанный deficit + lead-time.
 *
 * @param products — товары с дефицитом Д > 0 и (опционально) lead-time поставщика
 * @param today — текущая дата МСК (YYYY-MM-DD); по умолчанию getMskTodayString()
 */
export function buildProcurementPlanRows(
  { products }: { products: ProcurementPlanInput[] },
  today: string = getMskTodayString(),
): ProcurementPlanRow[] {
  return products
    .filter((p) => p.deficit > 0)
    .map((p) => {
      const deliveryEta =
        p.leadTimeDays !== null && p.leadTimeDays >= 0
          ? addDaysIso(today, p.leadTimeDays)
          : null
      return {
        productId: p.productId,
        sku: p.sku,
        name: p.name,
        brandName: p.brandName,
        categoryName: p.categoryName,
        subcategoryName: p.subcategoryName,
        deficit: Math.trunc(p.deficit),
        leadTimeDays: p.leadTimeDays,
        supplierName: p.supplierName,
        // Рекомендованная дата заказа = сегодня (дефицит уже наступил).
        orderByDate: today,
        deliveryEta,
      }
    })
}
