// POST /api/analytics/upload — валидация 6 detail-JSON «Сравнение карточек» + превью топ-30 (ANL-01).
// Гейт: requireSection ANALYTICS VIEW. Реюз extractTop30 (30-04) — единый парсер/валидатор.
// Анти-DoS (T-30-03): проверка количества (===6) и размера каждого файла (≤5МБ) ДО JSON.parse.
// Возвращает превью (30 SKU: nmId/brand/mainPhoto) + wire-данные для startNicheRun (30-08).
export const runtime = "nodejs"
export const maxDuration = 120

import { NextRequest, NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import { extractTop30, serializeTop30 } from "@/lib/analytics/data"

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5 МБ на файл
const REQUIRED_FILES = 6

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    await requireSection("ANALYTICS", "VIEW")
  } catch (e) {
    const status = e instanceof Error && e.message === "FORBIDDEN" ? 403 : 401
    return NextResponse.json({ error: "Нет доступа" }, { status })
  }

  let form: FormData
  try {
    form = await req.formData()
  } catch {
    return NextResponse.json({ error: "Ожидается multipart/form-data" }, { status: 400 })
  }

  const files = form.getAll("files").filter((f): f is File => f instanceof File)
  if (files.length !== REQUIRED_FILES) {
    return NextResponse.json(
      { error: `Нужно ровно ${REQUIRED_FILES} файлов (получено ${files.length})` },
      { status: 400 },
    )
  }

  // Размер ДО парсинга (анти-DoS).
  for (const f of files) {
    if (f.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `Файл «${f.name}» превышает 5 МБ` },
        { status: 400 },
      )
    }
  }

  // Парсинг JSON каждого файла.
  const rawFiles: unknown[] = []
  for (const f of files) {
    try {
      rawFiles.push(JSON.parse(await f.text()))
    } catch {
      return NextResponse.json({ error: `Файл «${f.name}» — не валидный JSON` }, { status: 400 })
    }
  }

  // Валидация + извлечение топ-30 (кросс-файловая дедуп, единый период, ровно 30 SKU).
  try {
    const result = extractTop30(rawFiles)
    const wire = serializeTop30(result)
    const preview = result.skus.map((nmId) => {
      const cp = result.commonParamsByNmId.get(nmId)
      return { nmId, brand: cp?.brandName ?? "", mainPhoto: cp?.mainPhoto ?? "", name: cp?.nmName ?? "" }
    })
    return NextResponse.json({
      ok: true,
      preview,
      dateFrom: result.dateFrom,
      dateTo: result.dateTo,
      data: wire,
    })
  } catch (e) {
    // Явное человекочитаемое сообщение из data.ts (дубликат nmID / период / <30 SKU / битая структура).
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ошибка валидации файлов" }, { status: 400 })
  }
}
