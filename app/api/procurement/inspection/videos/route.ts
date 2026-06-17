// POST   /api/procurement/inspection/videos?purchaseId=&name=  — загрузить видео (raw body)
// DELETE /api/procurement/inspection/videos?id=...             — удалить
// Тело шлётся СЫРЫМ (не multipart) и стримится на диск (без буфера в памяти).
// Вход ≤200 МБ; если итог >20 МБ — сжимаем ffmpeg до ≤20 МБ.
export const runtime = "nodejs"
export const maxDuration = 600

import { NextRequest, NextResponse } from "next/server"
import { mkdir, unlink, stat, rename } from "node:fs/promises"
import { createWriteStream } from "node:fs"
import { Readable } from "node:stream"
import { pipeline } from "node:stream/promises"
import { execFile, spawn } from "node:child_process"
import { promisify } from "node:util"
import { join, extname } from "node:path"
import { randomUUID } from "node:crypto"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

const execFileP = promisify(execFile)

const BASE =
  process.env.UPLOAD_DIR ??
  (process.env.NODE_ENV === "production" ? "/var/www/zoiten-uploads" : "/tmp/zoiten-uploads")

const MAX_INPUT = 200 * 1024 * 1024 // приём ≤200 МБ
const TARGET = 20 * 1024 * 1024 // итог ≤20 МБ

function videoDir(purchaseId: string): string {
  return join(BASE, "procurement", purchaseId, "inspection", "videos")
}
function authStatus(e: unknown): number {
  return e instanceof Error && e.message === "FORBIDDEN" ? 403 : 401
}

async function probeDuration(path: string): Promise<number> {
  try {
    const { stdout } = await execFileP("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=nw=1:nk=1",
      path,
    ])
    const d = parseFloat(stdout.trim())
    return Number.isFinite(d) ? d : 0
  } catch {
    return 0
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn("ffmpeg", args, { stdio: ["ignore", "ignore", "pipe"] })
    let err = ""
    p.stderr.on("data", (d) => {
      err += d.toString()
      if (err.length > 4000) err = err.slice(-4000)
    })
    p.on("error", reject)
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exit ${code}: ${err.slice(-500)}`))
    )
  })
}

// Сжать видео под бюджет байт (расчёт битрейта по длительности; ретрай меньшим разрешением).
async function transcodeToBudget(src: string, out: string, budget: number): Promise<void> {
  const dur = await probeDuration(src)
  const audioBps = 96_000
  function vk(scaleW: number, factor: number): number {
    const targetBits = budget * 8 * 0.95
    const v = dur > 0 ? targetBits / dur - audioBps : 900_000
    return Math.max(150, Math.floor((v * factor) / 1000)) // kbps, пол 150
  }
  const attempts = [
    { w: 1280, f: 1 },
    { w: 854, f: 0.8 },
    { w: 640, f: 0.6 },
  ]
  for (let i = 0; i < attempts.length; i++) {
    const { w, f } = attempts[i]
    const bv = vk(w, f)
    await runFfmpeg([
      "-y", "-i", src,
      "-vf", `scale='min(${w},iw)':-2`,
      "-c:v", "libx264", "-preset", "veryfast", "-pix_fmt", "yuv420p",
      "-b:v", `${bv}k`, "-maxrate", `${Math.floor(bv * 1.5)}k`, "-bufsize", `${bv * 2}k`,
      "-c:a", "aac", "-b:a", "96k",
      "-movflags", "+faststart",
      out,
    ])
    const sz = (await stat(out)).size
    if (sz <= budget || i === attempts.length - 1) return
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
  } catch (e) {
    return NextResponse.json({ error: "Нет доступа" }, { status: authStatus(e) })
  }

  const purchaseId = req.nextUrl.searchParams.get("purchaseId")
  const nameParam = req.nextUrl.searchParams.get("name") || "video"
  if (!purchaseId) return NextResponse.json({ error: "purchaseId обязателен" }, { status: 400 })
  if (!req.body) return NextResponse.json({ error: "Пустое тело" }, { status: 400 })

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true },
  })
  if (!purchase) return NextResponse.json({ error: "Закупка не найдена" }, { status: 404 })

  const insp = await prisma.purchaseInspection.upsert({
    where: { purchaseId },
    create: { purchaseId },
    update: {},
    select: { id: true },
  })

  const dir = videoDir(purchaseId)
  await mkdir(dir, { recursive: true })
  const origExt = extname(nameParam).toLowerCase() || ".mp4"
  const rawPath = join(dir, `${randomUUID()}.orig${origExt}`)

  // Стрим тела на диск (без буфера в памяти)
  try {
    await pipeline(Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(rawPath))
  } catch (e) {
    await unlink(rawPath).catch(() => {})
    console.error("video stream error:", e)
    return NextResponse.json({ error: "Ошибка загрузки" }, { status: 500 })
  }

  const inputSize = (await stat(rawPath)).size
  if (inputSize > MAX_INPUT) {
    await unlink(rawPath).catch(() => {})
    return NextResponse.json({ error: "Файл больше 200 МБ — не принимается" }, { status: 413 })
  }

  let storedName: string
  let finalSize: number
  let finalMime: string
  let finalName: string

  if (inputSize <= TARGET) {
    // оставляем как есть
    storedName = `${randomUUID()}${origExt}`
    await rename(rawPath, join(dir, storedName))
    finalSize = inputSize
    finalMime = req.headers.get("content-type") || "video/mp4"
    finalName = nameParam
  } else {
    // сжимаем до ≤20 МБ
    storedName = `${randomUUID()}.mp4`
    const outPath = join(dir, storedName)
    try {
      await transcodeToBudget(rawPath, outPath, TARGET)
    } catch (e) {
      await unlink(rawPath).catch(() => {})
      await unlink(outPath).catch(() => {})
      console.error("transcode error:", e)
      return NextResponse.json({ error: "Не удалось сжать видео" }, { status: 500 })
    }
    await unlink(rawPath).catch(() => {})
    finalSize = (await stat(outPath)).size
    finalMime = "video/mp4"
    const base = nameParam.replace(/\.[^.]+$/, "")
    finalName = `${base}.mp4`
  }

  const video = await prisma.inspectionVideo.create({
    data: {
      inspectionId: insp.id,
      fileName: finalName,
      storedName,
      mimeType: finalMime,
      sizeBytes: finalSize,
    },
  })

  return NextResponse.json({ ok: true, id: video.id, fileName: finalName, sizeBytes: finalSize })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
  } catch (e) {
    return NextResponse.json({ error: "Нет доступа" }, { status: authStatus(e) })
  }
  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 })

  const video = await prisma.inspectionVideo.findUnique({
    where: { id },
    include: { inspection: { select: { purchaseId: true } } },
  })
  if (!video) return NextResponse.json({ ok: true })
  await unlink(join(videoDir(video.inspection.purchaseId), video.storedName)).catch(() => {})
  await prisma.inspectionVideo.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
