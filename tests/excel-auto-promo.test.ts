import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"
import { parseAutoPromoExcel } from "@/lib/parse-auto-promo-excel"

// ──────────────────────────────────────────────────────────────────
// Excel auto-promo parser — tests/fixtures/auto-promo-sample.xlsx
// ──────────────────────────────────────────────────────────────────
//
// Парсер auto-акций (D-06) читает колонки по индексам (НЕ по названиям,
// т.к. WB может менять заголовки между релизами кабинета).
//
// Индексы зафиксированы по реальному fixture (20 колонок, индексы 0..19):
//
//   A (0)  — "Товар уже участвует в акции" → inAction ("Да" / "Нет")
//   F (5)  — "Артикул WB"                  → nmId (число)
//   L (11) — "Плановая цена для акции"     → planPrice (₽)
//   M (12) — "Текущая розничная цена"      → currentPrice (₽)
//   S (18) — "Загружаемая скидка…"         → planDiscount (%)
//   T (19) — "Статус"                      → status (строка)
//
// ВАЖНО (07-04 deviation): план 07-04 ошибочно указывал T=19/U=20 (off-by-one),
// реальные индексы — S=18 для planDiscount и T=19 для status. Корректные
// индексы зафиксированы в этом тесте и в lib/parse-auto-promo-excel.ts.
//
// Этот тест — НЕ RED stub (парсер использует стандартный xlsx sheet_to_json),
// а структурная проверка fixture: гарантирует, что реальный Excel из кабинета
// WB имеет ожидаемую геометрию колонок.

describe("Excel auto-promo — структура fixture", () => {
  const fixturePath = path.resolve(process.cwd(), "tests/fixtures/auto-promo-sample.xlsx")

  it("fixture существует и читается", () => {
    expect(fs.existsSync(fixturePath)).toBe(true)
    const buf = fs.readFileSync(fixturePath)
    expect(buf.byteLength).toBeGreaterThan(1000)
  })

  it("содержит минимум одну data row с валидным nmId в колонке F (index 5)", () => {
    const buf = fs.readFileSync(fixturePath)
    const wb = XLSX.read(buf, { type: "buffer" })
    const sheet = wb.Sheets[wb.SheetNames[0]!]!
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    })

    // Первые строки — заголовки WB кабинета, пропускаем
    expect(rows.length).toBeGreaterThan(1)

    const dataRows = rows.filter((r) => {
      if (!r || r.length < 6) return false
      const cell = r[5]
      if (cell == null) return false
      const n = Number(cell)
      return !Number.isNaN(n) && n > 1000
    })
    expect(dataRows.length).toBeGreaterThan(0)

    const firstDataRow = dataRows[0]!
    const nmId = Number(firstDataRow[5])
    expect(Number.isInteger(nmId)).toBe(true)
    expect(nmId).toBeGreaterThan(0)
  })

  it("колонка A (index 0) содержит только 'Да' / 'Нет' / пусто в data rows", () => {
    const buf = fs.readFileSync(fixturePath)
    const wb = XLSX.read(buf, { type: "buffer" })
    const sheet = wb.Sheets[wb.SheetNames[0]!]!
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    })

    const dataRows = rows.filter((r) => {
      if (!r || r.length < 6) return false
      const cell = r[5]
      if (cell == null) return false
      const n = Number(cell)
      return !Number.isNaN(n) && n > 1000
    })

    const validValues = new Set(["да", "нет", ""])
    for (const row of dataRows) {
      const raw = row[0]
      const normalized = String(raw ?? "").trim().toLowerCase()
      expect(
        validValues.has(normalized),
        `Колонка A содержит неожиданное значение: "${raw}"`
      ).toBe(true)
    }
  })

  it("колонки L (11), M (12), S (18) — числовые (или null) в data rows", () => {
    const buf = fs.readFileSync(fixturePath)
    const wb = XLSX.read(buf, { type: "buffer" })
    const sheet = wb.Sheets[wb.SheetNames[0]!]!
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    })

    const dataRows = rows.filter((r) => {
      if (!r || r.length < 6) return false
      const cell = r[5]
      if (cell == null) return false
      const n = Number(cell)
      return !Number.isNaN(n) && n > 1000
    })

    for (const row of dataRows) {
      for (const idx of [11, 12, 18] as const) {
        const cell = row[idx]
        if (cell == null || cell === "") continue
        const n = Number(cell)
        expect(
          Number.isFinite(n),
          `Колонка index ${idx} содержит не-число: "${cell}"`
        ).toBe(true)
      }
    }
  })

  it("колонка T (19) — строка статуса или null в data rows", () => {
    const buf = fs.readFileSync(fixturePath)
    const wb = XLSX.read(buf, { type: "buffer" })
    const sheet = wb.Sheets[wb.SheetNames[0]!]!
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
      header: 1,
      defval: null,
    })

    const dataRows = rows.filter((r) => {
      if (!r || r.length < 6) return false
      const cell = r[5]
      if (cell == null) return false
      const n = Number(cell)
      return !Number.isNaN(n) && n > 1000
    })

    for (const row of dataRows) {
      const cell = row[19]
      if (cell == null) continue
      expect(typeof cell === "string" || typeof cell === "number").toBe(true)
    }
  })
})

// ──────────────────────────────────────────────────────────────────
// parseAutoPromoExcel — интеграция exported функции с реальным fixture
// ──────────────────────────────────────────────────────────────────
describe("parseAutoPromoExcel — real fixture", () => {
  const fixturePath = path.resolve(
    process.cwd(),
    "tests/fixtures/auto-promo-sample.xlsx",
  )

  it("парсит fixture в массив ParsedAutoPromoRow с валидными полями", () => {
    const buf = fs.readFileSync(fixturePath)
    const rows = parseAutoPromoExcel(buf)

    expect(rows.length).toBeGreaterThan(0)

    const first = rows[0]!
    expect(first.nmId).toBeGreaterThan(0)
    expect(Number.isInteger(first.nmId)).toBe(true)
    expect(typeof first.inAction).toBe("boolean")

    // Числовые поля — либо number, либо null
    for (const r of rows) {
      expect(r.planPrice === null || typeof r.planPrice === "number").toBe(true)
      expect(
        r.currentPrice === null || typeof r.currentPrice === "number",
      ).toBe(true)
      expect(
        r.planDiscount === null || typeof r.planDiscount === "number",
      ).toBe(true)
      expect(r.status === null || typeof r.status === "string").toBe(true)
    }
  })

  it("пропускает строки с невалидным nmId", () => {
    const buf = fs.readFileSync(fixturePath)
    const rows = parseAutoPromoExcel(buf)

    // У всех распарсенных rows nmId должен быть валидным positive integer
    for (const r of rows) {
      expect(r.nmId).toBeGreaterThan(0)
      expect(Number.isFinite(r.nmId)).toBe(true)
    }
  })
})

