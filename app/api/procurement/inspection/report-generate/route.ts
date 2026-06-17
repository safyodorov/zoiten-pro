// POST /api/procurement/inspection/report-generate  { purchaseId, summary }
// Генерирует PDF-отчёт инспекции: стр.1 инфо о закупке + параметры инспекции,
// стр.2 резюме, далее фото по 4 на страницу. Фото сжимаются под бюджет, чтобы
// итог ≤ 20 МБ. PDF сохраняется как файл отчёта инспекции (не отдаётся напрямую).
export const runtime = "nodejs"
export const maxDuration = 300

import { NextRequest, NextResponse } from "next/server"
import { mkdir, readFile, unlink, stat } from "node:fs/promises"
import { createWriteStream, existsSync } from "node:fs"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import sharp from "sharp"
import PDFDocument from "pdfkit"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"

const BASE =
  process.env.UPLOAD_DIR ??
  (process.env.NODE_ENV === "production" ? "/var/www/zoiten-uploads" : "/tmp/zoiten-uploads")

// Кириллические шрифты (есть на VPS). Fallback на встроенный Helvetica (без кириллицы).
const FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

function inspDir(purchaseId: string): string {
  return join(BASE, "procurement", purchaseId, "inspection")
}
function photoPath(purchaseId: string, stored: string): string {
  return join(inspDir(purchaseId), "photos", stored)
}
function ruDate(d: Date | null): string {
  if (!d) return "—"
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}
function money(n: number): string {
  return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 })
}

// Сжать фото под бюджет байт (понижая размер/качество ступенями).
async function compressToBudget(src: string, budget: number): Promise<Buffer> {
  const tiers = [
    { dim: 1000, q: 72 },
    { dim: 820, q: 64 },
    { dim: 680, q: 56 },
    { dim: 540, q: 48 },
    { dim: 440, q: 40 },
    { dim: 360, q: 34 },
  ]
  let buf: Buffer | undefined
  for (let i = 0; i < tiers.length; i++) {
    buf = await sharp(src)
      .rotate()
      .resize(tiers[i].dim, tiers[i].dim, { fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: tiers[i].q })
      .toBuffer()
    if (buf.length <= budget) break
  }
  return buf as Buffer
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
  } catch (e) {
    const status = e instanceof Error && e.message === "FORBIDDEN" ? 403 : 401
    return NextResponse.json({ error: "Нет доступа" }, { status })
  }

  let body: { purchaseId?: string; summary?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: "Неверный формат" }, { status: 400 })
  }
  const purchaseId = body.purchaseId
  const summary = (body.summary ?? "").trim()
  if (!purchaseId) return NextResponse.json({ error: "purchaseId обязателен" }, { status: 400 })

  const purchase = await prisma.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      supplier: { select: { nameEnglish: true, buyer: { select: { lastName: true, firstName: true } } } },
      items: { select: { quantity: true, unitPrice: true } },
      inspection: { include: { contacts: true, photos: { orderBy: { sortOrder: "asc" } } } },
    },
  })
  if (!purchase) return NextResponse.json({ error: "Закупка не найдена" }, { status: 404 })

  // Сохраняем резюме в инспекцию (upsert)
  const insp = await prisma.purchaseInspection.upsert({
    where: { purchaseId },
    create: { purchaseId, reportSummary: summary || null },
    update: { reportSummary: summary || null },
    include: { contacts: true, photos: { orderBy: { sortOrder: "asc" } } },
  })

  const photos = insp.photos
  const total = purchase.items.reduce((s, i) => s + i.quantity * Number(i.unitPrice), 0)
  const budget = Math.floor((19 * 1024 * 1024) / Math.max(1, photos.length))

  const outName = `report-${randomUUID()}.pdf`
  const outPath = join(inspDir(purchaseId), outName)

  try {
    await mkdir(inspDir(purchaseId), { recursive: true })

    const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: false })
    const hasFont = existsSync(FONT_REG) && existsSync(FONT_BOLD)
    if (hasFont) {
      doc.registerFont("reg", FONT_REG)
      doc.registerFont("bold", FONT_BOLD)
    }
    const reg = hasFont ? "reg" : "Helvetica"
    const bold = hasFont ? "bold" : "Helvetica-Bold"

    const ws = createWriteStream(outPath)
    const done = new Promise<void>((resolve, reject) => {
      ws.on("finish", () => resolve())
      ws.on("error", reject)
    })
    doc.pipe(ws)

    const M = 40

    // ── Стр. 1: информация ──
    doc.addPage()
    const W = doc.page.width - M * 2
    doc.font(bold).fontSize(18).text("ОТЧЁТ ПО ИНСПЕКЦИИ", { align: "center" })
    doc.moveDown(1)

    const line = (label: string, value: string) => {
      doc.font(bold).fontSize(10).text(label + ": ", { continued: true })
      doc.font(reg).text(value)
    }

    doc.font(bold).fontSize(13).text("Закупка")
    doc.moveDown(0.3)
    line("Поставщик", purchase.supplier.nameEnglish)
    line(
      "Закупщик",
      purchase.supplier.buyer
        ? `${purchase.supplier.buyer.lastName} ${purchase.supplier.buyer.firstName}`.trim()
        : "—"
    )
    line("Статус", purchase.status)
    line("Стоимость", `${money(total)} ${purchase.currency}`)
    line("Создана", ruDate(purchase.createdAt))
    doc.moveDown(1)

    doc.font(bold).fontSize(13).text("Параметры инспекции")
    doc.moveDown(0.3)
    line("Плановая дата", ruDate(insp.plannedDate))
    line("Фактическая дата", ruDate(insp.actualDate))
    line("Стоимость инспекции", insp.costRub != null ? `${money(Number(insp.costRub))} ₽` : "—")
    line("Инспектор", insp.inspectorName || "—")
    if (insp.contacts.length) {
      for (const c of insp.contacts) {
        const parts = [c.phone ? `тел: ${c.phone}` : null, c.wechat ? `WeChat: ${c.wechat}` : null]
          .filter(Boolean)
          .join(", ")
        if (parts) doc.font(reg).fontSize(10).text(`   • ${parts}`)
      }
    }
    line("Фотографий", String(photos.length))

    // ── Стр. 2: резюме ──
    doc.addPage()
    doc.font(bold).fontSize(13).text("Резюме инспекции")
    doc.moveDown(0.5)
    doc.font(reg).fontSize(11).text(summary || "—", { align: "left", width: W })

    // ── Фото: 4 на страницу (2×2) ──
    const gap = 12
    for (let i = 0; i < photos.length; i++) {
      const slot = i % 4
      if (slot === 0) doc.addPage()
      const cellW = (W - gap) / 2
      const pageH = doc.page.height - M * 2
      const cellH = (pageH - gap) / 2
      const col = slot % 2
      const row = Math.floor(slot / 2)
      const x = M + col * (cellW + gap)
      const y = M + row * (cellH + gap)
      try {
        const buf = await compressToBudget(photoPath(purchaseId, photos[i].storedName), budget)
        doc.image(buf, x, y, { fit: [cellW, cellH], align: "center", valign: "center" })
      } catch {
        // пропускаем нечитаемое фото
        doc.font(reg).fontSize(9).text("(фото недоступно)", x, y)
      }
    }

    doc.end()
    await done
  } catch (e) {
    console.error("report-generate error:", e)
    await unlink(outPath).catch(() => {})
    return NextResponse.json({ error: "Ошибка генерации отчёта" }, { status: 500 })
  }

  const size = (await stat(outPath)).size
  const reportName = `Отчёт инспекции ${ruDate(insp.actualDate ?? new Date())}.pdf`

  // удалить предыдущий файл отчёта (если был и отличается)
  if (insp.reportStored && insp.reportStored !== outName) {
    await unlink(join(inspDir(purchaseId), insp.reportStored)).catch(() => {})
  }
  await prisma.purchaseInspection.update({
    where: { purchaseId },
    data: {
      reportName,
      reportStored: outName,
      reportMime: "application/pdf",
      reportSize: size,
    },
  })

  return NextResponse.json({ ok: true, sizeBytes: size })
}
