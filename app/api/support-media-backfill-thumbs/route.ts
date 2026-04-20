// POST /api/support-media-backfill-thumbs
// Одноразовая генерация thumbnail для существующих медиа (thumbnailPath IS NULL).
// Quick Task 260420-oxd: после деплоя миграции + ffmpeg на VPS запустить
// вручную, чтобы сгенерировать превью для уже скачанных медиа.
//
// Защищён requireSuperadmin(). Запуск:
//   curl -X POST -H "Cookie: next-auth.session-token=..." \
//     https://zoiten.pro/api/support-media-backfill-thumbs
//
// Обрабатывает пакетами по 50, внутри цикла — для каждой media:
//   - если localPath нет → skip (файл не скачан, ждём регулярный sync)
//   - если файл физически пропал → skip + push в errors[]
//   - если IMAGE → generateImageThumbnail
//   - если VIDEO → generateVideoThumbnail (требует ffmpeg в PATH)
//   - если DOCUMENT → skip
//   - ошибки non-fatal, копятся в errors[]
// Идемпотентен: повторный запуск пропускает уже обработанные записи
// (фильтр WHERE thumbnailPath IS NULL).
// Возвращает JSON: { processed, generated, skipped, errors }

import { NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import { prisma } from "@/lib/prisma"
import { requireSuperadmin } from "@/lib/rbac"
import {
  generateImageThumbnail,
  generateVideoThumbnail,
} from "@/lib/support-media"

const BATCH_SIZE = 50

export async function POST() {
  await requireSuperadmin()

  const errors: string[] = []
  const erroredIds = new Set<string>()
  let processed = 0
  let generated = 0
  let skipped = 0

  // Обрабатываем батчами — чтобы не держать открытый query на тысячи rows
  // (Prisma findMany без take читает всё в память).
  // Без skip — после update записи уходят из фильтра; errored IDs исключаются
  // через notIn чтобы не зацикливаться на проблемных rows.
  while (true) {
    const rows = await prisma.supportMedia.findMany({
      where: {
        thumbnailPath: null,
        localPath: { not: null },
        ...(erroredIds.size > 0 && { id: { notIn: Array.from(erroredIds) } }),
      },
      select: { id: true, type: true, localPath: true, wbUrl: true },
      orderBy: { createdAt: "desc" },
      take: BATCH_SIZE,
    })
    if (rows.length === 0) break

    for (const row of rows) {
      processed++
      if (!row.localPath) {
        skipped++
        continue
      }
      if (row.type === "DOCUMENT") {
        skipped++
        continue
      }

      // Убедиться что файл физически существует
      try {
        await fs.access(row.localPath)
      } catch {
        errors.push(`${row.id}: file missing at ${row.localPath}`)
        erroredIds.add(row.id)
        skipped++
        continue
      }

      try {
        let thumbnailPath: string
        if (row.type === "IMAGE") {
          thumbnailPath = await generateImageThumbnail(row.localPath)
        } else {
          // VIDEO: WB отдаёт HLS m3u8 — локально только плейлист без сегментов,
          // поэтому ffmpeg тянет кадр из wbUrl (CDN сам отдаст первый сегмент).
          const thumbPath =
            row.localPath.replace(/\.[^./\\]+$/, "") + ".thumb.jpg"
          thumbnailPath = await generateVideoThumbnail(row.wbUrl, thumbPath)
        }
        await prisma.supportMedia.update({
          where: { id: row.id },
          data: { thumbnailPath },
        })
        generated++
      } catch (err) {
        errors.push(
          `${row.id}: ${err instanceof Error ? err.message : String(err)}`
        )
        erroredIds.add(row.id)
      }
    }
  }

  return NextResponse.json({ processed, generated, skipped, errors })
}
