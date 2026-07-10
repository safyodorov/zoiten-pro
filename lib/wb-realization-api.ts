// lib/wb-realization-api.ts
// W1 (quick 260710-jgs): клиент WB Finance API sales-reports (отчёт реализации)
// + pure-классификатор строк отчёта по бакетам ИУ-факта для /finance/weekly.
//
// Endpoints (верифицированы 24-RESEARCH, первоисточник dev.wildberries.ru):
//   POST finance-api.wildberries.ru/api/finance/v1/sales-reports/list
//     body { dateFrom, dateTo } (RFC3339 МСК), period default weekly.
//     Деньги в ответе — СТРОКИ → parseMoney. reportId → String (BigInt guard:
//     daily reportId может превышать Number.MAX_SAFE_INTEGER).
//   POST .../sales-reports/detailed/{reportId}
//     пагинация body { rrdId: cursor, limit } → HTTP 204 = конец.
//
// Rate limit: 1 req/мин на ОБА endpoint'а (Персональный/Сервисный токен ТОЛЬКО;
// на базовом sales-reports недоступен). Cooldown bucket "finance-reports" —
// ОТДЕЛЬНЫЙ от 'finance' (balance), чтобы не запирать снапшоты баланса.
// Дисциплина 429 (памятка): ровно ОДИН повтор по Retry-After — blind-retry запрещён.
//
// Pure-хелперы (parseMoney / normalizeRealizationRow / explodeRealizationRow /
// accumulateRealizationRows) — без side-effects, тестируются без сети
// (tests/wb-realization-classify.test.ts).
//
// Классификация — МУЛЬТИ-ПОЛЕ разнос (explode, quick 260710-kvf): WB кладёт
// деньги ПОЛЯМИ на каждой строке (forPay + deliveryService + penalty +
// deduction + … одновременно) — одна строка даёт вклад в НЕСКОЛЬКО бакетов.
// Ground truth: зонд detailed 772161985, 29 014 строк, 2026-07-10.
//
// ⚠ reportDetailByPeriod (v5 supplier report) умирает 15.07.2026 — НЕ использовать.

import { getWbToken } from "@/lib/wb-token"
import {
  getWbCooldownSecondsRemaining,
  setWbCooldownUntil,
} from "@/lib/wb-cooldown"
import { WbRateLimitError } from "@/lib/wb-api"

const REPORTS_BASE = "https://finance-api.wildberries.ru/api/finance/v1/sales-reports"

/**
 * Пауза между ЛЮБЫМИ последовательными вызовами sales-reports (лимит 1 req/мин).
 * Используется в lib/wb-realization-sync.ts между list → detailed и между
 * страницами пагинации detailed.
 */
export const FINANCE_REPORTS_SLEEP_MS = 61_000

// ── Pure-хелперы (без side-effects, тестируются без сети) ──────────────────────

/**
 * Деньги из отчёта реализации: WB отдаёт СТРОКИ ("1234,56" или "1234.56").
 * number — как есть (finite guard); string → замена запятой → parseFloat;
 * null / "" / мусор / прочее → 0.
 */
export function parseMoney(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0
  if (typeof v === "string") {
    const n = parseFloat(v.replace(",", "."))
    return Number.isFinite(n) ? n : 0
  }
  return 0
}

export interface NormalizedRealizationRow {
  nmId: number // 0 = account-level строка без nm_id
  supplierOperName: string
  docTypeName: string
  bonusTypeName: string
  forPay: number
  deliveryRub: number
  storageRub: number
  penaltyRub: number
  acceptanceRub: number
  deductionRub: number
  /** Возмещение издержек по перевозке/складским операциям (диагностика). */
  rebillLogisticCost: number
  quantity: number
}

function asString(v: unknown): string {
  if (typeof v === "string") return v
  if (v == null) return ""
  return String(v)
}

/**
 * Нормализует сырую строку detailed-отчёта: читает и snake_case, и camelCase
 * варианты полей (WB исторически менял нейминг между версиями API),
 * деньги — через parseMoney. Отсутствие nm_id → nmId=0 (account-level).
 *
 * ⚠ Реальный API отдаёт оператора полем `sellerOperName` (ground truth зонда
 * 2026-07-10) — алиас ОБЯЗАТЕЛЕН, без него все операции пустые.
 */
export function normalizeRealizationRow(raw: unknown): NormalizedRealizationRow {
  const r = (raw ?? {}) as Record<string, unknown>
  const nmIdNum = Number(r.nm_id ?? r.nmId ?? 0)
  return {
    nmId: Number.isFinite(nmIdNum) ? Math.trunc(nmIdNum) : 0,
    supplierOperName: asString(
      r.supplier_oper_name ?? r.supplierOperName ?? r.sellerOperName,
    ),
    docTypeName: asString(r.doc_type_name ?? r.docTypeName),
    bonusTypeName: asString(r.bonus_type_name ?? r.bonusTypeName),
    forPay: parseMoney(r.ppvz_for_pay ?? r.forPay),
    deliveryRub: parseMoney(r.delivery_rub ?? r.deliveryRub ?? r.deliveryService),
    storageRub: parseMoney(r.paid_storage ?? r.paidStorage),
    penaltyRub: parseMoney(r.penalty),
    acceptanceRub: parseMoney(r.paid_acceptance ?? r.paidAcceptance),
    deductionRub: parseMoney(r.deduction),
    rebillLogisticCost: parseMoney(r.rebill_logistic_cost ?? r.rebillLogisticCost),
    quantity: Number.isFinite(Number(r.quantity)) ? Number(r.quantity) : 0,
  }
}

export type RealizationBucket =
  | "forPay"
  | "delivery"
  | "storage"
  | "acceptance"
  | "penalty"
  | "reviewPoints"
  | "promotion"
  | "deductionOther"

/**
 * МУЛЬТИ-ПОЛЕ разнос строки отчёта по бакетам (explode, quick 260710-kvf).
 * WB кладёт деньги ПОЛЯМИ на каждой строке — «Продажа» одновременно несёт
 * forPay + deliveryService + penalty и т.д. Каждое ненулевое денежное поле →
 * отдельный вклад в свой бакет.
 *
 * Условие вклада — `!== 0`, НЕ `> 0`: «Возврат» несёт ОТРИЦАТЕЛЬНЫЙ forPay,
 * знак как отдаёт WB, не инвертируем.
 *
 * deduction суб-классифицируется по bonusTypeName (ground truth зонда 2026-07-10):
 *   «Списание за отзыв <id>: акция №…, товар <nmId>» → reviewPoints;
 *   «Оказание услуг «WB Продвижение» / «ВБ.Продвижение»…» → promotion;
 *   прочее → deductionOther.
 *
 * rebillLogisticCost (возмещение издержек по перевозке/складским операциям) →
 * deductionOther: в расчёт ИУ-факта НЕ идёт, только хранится (диагностический
 * бакет для сверки).
 *
 * nmIdOverride: строки «Списание за отзыв» приходят account-level (nmId=0),
 * но WB зашивает артикул в текст bonusTypeName («…, товар 848830964») —
 * извлекаем его регекспом для точной атрибуции вместо распределения по выручке.
 */
export interface RealizationContribution {
  bucket: RealizationBucket
  amountRub: number
  /** Переопределяет nmId строки при аккумуляции (точная атрибуция отзывов). */
  nmIdOverride?: number
}

const REVIEW_NMID_RE = /товар\s+(\d+)/i

export function explodeRealizationRow(
  row: NormalizedRealizationRow,
): RealizationContribution[] {
  const contributions: RealizationContribution[] = []

  if (row.forPay !== 0) contributions.push({ bucket: "forPay", amountRub: row.forPay })
  if (row.deliveryRub !== 0) {
    contributions.push({ bucket: "delivery", amountRub: row.deliveryRub })
  }
  if (row.penaltyRub !== 0) {
    contributions.push({ bucket: "penalty", amountRub: row.penaltyRub })
  }
  if (row.storageRub !== 0) {
    contributions.push({ bucket: "storage", amountRub: row.storageRub })
  }
  if (row.acceptanceRub !== 0) {
    contributions.push({ bucket: "acceptance", amountRub: row.acceptanceRub })
  }
  if (row.deductionRub !== 0) {
    const bonus = row.bonusTypeName.toLowerCase()
    if (bonus.includes("списание за отзыв")) {
      // Точная атрибуция: nmId из текста «…, товар <nmId>» (строка сама nmId=0).
      const m = REVIEW_NMID_RE.exec(row.bonusTypeName)
      const parsed = m ? Number(m[1]) : NaN
      contributions.push({
        bucket: "reviewPoints",
        amountRub: row.deductionRub,
        ...(Number.isFinite(parsed) && parsed > 0 ? { nmIdOverride: parsed } : {}),
      })
    } else {
      contributions.push({
        bucket: bonus.includes("продвижение") ? "promotion" : "deductionOther",
        amountRub: row.deductionRub,
      })
    }
  }
  if (row.rebillLogisticCost !== 0) {
    contributions.push({ bucket: "deductionOther", amountRub: row.rebillLogisticCost })
  }

  return contributions
}

export type RealizationBucketTotals = Record<RealizationBucket, number>

export function emptyRealizationBuckets(): RealizationBucketTotals {
  return {
    forPay: 0,
    delivery: 0,
    storage: 0,
    acceptance: 0,
    penalty: 0,
    reviewPoints: 0,
    promotion: 0,
    deductionOther: 0,
  }
}

/**
 * Разносит строки по бакетам (explode) и суммирует по nmId (nmId=0 —
 * account-level). Возвращает Map<nmId, суммы по 8 бакетам>. Запись в Map
 * создаётся для КАЖДОЙ строки, даже если explode вернул 0 вкладов
 * (строка без денег всё равно фиксирует nmId нулями — поведение прежнее).
 */
export function accumulateRealizationRows(
  rows: NormalizedRealizationRow[],
): Map<number, RealizationBucketTotals> {
  const acc = new Map<number, RealizationBucketTotals>()
  const bucketFor = (nmId: number): RealizationBucketTotals => {
    let totals = acc.get(nmId)
    if (!totals) {
      totals = emptyRealizationBuckets()
      acc.set(nmId, totals)
    }
    return totals
  }
  for (const row of rows) {
    // Запись для nmId строки создаётся всегда (даже без вкладов) — поведение прежнее.
    bucketFor(row.nmId)
    for (const { bucket, amountRub, nmIdOverride } of explodeRealizationRow(row)) {
      bucketFor(nmIdOverride ?? row.nmId)[bucket] += amountRub
    }
  }
  return acc
}

// ── Сетевая часть (НЕ вызывается в тестах) ─────────────────────────────────────

export interface SalesReportListItem {
  reportId: string // string — BigInt guard (daily reportId > 2^53)
  dateFrom: string
  dateTo: string
  createDate: string
  currency: string
  reportType: string
  retailAmountSum: number
  forPaySum: number
  deliveryServiceSum: number
  paidStorageSum: number
  paidAcceptanceSum: number
  deductionSum: number
  penaltySum: number
  paymentSchedule: string
  bankPaymentSum: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/** Читает Retry-After (секунды) из 429-ответа, дефолт 60 (лимит 1 req/мин). */
function parseRetryAfter(res: Response): number {
  const header = res.headers.get("Retry-After") ?? res.headers.get("X-Ratelimit-Retry")
  const parsed = header ? parseInt(header, 10) : NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 60
}

/**
 * Общий вызов sales-reports: cooldown-check bucket "finance-reports" →
 * POST c WB_FINANCE_TOKEN → обработка статусов.
 *
 * 429: на ПЕРВОМ — записываем cooldown, ждём ровно Retry-After и повторяем
 * РОВНО ОДИН раз (памятка rate-limit: blind-retry циклы запрещены). Повторный
 * 429 → WbRateLimitError наверх.
 */
async function callFinanceReports(
  path: string,
  body: unknown,
): Promise<{ status: number; text: string }> {
  const cooldown = await getWbCooldownSecondsRemaining("finance-reports")
  if (cooldown > 0) {
    throw new WbRateLimitError(
      `Finance API sales-reports${path} (cooldown finance-reports)`,
      cooldown,
    )
  }

  const token = await getWbToken("WB_FINANCE_TOKEN")
  const doFetch = () =>
    fetch(`${REPORTS_BASE}${path}`, {
      method: "POST",
      headers: { Authorization: token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

  let res = await doFetch()
  if (res.status === 429) {
    const retryAfter = parseRetryAfter(res)
    await setWbCooldownUntil("finance-reports", retryAfter)
    // Ровно один повтор после ожидания Retry-After.
    await sleep(retryAfter * 1000)
    res = await doFetch()
    if (res.status === 429) {
      const retryAgain = parseRetryAfter(res)
      await setWbCooldownUntil("finance-reports", retryAgain)
      throw new WbRateLimitError(`Finance API sales-reports${path}`, retryAgain)
    }
  }
  if (res.status === 402) {
    throw new Error(
      "WB Finance API 402 Payment Required — проверьте оплату подписки WB API в ЛК",
    )
  }
  if (res.status === 401) {
    throw new Error(
      "WB Finance API 401 — токен без scope «Финансы» или не Персональный/Сервисный " +
        "(sales-reports недоступен на базовом токене)",
    )
  }
  if (res.status === 204) {
    return { status: 204, text: "" }
  }
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`WB Finance API sales-reports${path} → HTTP ${res.status}: ${text}`)
  }
  return { status: res.status, text: await res.text() }
}

/**
 * Список отчётов реализации, пересекающих [dateFrom, dateTo] (обе — "YYYY-MM-DD",
 * конвертируются в RFC3339 МСК). period не передаём → default weekly.
 * BigInt guard: reportId оборачивается в строку ДО JSON.parse.
 */
export async function listSalesReports(
  dateFrom: string,
  dateTo: string,
): Promise<SalesReportListItem[]> {
  const { status, text } = await callFinanceReports("/list", {
    dateFrom: `${dateFrom}T00:00:00+03:00`,
    dateTo: `${dateTo}T00:00:00+03:00`,
  })
  if (status === 204 || !text.trim()) return []

  // BigInt guard: daily reportId > Number.MAX_SAFE_INTEGER — стрингифицируем
  // числовое значение прямо в JSON-тексте до парсинга.
  const guarded = text.replace(/"(reportId|report_id)"\s*:\s*(\d+)/g, '"$1":"$2"')
  const parsed = JSON.parse(guarded) as unknown
  const items: unknown[] = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { data?: unknown[] })?.data)
      ? ((parsed as { data: unknown[] }).data as unknown[])
      : Array.isArray((parsed as { reports?: unknown[] })?.reports)
        ? ((parsed as { reports: unknown[] }).reports as unknown[])
        : []

  return items.map((item) => {
    const r = (item ?? {}) as Record<string, unknown>
    return {
      reportId: asString(r.reportId ?? r.report_id),
      dateFrom: asString(r.dateFrom ?? r.date_from),
      dateTo: asString(r.dateTo ?? r.date_to),
      createDate: asString(r.createDate ?? r.create_date),
      currency: asString(r.currency ?? "RUB"),
      reportType: asString(r.reportType ?? r.report_type),
      retailAmountSum: parseMoney(r.retailAmountSum),
      forPaySum: parseMoney(r.forPaySum),
      deliveryServiceSum: parseMoney(r.deliveryServiceSum),
      paidStorageSum: parseMoney(r.paidStorageSum),
      paidAcceptanceSum: parseMoney(r.paidAcceptanceSum),
      deductionSum: parseMoney(r.deductionSum),
      penaltySum: parseMoney(r.penaltySum),
      paymentSchedule: asString(r.paymentSchedule),
      bankPaymentSum: parseMoney(r.bankPaymentSum),
    }
  })
}

/**
 * Все строки detailed-отчёта. Пагинация: body { rrdId: cursor, limit } →
 * HTTP 204 (или пустая страница) = конец; cursor = rrd_id последней строки.
 * Между страницами пауза FINANCE_REPORTS_SLEEP_MS (1 req/мин).
 */
export async function fetchSalesReportDetailed(reportId: string): Promise<unknown[]> {
  const rows: unknown[] = []
  let cursor = 0
  let firstPage = true

  for (;;) {
    if (!firstPage) await sleep(FINANCE_REPORTS_SLEEP_MS)
    firstPage = false

    const { status, text } = await callFinanceReports(`/detailed/${reportId}`, {
      rrdId: cursor,
      limit: 100_000,
    })
    if (status === 204 || !text.trim()) break

    const parsed = JSON.parse(text) as unknown
    const page: unknown[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray((parsed as { data?: unknown[] })?.data)
        ? ((parsed as { data: unknown[] }).data as unknown[])
        : []
    if (page.length === 0) break

    rows.push(...page)

    const last = (page[page.length - 1] ?? {}) as Record<string, unknown>
    const nextCursor = Number(last.rrd_id ?? last.rrdId ?? 0)
    // Guard от зацикливания: cursor обязан строго расти.
    if (!Number.isFinite(nextCursor) || nextCursor <= cursor) break
    cursor = nextCursor
  }

  return rows
}
