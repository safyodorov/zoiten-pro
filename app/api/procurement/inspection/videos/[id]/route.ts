// GET /api/procurement/inspection/videos/[id] — скачать/проиграть видео инспекции
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

const BASE =
  process.env.UPLOAD_DIR ??
  (process.env.NODE_ENV === "production" ? "/var/www/zoiten-uploads" : "/tmp/zoiten-uploads")

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT")
  } catch (e) {
    const status = e instanceof Error && e.message === "FORBIDDEN" ? 403 : 401
    return NextResponse.json({ error: "Нет доступа" }, { status })
  }

  const { id } = await params
  const video = await prisma.inspectionVideo.findUnique({
    where: { id },
    include: { inspection: { select: { purchaseId: true } } },
  })
  if (!video) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

  let buffer: Buffer
  try {
    buffer = await readFile(
      join(BASE, "procurement", video.inspection.purchaseId, "inspection", "videos", video.storedName)
    )
  } catch {
    return NextResponse.json({ error: "Файл недоступен" }, { status: 404 })
  }
  const encoded = encodeURIComponent(video.fileName)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": video.mimeType || "video/mp4",
      "Content-Disposition": `inline; filename*=UTF-8''${encoded}`,
      "Content-Length": String(buffer.length),
      "Accept-Ranges": "bytes",
    },
  })
}
