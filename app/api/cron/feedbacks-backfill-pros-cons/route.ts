// POST /api/cron/feedbacks-backfill-pros-cons — one-shot backfill потерянных
// pros/cons в исторических FEEDBACK тикетах. Quick 260518-hz7.
//
// Логика:
//   1. Дёргаем WB Feedbacks API за окно `days` (default 180, query ?days=N, max 365)
//      isAnswered=undefined (без фильтра — и отвеченные, и нет)
//   2. Для каждого fb с непустым pros||cons:
//      - находим SupportTicket по channel=FEEDBACK + wbExternalId=fb.id
//      - находим первый INBOUND SupportMessage (orderBy sentAt asc, take 1)
//      - формируем новый text через formatFeedbackBody(fb)
//      - update если newText !== currentText (idempotent skip)
//   3. Rate-limit-safe: callApi в lib/wb-support-api.ts уже ретраит 429 и
//      пишет cooldown в AppSetting. WbRateLimitError ловится — endpoint
//      возвращает частичный результат.
//
// Защита: x-cron-secret (как /api/cron/support-sync-reviews).
//
// Запуск (manual):
//   curl -sS -X POST -H "x-cron-secret: $CRON_SECRET" \
//     'https://zoiten.pro/api/cron/feedbacks-backfill-pros-cons?days=365'

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import {
  listFeedbacks,
  formatFeedbackBody,
  WbRateLimitError,
} from "@/lib/wb-support-api"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const url = new URL(req.url)
  const daysParam = Number.parseInt(url.searchParams.get("days") ?? "180", 10)
  const days =
    Number.isFinite(daysParam) && daysParam > 0 ? Math.min(daysParam, 365) : 180

  const dateTo = Math.floor(Date.now() / 1000)
  const dateFrom = dateTo - days * 24 * 60 * 60

  let scanned = 0
  let updated = 0
  let skipped = 0
  const errors: string[] = []

  try {
    // Пагинация: take=5000 (max WB), skip += 5000 до empty page.
    for (let skip = 0; ; skip += 5000) {
      let batch: Awaited<ReturnType<typeof listFeedbacks>>
      try {
        batch = await listFeedbacks({ take: 5000, skip, dateFrom, dateTo })
      } catch (err) {
        if (err instanceof WbRateLimitError) {
          errors.push(`WB rate-limit на skip=${skip}: ${err.message}`)
        } else {
          errors.push(
            `listFeedbacks skip=${skip}: ${err instanceof Error ? err.message : "unknown"}`
          )
        }
        break
      }
      if (batch.length === 0) break

      for (const fb of batch) {
        scanned++
        const hasPros = !!fb.pros?.trim()
        const hasCons = !!fb.cons?.trim()
        if (!hasPros && !hasCons) {
          skipped++
          continue
        }
        try {
          const ticket = await prisma.supportTicket.findUnique({
            where: {
              channel_wbExternalId: { channel: "FEEDBACK", wbExternalId: fb.id },
            },
            select: { id: true },
          })
          if (!ticket) {
            skipped++
            continue
          }
          const inbound = await prisma.supportMessage.findFirst({
            where: { ticketId: ticket.id, direction: "INBOUND" },
            orderBy: { sentAt: "asc" },
            select: { id: true, text: true },
          })
          if (!inbound) {
            skipped++
            continue
          }
          const newText = formatFeedbackBody(fb)
          if (!newText || newText === inbound.text) {
            skipped++
            continue
          }
          await prisma.supportMessage.update({
            where: { id: inbound.id },
            data: { text: newText },
          })
          updated++
        } catch (err) {
          errors.push(
            `fb ${fb.id}: ${err instanceof Error ? err.message : "unknown"}`
          )
        }
      }

      if (batch.length < 5000) break
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка backfill"
    return NextResponse.json(
      { ok: false, scanned, updated, skipped, errors: [...errors, msg] },
      { status: 500 }
    )
  }

  return NextResponse.json({ ok: true, scanned, updated, skipped, days, errors })
}
