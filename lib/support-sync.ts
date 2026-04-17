// Синхронизация WB Feedbacks + Questions → SupportTicket/Message/Media.
// Переиспользуется из POST /api/support-sync (ручной) и GET /api/cron/support-sync-reviews.
// customerId всегда null в Phase 8 — WB Feedbacks/Questions API не даёт wbUserId.

import { prisma } from "@/lib/prisma"
import {
  listFeedbacks,
  listQuestions,
  listReturns,
  type Feedback,
  type Question,
  type Claim,
} from "@/lib/wb-support-api"
import { downloadMediaBatch, type DownloadItem } from "@/lib/support-media"

const YEAR_MS = 365 * 24 * 60 * 60 * 1000
const RETURNS_PAGE_LIMIT = 200
const RETURNS_PAGE_PAUSE_MS = 600

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
            status: fb.answer?.text ? "ANSWERED" : undefined,
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
            status: q.answer?.text ? "ANSWERED" : undefined,
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

// ── Phase 9: синхронизация возвратов (Returns/Claims) ──────────

export interface SyncReturnsResult {
  synced: number
  created: number
  updated: number
  mediaDownloaded: number
  errors: string[]
}

// //photos.wbstatic.net/... → https://photos.wbstatic.net/...
// Уже https://... URL-ы не трогаем.
function normalizeWbUrl(url: string): string {
  if (url.startsWith("//")) return `https:${url}`
  return url
}

async function fetchAllClaims(isArchive: boolean): Promise<Claim[]> {
  const out: Claim[] = []
  for (let offset = 0; ; offset += RETURNS_PAGE_LIMIT) {
    const { claims } = await listReturns({
      is_archive: isArchive,
      limit: RETURNS_PAGE_LIMIT,
      offset,
    })
    out.push(...claims)
    if (claims.length < RETURNS_PAGE_LIMIT) break
    await new Promise((r) => setTimeout(r, RETURNS_PAGE_PAUSE_MS))
  }
  return out
}

export async function syncReturns(): Promise<SyncReturnsResult> {
  const result: SyncReturnsResult = {
    synced: 0,
    created: 0,
    updated: 0,
    mediaDownloaded: 0,
    errors: [],
  }
  const mediaQueue: DownloadItem[] = []

  // 1. Загрузить обе страницы (под рассмотрением + архив)
  let allClaims: Claim[] = []
  try {
    const pending = await fetchAllClaims(false)
    const archive = await fetchAllClaims(true)
    allClaims = [...pending, ...archive]
  } catch (err) {
    result.errors.push(
      `listReturns: ${err instanceof Error ? err.message : "unknown"}`
    )
    return result
  }

  // 2. Per-claim transaction — идемпотентный upsert
  for (const claim of allClaims) {
    try {
      await prisma.$transaction(async (tx) => {
        // Определяем create vs update через findUnique перед upsert —
        // чтобы правильно посчитать created/updated счётчики.
        const existing = await tx.supportTicket.findUnique({
          where: {
            channel_wbExternalId: {
              channel: "RETURN",
              wbExternalId: claim.id,
            },
          },
          select: { id: true },
        })
        const isCreate = !existing

        const previewText = (claim.user_comment ?? "").slice(0, 140)
        const wbCreatedAt = claim.dt ? new Date(claim.dt) : null

        const ticket = await tx.supportTicket.upsert({
          where: {
            channel_wbExternalId: {
              channel: "RETURN",
              wbExternalId: claim.id,
            },
          },
          create: {
            channel: "RETURN",
            wbExternalId: claim.id,
            customerId: null,
            nmId: claim.nm_id,
            status: "NEW",
            returnState: "PENDING",
            wbClaimStatus: claim.status,
            wbClaimStatusEx: claim.status_ex,
            wbClaimType: claim.claim_type,
            wbActions: claim.actions ?? [],
            wbComment: claim.wb_comment ?? null,
            srid: claim.srid ?? null,
            price: claim.price ?? null,
            previewText,
            lastMessageAt: wbCreatedAt,
          },
          update: {
            // ⚠ НЕ трогаем returnState/status — локальные решения защищены
            wbClaimStatus: claim.status,
            wbClaimStatusEx: claim.status_ex,
            wbActions: claim.actions ?? [],
            wbComment: claim.wb_comment ?? null,
            previewText,
          },
        })

        if (isCreate) result.created++
        else result.updated++

        // 1 INBOUND message per ticket (user_comment)
        const inbound = await tx.supportMessage.findFirst({
          where: { ticketId: ticket.id, direction: "INBOUND" },
          select: { id: true },
        })
        if (!inbound) {
          const msg = await tx.supportMessage.create({
            data: {
              ticketId: ticket.id,
              direction: "INBOUND",
              text: claim.user_comment,
              authorId: null,
              wbSentAt: wbCreatedAt,
            },
          })

          // photos
          for (const photo of claim.photos ?? []) {
            const url = normalizeWbUrl(photo)
            await tx.supportMedia.create({
              data: {
                messageId: msg.id,
                type: "IMAGE",
                wbUrl: url,
                expiresAt: new Date(Date.now() + YEAR_MS),
              },
            })
            mediaQueue.push({
              wbUrl: url,
              ticketId: ticket.id,
              messageId: msg.id,
            })
          }

          // videos
          for (const videoUrl of claim.video_paths ?? []) {
            const url = normalizeWbUrl(videoUrl)
            await tx.supportMedia.create({
              data: {
                messageId: msg.id,
                type: "VIDEO",
                wbUrl: url,
                expiresAt: new Date(Date.now() + YEAR_MS),
              },
            })
            mediaQueue.push({
              wbUrl: url,
              ticketId: ticket.id,
              messageId: msg.id,
            })
          }
        }

        result.synced++
      })
    } catch (err) {
      result.errors.push(
        `claim ${claim.id}: ${err instanceof Error ? err.message : "unknown"}`
      )
    }
  }

  // 3. Скачать медиа вне транзакций (параллельно, не блокируя БД)
  if (mediaQueue.length > 0) {
    try {
      const downloadResults = await downloadMediaBatch(mediaQueue, 5)
      for (const r of downloadResults) {
        if (r.localPath) {
          try {
            await prisma.supportMedia.updateMany({
              where: { wbUrl: r.wbUrl, messageId: r.messageId },
              data: { localPath: r.localPath, sizeBytes: r.sizeBytes },
            })
            result.mediaDownloaded++
          } catch (err) {
            result.errors.push(
              `Media update ${r.wbUrl}: ${err instanceof Error ? err.message : "unknown"}`
            )
          }
        } else if (r.error) {
          result.errors.push(`Media download ${r.wbUrl}: ${r.error}`)
        }
      }
    } catch (err) {
      result.errors.push(
        `media batch: ${err instanceof Error ? err.message : "unknown"}`
      )
    }
  }

  return result
}
