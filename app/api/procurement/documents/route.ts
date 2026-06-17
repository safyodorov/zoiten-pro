// POST /api/procurement/documents — загрузка документа закупки (multipart)
// DELETE /api/procurement/documents?id=... — удаление документа
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { mkdir, writeFile, unlink } from "node:fs/promises"
import { join, extname } from "node:path"
import { randomUUID } from "node:crypto"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import {
  isDocCategory,
  MAX_DOC_BYTES,
  MAX_DOCS_PER_CATEGORY,
} from "@/lib/purchase-documents"

const BASE =
  process.env.UPLOAD_DIR ??
  (process.env.NODE_ENV === "production" ? "/var/www/zoiten-uploads" : "/tmp/zoiten-uploads")

function docDir(purchaseId: string): string {
  return join(BASE, "procurement", purchaseId)
}

function authStatus(e: unknown): number {
  if (e instanceof Error && e.message === "FORBIDDEN") return 403
  return 401
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
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 })
  }

  const file = form.get("file")
  const purchaseId = form.get("purchaseId")
  const category = form.get("category")

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  }
  if (typeof purchaseId !== "string" || !purchaseId) {
    return NextResponse.json({ error: "purchaseId обязателен" }, { status: 400 })
  }
  if (!isDocCategory(category)) {
    return NextResponse.json({ error: "Неверная категория" }, { status: 400 })
  }
  if (file.size > MAX_DOC_BYTES) {
    return NextResponse.json({ error: "Файл больше 10 МБ" }, { status: 400 })
  }

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    select: { id: true },
  })
  if (!purchase) {
    return NextResponse.json({ error: "Закупка не найдена" }, { status: 404 })
  }

  const count = await prisma.purchaseDocument.count({ where: { purchaseId, category } })
  if (count >= MAX_DOCS_PER_CATEGORY) {
    return NextResponse.json(
      { error: `Лимит ${MAX_DOCS_PER_CATEGORY} файлов в категории` },
      { status: 400 }
    )
  }

  const ext = extname(file.name).slice(0, 12)
  const storedName = `${randomUUID()}${ext}`
  try {
    await mkdir(docDir(purchaseId), { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(join(docDir(purchaseId), storedName), buffer)
  } catch (e) {
    console.error("doc upload write error:", e)
    return NextResponse.json({ error: "Ошибка сохранения файла" }, { status: 500 })
  }

  const doc = await prisma.purchaseDocument.create({
    data: {
      purchaseId,
      category,
      fileName: file.name,
      storedName,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
    },
  })

  return NextResponse.json({ ok: true, doc })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
  } catch (e) {
    return NextResponse.json({ error: "Нет доступа" }, { status: authStatus(e) })
  }

  const id = req.nextUrl.searchParams.get("id")
  if (!id) return NextResponse.json({ error: "id обязателен" }, { status: 400 })

  const doc = await prisma.purchaseDocument.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: "Документ не найден" }, { status: 404 })

  try {
    await unlink(join(docDir(doc.purchaseId), doc.storedName))
  } catch {
    // файла может не быть — продолжаем удаление записи
  }
  await prisma.purchaseDocument.delete({ where: { id } })

  return NextResponse.json({ ok: true })
}
