// Phase 19+ 2026-05-20: Orchestration для GET /adv/v1/upd (история списаний).
// Один запрос за период (max 31 день) возвращает все списания — нет batch
// rotation, нет per-advertId sweep. Идемпотентность через DELETE+INSERT
// в транзакции по effectiveDate range.

import { prisma } from "@/lib/prisma"
import { fetchSpendHistory, resetAdvTokenForRun } from "@/lib/wb-adv-api"

/** Default период обзора для daily cron. WB max 31 день. 7 покрывает с
 *  запасом — если cron пропустит несколько дней, на следующем sync догонит. */
export const DEFAULT_UPD_DAYS = 7

/** Max период в одном запросе (per WB docs). */
const MAX_UPD_DAYS = 31

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10) // YYYY-MM-DD
}

export interface AdvUpdSyncResult {
  from: string
  to: string
  fetched: number
  deleted: number
  inserted: number
  totalSpend: number // ₽ за период
}

/** Sync истории затрат за окно N дней. days clamped to [1, 31].
 *  Idempotent: повторный run за тот же период перепишет данные.
 *  Throws WbRateLimitError при 429. */
export async function runAdvUpdSync(daysWindow: number = DEFAULT_UPD_DAYS): Promise<AdvUpdSyncResult> {
  const days = Math.min(Math.max(1, Math.floor(daysWindow)), MAX_UPD_DAYS)
  resetAdvTokenForRun()

  // Период [today - days, today]. WB обычно фиксирует сегодняшний spend
  // только на следующий день, но 7-day rolling всё подхватит.
  const now = new Date()
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const fromDate = new Date(today.getTime() - days * 24 * 3600_000)
  const from = formatDate(fromDate)
  const to = formatDate(today)

  const rows = await fetchSpendHistory({ from, to })
  console.log(`[wb-adv-upd-sync] fetched ${rows.length} spend rows for ${from}..${to}`)

  // Идемпотентность: DELETE по effectiveDate range, затем INSERT свежих.
  // effectiveDate = parsed(updTime) ?? now() — для null updTime ставим текущий
  // timestamp чтобы они попали в DELETE на следующем backfill за тот же период.
  const nowTs = new Date()
  const inserts = rows.map(r => {
    const updTime = r.updTime ? new Date(r.updTime) : null
    const effectiveDate = updTime ?? nowTs
    return {
      updTime,
      effectiveDate,
      updSum: r.updSum,
      advertId: r.advertId,
      campName: r.campName,
      advertType: r.advertType,
      paymentType: r.paymentType,
      advertStatus: r.advertStatus,
    }
  })

  // DELETE+INSERT в одной транзакции. Inclusive диапазон по дате.
  const delFrom = new Date(`${from}T00:00:00Z`)
  const delTo = new Date(`${to}T23:59:59.999Z`)
  const { deleted, inserted } = await prisma.$transaction(async tx => {
    const del = await tx.wbAdvertSpendRow.deleteMany({
      where: { effectiveDate: { gte: delFrom, lte: delTo } },
    })
    let ins = 0
    if (inserts.length > 0) {
      const created = await tx.wbAdvertSpendRow.createMany({ data: inserts })
      ins = created.count
    }
    return { deleted: del.count, inserted: ins }
  })

  const totalSpend = rows.reduce((sum, r) => sum + Number(r.updSum), 0)
  console.log(`[wb-adv-upd-sync] deleted=${deleted} inserted=${inserted} totalSpend=${totalSpend.toFixed(2)}₽`)

  return { from, to, fetched: rows.length, deleted, inserted, totalSpend }
}
