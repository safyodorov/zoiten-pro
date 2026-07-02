// lib/stock-wb-export.ts
// Quick 260702: экспорт раздела /stock/wb в Excel с фото товаров.
// Формат повторяет таблицу StockWbTable (сокращённый набор колонок):
//   Фото | Сводка | Артикул | Иваново | Всего на ВБ | Товар в пути (Всего/от/к)
// На каждый товар: строка «Сводная» (фото + агрегаты), строки per-nmId,
// размерные строки для многоразмерных артикулов (sizeBreakdown из stock-wb-data).
//
// Фото: WB CDN (https) качаются через curl — Node fetch блокируется WB по
// TLS fingerprint (см. CLAUDE.md); локальные /uploads/ читаются с диска.
// Миниатюры 144×192 jpeg через sharp, module-level кэш между экспортами.

import path from "node:path"
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import ExcelJS from "exceljs"
import sharp from "sharp"
import type { ProductWbGroup } from "@/lib/stock-wb-data"

const execFileAsync = promisify(execFile)

const THUMB_W = 144 // 2x от отображаемых 72×96 — чётче при зуме
const THUMB_H = 192
const DISPLAY_W = 72
const DISPLAY_H = 96
const DOWNLOAD_CONCURRENCY = 8

const photoCache = new Map<string, Buffer | null>()
const PHOTO_CACHE_MAX = 500

function uploadDir(): string {
  return (
    process.env.UPLOAD_DIR ??
    (process.env.NODE_ENV === "production"
      ? "/var/www/zoiten-uploads"
      : "/tmp/zoiten-uploads")
  )
}

async function fetchPhotoThumb(photoUrl: string): Promise<Buffer | null> {
  const cached = photoCache.get(photoUrl)
  if (cached !== undefined) return cached

  let thumb: Buffer | null = null
  try {
    let source: Buffer | string
    if (/^https?:\/\//.test(photoUrl)) {
      const { stdout } = await execFileAsync(
        "curl",
        ["-sf", "--max-time", "20", photoUrl],
        { encoding: "buffer", maxBuffer: 50 * 1024 * 1024 },
      )
      source = stdout
    } else {
      source = path.join(uploadDir(), photoUrl.replace(/^\/uploads\//, ""))
    }
    thumb = await sharp(source)
      .resize(THUMB_W, THUMB_H, { fit: "cover" })
      .jpeg({ quality: 80 })
      .toBuffer()
  } catch {
    thumb = null
  }

  if (photoCache.size >= PHOTO_CACHE_MAX) photoCache.clear()
  photoCache.set(photoUrl, thumb)
  return thumb
}

/** Null-safe сумма как в StockWbTable: все null → null, иначе сумма не-null. */
function sumNullable(vals: Array<number | null>): number | null {
  return vals.reduce<number | null>(
    (acc, v) => (v === null ? acc : (acc ?? 0) + v),
    null,
  )
}

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD9D9D9" } },
  left: { style: "thin", color: { argb: "FFD9D9D9" } },
  bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
  right: { style: "thin", color: { argb: "FFD9D9D9" } },
}

export async function buildStockWbExportBuffer(
  groups: ProductWbGroup[],
): Promise<Buffer> {
  // Предзагрузка фото с ограниченной параллельностью
  const urls = [
    ...new Set(
      groups.map((g) => g.photoUrl).filter((u): u is string => Boolean(u)),
    ),
  ]
  for (let i = 0; i < urls.length; i += DOWNLOAD_CONCURRENCY) {
    await Promise.all(
      urls.slice(i, i + DOWNLOAD_CONCURRENCY).map((u) => fetchPhotoThumb(u)),
    )
  }

  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet("Остатки WB", {
    views: [{ state: "frozen", ySplit: 2 }],
  })

  ws.columns = [
    { key: "photo", width: 12 },
    { key: "name", width: 45 },
    { key: "article", width: 14 },
    { key: "ivanovo", width: 10 },
    { key: "totalWb", width: 12 },
    { key: "inWayTotal", width: 10 },
    { key: "inWayFrom", width: 8 },
    { key: "inWayTo", width: 8 },
  ]

  // Шапка в 2 строки: «Товар в пути» с под-колонками Всего/от/к (как в UI)
  ws.mergeCells("A1:A2")
  ws.mergeCells("B1:B2")
  ws.mergeCells("C1:C2")
  ws.mergeCells("D1:D2")
  ws.mergeCells("E1:E2")
  ws.mergeCells("F1:H1")
  ws.getCell("A1").value = "Фото"
  ws.getCell("B1").value = "Сводка"
  ws.getCell("C1").value = "Артикул"
  ws.getCell("D1").value = "Иваново"
  ws.getCell("E1").value = "Всего на ВБ"
  ws.getCell("F1").value = "Товар в пути"
  ws.getCell("F2").value = "Всего"
  ws.getCell("G2").value = "от"
  ws.getCell("H2").value = "к"
  for (const rowNum of [1, 2]) {
    const row = ws.getRow(rowNum)
    row.font = { bold: true, size: 10 }
    row.alignment = { horizontal: "center", vertical: "middle" }
  }
  ws.getRow(1).height = 18
  ws.getRow(2).height = 16

  let rowIdx = 2 // последняя заполненная строка (2 = шапка)

  for (const g of groups) {
    const cardCalcs = g.wbCards.map((card) => {
      const inWayTotal =
        card.inWayToClient === null && card.inWayFromClient === null
          ? null
          : (card.inWayToClient ?? 0) + (card.inWayFromClient ?? 0)
      const totalOnWb =
        card.totalStock === null && inWayTotal === null
          ? null
          : (card.totalStock ?? 0) + (inWayTotal ?? 0)
      return { card, inWayTotal, totalOnWb }
    })

    const rowTotalStock = sumNullable(g.wbCards.map((c) => c.totalStock))
    const rowInWayTo = sumNullable(g.wbCards.map((c) => c.inWayToClient))
    const rowInWayFrom = sumNullable(g.wbCards.map((c) => c.inWayFromClient))
    const rowInWayTotal =
      rowInWayTo === null && rowInWayFrom === null
        ? null
        : (rowInWayTo ?? 0) + (rowInWayFrom ?? 0)
    const rowTotalOnWb =
      rowTotalStock === null && rowInWayTotal === null
        ? null
        : (rowTotalStock ?? 0) + (rowInWayTotal ?? 0)

    const groupStart = rowIdx + 1

    const summaryRow = ws.addRow({
      name: `${g.productName}\n${g.productSku} · ${g.brandName}`,
      article: "Сводная",
      ivanovo: g.ivanovoStock ?? "—",
      totalWb: rowTotalOnWb ?? "—",
      inWayTotal: rowInWayTotal ?? "—",
      inWayFrom: rowInWayFrom ?? "—",
      inWayTo: rowInWayTo ?? "—",
    })
    rowIdx++
    summaryRow.height = 76
    summaryRow.font = { bold: true, size: 10 }
    summaryRow.getCell("name").font = { size: 10 }

    if (g.photoUrl) {
      const thumb = photoCache.get(g.photoUrl)
      if (thumb) {
        // exceljs типизирует buffer как ArrayBuffer (Node Buffer не проходит по типам)
        const arrayBuffer = thumb.buffer.slice(
          thumb.byteOffset,
          thumb.byteOffset + thumb.byteLength,
        ) as ArrayBuffer
        const imageId = wb.addImage({ buffer: arrayBuffer, extension: "jpeg" })
        ws.addImage(imageId, {
          tl: { col: 0.15, row: rowIdx - 1 + 0.05 },
          ext: { width: DISPLAY_W, height: DISPLAY_H },
          editAs: "oneCell",
        })
      }
    }

    for (const { card, inWayTotal, totalOnWb } of cardCalcs) {
      const r = ws.addRow({
        article: card.nmId,
        ivanovo: "",
        totalWb: totalOnWb ?? "—",
        inWayTotal: inWayTotal ?? "—",
        inWayFrom: card.inWayFromClient ?? "—",
        inWayTo: card.inWayToClient ?? "—",
      })
      rowIdx++
      r.font = { size: 10 }

      // Размерные строки — только многоразмерные артикулы (одежда).
      // per-size «в пути» не хранится → пустые ячейки (как «—» в UI).
      for (const sizeRow of card.sizeBreakdown) {
        const sRow = ws.addRow({
          article: `   ↳ ${sizeRow.techSize || "—"}`,
          totalWb: sizeRow.totalStock ?? "—",
        })
        rowIdx++
        sRow.font = { size: 9, color: { argb: "FF666666" } }
        for (let c = 2; c <= 8; c++) {
          sRow.getCell(c).fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF2F2F2" },
          }
        }
      }
    }

    // Фото + Сводка объединены на всю группу
    if (rowIdx > groupStart) {
      ws.mergeCells(groupStart, 1, rowIdx, 1)
      ws.mergeCells(groupStart, 2, rowIdx, 2)
    }
    ws.getCell(groupStart, 2).alignment = { wrapText: true, vertical: "top" }

    // Границы + выравнивание
    for (let r = groupStart; r <= rowIdx; r++) {
      for (let c = 1; c <= 8; c++) {
        const cell = ws.getCell(r, c)
        cell.border = THIN_BORDER
        if (c === 3) {
          cell.alignment = { ...(cell.alignment ?? {}), horizontal: "left" }
        } else if (c >= 4) {
          cell.alignment = { ...(cell.alignment ?? {}), horizontal: "right" }
        }
      }
    }
    // Жирная граница сверху группы
    for (let c = 1; c <= 8; c++) {
      ws.getCell(groupStart, c).border = {
        ...THIN_BORDER,
        top: { style: "medium", color: { argb: "FF999999" } },
      }
    }
  }

  const out = await wb.xlsx.writeBuffer()
  return Buffer.from(out as ArrayBuffer)
}
