// Скачивание медиа из WB в /var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename}
// UPLOAD_DIR env задаёт корень (fallback /var/www/zoiten-uploads).
//
// Thumbnail генерация (Quick Task 260420-oxd):
// - IMAGE → sharp → .thumb.webp 96×96 (quality 75)
// - VIDEO → ffmpeg spawn → .thumb.jpg 96×96 (кадр 1 сек, q:v 5)
// - DOCUMENT → нет превью
// Все ошибки thumbnail — non-fatal: sync не падает, если ffmpeg отсутствует
// или sharp не распознал формат; ошибка пишется в thumbError поля DownloadResult.

import { promises as fs } from "node:fs"
import path from "node:path"
import { spawn } from "node:child_process"
import sharp from "sharp"

const DEFAULT_UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/zoiten-uploads"

export interface DownloadItem {
  wbUrl: string
  ticketId: string
  messageId: string
  mediaType: "IMAGE" | "VIDEO" | "DOCUMENT"
}

export interface DownloadResult extends DownloadItem {
  localPath?: string
  thumbnailPath?: string
  sizeBytes?: number
  error?: string
  thumbError?: string
}

// Генерирует .thumb.webp 96×96 (cover) рядом с исходным файлом через sharp.
// Возвращает путь к созданному thumbnail.
export async function generateImageThumbnail(sourcePath: string): Promise<string> {
  const thumbPath = sourcePath.replace(/\.[^./\\]+$/, "") + ".thumb.webp"
  await sharp(sourcePath)
    .resize(96, 96, { fit: "cover", position: "center" })
    .webp({ quality: 75 })
    .toFile(thumbPath)
  return thumbPath
}

// Генерирует .thumb.jpg 96×96 из первой секунды видео через ffmpeg (spawn).
// Требует ffmpeg в PATH (VPS: apt install -y ffmpeg). На Windows dev без ffmpeg
// — proc.on('error') ловит ENOENT и reject — вызывающий код обязан обернуть
// в try/catch и трактовать как non-fatal.
export async function generateVideoThumbnail(sourcePath: string): Promise<string> {
  const thumbPath = sourcePath.replace(/\.[^./\\]+$/, "") + ".thumb.jpg"
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-y",
      "-ss",
      "00:00:01",
      "-i",
      sourcePath,
      "-vframes",
      "1",
      "-vf",
      "scale=96:96:force_original_aspect_ratio=increase,crop=96:96",
      "-q:v",
      "5",
      thumbPath,
    ])
    let stderr = ""
    proc.stderr.on("data", (d) => {
      stderr += String(d)
    })
    proc.on("error", (err) => reject(err)) // ENOENT на Windows без ffmpeg
    proc.on("close", (code) => {
      if (code === 0) resolve(thumbPath)
      else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 500)}`))
    })
  })
}

export async function downloadMedia(
  item: DownloadItem,
  attempt = 0
): Promise<DownloadResult> {
  const dir = path.join(DEFAULT_UPLOAD_DIR, "support", item.ticketId, item.messageId)
  try {
    await fs.mkdir(dir, { recursive: true })
    const rawName = path.basename(new URL(item.wbUrl).pathname)
    const sanitized = rawName.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-128)
    const filename = sanitized || `file_${Date.now()}`
    const localPath = path.join(dir, filename)

    const res = await fetch(item.wbUrl)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const buf = Buffer.from(await res.arrayBuffer())
    await fs.writeFile(localPath, buf)

    // ── Thumbnail generation (non-fatal) ──
    let thumbnailPath: string | undefined
    let thumbError: string | undefined
    try {
      if (item.mediaType === "IMAGE") {
        thumbnailPath = await generateImageThumbnail(localPath)
      } else if (item.mediaType === "VIDEO") {
        thumbnailPath = await generateVideoThumbnail(localPath)
      }
      // DOCUMENT — skip, рендерим иконкой
    } catch (err) {
      thumbError = err instanceof Error ? err.message : String(err)
    }

    return {
      ...item,
      localPath,
      thumbnailPath,
      sizeBytes: buf.length,
      thumbError,
    }
  } catch (err) {
    if (attempt === 0) {
      await new Promise((r) => setTimeout(r, 1000))
      return downloadMedia(item, 1)
    }
    return {
      ...item,
      error: err instanceof Error ? err.message : "Ошибка скачивания медиа",
    }
  }
}

export async function downloadMediaBatch(
  items: DownloadItem[],
  concurrency = 5
): Promise<DownloadResult[]> {
  const results: DownloadResult[] = []
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency)
    results.push(...(await Promise.all(batch.map((it) => downloadMedia(it)))))
  }
  return results
}
