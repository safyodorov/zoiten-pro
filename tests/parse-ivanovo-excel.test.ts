// tests/parse-ivanovo-excel.test.ts
// Phase 14 (STOCK-28): тесты парсера Excel склада Иваново.
//
// Использует синтетическую fixture tests/fixtures/ivanovo-sample.xlsx
// (создана в Plan 14-04, структура:
//   Row 0 = заголовки [Штрих-код, Артикул, Наименование, Количество, Дата инвентаризации]
//   Rows 1-5 = 5 валидных строк (УКТ-000001..000005)
//   Rows 6-7 = дубликат штрих-кода 4607091403461 (qty 20 и 25)
//   Rows 8-9 = 2 unmatched (несуществующие sku)
//   Row 10   = invalid: qty = -5
//   Row 11   = invalid: пустой штрих-код и артикул
// )
//
// NOTE: unmatched (не найдено в БД) — это зона ответственности API route,
// чистый парсер не делает DB-запросов.

import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import * as XLSX from "xlsx"
import { parseIvanovoExcel, type ParseIvanovoResult } from "@/lib/parse-ivanovo-excel"

const FIXTURE_PATH = "tests/fixtures/ivanovo-sample.xlsx"

// ──────────────────────────────────────────────────────────────────
// Вспомогательные функции для создания тестовых буферов
// ──────────────────────────────────────────────────────────────────

function makeXlsx(rows: (string | number | null)[][]): Buffer {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, "Лист1")
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
}

// ──────────────────────────────────────────────────────────────────
// Тесты
// ──────────────────────────────────────────────────────────────────

describe("parseIvanovoExcel", () => {
  // ── 1. Happy path с реальной (синтетической) fixture ──────────

  it("happy path: fixture парсится, 9 valid строк (5 уникальных + 2 дубля + 2 unmatched-by-sku)", () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result: ParseIvanovoResult = parseIvanovoExcel(buf)

    // fixture: rows 1-9 валидны по формату (qty ≥ 0, есть barcode/sku)
    // rows 10-11 — invalid
    expect(result.valid.length).toBe(9)
  })

  it("заголовок (строка 0) НЕ попадает в valid", () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result = parseIvanovoExcel(buf)
    // Если бы строка 0 попала в valid, в sku было бы "Артикул"
    const skuValues = result.valid.map(r => r.sku?.toLowerCase() ?? "")
    expect(skuValues).not.toContain("артикул")
    expect(skuValues).not.toContain("sku")
  })

  it("fixture: первая valid строка = УКТ-000001 qty=150", () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result = parseIvanovoExcel(buf)
    const first = result.valid[0]!
    expect(first.sku).toBe("УКТ-000001")
    expect(first.barcode).toBe("4607091403456")
    expect(first.quantity).toBe(150)
  })

  it("fixture: qty=0 допустимо (нулевой остаток — валидный)", () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result = parseIvanovoExcel(buf)
    const zeroQty = result.valid.find(r => r.sku === "УКТ-000003")
    expect(zeroQty).toBeDefined()
    expect(zeroQty!.quantity).toBe(0)
  })

  // ── 2. Fuzzy header matching ───────────────────────────────────

  it("fuzzy headers: 'Barcode' / 'SKU' / 'Quantity' (латиница) — распознаёт колонки", () => {
    const buf = makeXlsx([
      ["Barcode", "SKU", "Name", "Quantity"],
      ["4600001234567", "УКТ-000001", "Тест товар", 10],
      ["4600001234568", "УКТ-000002", "Тест товар 2", 20],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.valid.length).toBe(2)
    expect(result.columnMap.barcode).toBe(0)
    expect(result.columnMap.sku).toBe(1)
    expect(result.columnMap.quantity).toBe(3)
    expect(result.valid[0]!.quantity).toBe(10)
  })

  it("fuzzy headers: 'Остаток' вместо 'Количество' — корректно сматчивается", () => {
    const buf = makeXlsx([
      ["Штрихкод", "Артикул", "Остаток"],
      ["4600001234567", "УКТ-000001", 42],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.valid.length).toBe(1)
    expect(result.valid[0]!.quantity).toBe(42)
  })

  it("fuzzy headers: 'Штрихкод' (без дефиса) — сматчивается как barcode", () => {
    const buf = makeXlsx([
      ["Штрихкод", "Артикул", "Количество"],
      ["4600001234567", "УКТ-000001", 5],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.columnMap.barcode).toBe(0)
    expect(result.valid[0]!.barcode).toBe("4600001234567")
  })

  // ── 3. Дубликаты ──────────────────────────────────────────────

  it("fixture: дубликат штрих-кода 4607091403461 обнаруживается (rows 6 и 7)", () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result = parseIvanovoExcel(buf)
    const dup = result.duplicates.find(d => d.key === "4607091403461")
    expect(dup).toBeDefined()
    expect(dup!.keyType).toBe("barcode")
    expect(dup!.rows.length).toBe(2)
  })

  it("дубликаты попадают в valid (оба экземпляра) — dedup через last-write-wins в API route", () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result = parseIvanovoExcel(buf)
    const dupRows = result.valid.filter(r => r.barcode === "4607091403461")
    expect(dupRows.length).toBe(2)
    // Последний имеет qty=25
    expect(dupRows[dupRows.length - 1]!.quantity).toBe(25)
  })

  it("inline дублирование: 3 строки с одним sku → в duplicates, все в valid", () => {
    const buf = makeXlsx([
      ["Штрих-код", "Артикул", "Количество"],
      ["1111111111111", "УКТ-000001", 10],
      ["2222222222222", "УКТ-000001", 20],
      ["3333333333333", "УКТ-000001", 30],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.valid.length).toBe(3)
    const dup = result.duplicates.find(d => d.key === "УКТ-000001")
    expect(dup).toBeDefined()
    expect(dup!.rows.length).toBe(3)
  })

  // ── 4. Невалидные строки ──────────────────────────────────────

  it("отрицательное количество → в invalid", () => {
    const buf = makeXlsx([
      ["Штрих-код", "Артикул", "Количество"],
      ["4607091403470", "УКТ-000010", -5],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.valid.length).toBe(0)
    expect(result.invalid.length).toBe(1)
    expect(result.invalid[0]!.reason).toMatch(/отрицательное/i)
  })

  it("fixture: строка 11 (пустой штрих-код и артикул) → invalid", () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result = parseIvanovoExcel(buf)
    const emptyKeyInvalid = result.invalid.find(r => r.reason.includes("Пустой"))
    expect(emptyKeyInvalid).toBeDefined()
  })

  it("пустое количество → invalid", () => {
    const buf = makeXlsx([
      ["Штрих-код", "Артикул", "Количество"],
      ["4607091403456", "УКТ-000001", null],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.invalid.length).toBe(1)
    expect(result.invalid[0]!.reason).toMatch(/пустое количество/i)
  })

  it("нечисловое количество → invalid", () => {
    const buf = makeXlsx([
      ["Штрих-код", "Артикул", "Количество"],
      ["4607091403456", "УКТ-000001", "abc"],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.invalid.length).toBe(1)
  })

  // ── 5. Edge cases ─────────────────────────────────────────────

  it("пустые строки между данными — пропускаются (не в invalid)", () => {
    const buf = makeXlsx([
      ["Штрих-код", "Артикул", "Количество"],
      ["4607091403456", "УКТ-000001", 10],
      [null, null, null],  // пустая строка
      ["4607091403457", "УКТ-000002", 20],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.valid.length).toBe(2)
    expect(result.invalid.length).toBe(0)
  })

  it("пустой лист → {valid: [], invalid: [], duplicates: []}", () => {
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet([])
    XLSX.utils.book_append_sheet(wb, ws, "Лист1")
    const buf = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }))
    const result = parseIvanovoExcel(buf)
    expect(result.valid).toEqual([])
    expect(result.invalid).toEqual([])
    expect(result.duplicates).toEqual([])
  })

  it("нет колонки количества → все строки invalid", () => {
    const buf = makeXlsx([
      ["Штрих-код", "Артикул"],  // нет колонки qty
      ["4607091403456", "УКТ-000001"],
    ])
    const result = parseIvanovoExcel(buf)
    expect(result.columnMap.quantity).toBeNull()
    expect(result.invalid.length).toBe(1)
    expect(result.invalid[0]!.reason).toMatch(/пустое количество/i)
  })

  it("columnMap корректно заполняется для синтетической fixture", () => {
    const buf = readFileSync(FIXTURE_PATH)
    const result = parseIvanovoExcel(buf)
    // fixture: [Штрих-код=0, Артикул=1, Наименование=2, Количество=3, Дата=4]
    expect(result.columnMap.barcode).toBe(0)
    expect(result.columnMap.sku).toBe(1)
    expect(result.columnMap.name).toBe(2)
    expect(result.columnMap.quantity).toBe(3)
  })
})
