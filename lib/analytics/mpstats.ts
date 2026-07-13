// lib/analytics/mpstats.ts
// Phase 30 (analytics) — MPSTATS-клиент (ANL-03). Пути/форма ответа ПОДТВЕРЖДЕНЫ в Wave 0
// (30-01-WAVE0-NOTES.md §1), НЕ по догадке. Один вызов by_keywords на SKU покрывает и позиции,
// и список запросов ниши с частотностью.
// Границы доверия: сервер → MPSTATS. Токен — только параметр функции (DI), не читает БД, не логируется (T-30-01).
// 429/исчерпание тарифа → MpstatsRateLimitError без падения прогона (T-30-04); коллектор (30-07) деградирует по правилу полноты.
import { averagePositionByQuery } from "./engine"
import type { PositionDay, QueryPositionSeries, AdPosition } from "./types"

/** База MPSTATS (подтверждена Wave 0 + independent sources). */
export const MPSTATS_BASE = "https://mpstats.io/api/wb"
/** Порог частотности ниши (ANL-03): оставляем запросы с частотностью > 500. */
export const MIN_QUERY_FREQUENCY = 500

/** Лимит тарифа MPSTATS исчерпан (HTTP 429). Отдельный тип — коллектор ловит именно его. */
export class MpstatsRateLimitError extends Error {
  constructor() {
    super("MPSTATS: лимит тарифа исчерпан (429)")
    this.name = "MpstatsRateLimitError"
  }
}

/** Сырой формат words[query] из by_keywords (Wave 0). Все ряды выровнены по days_formatted. */
interface RawWordEntry {
  organic_pos?: number[] // органическая позиция по дням (0 = нет в органике)
  auto?: Array<[number, number, string, number] | number[] | null> // [cpm, ?, ad_type, position]
  ad_type?: string[]
  wb_count?: number // агрегатная частотность WB (фильтр > 500)
  norm_query?: string
}

interface RawByKeywords {
  words?: Record<string, RawWordEntry>
  days_formatted?: string[]
}

/** DI-инъекция fetch для контрактных тестов; по умолчанию — глобальный fetch. */
type FetchImpl = typeof fetch

/** Общий GET к MPSTATS: заголовок X-Mpstats-TOKEN; 429 → MpstatsRateLimitError; !ok → Error(status+body). */
async function mpstatsFetch<T>(path: string, token: string, fetchImpl: FetchImpl = fetch): Promise<T> {
  const res = await fetchImpl(`${MPSTATS_BASE}${path}`, {
    headers: { "X-Mpstats-TOKEN": token },
  })
  if (res.status === 429) throw new MpstatsRateLimitError()
  if (!res.ok) throw new Error(`MPSTATS ${res.status}: ${await res.text()}`)
  return (await res.json()) as T
}

/** Путь by_keywords с окном дат = период файлов (d1/d2). */
export function buildByKeywordsPath(nmId: number, d1: string, d2: string): string {
  return `/get/item/${nmId}/by_keywords?d1=${d1}&d2=${d2}`
}

/** Рекламная позиция дня из auto[i] = [cpm, ?, ad_type, position]. position≤0 → нет рекламы (null). */
function adFromAuto(el: unknown): AdPosition | null {
  if (!Array.isArray(el)) return null
  const cpm = typeof el[0] === "number" ? el[0] : 0
  const placementType = typeof el[2] === "string" ? el[2] : ""
  const position = typeof el[3] === "number" ? el[3] : 0
  if (position <= 0) return null
  return { position, cpm, placementType, boostPosition: position }
}

/**
 * PURE: маппит words → QueryPositionSeries[] (organic/ad по дням + частотность + avgPosition).
 * organic_pos[i] ≤ 0 → organic:null (отсутствие в выдаче — не штрафует среднюю позицию, ANL-10).
 * Экспортируется для тестируемости и для склейки страниц (несколько words-объектов).
 */
export function mapWordsToSeries(raw: RawByKeywords): QueryPositionSeries[] {
  const axis = raw.days_formatted ?? []
  const words = raw.words ?? {}
  return Object.entries(words).map(([query, entry]) => {
    const organic = entry.organic_pos ?? []
    const auto = entry.auto ?? []
    const days: PositionDay[] = axis.map((dt, i) => {
      const org = typeof organic[i] === "number" && organic[i] > 0 ? organic[i] : null
      return { dt, organic: org, ad: adFromAuto(auto[i]) }
    })
    return {
      query,
      frequency: typeof entry.wb_count === "number" ? entry.wb_count : 0,
      days,
      avgPosition: averagePositionByQuery(days),
    }
  })
}

/**
 * Список запросов ниши по SKU с частотностью > 500 (ANL-03).
 * Один вызов by_keywords покрывает ≤200 запросов (Wave 0) — этого достаточно для топа ниши,
 * пагинация не требуется (подтверждено спайком).
 */
export async function fetchNicheQueries(
  nmId: number,
  d1: string,
  d2: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<QueryPositionSeries[]> {
  const raw = await mpstatsFetch<RawByKeywords>(buildByKeywordsPath(nmId, d1, d2), token, fetchImpl)
  return mapWordsToSeries(raw).filter((q) => q.frequency > MIN_QUERY_FREQUENCY)
}

/**
 * Дневной ряд позиций SKU по его основному (самому частотному) запросу — organic + ad.
 * Возвращает [] если у SKU нет запросов. Использует тот же by_keywords-вызов.
 */
export async function fetchPositions(
  nmId: number,
  d1: string,
  d2: string,
  token: string,
  fetchImpl: FetchImpl = fetch,
): Promise<PositionDay[]> {
  const raw = await mpstatsFetch<RawByKeywords>(buildByKeywordsPath(nmId, d1, d2), token, fetchImpl)
  const series = mapWordsToSeries(raw)
  if (series.length === 0) return []
  const headline = series.reduce((a, b) => (b.frequency > a.frequency ? b : a))
  return headline.days
}
