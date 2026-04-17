// Синхронизация WB Feedbacks + Questions → SupportTicket/Message/Media.
// Переиспользуется из POST /api/support-sync (ручной) и GET /api/cron/support-sync-reviews.
// customerId всегда null в Phase 8 — WB Feedbacks/Questions API не даёт wbUserId.

import { prisma } from "@/lib/prisma"
import {
  listFeedbacks,
  listQuestions,
  type Feedback,
  type Question,
} from "@/lib/wb-support-api"
import { downloadMediaBatch, type DownloadItem } from "@/lib/support-media"

const YEAR_MS = 365 * 24 * 60 * 60 * 1000

export interface SyncResult {
  feedbacksSynced: number
  questionsSynced: number
  mediaSaved: number
  errors: string[]
}

export async function syncSupport(
  opts: { isAnswered?: boolean } = {}
): Promise<SyncResult> {
  const errors: string[] = []
  let feedbacksSynced = 0
  let questionsSynced = 0

  // 1. Feedbacks — пагинация по skip, take=5000
  const feedbacks: Feedback[] = []
  for (let skip = 0; ; skip += 5000) {
    try {
      const batch = await listFeedbacks({
        isAnswered: opts.isAnswered,
        take: 5000,
        skip,
      })
      feedbacks.push(...batch)
      if (batch.length < 5000) break
    } catch (err) {
      errors.push(
        `Feedbacks skip=${skip}: ${err instanceof Error ? err.message : "unknown"}`
      )
      break
    }
  }

  // 2. Questions — пагинация по skip, take=10000
  const questions: Question[] = []
  for (let skip = 0; ; skip += 10000) {
    try {
      const batch = await listQuestions({
        isAnswered: opts.isAnswered,
        take: 10000,
        skip,
      })
      questions.push(...batch)
      if (batch.length < 10000) break
    } catch (err) {
      errors.push(
        `Questions skip=${skip}: ${err instanceof Error ? err.message : "unknown"}`
      )
      break
    }
  }

  const mediaToDownload: DownloadItem[] = []

  // 3. Feedbacks → transaction per-item
  for (const fb of feedbacks) {
    try {
      const previewText = (fb.text ?? "").slice(0, 140)
      const wbCreatedAt = fb.createdDate ? new Date(fb.createdDate) : null

      await prisma.$transaction(async (tx) => {
        const ticket = await tx.supportTicket.upsert({
          where: {
            channel_wbExternalId: { channel: "FEEDBACK", wbExternalId: fb.id },
          },
          create: {
            channel: "FEEDBACK",
            wbExternalId: fb.id,
            customerId: null,
            nmId: fb.productDetails?.nmId ?? null,
            rating: fb.productValuation ?? null,
            previewText,
            lastMessageAt: wbCreatedAt,
            status: fb.answer?.text ? "ANSWERED" : "NEW",
          },
          update: {
            nmId: fb.productDetails?.nmId ?? null,
            rating: fb.productValuation ?? null,
            previewText,
          },
        })

        const inbound = await tx.supportMessage.findFirst({
          where: { ticketId: ticket.id, direction: "INBOUND" },
        })
        if (!inbound) {
          const msg = await tx.supportMessage.create({
            data: {
              ticketId: ticket.id,
              direction: "INBOUND",
              text: fb.text,
              authorId: null,
              wbSentAt: wbCreatedAt,
            },
          })
          for (const photo of fb.photoLinks ?? []) {
            const expiresAt = new Date(Date.now() + YEAR_MS)
            await tx.supportMedia.create({
              data: {
                messageId: msg.id,
                type: "IMAGE",
                wbUrl: photo.fullSize,
                expiresAt,
              },
            })
            mediaToDownload.push({
              wbUrl: photo.fullSize,
              ticketId: ticket.id,
              messageId: msg.id,
            })
          }
          if (fb.video?.link) {
            const expiresAt = new Date(Date.now() + YEAR_MS)
            await tx.supportMedia.create({
              data: {
                messageId: msg.id,
                type: "VIDEO",
                wbUrl: fb.video.link,
                expiresAt,
              },
            })
            mediaToDownload.push({
              wbUrl: fb.video.link,
              ticketId: ticket.id,
              messageId: msg.id,
            })
          }
        }

        if (fb.answer?.text) {
          const outbound = await tx.supportMessage.findFirst({
            where: { ticketId: ticket.id, direction: "OUTBOUND" },
          })
          if (!outbound) {
            await tx.supportMessage.create({
              data: {
                ticketId: ticket.id,
                direction: "OUTBOUND",
                text: fb.answer.text,
                authorId: null,
                wbSentAt: fb.answer.createDate
                  ? new Date(fb.answer.createDate)
                  : null,
              },
            })
          }
        }
      })
      feedbacksSynced++
    } catch (err) {
      errors.push(
        `Feedback ${fb.id}: ${err instanceof Error ? err.message : "unknown"}`
      )
    }
  }

  // 4. Questions — без медиа (WB Questions API не даёт photoLinks)
  for (const q of questions) {
    try {
      const previewText = (q.text ?? "").slice(0, 140)
      const wbCreatedAt = q.createdDate ? new Date(q.createdDate) : null
      await prisma.$transaction(async (tx) => {
        const ticket = await tx.supportTicket.upsert({
          where: {
            channel_wbExternalId: { channel: "QUESTION", wbExternalId: q.id },
          },
          create: {
            channel: "QUESTION",
            wbExternalId: q.id,
            customerId: null,
            nmId: q.productDetails?.nmId ?? null,
            previewText,
            lastMessageAt: wbCreatedAt,
            status: q.answer?.text ? "ANSWERED" : "NEW",
          },
          update: {
            nmId: q.productDetails?.nmId ?? null,
            previewText,
          },
        })
        const inbound = await tx.supportMessage.findFirst({
          where: { ticketId: ticket.id, direction: "INBOUND" },
        })
        if (!inbound) {
          await tx.supportMessage.create({
            data: {
              ticketId: ticket.id,
              direction: "INBOUND",
              text: q.text,
              authorId: null,
              wbSentAt: wbCreatedAt,
            },
          })
        }
        if (q.answer?.text) {
          const outbound = await tx.supportMessage.findFirst({
            where: { ticketId: ticket.id, direction: "OUTBOUND" },
          })
          if (!outbound) {
            await tx.supportMessage.create({
              data: {
                ticketId: ticket.id,
                direction: "OUTBOUND",
                text: q.answer.text,
                authorId: null,
                wbSentAt: q.answer.createDate
                  ? new Date(q.answer.createDate)
                  : null,
              },
            })
          }
        }
      })
      questionsSynced++
    } catch (err) {
      errors.push(
        `Question ${q.id}: ${err instanceof Error ? err.message : "unknown"}`
      )
    }
  }

  // 5. Скачать медиа параллельно + обновить localPath
  let mediaSaved = 0
  if (mediaToDownload.length > 0) {
    const downloadResults = await downloadMediaBatch(mediaToDownload, 5)
    for (const r of downloadResults) {
      if (r.localPath) {
        try {
          await prisma.supportMedia.updateMany({
            where: { wbUrl: r.wbUrl, messageId: r.messageId },
            data: { localPath: r.localPath, sizeBytes: r.sizeBytes },
          })
          mediaSaved++
        } catch (err) {
          errors.push(
            `Media update ${r.wbUrl}: ${err instanceof Error ? err.message : "unknown"}`
          )
        }
      } else if (r.error) {
        errors.push(`Media download ${r.wbUrl}: ${r.error}`)
      }
    }
  }

  // 6. AppSetting lastSyncedAt
  try {
    await prisma.appSetting.upsert({
      where: { key: "support.lastSyncedAt" },
      create: { key: "support.lastSyncedAt", value: new Date().toISOString() },
      update: { value: new Date().toISOString() },
    })
  } catch (err) {
    errors.push(
      `lastSyncedAt: ${err instanceof Error ? err.message : "unknown"}`
    )
  }

  return { feedbacksSynced, questionsSynced, mediaSaved, errors }
}
