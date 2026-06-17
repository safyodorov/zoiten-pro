// GET /api/procurement/documents/zip?purchaseId=... — ZIP всех документов закупки
// со структурой папок (Документы для таможни/<категория>, Документы прочие).
export const runtime = "nodejs"

import { NextRequest, NextResponse } from "next/server"
import { join } from "node:path"
import archiver from "archiver"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { zipFolderFor, type DocCategory } from "@/lib/purchase-documents"

const BASE =
  process.env.UPLOAD_DIR ??
  (process.env.NODE_ENV === "production" ? "/var/www/zoiten-uploads" : "/tmp/zoiten-uploads")

export async function GET(req: NextRequest): Promise<Response> {
  try {
    await requireSection("PROCUREMENT")
  } catch (e) {
    const status = e instanceof Error && e.message === "FORBIDDEN" ? 403 : 401
    return NextResponse.json({ error: "Нет доступа" }, { status })
  }

  const purchaseId = req.nextUrl.searchParams.get("purchaseId")
  if (!purchaseId) return NextResponse.json({ error: "purchaseId обязателен" }, { status: 400 })

  const docs = await prisma.purchaseDocument.findMany({
    where: { purchaseId },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  })
  if (docs.length === 0) {
    return NextResponse.json({ error: "Документов нет" }, { status: 404 })
  }

  const archive = archiver("zip", { zlib: { level: 9 } })
  // защита от коллизий имён в одной папке
  const usedNames = new Set<string>()

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      archive.on("data", (chunk: Buffer) => controller.enqueue(new Uint8Array(chunk)))
      archive.on("end", () => controller.close())
      archive.on("warning", (err: Error) => console.warn("zip warning:", err))
      archive.on("error", (err: Error) => controller.error(err))

      for (const d of docs) {
        const folder = zipFolderFor(d.category as DocCategory)
        let name = `${folder}/${d.fileName}`
        let n = 1
        while (usedNames.has(name)) {
          const dot = d.fileName.lastIndexOf(".")
          const base = dot > 0 ? d.fileName.slice(0, dot) : d.fileName
          const ext = dot > 0 ? d.fileName.slice(dot) : ""
          name = `${folder}/${base} (${n})${ext}`
          n++
        }
        usedNames.add(name)
        archive.file(join(BASE, "procurement", d.purchaseId, d.storedName), { name })
      }
      archive.finalize()
    },
  })

  const zipName = `documents-${purchaseId}.zip`
  return new Response(stream, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${zipName}"`,
    },
  })
}
