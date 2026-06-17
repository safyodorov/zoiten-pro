// POST   /api/procurement/inspection/file  — загрузить ТЗ или отчёт (multipart: purchaseId, kind, file)
// GET    /api/procurement/inspection/file?purchaseId=&kind=  — скачать
// DELETE /api/procurement/inspection/file?purchaseId=&kind=  — удалить
// kind = "techspec" | "report"
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { mkdir, writeFile, readFile, unlink } from "node:fs/promises"
import { join, extname } from "node:path"
import { randomUUID } from "node:crypto"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

const BASE =
  process.env.UPLOAD_DIR ??
  (process.env.NODE_ENV === "production" ? "/var/www/zoiten-uploads" : "/tmp/zoiten-uploads")

const MAX_BYTES = 25 * 1024 * 1024 // ТЗ/отчёт — до 25 МБ

function inspDir(purchaseId: string): string {
  return join(BASE, "procurement", purchaseId, "inspection")
}
function isKind(v: unknown): v is "techspec" | "report" {
  return v === "techspec" || v === "report"
}
function authStatus(e: unknown): number {
  return e instanceof Error && e.message === "FORBIDDEN" ? 403 : 401
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
  } catch (e) {
    return NextResponse.json({ error: "Нет доступа" }, { status: authStatus(e) })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 })
  }
  const file = form.get("file")
  const purchaseId = form.get("purchaseId")
  const kind = form.get("kind")

  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  if (typeof purchaseId !== "string" || !purchaseId)
    return NextResponse.json({ error: "purchaseId обязателен" }, { status: 400 })
  if (!isKind(kind)) return NextResponse.json({ error: "Неверный kind" }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Файл больше 25 МБ" }, { status: 400 })

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true },
  })
  if (!purchase) return NextResponse.json({ error: "Закупка не найдена" }, { status: 404 })

  const ext = extname(file.name).slice(0, 12)
  const storedName = `${kind}-${randomUUID()}${ext}`
  try {
    await mkdir(inspDir(purchaseId), { recursive: true })
    await writeFile(join(inspDir(purchaseId), storedName), Buffer.from(await file.arrayBuffer()))
  } catch (e) {
    console.error("inspection file write error:", e)
    return NextResponse.json({ error: "Ошибка сохранения" }, { status: 500 })
  }

  // upsert inspection + запись полей файла; старый файл удаляем
  const existing = await prisma.purchaseInspection.findUnique({
    where: { purchaseId },
    select: kind === "techspec" ? { techSpecStored: true } : { reportStored: true },
  })
  const oldStored =
    kind === "techspec"
      ? (existing as { techSpecStored: string | null } | null)?.techSpecStored
      : (existing as { reportStored: string | null } | null)?.reportStored

  const fileFields =
    kind === "techspec"
      ? {
          techSpecName: file.name,
          techSpecStored: storedName,
          techSpecMime: file.type || "application/octet-stream",
          techSpecSize: file.size,
        }
      : {
          reportName: file.name,
          reportStored: storedName,
          reportMime: file.type || "application/octet-stream",
          reportSize: file.size,
        }

  await prisma.purchaseInspection.upsert({
    where: { purchaseId },
    create: { purchaseId, ...fileFields },
    update: fileFields,
  })

  if (oldStored && oldStored !== storedName) {
    await unlink(join(inspDir(purchaseId), oldStored)).catch(() => {})
  }

  return NextResponse.json({ ok: true })
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT")
  } catch (e) {
    return NextResponse.json({ error: "Нет доступа" }, { status: authStatus(e) })
  }

  const purchaseId = req.nextUrl.searchParams.get("purchaseId")
  const kind = req.nextUrl.searchParams.get("kind")
  if (!purchaseId || !isKind(kind))
    return NextResponse.json({ error: "Параметры некорректны" }, { status: 400 })

  const insp = await prisma.purchaseInspection.findUnique({ where: { purchaseId } })
  if (!insp) return NextResponse.json({ error: "Нет инспекции" }, { status: 404 })

  const stored = kind === "techspec" ? insp.techSpecStored : insp.reportStored
  const name = kind === "techspec" ? insp.techSpecName : insp.reportName
  const mime = kind === "techspec" ? insp.techSpecMime : insp.reportMime
  if (!stored) return NextResponse.json({ error: "Файл не загружен" }, { status: 404 })

  let buffer: Buffer
  try {
    buffer = await readFile(join(inspDir(purchaseId), stored))
  } catch {
    return NextResponse.json({ error: "Файл недоступен" }, { status: 404 })
  }
  const encoded = encodeURIComponent(name ?? stored)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": mime || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
      "Content-Length": String(buffer.length),
    },
  })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
  } catch (e) {
    return NextResponse.json({ error: "Нет доступа" }, { status: authStatus(e) })
  }
  const purchaseId = req.nextUrl.searchParams.get("purchaseId")
  const kind = req.nextUrl.searchParams.get("kind")
  if (!purchaseId || !isKind(kind))
    return NextResponse.json({ error: "Параметры некорректны" }, { status: 400 })

  const insp = await prisma.purchaseInspection.findUnique({ where: { purchaseId } })
  if (!insp) return NextResponse.json({ ok: true })

  const stored = kind === "techspec" ? insp.techSpecStored : insp.reportStored
  if (stored) await unlink(join(inspDir(purchaseId), stored)).catch(() => {})

  await prisma.purchaseInspection.update({
    where: { purchaseId },
    data:
      kind === "techspec"
        ? { techSpecName: null, techSpecStored: null, techSpecMime: null, techSpecSize: null }
        : { reportName: null, reportStored: null, reportMime: null, reportSize: null },
  })
  return NextResponse.json({ ok: true })
}
