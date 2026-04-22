// app/api/stock/ivanovo-upload/route.ts
// Phase 14 (STOCK-11, STOCK-12): POST multipart → preview JSON
//
// Принимает .xlsx файл остатков склада Иваново, парсит через parseIvanovoExcel,
// нормализует УКТ через normalizeSku, делает lookup в БД и возвращает
// preview-результат с 4 секциями:
//   - valid:           строки, готовые к применению (product найден в БД)
//   - unmatched:       строки, SKU которых нет в Product таблице
//   - duplicates:      дубли штрих-кода/артикула в файле
//   - invalid:         строки с ошибками формата
//   - invalidParseRows: 1-based rowIndex невалидных строк (для display)
//
// Фактическое применение — через upsertIvanovoStock server action из Dialog.
// Этот route только парсит + делает lookup. В БД ничего не пишет.

export const runtime = "nodejs" // XLSX не работает в Edge runtime

import { NextRequest, NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { parseIvanovoExcel } from "@/lib/parse-ivanovo-excel"
import { normalizeSku } from "@/lib/normalize-sku"

// ── Типы preview-ответа ─────────────────────────────────────────

export interface IvanovoPreviewValid {
  sku: string             // нормализованный УКТ
  productId: string
  productName: string
  oldQty: number | null   // текущий ivanovoStock в БД
  newQty: number          // из файла
}

export interface IvanovoPreviewUnmatched {
  skuRaw: string          // сырой артикул из файла
  sku: string             // нормализованный (или original если normalizeSku не смог)
  barcode: string | null  // штрих-код из файла (если есть)
  newQty: number
}

export interface IvanovoPreviewDuplicate {
  key: string             // штрих-код или артикул
  keyType: "barcode" | "sku"
  occurrences: number
  lastQty: number         // qty последнего вхождения в файле
}

export interface IvanovoPreviewInvalid {
  skuRaw: string
  barcode?: string
  error: string
}

export interface IvanovoPreviewResponse {
  valid: IvanovoPreviewValid[]
  unmatched: IvanovoPreviewUnmatched[]
  duplicates: IvanovoPreviewDuplicate[]
  invalid: IvanovoPreviewInvalid[]
  invalidParseRows: number[]  // 1-based rowIndex для UI сообщений
}

// ── Route handler ───────────────────────────────────────────────

export async function POST(req: NextRequest): Promise<NextResponse> {
  // RBAC — только пользователи с правом STOCK MANAGE
  try {
    await requireSection("STOCK", "MANAGE")
  } catch {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: "Неверный формат запроса" }, { status: 400 })
  }

  const file = formData.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Файл не загружен" }, { status: 400 })
  }

  const buf = Buffer.from(await file.arrayBuffer())

  // Парсинг Excel
  let parsed
  try {
    parsed = parseIvanovoExcel(buf)
  } catch (e) {
    return NextResponse.json(
      {
        error: `Не удалось прочитать Excel: ${(e as Error).message}. Проверьте формат — ожидается файл с колонками: Штрих-код, Артикул, Количество.`,
      },
      { status: 400 },
    )
  }

  // Нормализуем SKU для каждой валидной строки
  interface NormalizedRow {
    rowIndex: number
    barcode: string | null
    skuRaw: string | null
    skuNorm: string | null
    normalizeError?: string
    quantity: number
  }

  const normalized: NormalizedRow[] = parsed.valid.map((row) => {
    if (!row.sku) {
      // Нет артикула — используем штрих-код как ключ для unmatched display
      return { rowIndex: row.rowIndex, barcode: row.barcode, skuRaw: null, skuNorm: null, quantity: row.quantity }
    }
    try {
      const skuNorm = normalizeSku(row.sku)
      return { rowIndex: row.rowIndex, barcode: row.barcode, skuRaw: row.sku, skuNorm, quantity: row.quantity }
    } catch (e) {
      return {
        rowIndex: row.rowIndex,
        barcode: row.barcode,
        skuRaw: row.sku,
        skuNorm: null,
        normalizeError: (e as Error).message,
        quantity: row.quantity,
      }
    }
  })

  // Собираем уникальные нормализованные SKU для DB-запроса
  const uniqueSkus = [...new Set(normalized.filter((r) => r.skuNorm).map((r) => r.skuNorm!))]

  const existingProducts = await prisma.product.findMany({
    where: { sku: { in: uniqueSkus }, deletedAt: null },
    select: { id: true, sku: true, name: true, ivanovoStock: true },
  })
  const productsBySku = new Map(existingProducts.map((p) => [p.sku, p]))

  // Строим preview-ответ
  const valid: IvanovoPreviewValid[] = []
  const unmatched: IvanovoPreviewUnmatched[] = []
  const invalid: IvanovoPreviewInvalid[] = []

  // Трекинг last-write-wins для дубликатов в valid
  const validBySku = new Map<string, IvanovoPreviewValid>()

  for (const row of normalized) {
    if (!row.skuNorm) {
      // normalizeSku упал — в invalid
      invalid.push({
        skuRaw: row.skuRaw ?? "(нет)",
        barcode: row.barcode ?? undefined,
        error: (row as { normalizeError?: string }).normalizeError ?? "Невалидный артикул",
      })
      continue
    }

    const product = productsBySku.get(row.skuNorm)
    if (!product) {
      unmatched.push({
        skuRaw: row.skuRaw ?? row.skuNorm,
        sku: row.skuNorm,
        barcode: row.barcode,
        newQty: row.quantity,
      })
      continue
    }

    // Товар найден в БД — last-write-wins по SKU (дубликаты в файле)
    validBySku.set(row.skuNorm, {
      sku: row.skuNorm,
      productId: product.id,
      productName: product.name,
      oldQty: product.ivanovoStock,
      newQty: row.quantity,
    })
  }

  valid.push(...validBySku.values())

  // Добавляем invalid из парсера (format-level ошибки)
  for (const inv of parsed.invalid) {
    invalid.push({
      skuRaw: inv.sku ?? inv.barcode ?? "(нет)",
      barcode: inv.barcode,
      error: inv.reason,
    })
  }

  // Дубликаты из парсера — обогащаем lastQty
  const duplicates: IvanovoPreviewDuplicate[] = parsed.duplicates.map((d) => {
    // Ищем последнюю строку с этим ключом в parsed.valid
    const relevantRows = parsed.valid
      .filter((r) =>
        d.keyType === "barcode" ? r.barcode === d.key : r.sku === d.key,
      )
      .sort((a, b) => b.rowIndex - a.rowIndex)
    const lastQty = relevantRows[0]?.quantity ?? 0
    return {
      key: d.key,
      keyType: d.keyType,
      occurrences: d.rows.length,
      lastQty,
    }
  })

  const response: IvanovoPreviewResponse = {
    valid,
    unmatched,
    duplicates,
    invalid,
    invalidParseRows: parsed.invalid.map((r) => r.rowIndex),
  }

  return NextResponse.json(response)
}
