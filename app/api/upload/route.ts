// app/api/upload/route.ts
// POST /api/upload — multipart file upload to filesystem
// Auth required; returns { url: "/uploads/{filename}" }
export const runtime = "nodejs"

import { auth } from "@/lib/auth"
import { NextRequest, NextResponse } from "next/server"
import { mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"

const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png"]

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 })
  }

  const file = formData.get("file") as File | null
  const productId = formData.get("productId") as string | null

  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  }

  if (!productId) {
    return NextResponse.json({ error: "productId обязателен" }, { status: 400 })
  }

  // Server-side MIME check
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Допустимы только JPEG и PNG изображения" },
      { status: 400 }
    )
  }

  const ext = file.type === "image/png" ? "png" : "jpg"
  const filename = `${productId}-${Date.now()}.${ext}`

  const uploadDir =
    process.env.UPLOAD_DIR ??
    (process.env.NODE_ENV === "production"
      ? "/var/www/zoiten-uploads"
      : "/tmp/zoiten-uploads")

  try {
    await mkdir(uploadDir, { recursive: true })
    const buffer = Buffer.from(await file.arrayBuffer())
    await writeFile(join(uploadDir, filename), buffer)
  } catch (e) {
    console.error("Upload error:", e)
    return NextResponse.json({ error: "Ошибка сохранения файла" }, { status: 500 })
  }

  return NextResponse.json({ url: `/uploads/${filename}` })
}
