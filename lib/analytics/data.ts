// lib/analytics/data.ts
// Phase 30 (analytics) — парсер/валидатор detail-JSON («Сравнение карточек» WB) + извлечение топ-30.
// Границы доверия: JSON приходит от клиента (загрузка файлов) — недоверенный ввод (T-30-09, T-30-02).
// zod отклоняет неизвестную структуру ЯВНЫМ сообщением (не «тихая» деградация — Pitfall #7/#8).
// Паттерн zod-схем — lib/pricing-schemas.ts. Имена полей сверены с фикстурой Wave 0
// (tests/fixtures/analytics-detail-sample-1.json): byDay/byMonth используют `nmID` (капс ID).
import { z } from "zod"
import type { FunnelDayRaw, FunnelMonthTotals } from "./types"

// ──────────────────────────────────────────────────────────────────
// Нормализованные формы, извлекаемые из одного файла
// ──────────────────────────────────────────────────────────────────

/** commonParams одного SKU — нормализованный субсет (полные объекты {current} схлопнуты). */
export interface CommonParamNormalized {
  nmId: number
  nmName: string
  mainPhoto: string
  subject: string
  item: string
  brandName: string
  nmRating: number | null
  feedbacksCount: number | null
  medianPrice: number | null
}

/** Результат разбора одного detail-файла. */
export interface ParsedDetail {
  nmIds: number[] // уникальные nmID из byDay
  byDay: FunnelDayRaw[]
  monthByNmId: Map<number, FunnelMonthTotals>
  commonParams: CommonParamNormalized[]
  dateFrom: string // min(dt) в byDay
  dateTo: string // max(dt) в byDay
}

/** Итог сборки топ-30 из 6 файлов. Контракт для upload-route (30-08) и коллектора (30-07). */
export interface Top30Result {
  skus: number[] // ровно 30 уникальных nmID
  byDayByNmId: Map<number, FunnelDayRaw[]>
  monthlyTotalsByNmId: Map<number, FunnelMonthTotals> // движок 30-03 делит на константу 30
  commonParamsByNmId: Map<number, CommonParamNormalized>
  dateFrom: string
  dateTo: string
}

export const REQUIRED_FILE_COUNT = 6 as const
export const REQUIRED_SKU_COUNT = 30 as const

// ──────────────────────────────────────────────────────────────────
// zod схемы (строгие на читаемых полях, passthrough на остальном)
// ──────────────────────────────────────────────────────────────────

const byDayRowSchema = z
  .object({
    nmID: z.number().int().positive(), // T-30-02: единственный доверенный источник nmID
    dt: z.string().min(1),
    openCard: z.number(),
    addToCart: z.number(),
    orders: z.number(),
    ordersSum: z.number(),
    buyoutCount: z.number(),
    viewCount: z.number(),
    medianPrice: z.number(),
  })
  .passthrough()

const byMonthRowSchema = z
  .object({
    nmID: z.number().int().positive(),
    viewCount: z.number(),
    orders: z.number(),
    ordersSum: z.number(),
  })
  .passthrough()

const commonParamSchema = z
  .object({
    nmId: z.number().int().positive(),
  })
  .passthrough()

const detailFileSchema = z
  .object({
    data: z
      .object({
        salesFunnel: z
          .object({
            byDay: z.array(byDayRowSchema).min(1),
            byMonth: z.array(byMonthRowSchema),
          })
          .passthrough(),
        commonParams: z.array(commonParamSchema),
      })
      .passthrough(),
  })
  .passthrough()

/** Человекочитаемое сообщение из ZodError — путь + текст первой проблемы. */
function formatZodError(err: z.ZodError): string {
  const first = err.issues[0]
  const path = first?.path?.join(".") || "(root)"
  return `невалидная структура detail-файла: поле «${path}» — ${first?.message ?? "не распознано"}`
}

/** Из значения-объекта {current} или числа достаём число; иначе null. */
function pickNumber(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v
  if (v && typeof v === "object" && "current" in v) {
    const c = (v as { current: unknown }).current
    if (typeof c === "number" && Number.isFinite(c)) return c
  }
  return null
}

function pickString(v: unknown): string {
  return typeof v === "string" ? v : ""
}

// ──────────────────────────────────────────────────────────────────
// Публичный API
// ──────────────────────────────────────────────────────────────────

/**
 * Разбирает и валидирует один detail-JSON.
 * Извлекает посуточную воронку (byDay), месячные тоталы (byMonth → сумма всех строк per nmID —
 * равна Σ(byDay), устойчиво к окну, пересекающему календарные месяцы) и commonParams.
 * Битая структура → throw с явным сообщением (какое поле).
 */
export function parseDetailFile(raw: unknown): ParsedDetail {
  // Явный guard основного структурного контракта — самое частое сообщение об ошибке.
  const anyRaw = raw as { data?: { salesFunnel?: { byDay?: unknown } } } | null | undefined
  const byDayRaw = anyRaw?.data?.salesFunnel?.byDay
  if (!Array.isArray(byDayRaw) || byDayRaw.length === 0) {
    throw new Error("структура файла не распознана (нет salesFunnel.byDay)")
  }

  const parsed = detailFileSchema.safeParse(raw)
  if (!parsed.success) {
    throw new Error(formatZodError(parsed.error))
  }
  const { salesFunnel, commonParams } = parsed.data.data

  // byDay → FunnelDayRaw[]
  const byDay: FunnelDayRaw[] = salesFunnel.byDay.map((r) => ({
    nmId: r.nmID,
    dt: r.dt,
    viewCount: r.viewCount,
    openCard: r.openCard,
    addToCart: r.addToCart,
    orders: r.orders,
    ordersSum: r.ordersSum,
    buyoutCount: r.buyoutCount,
    medianPrice: r.medianPrice,
  }))

  // byMonth → сумма строк per nmID (= Σ byDay; см. Wave 0 notes §3).
  const monthByNmId = new Map<number, FunnelMonthTotals>()
  for (const r of salesFunnel.byMonth) {
    const acc = monthByNmId.get(r.nmID) ?? { viewCount: 0, orders: 0, ordersSum: 0 }
    acc.viewCount += r.viewCount
    acc.orders += r.orders
    acc.ordersSum += r.ordersSum
    monthByNmId.set(r.nmID, acc)
  }

  // commonParams → нормализованный субсет.
  const commonParamsNorm: CommonParamNormalized[] = commonParams.map((c) => {
    const o = c as Record<string, unknown>
    return {
      nmId: o.nmId as number,
      nmName: pickString(o.nmName),
      mainPhoto: pickString(o.mainPhoto),
      subject: pickString(o.subject),
      item: pickString(o.item),
      brandName: pickString(o.brandName),
      nmRating: pickNumber(o.nmRating),
      feedbacksCount: pickNumber(o.feedbacksCount),
      medianPrice: pickNumber(o.medianPrice),
    }
  })

  // Уникальные nmID + период из byDay.
  const nmIds = [...new Set(byDay.map((d) => d.nmId))]
  const dts = byDay.map((d) => d.dt).sort()
  const dateFrom = dts[0]
  const dateTo = dts[dts.length - 1]

  return { nmIds, byDay, monthByNmId, commonParams: commonParamsNorm, dateFrom, dateTo }
}

/**
 * Кросс-файловая дедупликация: накопительное множество nmID.
 * Повтор nmID между файлами → throw с указанием дублирующегося nmID (Pitfall #8 — не терять «тихо»).
 */
export function mergeDetailFiles(files: ParsedDetail[]): number[] {
  const seen = new Set<number>()
  for (const f of files) {
    for (const nm of f.nmIds) {
      if (seen.has(nm)) {
        throw new Error(`дубликат nmID ${nm} встречается в нескольких файлах`)
      }
      seen.add(nm)
    }
  }
  return [...seen]
}

/**
 * Собирает топ-30 из ровно 6 detail-файлов (ANL-01).
 * Требует: 6 файлов, единый период (строгое равенство окон byDay — Open Q#2), ровно 30 уникальных SKU.
 * Любой сбой → явный throw (не «тихая» деградация состава ниши).
 */
export function extractTop30(rawFiles: unknown[]): Top30Result {
  if (!Array.isArray(rawFiles) || rawFiles.length !== REQUIRED_FILE_COUNT) {
    throw new Error(
      `нужно ровно ${REQUIRED_FILE_COUNT} файлов (получено ${Array.isArray(rawFiles) ? rawFiles.length : 0})`,
    )
  }

  const parsed = rawFiles.map((r) => parseDetailFile(r))

  // Единый период: все окна byDay должны совпадать (строгий вариант).
  const from = parsed[0].dateFrom
  const to = parsed[0].dateTo
  for (const p of parsed) {
    if (p.dateFrom !== from || p.dateTo !== to) {
      throw new Error(
        `периоды файлов не совпадают: ожидалось ${from}..${to}, встречено ${p.dateFrom}..${p.dateTo}`,
      )
    }
  }

  // Кросс-файловая дедупликация (throw на повторе).
  const skus = mergeDetailFiles(parsed)
  if (skus.length !== REQUIRED_SKU_COUNT) {
    throw new Error(`получено ${skus.length} уникальных SKU из ${REQUIRED_SKU_COUNT}`)
  }

  const byDayByNmId = new Map<number, FunnelDayRaw[]>()
  const monthlyTotalsByNmId = new Map<number, FunnelMonthTotals>()
  const commonParamsByNmId = new Map<number, CommonParamNormalized>()
  for (const p of parsed) {
    for (const d of p.byDay) {
      const arr = byDayByNmId.get(d.nmId) ?? []
      arr.push(d)
      byDayByNmId.set(d.nmId, arr)
    }
    for (const [nm, tot] of p.monthByNmId) monthlyTotalsByNmId.set(nm, tot)
    for (const c of p.commonParams) commonParamsByNmId.set(c.nmId, c)
  }

  return { skus, byDayByNmId, monthlyTotalsByNmId, commonParamsByNmId, dateFrom: from, dateTo: to }
}
