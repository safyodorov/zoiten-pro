// GET /api/procurement/inspection/videos/[id]/thumb — превью-кадр видео (jpeg).
// Генерируется лениво ffmpeg при первом запросе и кэшируется на диске.
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { readFile, stat } from "node:fs/promises"
import { existsSync } from "node:fs"
import { spawn } from "node:child_process"
import { join } from "node:path"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

const BASE =
  process.env.UPLOAD_DIR ??
  (process.env.NODE_ENV === "production" ? "/var/www/zoiten-uploads" : "/tmp/zoiten-uploads")

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "ignore"] })
    p.on("error", reject)
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}`))))
  })
}

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

  const dir = join(BASE, "procurement", video.inspection.purchaseId, "inspection", "videos")
  const src = join(dir, video.storedName)
  const thumb = join(dir, `${video.storedName}.thumb.jpg`)

  if (!existsSync(thumb)) {
    if (!existsSync(src)) return NextResponse.json({ error: "Видео недоступно" }, { status: 404 })
    try {
      await runFfmpeg([
        "-y", "-i", src,
        "-vf", "thumbnail,scale=400:-2",
        "-frames:v", "1",
        thumb,
      ])
    } catch {
      return NextResponse.json({ error: "Не удалось сделать превью" }, { status: 500 })
    }
  }

  try {
    await stat(thumb)
    const buf = await readFile(thumb)
    return new NextResponse(new Uint8Array(buf), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
    })
  } catch {
    return NextResponse.json({ error: "Превью недоступно" }, { status: 404 })
  }
}
