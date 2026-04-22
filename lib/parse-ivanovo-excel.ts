// lib/parse-ivanovo-excel.ts
// Phase 14 (STOCK-11, STOCK-28): парсер Excel склада Иваново.
//
// Формат файла (синтетический fixture tests/fixtures/ivanovo-sample.xlsx,
// Plan 14-04 Zero Wave Deviation — реальный файл будет загружен пользователем позже):
//   Заголовки в строке 0 (fuzzy matching, регистр-независимо):
//   - Штрих-код / Штрихкод / Barcode / EAN → колонка barcode
//   - Артикул / SKU / Article / УКТ         → колонка sku (primary match key)
//   - Количество / Qty / Quantity / Остаток  → колонка quantity
//   - Наименование / Name                   → колонка name (для display, опц.)
//
// Паттерн: fuzzy header matching по первой строке (не hardcoded индексы)
// Первая строка (index 0) = заголовки → пропускается для парсинга данных.

import * as XLSX from "xlsx"

// ──────────────────────────────────────────────────────────────────
// Интерфейсы (экспортируются для API route + тестов)
// ──────────────────────────────────────────────────────────────────

export interface ParsedIvanovoRow {
  /** Строка-источник (1-based для сообщений пользователю) */
  rowIndex: number
  /** Штрих-код (может быть null если колонки нет) */
  barcode: string | null
  /** Артикул/УКТ — сырой, до normalizeSku (нормализация в upsertIvanovoStock) */
  sku: string | null
  /** Наименование (для display) */
  name: string | null
  /** Количество (≥ 0, integer) */
  quantity: number
}

export interface ParsedIvanovo_Invalid {
  rowIndex: number
  barcode?: string
  sku?: string
  name?: string
  reason: string
}

export interface ParsedIvanovo_Duplicate {
  /** Штрих-код ИЛИ артикул (ключ дубликата) */
  key: string
  keyType: "barcode" | "sku"
  rows: number[]  // 1-based rowIndex
}

export interface ParseIvanovoResult {
  /** Корректные строки — готовы к DB-матчингу в API route */
  valid: ParsedIvanovoRow[]
  /** Строки с ошибками (пустые ключи, отрицательные qty, непарсируемые числа) */
  invalid: ParsedIvanovo_Invalid[]
  /**
   * Дубликаты по штрих-коду или артикулу в рамках одного файла.
   * valid массив СОДЕРЖИТ дублируемые строки (последнее значение выиграет при upsert),
   * duplicates — мета-информация для отображения пользователю.
   */
  duplicates: ParsedIvanovo_Duplicate[]
  /**
   * Карта найденных колонок: ключ → индекс.
   * Нужна для отладки при неожиданном формате файла.
   */
  columnMap: {
    barcode: number | null
    sku: number | null
    quantity: number | null
    name: number | null
  }
}

// ──────────────────────────────────────────────────────────────────
// Fuzzy header matching
// ──────────────────────────────────────────────────────────────────

const BARCODE_HEADERS = ["штрих-код", "штрихкод", "barcode", "ean", "ean-13", "ean13"]
const SKU_HEADERS = ["артикул", "арт.", "sku", "article", "укт", "укт-код"]
const QTY_HEADERS = ["количество", "кол-во", "кол", "qty", "quantity", "остаток", "остатки"]
const NAME_HEADERS = ["наименование", "название", "name", "товар"]

function matchHeader(cell: string | number | null | undefined, variants: string[]): boolean {
  if (cell == null) return false
  const s = String(cell).trim().toLowerCase()
  return variants.some(v => s.includes(v))
}

function detectColumns(
  headerRow: (string | number | null | undefined)[]
): { barcode: number | null; sku: number | null; quantity: number | null; name: number | null } {
  let barcode: number | null = null
  let sku: number | null = null
  let quantity: number | null = null
  let name: number | null = null

  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i]
    if (barcode === null && matchHeader(cell, BARCODE_HEADERS)) {
      barcode = i
    } else if (sku === null && matchHeader(cell, SKU_HEADERS)) {
      sku = i
    } else if (quantity === null && matchHeader(cell, QTY_HEADERS)) {
      quantity = i
    } else if (name === null && matchHeader(cell, NAME_HEADERS)) {
      name = i
    }
  }

  return { barcode, sku, quantity, name }
}

// ──────────────────────────────────────────────────────────────────
// Основная функция парсинга
// ──────────────────────────────────────────────────────────────────

export function parseIvanovoExcel(buf: Buffer): ParseIvanovoResult {
  const wb = XLSX.read(buf, { type: "buffer" })
  const sheetName = wb.SheetNames[0]
  if (!sheetName) {
    return {
      valid: [],
      invalid: [],
      duplicates: [],
      columnMap: { barcode: null, sku: null, quantity: null, name: null },
    }
  }

  const sheet = wb.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json<(string | number | null | undefined)[]>(
    sheet,
    { header: 1, defval: null },
  )

  if (rows.length === 0) {
    return {
      valid: [],
      invalid: [],
      duplicates: [],
      columnMap: { barcode: null, sku: null, quantity: null, name: null },
    }
  }

  // Строка 0 — заголовки (fuzzy detection)
  const headerRow = rows[0] ?? []
  const columnMap = detectColumns(headerRow)

  const valid: ParsedIvanovoRow[] = []
  const invalid: ParsedIvanovo_Invalid[] = []

  // Для дубликатов — отслеживаем ключи
  const barcodeIndex = new Map<string, number[]>() // barcode → rowIndexes
  const skuIndex = new Map<string, number[]>()     // sku → rowIndexes

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i]
    const rowIndex = i + 1 // 1-based (Excel row number с учётом заголовка)

    // Пустые строки (все значимые ячейки null/empty) — просто пропускаем
    if (!r || r.length === 0) continue

    const barcodeRaw = columnMap.barcode !== null ? r[columnMap.barcode] : null
    const skuRaw = columnMap.sku !== null ? r[columnMap.sku] : null
    const qtyRaw = columnMap.quantity !== null ? r[columnMap.quantity] : null
    const nameRaw = columnMap.name !== null ? r[columnMap.name] : null

    const barcode = barcodeRaw != null && barcodeRaw !== "" ? String(barcodeRaw).trim() : null
    const sku = skuRaw != null && skuRaw !== "" ? String(skuRaw).trim() : null
    const name = nameRaw != null && nameRaw !== "" ? String(nameRaw).trim() : null

    // Строки, где обе ключевые колонки пустые, пропускаем (пустая строка файла)
    if (barcode === null && sku === null) {
      // Если есть хоть что-то в других полях — invalid (частично заполненная строка)
      if (qtyRaw != null && qtyRaw !== "") {
        invalid.push({
          rowIndex,
          name: name ?? undefined,
          reason: "Пустой штрих-код и артикул",
        })
      }
      continue
    }

    // Валидация qty
    if (qtyRaw == null || qtyRaw === "") {
      invalid.push({
        rowIndex,
        barcode: barcode ?? undefined,
        sku: sku ?? undefined,
        name: name ?? undefined,
        reason: "Пустое количество",
      })
      continue
    }

    const qty = typeof qtyRaw === "number" ? qtyRaw : parseFloat(String(qtyRaw))
    if (!Number.isFinite(qty) || !Number.isInteger(qty)) {
      invalid.push({
        rowIndex,
        barcode: barcode ?? undefined,
        sku: sku ?? undefined,
        name: name ?? undefined,
        reason: `Некорректное количество: "${qtyRaw}" (ожидается целое число)`,
      })
      continue
    }
    if (qty < 0) {
      invalid.push({
        rowIndex,
        barcode: barcode ?? undefined,
        sku: sku ?? undefined,
        name: name ?? undefined,
        reason: `Отрицательное количество: ${qty}`,
      })
      continue
    }

    // Строка валидна — добавляем в valid
    valid.push({ rowIndex, barcode, sku, name, quantity: qty })

    // Трекинг для дубликатов
    if (barcode) {
      const existing = barcodeIndex.get(barcode) ?? []
      existing.push(rowIndex)
      barcodeIndex.set(barcode, existing)
    }
    if (sku) {
      const existing = skuIndex.get(sku) ?? []
      existing.push(rowIndex)
      skuIndex.set(sku, existing)
    }
  }

  // Собираем дубликаты
  const duplicates: ParsedIvanovo_Duplicate[] = []
  for (const [key, rowIndexes] of barcodeIndex.entries()) {
    if (rowIndexes.length > 1) {
      duplicates.push({ key, keyType: "barcode", rows: rowIndexes })
    }
  }
  for (const [key, rowIndexes] of skuIndex.entries()) {
    if (rowIndexes.length > 1) {
      // Не дублируем, если уже найден по barcode
      const alreadyByBarcode = duplicates.some(d => d.keyType === "barcode" && d.rows.some(r => rowIndexes.includes(r)))
      if (!alreadyByBarcode) {
        duplicates.push({ key, keyType: "sku", rows: rowIndexes })
      }
    }
  }

  return { valid, invalid, duplicates, columnMap }
}
