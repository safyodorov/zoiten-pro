// Скачивание медиа из WB в /var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename}
// UPLOAD_DIR env задаёт корень (fallback /var/www/zoiten-uploads).

import { promises as fs } from "node:fs"
import path from "node:path"

const DEFAULT_UPLOAD_DIR = process.env.UPLOAD_DIR || "/var/www/zoiten-uploads"

export interface DownloadItem {
  wbUrl: string
  ticketId: string
  messageId: string
}

export interface DownloadResult extends DownloadItem {
  localPath?: string
  sizeBytes?: number
  error?: string
}

export async function downloadMedia(item: DownloadItem, attempt = 0): Promise<DownloadResult> {
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
    return { ...item, localPath, sizeBytes: buf.length }
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
