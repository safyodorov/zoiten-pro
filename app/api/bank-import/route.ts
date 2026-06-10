// app/api/bank-import/route.ts
// POST /api/bank-import — загрузка Excel-выписки банка, авто-детект формата, сохранение операций.
// Phase 22 (22-04): детект → парсинг → persistParsedTransactions.
// Все логика upsert/createMany/ImportBatch живёт ТОЛЬКО в persist.ts.
export const runtime = "nodejs" // xlsx требует Node.js runtime (не Edge)

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { detectFormat, parseStatement } from "@/lib/bank-import"
import { persistParsedTransactions } from "@/lib/bank-import/persist"

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

    // Для Сбер merged cells нужен raw: false — сначала зондируем workbook для detectFormat,
    // затем перечитываем с raw: false если формат Сбер.
    // ⚠ ВТБ может печатать «Bad uncompressed size» в stderr — данные читаются корректно.
    const probe = XLSX.read(buffer, { type: "buffer" })
    const format = detectFormat(file.name, probe)
    const workbook =
      format === "sber" ? XLSX.read(buffer, { type: "buffer", raw: false }) : probe

    const { transactions } = parseStatement(format, workbook)

    const result = await persistParsedTransactions(prisma, transactions, {
      fileName: file.name,
      sourceBank: format,
      importedById: session.user.id ?? null,
    })

    return NextResponse.json({
      imported: result.imported,
      skipped: result.skipped,
      total: result.total,
      format,
    })
  } catch (e) {
    console.error("Bank import error:", e)
    return NextResponse.json(
      { error: (e as Error).message || "Ошибка обработки файла" },
      { status: 500 },
    )
  }
}
