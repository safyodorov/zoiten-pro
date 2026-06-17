// POST   /api/procurement/inspection/photos  — добавить фото для отчёта (multipart: purchaseId, file)
// DELETE /api/procurement/inspection/photos?id=...           — удалить одно
// DELETE /api/procurement/inspection/photos?purchaseId=&all=1 — удалить все
// Фото приходят уже сжатыми с клиента; на сервере нормализуем в jpeg ≤1280px.
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { mkdir, writeFile, unlink } from "node:fs/promises"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import sharp from "sharp"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

const BASE =
  process.env.UPLOAD_DIR ??
  (process.env.NODE_ENV === "production" ? "/var/www/zoiten-uploads" : "/tmp/zoiten-uploads")

const MAX_PHOTOS = 300

function photoDir(purchaseId: string): string {
  return join(BASE, "procurement", purchaseId, "inspection", "photos")
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
  if (!(file instanceof File)) return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  if (typeof purchaseId !== "string" || !purchaseId)
    return NextResponse.json({ error: "purchaseId обязателен" }, { status: 400 })

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

  const count = await prisma.inspectionPhoto.count({ where: { inspectionId: insp.id } })
  if (count >= MAX_PHOTOS) {
    return NextResponse.json({ error: `Лимит ${MAX_PHOTOS} фото` }, { status: 400 })
  }

  const storedName = `${randomUUID()}.jpg`
  try {
    await mkdir(photoDir(purchaseId), { recursive: true })
    const out = await sharp(Buffer.from(await file.arrayBuffer()))
      .rotate()
      .resize(1280, 1280, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer()
    await writeFile(join(photoDir(purchaseId), storedName), out)
  } catch (e) {
    console.error("inspection photo write error:", e)
    return NextResponse.json({ error: "Ошибка обработки фото" }, { status: 500 })
  }

  const max = await prisma.inspectionPhoto.aggregate({
    where: { inspectionId: insp.id },
    _max: { sortOrder: true },
  })
  const photo = await prisma.inspectionPhoto.create({
    data: {
      inspectionId: insp.id,
      storedName,
      sortOrder: (max._max.sortOrder ?? 0) + 1,
    },
  })

  return NextResponse.json({ ok: true, id: photo.id, count: count + 1 })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
  } catch (e) {
    return NextResponse.json({ error: "Нет доступа" }, { status: authStatus(e) })
  }

  const id = req.nextUrl.searchParams.get("id")
  const purchaseId = req.nextUrl.searchParams.get("purchaseId")
  const all = req.nextUrl.searchParams.get("all")

  if (id) {
    const photo = await prisma.inspectionPhoto.findUnique({
      where: { id },
      include: { inspection: { select: { purchaseId: true } } },
    })
    if (!photo) return NextResponse.json({ ok: true })
    await unlink(join(photoDir(photo.inspection.purchaseId), photo.storedName)).catch(() => {})
    await prisma.inspectionPhoto.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  }

  if (purchaseId && all) {
    const insp = await prisma.purchaseInspection.findUnique({
      where: { purchaseId },
      select: { id: true, photos: { select: { storedName: true } } },
    })
    if (insp) {
      for (const p of insp.photos) {
        await unlink(join(photoDir(purchaseId), p.storedName)).catch(() => {})
      }
      await prisma.inspectionPhoto.deleteMany({ where: { inspectionId: insp.id } })
    }
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ error: "Параметры некорректны" }, { status: 400 })
}
