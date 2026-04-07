// app/api/wb-commission-iu/route.ts
// POST /api/wb-commission-iu — загрузка Excel с индивидуальными условиями комиссий
export const runtime = "nodejs"

import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
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
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })

    if (rows.length < 2) {
      return NextResponse.json({ error: "Файл пустой или без данных" }, { status: 400 })
    }

    // Пропускаем заголовок (строка 0)
    // Формат: Категория, Предмет, Склад WB %, Склад продавца %, DBS %, Экспресс %, Самовывоз, Бронирование
    const records: Array<{
      parentName: string
      subjectName: string
      fbw: number
      fbs: number
      dbs: number
      express: number
      pickup: number
      booking: number
    }> = []

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || !row[0] || !row[1]) continue

      const parentName = String(row[0]).trim()
      const subjectName = String(row[1]).trim()
      if (!subjectName) continue

      records.push({
        parentName,
        subjectName,
        fbw: parseFloat(String(row[2])) || 0,
        fbs: parseFloat(String(row[3])) || 0,
        dbs: parseFloat(String(row[4])) || 0,
        express: parseFloat(String(row[5])) || 0,
        pickup: parseFloat(String(row[6])) || 0,
        booking: parseFloat(String(row[7])) || 0,
      })
    }

    if (records.length === 0) {
      return NextResponse.json({ error: "Не удалось распарсить строки" }, { status: 400 })
    }

    // Полная перезаливка: удаляем старые, вставляем новые
    await prisma.$transaction([
      prisma.wbCommissionIu.deleteMany(),
      prisma.wbCommissionIu.createMany({ data: records }),
    ])

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
