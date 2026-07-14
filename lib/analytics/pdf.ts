// lib/analytics/pdf.ts
// Phase 30 (analytics) — PDF-выгрузка прогона ниши (ANL-11).
// pdfkit (уже в проекте) + sharp для сжатия фото. Графики рисуются примитивами
// moveTo/lineTo/stroke (RESEARCH Pattern 7) — без клиентских чарт-библиотек/headless-браузера на сервере.
// Кириллица: регистрация системного DejaVuSans (есть на VPS) с graceful fallback
// на Helvetica (локально/без шрифта — глифы неверные, но без падения; прод рендерит корректно).
// Порядок SKU = sortSkus(payload.skus, sortMode) — совпадает с экранной сортировкой.
import PDFDocument from "pdfkit"
import sharp from "sharp"
import { existsSync } from "node:fs"
import { sortSkus } from "./engine"
import type { NicheRunPayload, SkuPayload, SortMode } from "./types"

const FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
const FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
const ACCENT = "#e0562b"
const CHART_MUTED = "#c8c8c8"

function pct(x: number): string {
  return `${(x * 100).toFixed(1)}%`
}
function money(n: number): string {
  return Math.round(n).toLocaleString("ru-RU")
}

/** Порядок SKU в PDF = экранная сортировка (единый источник — sortSkus). */
export function orderSkusForPdf(payload: NicheRunPayload, sortMode: SortMode): SkuPayload[] {
  return sortSkus(payload.skus, sortMode)
}

/** Скачать фото и сжать под байт-бюджет (sharp). Ошибка сети/декода → null (фото пропускается). */
async function fetchPhotoBuffer(url: string, budget: number): Promise<Buffer | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const raw = Buffer.from(await res.arrayBuffer())
    const tiers = [
      { dim: 600, q: 66 },
      { dim: 460, q: 56 },
      { dim: 360, q: 46 },
    ]
    let out: Buffer = raw
    for (const t of tiers) {
      out = await sharp(raw).rotate().resize(t.dim, t.dim, { fit: "inside", withoutEnlargement: true }).jpeg({ quality: t.q }).toBuffer()
      if (out.length <= budget) break
    }
    return out
  } catch {
    return null
  }
}

/**
 * Линейный график из ряда значений в прямоугольнике (x,y,w,h).
 * < 2 валидных точек → только рамка (не падает). fill+stroke gotcha: явный save/restore
 * + strokeColor, чтобы линия не наследовала fill предыдущих операций.
 */
function drawLineChart(
  doc: PDFKit.PDFDocument,
  values: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  color: string,
): void {
  doc.save()
  doc.lineWidth(0.5).strokeColor(CHART_MUTED)
  doc.rect(x, y, w, h).stroke()

  const finite = values.filter((v) => Number.isFinite(v))
  if (finite.length >= 2) {
    const min = Math.min(...finite)
    const max = Math.max(...finite)
    const range = max - min || 1
    doc.lineWidth(1).strokeColor(color)
    values.forEach((v, i) => {
      const px = x + (w * i) / (values.length - 1)
      const py = y + h - ((v - min) / range) * h
      if (i === 0) doc.moveTo(px, py)
      else doc.lineTo(px, py)
    })
    doc.stroke()
  }
  doc.restore()
}

/**
 * Строит PDF прогона: (a) сводная таблица 30 строк (артикул, бренд, выручка/мес, конв.клик→заказ),
 * (b) по-SKU блоки (артикул+бренд, выручка/мес, конв.клик→заказ, до 5 фото листинга,
 * график цены, графики конверсий клик→корзина / клик→заказ).
 */
export async function renderNicheRunPdf(
  payload: NicheRunPayload,
  sortMode: SortMode,
): Promise<Buffer> {
  const skus = orderSkusForPdf(payload, sortMode)

  const doc = new PDFDocument({ size: "A4", margin: 40, autoFirstPage: false })
  const hasFont = existsSync(FONT_REG) && existsSync(FONT_BOLD)
  if (hasFont) {
    doc.registerFont("reg", FONT_REG)
    doc.registerFont("bold", FONT_BOLD)
  }
  const reg = hasFont ? "reg" : "Helvetica"
  const bold = hasFont ? "bold" : "Helvetica-Bold"

  const chunks: Buffer[] = []
  doc.on("data", (c: Buffer) => chunks.push(c))
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))))

  const M = 40
  const W = doc.page ? doc.page.width - M * 2 : 515

  // ── Секция (a): сводная таблица ──
  doc.addPage()
  doc.font(bold).fontSize(16).text("Топ-30 SKU в нише", { align: "center" })
  doc
    .font(reg)
    .fontSize(10)
    .fillColor("#666666")
    .text(`Период: ${payload.dateFrom} — ${payload.dateTo}`, { align: "center" })
  doc.fillColor("#000000").moveDown(1)

  doc.font(bold).fontSize(12).text("Сводная таблица")
  doc.moveDown(0.4)

  const cols = { rank: M, article: M + 30, brand: M + 130, revenue: M + 300, conv: M + 420 }
  const headerY = doc.y
  doc.font(bold).fontSize(9)
  doc.text("#", cols.rank, headerY)
  doc.text("Артикул", cols.article, headerY)
  doc.text("Бренд", cols.brand, headerY)
  doc.text("Выручка/мес, ₽", cols.revenue, headerY)
  doc.text("Клик→заказ", cols.conv, headerY)
  doc.moveTo(M, doc.y + 2).lineTo(M + W, doc.y + 2).lineWidth(0.5).strokeColor(CHART_MUTED).stroke()
  doc.moveDown(0.5)

  doc.font(reg).fontSize(9)
  skus.forEach((s, i) => {
    const rowY = doc.y
    doc.fillColor("#000000")
    doc.text(String(i + 1), cols.rank, rowY, { width: 26 })
    doc.text(String(s.nmId), cols.article, rowY, { width: 96 })
    doc.text(s.brand || "—", cols.brand, rowY, { width: 166, ellipsis: true })
    doc.text(money(s.revenue), cols.revenue, rowY, { width: 116 })
    doc.text(pct(s.funnel.clickToOrder), cols.conv, rowY, { width: 90 })
    doc.moveDown(0.35)
    if (doc.y > doc.page.height - M - 20) doc.addPage()
  })

  // ── Секция (b): по-SKU блоки ──
  const photoBudget = 350 * 1024
  for (const s of skus) {
    doc.addPage()
    doc.font(bold).fontSize(13).fillColor("#000000").text(`${s.name || "—"} · ${s.brand || "—"}`)
    doc.font(reg).fontSize(10).fillColor("#444444")
    doc.text(`Артикул: ${s.nmId}    Продавец: ${s.seller || "—"}    Рейтинг: ${s.rating ?? "—"} (${s.feedbacksCount ?? 0} отз.)`)
    doc.text(`Выручка/мес: ${money(s.revenue)} ₽    Конв. клик→заказ: ${pct(s.funnel.clickToOrder)}    Ср. цена: ${money(s.funnel.medianPriceWallet)} ₽`)
    doc.fillColor("#000000").moveDown(0.5)

    // Фото листинга (до 5 в ряд)
    const photoTop = doc.y
    let px = M
    for (const url of s.listingPhotos.slice(0, 5)) {
      const buf = await fetchPhotoBuffer(url, photoBudget)
      if (buf) {
        try {
          doc.image(buf, px, photoTop, { fit: [92, 122], align: "center", valign: "center" })
        } catch {
          /* нечитаемое фото — пропускаем */
        }
      }
      px += 100
    }
    doc.y = photoTop + 132

    // График цены
    doc.font(reg).fontSize(9).fillColor("#000000").text("Цена (с СПП, −3% Кошелёк), ₽")
    drawLineChart(doc, s.priceDays.map((p) => p.value), M, doc.y + 2, 240, 68, ACCENT)

    // Графики конверсий (клик→корзина, клик→заказ)
    const cartConv = s.funnelDays.map((d) => (d.openCard > 0 ? d.addToCart / d.openCard : 0))
    const orderConv = s.funnelDays.map((d) => (d.openCard > 0 ? d.orders / d.openCard : 0))
    const convY = doc.y + 2
    doc.text("Конв. клик→корзина", M + 260, convY - 12)
    drawLineChart(doc, cartConv, M + 260, convY, 240, 68, "#2b8ce0")
    doc.y = convY + 78
    doc.font(reg).fontSize(9).text("Конв. клик→заказ")
    drawLineChart(doc, orderConv, M, doc.y + 2, 240, 68, "#2ba84a")
    doc.y += 78
  }

  doc.end()
  return done
}
