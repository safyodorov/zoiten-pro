// GET /api/cron/support-media-cleanup — удаление просроченных SupportMedia (раз в сутки).
// Удаляет файлы с диска + соответствующие записи в БД. ENOENT игнорируется.

import { NextRequest, NextResponse } from "next/server"
import { promises as fs } from "node:fs"
import { prisma } from "@/lib/prisma"

export const runtime = "nodejs"

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }
  try {
    const now = new Date()
    const expired = await prisma.supportMedia.findMany({
      where: { expiresAt: { lt: now } },
      select: { id: true, localPath: true },
    })
    let filesDeleted = 0
    for (const m of expired) {
      if (m.localPath) {
        try {
          await fs.unlink(m.localPath)
          filesDeleted++
        } catch (err: unknown) {
          const code = (err as { code?: string })?.code
          if (code !== "ENOENT") {
            console.error("support-media-cleanup unlink error:", err)
          }
        }
      }
    }
    const result = await prisma.supportMedia.deleteMany({
      where: { expiresAt: { lt: now } },
    })
    return NextResponse.json({
      ok: true,
      rowsDeleted: result.count,
      filesDeleted,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка очистки"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
