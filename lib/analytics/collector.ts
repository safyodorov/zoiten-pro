// lib/analytics/collector.ts
// Phase 30 (analytics) — оркестратор сбора прогона ниши (ANL-05, ANL-07).
// Статус-машина (D-02): PENDING → COLLECTING → READY | PARTIAL | FAILED.
// Собирает по 30 SKU из ТРЁХ источников:
//   • воронка — из detail-JSON (движок aggregateFunnel, объёмы = месяц÷30 через monthlyTotals);
//   • позиции/запросы — MPSTATS by_keywords (1 вызов/SKU, лимит ловится → SKU без позиций, прогон не падает);
//   • медиа+продавец — basket-CDN card.json (per-SKU, без rate-limit).
// Сверка цены/рейтинга — ОДИН verifyPricesBatch на все 30 nmId ВНЕ цикла (T-30-16, анти-rate-limit).
// Правило полноты (ANL-07): сбой в топ-10 по выручке → FAILED (payload НЕ пишется);
// в 11–30 → PARTIAL (payload + incompleteSkus); иначе READY.
import { prisma } from "@/lib/prisma"
import { aggregateFunnel, evaluateCompleteness } from "./engine"
import { fetchNicheQueries, MpstatsRateLimitError } from "./mpstats"
import { scanCardMedia, verifyPricesBatch } from "./wb-card-scan"
import { buildNicheRunPayload } from "./snapshot"
import {
  WALLET_PRICE_FACTOR,
  type FunnelDayRaw,
  type FunnelMonthTotals,
  type QueryPositionSeries,
  type SkuPayload,
  type SkuCompletenessInput,
} from "./types"
import type { CommonParamNormalized } from "./data"

export interface CollectNicheRunInput {
  skus: number[]
  byDayByNmId: Map<number, FunnelDayRaw[]>
  monthlyTotalsByNmId: Map<number, FunnelMonthTotals>
  commonParamsByNmId: Map<number, CommonParamNormalized>
  dateFrom: string
  dateTo: string
  mpstatsToken: string
}

const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0)

/**
 * Собирает прогон ниши и пишет статус/снапшот в NicheRun.
 * Ошибка отдельного SKU (в т.ч. MpstatsRateLimitError / недоступность card.json) ловится и
 * помечает SKU неполным — весь прогон НЕ падает, деградирует по правилу полноты.
 */
export async function collectNicheRun(runId: string, input: CollectNicheRunInput): Promise<void> {
  const { skus, byDayByNmId, monthlyTotalsByNmId, commonParamsByNmId, dateFrom, dateTo, mpstatsToken } =
    input

  try {
    await prisma.nicheRun.update({
      where: { id: runId },
      data: { status: "COLLECTING", skuCount: skus.length, progressNote: "Старт сбора…", errorMessage: null },
    })

    // ── Сверка цены/рейтинга: ОДИН батч-вызов на ВСЕ nmId (вне SKU-цикла, T-30-16) ──
    const priceVerify = await verifyPricesBatch(skus)

    // ── Сбор по SKU (последовательно — умеренная нагрузка на лимит MPSTATS, D-03) ──
    const collected: SkuPayload[] = []
    let mpstatsOk = 0
    let cardsOk = 0

    for (let i = 0; i < skus.length; i++) {
      const nmId = skus[i]
      const cp = commonParamsByNmId.get(nmId)
      const byDay = byDayByNmId.get(nmId) ?? []
      const monthly = monthlyTotalsByNmId.get(nmId)

      // 1) Позиции/запросы MPSTATS (лимит/ошибка → пустой список, SKU остаётся, прогон жив).
      let queries: QueryPositionSeries[] = []
      try {
        queries = await fetchNicheQueries(nmId, dateFrom, dateTo, mpstatsToken)
        mpstatsOk++
      } catch (e) {
        if (!(e instanceof MpstatsRateLimitError)) {
          // прочие ошибки MPSTATS тоже не роняют прогон — SKU без позиций
        }
      }

      // 2) Медиа + продавец из card.json (basket — без rate-limit; провал → без фото/характеристик).
      let listingPhotos: string[] = []
      let characteristics: SkuPayload["characteristics"] = []
      let seller = ""
      try {
        const media = await scanCardMedia(nmId, cp?.mainPhoto)
        listingPhotos = media.listingPhotos
        characteristics = media.characteristics
        seller = media.seller
        if (listingPhotos.length > 0) cardsOk++
      } catch {
        // card.json недоступен — SKU неполон по медиа
      }

      // 3) Агрегат воронки (объёмы = месяц÷30 через monthly; конверсии «от сумм»).
      const funnel = aggregateFunnel(byDay, monthly)
      const revenue = monthly?.ordersSum ?? sum(byDay.map((d) => d.ordersSum))
      const priceDays = byDay.map((d) => ({ dt: d.dt, value: d.medianPrice * WALLET_PRICE_FACTOR }))

      // Цена/рейтинг ПЕРВИЧНО из detail-JSON (D-04); verify — сверка/fallback.
      const pv = priceVerify.get(nmId)
      const rating = cp?.nmRating ?? pv?.rating ?? null
      const feedbacksCount = cp?.feedbacksCount ?? pv?.feedbacks ?? null

      const hasFunnel = byDay.length > 0
      const hasPhotos = listingPhotos.length > 0
      const hasCharacteristics = characteristics.length > 0
      const hasPositions = queries.length > 0
      const reasons: string[] = []
      if (!hasFunnel) reasons.push("нет воронки")
      if (!hasPhotos) reasons.push("нет фото")
      if (!hasCharacteristics) reasons.push("нет характеристик")
      if (!hasPositions) reasons.push("нет позиций MPSTATS")
      const complete = hasFunnel && hasPhotos && hasCharacteristics && hasPositions

      collected.push({
        nmId,
        brand: cp?.brandName ?? "",
        seller,
        subject: cp?.item || cp?.subject || "",
        name: cp?.nmName ?? "",
        rating,
        feedbacksCount,
        mainPhoto: cp?.mainPhoto ?? "",
        listingPhotos,
        characteristics,
        funnel,
        funnelDays: byDay,
        priceDays,
        queries,
        revenue,
        complete,
        ...(reasons.length > 0 ? { incompleteReasons: reasons } : {}),
      })

      // progress polling
      await prisma.nicheRun.update({
        where: { id: runId },
        data: { progressNote: `MPSTATS ${mpstatsOk}/${skus.length}, карточки ${cardsOk}/${skus.length}` },
      })
    }

    // ── Правило полноты по рангу выручки (ANL-07) ──
    const completenessInput: SkuCompletenessInput[] = collected.map((s) => ({
      nmId: s.nmId,
      revenue: s.revenue,
      complete: s.complete,
    }))
    const verdict = evaluateCompleteness(completenessInput)

    const incompleteSkus = collected
      .filter((s) => !s.complete)
      .map((s) => ({ nmId: s.nmId, reason: (s.incompleteReasons ?? []).join(", ") }))

    if (verdict.status === "FAILED") {
      // Сбой в топ-10 → снапшот НЕ пишется (данные ввели бы в заблуждение).
      const top10 = incompleteSkus.filter((s) => verdict.failedInTop10.includes(s.nmId))
      await prisma.nicheRun.update({
        where: { id: runId },
        data: {
          status: "FAILED",
          progressNote: null,
          incompleteSkus: incompleteSkus as never,
          errorMessage: `Сбор топ-10 неполный: ${top10.map((s) => `nmId ${s.nmId} (${s.reason})`).join("; ")}`,
        },
      })
      return
    }

    const payload = buildNicheRunPayload(collected, dateFrom, dateTo)
    await prisma.nicheRun.update({
      where: { id: runId },
      data: {
        status: verdict.status === "PARTIAL" ? "PARTIAL" : "READY",
        progressNote: null,
        payloadJson: payload as never,
        incompleteSkus: verdict.status === "PARTIAL" ? (incompleteSkus as never) : undefined,
        errorMessage: null,
      },
    })
  } catch (e) {
    // Непредвиденный сбой всего прогона → FAILED с сообщением (снапшот не пишется).
    await prisma.nicheRun.update({
      where: { id: runId },
      data: {
        status: "FAILED",
        progressNote: null,
        errorMessage: e instanceof Error ? e.message : "неизвестная ошибка сбора",
      },
    })
  }
}
