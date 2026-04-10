import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"
import fs from "fs"
import path from "path"

// ──────────────────────────────────────────────────────────────────
// Excel auto-promo parser — tests/fixtures/auto-promo-sample.xlsx
// ──────────────────────────────────────────────────────────────────
//
// Парсер auto-акций (D-06) читает колонки по индексам (НЕ по названиям,
// т.к. WB может менять заголовки между релизами кабинета):
//
//   A (0)  — "Товар уже участвует в акции" → inAction ("Да" / "Нет")
//   F (5)  — "Артикул WB"                  → nmId (число)
//   L (11) — "Плановая цена для акции"     → planPrice (₽)
//   M (12) — "Текущая розничная цена"      → currentPrice (₽)
//   T (19) — "Загружаемая скидка…"          → planDiscount (%)
//   U (20) — "Статус"                       → status (строка)
//
// Этот тест — НЕ RED stub (парсер использует стандартный xlsx sheet_to_json),
// а структурная проверка fixture: гарантирует, что реальный Excel из кабинета
// WB имеет ожидаемую геометрию колонок. План 07-05 (загрузка Excel auto-акций)
// будет использовать этот паттерн для реального парсера.

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

  it("колонки L (11), M (12), T (19) — числовые (или null) в data rows", () => {
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
      for (const idx of [11, 12, 19] as const) {
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

  it("колонка U (20) — строка статуса или null в data rows", () => {
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
      const cell = row[20]
      if (cell == null) continue
      expect(typeof cell === "string" || typeof cell === "number").toBe(true)
    }
  })
})
