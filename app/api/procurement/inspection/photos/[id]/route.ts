// GET /api/procurement/inspection/photos/[id] — превью фото (jpeg)
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
  const photo = await prisma.inspectionPhoto.findUnique({
    where: { id },
    include: { inspection: { select: { purchaseId: true } } },
  })
  if (!photo) return NextResponse.json({ error: "Не найдено" }, { status: 404 })

  let buffer: Buffer
  try {
    buffer = await readFile(
      join(BASE, "procurement", photo.inspection.purchaseId, "inspection", "photos", photo.storedName)
    )
  } catch {
    return NextResponse.json({ error: "Файл недоступен" }, { status: 404 })
  }
  return new NextResponse(new Uint8Array(buffer), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=3600" },
  })
}
