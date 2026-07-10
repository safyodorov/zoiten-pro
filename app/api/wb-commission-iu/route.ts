// app/api/wb-commission-iu/route.ts
// POST /api/wb-commission-iu — загрузка Excel с индивидуальными условиями комиссий
export const runtime = "nodejs"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { snapshotCommissionChanges } from "@/lib/wb-commission-history"
import {
  parseWbCommissionIuRows,
  type WbCommissionIuRecord,
} from "@/lib/wb-commission-iu-parser"
import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"

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
  if (!file) {
    return NextResponse.json({ error: "Файл не найден" }, { status: 400 })
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const workbook = XLSX.read(buffer, { type: "buffer" })
    const sheet = workbook.Sheets[workbook.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 })

    if (rows.length < 2) {
      return NextResponse.json({ error: "Файл пустой или без данных" }, { status: 400 })
    }

    // Колонки определяются по заголовкам — WB сменил порядок с ~07.07.2026
    // (легаси-формат поддержан). См. lib/wb-commission-iu-parser.ts.
    let records: WbCommissionIuRecord[]
    try {
      records = parseWbCommissionIuRows(rows)
    } catch (e) {
      // Нераспознанная шапка — проблема файла (400), не сервера
      return NextResponse.json({ error: (e as Error).message }, { status: 400 })
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "Не удалось распарсить строки" }, { status: 400 })
    }

    // Полная перезаливка: удаляем старые, вставляем новые
    await prisma.$transaction([
      prisma.wbCommissionIu.deleteMany(),
      prisma.wbCommissionIu.createMany({ data: records }),
    ])

    // W2d (quick 260710-hkj): снапшот истории комиссий. Route пишет только
    // WbCommissionIu — WbCard обновит следующий /api/wb-sync (join по category),
    // поэтому вызов здесь обычно no-op. Но он захватывает изменения, если
    // WbCard правили вручную/SQL между синками (решение пользователя 2026-07-10).
    try {
      const snapshotted = await snapshotCommissionChanges()
      if (snapshotted > 0) console.log(`[wb-commission-iu] commission snapshots: ${snapshotted}`)
    } catch (e) {
      console.error("[wb-commission-iu] commission snapshot failed:", e)
    }

    return NextResponse.json({
      imported: records.length,
      message: `Загружено ${records.length} записей ИУ`,
    })
  } catch (e) {
    console.error("ИУ upload error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка обработки файла" },
      { status: 500 }
    )
  }
}
