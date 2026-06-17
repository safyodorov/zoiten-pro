// GET /api/procurement/documents/[id] — скачать один документ закупки
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
  const doc = await prisma.purchaseDocument.findUnique({ where: { id } })
  if (!doc) return NextResponse.json({ error: "Документ не найден" }, { status: 404 })

  let buffer: Buffer
  try {
    buffer = await readFile(join(BASE, "procurement", doc.purchaseId, doc.storedName))
  } catch {
    return NextResponse.json({ error: "Файл недоступен" }, { status: 404 })
  }

  const encoded = encodeURIComponent(doc.fileName)
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": doc.mimeType || "application/octet-stream",
      "Content-Disposition": `attachment; filename*=UTF-8''${encoded}`,
      "Content-Length": String(buffer.length),
    },
  })
}
