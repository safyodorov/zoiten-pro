// tests/bank-import.test.ts
// Phase 22 (22-03): Golden + idempotency tests for lib/bank-import/ pure parsers.
// All tests use synthetic inline fixtures (aoa_to_sheet) — no real bank data in repo.

import { describe, it, expect } from "vitest"
import * as XLSX from "xlsx"

// ──────────────────────────────────────────────────────────────────
// helpers — создание in-memory XLSX без реальных fixtures
// ──────────────────────────────────────────────────────────────────

function makeXlsx(
  rows: (string | number | null)[][],
  sheetName = "Sheet1"
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(rows)
  XLSX.utils.book_append_sheet(wb, ws, sheetName)
  return wb
}

function makeXlsxMultiSheet(
  sheets: { name: string; rows: (string | number | null)[][] }[]
): XLSX.WorkBook {
  const wb = XLSX.utils.book_new()
  for (const { name, rows } of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, name)
  }
  return wb
}

// ──────────────────────────────────────────────────────────────────
// Task 1: Foundation helpers — normalize.ts + fingerprint.ts
// ──────────────────────────────────────────────────────────────────

describe("normalize helpers", () => {
  // parseDDMMYYYY
  it("parseDDMMYYYY: '12.03.2026' → Date UTC 2026-03-12", async () => {
    const { parseDDMMYYYY } = await import("@/lib/bank-import/normalize")
    const d = parseDDMMYYYY("12.03.2026")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-12")
  })

  it("parseDDMMYYYY: '1.1.2026' (short) → Date UTC 2026-01-01", async () => {
    const { parseDDMMYYYY } = await import("@/lib/bank-import/normalize")
    const d = parseDDMMYYYY("1.1.2026")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-01-01")
  })

  it("parseDDMMYYYY: невалидная строка → null", async () => {
    const { parseDDMMYYYY } = await import("@/lib/bank-import/normalize")
    expect(parseDDMMYYYY("2026-03-12")).toBeNull()
    expect(parseDDMMYYYY("abc")).toBeNull()
    expect(parseDDMMYYYY(null as unknown as string)).toBeNull()
  })

  // excelSerialToDate
  it("excelSerialToDate: 46024 → 2026-01-02 (UTC)", async () => {
    const { excelSerialToDate } = await import("@/lib/bank-import/normalize")
    const d = excelSerialToDate(46024)
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-01-02")
  })

  it("excelSerialToDate: 45658 → 2025-01-01 (UTC)", async () => {
    const { excelSerialToDate } = await import("@/lib/bank-import/normalize")
    const d = excelSerialToDate(45658)
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2025-01-01")
  })

  it("excelSerialToDate: out-of-range (100) → null", async () => {
    const { excelSerialToDate } = await import("@/lib/bank-import/normalize")
    expect(excelSerialToDate(100)).toBeNull()
  })

  // parseDateCell
  it("parseDateCell: '12.03.2026' (DD.MM.YYYY string) → 2026-03-12", async () => {
    const { parseDateCell } = await import("@/lib/bank-import/normalize")
    const d = parseDateCell("12.03.2026")
    expect(d!.toISOString().slice(0, 10)).toBe("2026-03-12")
  })

  it("parseDateCell: '46024.1819675928' (Excel serial string) → 2026-01-02", async () => {
    const { parseDateCell } = await import("@/lib/bank-import/normalize")
    const d = parseDateCell("46024.1819675928")
    expect(d).not.toBeNull()
    expect(d!.toISOString().slice(0, 10)).toBe("2026-01-02")
  })

  it("parseDateCell: numeric 46024 → 2026-01-02", async () => {
    const { parseDateCell } = await import("@/lib/bank-import/normalize")
    const d = parseDateCell(46024)
    expect(d!.toISOString().slice(0, 10)).toBe("2026-01-02")
  })

  it("parseDateCell: null/invalid → null", async () => {
    const { parseDateCell } = await import("@/lib/bank-import/normalize")
    expect(parseDateCell(null)).toBeNull()
    expect(parseDateCell("abc")).toBeNull()
    expect(parseDateCell("")).toBeNull()
  })

  // parseAmount
  it("parseAmount: '6,057,806.46' (тысячные запятые) → 6057806.46", async () => {
    const { parseAmount } = await import("@/lib/bank-import/normalize")
    expect(parseAmount("6,057,806.46")).toBeCloseTo(6057806.46)
  })

  it("parseAmount: число 150000 → 150000", async () => {
    const { parseAmount } = await import("@/lib/bank-import/normalize")
    expect(parseAmount(150000)).toBe(150000)
  })

  it("parseAmount: '' → null", async () => {
    const { parseAmount } = await import("@/lib/bank-import/normalize")
    expect(parseAmount("")).toBeNull()
    expect(parseAmount(null)).toBeNull()
  })

  it("parseAmount: '5,571,064.72' → 5571064.72", async () => {
    const { parseAmount } = await import("@/lib/bank-import/normalize")
    expect(parseAmount("5,571,064.72")).toBeCloseTo(5571064.72)
  })

  // normalizePurpose
  it("normalizePurpose: '  Оплата   ПО  счёту ' → 'оплата по счёту'", async () => {
    const { normalizePurpose } = await import("@/lib/bank-import/normalize")
    expect(normalizePurpose("  Оплата   ПО  счёту ")).toBe("оплата по счёту")
  })

  it("normalizePurpose: null/undefined → ''", async () => {
    const { normalizePurpose } = await import("@/lib/bank-import/normalize")
    expect(normalizePurpose(null)).toBe("")
    expect(normalizePurpose(undefined)).toBe("")
  })

  // extractBic
  it("extractBic: 'БИК 047003608 Ивановское отд…' → '047003608'", async () => {
    const { extractBic } = await import("@/lib/bank-import/normalize")
    expect(extractBic("БИК 047003608 Ивановское отд. Московского банка ПАО Сбербанк")).toBe("047003608")
  })

  it("extractBic: null/empty → null", async () => {
    const { extractBic } = await import("@/lib/bank-import/normalize")
    expect(extractBic(null)).toBeNull()
    expect(extractBic("")).toBeNull()
  })

  // buildHeaderMap
  it("buildHeaderMap: строит map заголовок → индекс", async () => {
    const { buildHeaderMap } = await import("@/lib/bank-import/normalize")
    const map = buildHeaderMap(["Дата", null, "Сумма", "Назначение"])
    expect(map["Дата"]).toBe(0)
    expect(map["Сумма"]).toBe(2)
    expect(map["Назначение"]).toBe(3)
    expect(Object.keys(map)).not.toContain("")
  })

  // canonicalizeCompanyName
  it("canonicalizeCompanyName: 'ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ \"ЗОЙТЕН\"' → 'ООО \"ЗОЙТЕН\"'", async () => {
    const { canonicalizeCompanyName } = await import("@/lib/bank-import/normalize")
    expect(canonicalizeCompanyName('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ЗОЙТЕН"')).toBe('ООО "ЗОЙТЕН"')
  })
  it("canonicalizeCompanyName: варианты Сбер/ВТБ/ПСБ одной компании сходятся к одному ключу", async () => {
    const { canonicalizeCompanyName } = await import("@/lib/bank-import/normalize")
    const a = canonicalizeCompanyName('ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ "ГЕЙМ БЛОКС"')
    const b = canonicalizeCompanyName('ООО "ГЕЙМ БЛОКС"')
    const c = canonicalizeCompanyName('ООО «ГЕЙМ БЛОКС»')
    expect(a).toBe('ООО "ГЕЙМ БЛОКС"')
    expect(b).toBe('ООО "ГЕЙМ БЛОКС"')
    expect(c).toBe('ООО "ГЕЙМ БЛОКС"')
  })
  it("canonicalizeCompanyName: ПАО/АО/ИП + пустой ввод", async () => {
    const { canonicalizeCompanyName } = await import("@/lib/bank-import/normalize")
    expect(canonicalizeCompanyName("ПУБЛИЧНОЕ АКЦИОНЕРНОЕ ОБЩЕСТВО СБЕРБАНК")).toBe("ПАО СБЕРБАНК")
    expect(canonicalizeCompanyName("АКЦИОНЕРНОЕ ОБЩЕСТВО ТБАНК")).toBe("АО ТБАНК")
    expect(canonicalizeCompanyName("ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ИВАНОВ И.И.")).toBe("ИП ИВАНОВ И.И.")
    expect(canonicalizeCompanyName("")).toBeNull()
    expect(canonicalizeCompanyName(null)).toBeNull()
  })

  // parseDateCell (Excel serial)
  it("parseDateCell: серийный номер Excel '46024.18197' → 2026-01-02", async () => {
    const { parseDateCell } = await import("@/lib/bank-import/normalize")
    const d = parseDateCell("46024.1819675928")
    expect(d?.toISOString().slice(0, 10)).toBe("2026-01-02")
  })
  it("parseDateCell: 'DD.MM.YYYY' строка тоже парсится", async () => {
    const { parseDateCell } = await import("@/lib/bank-import/normalize")
    expect(parseDateCell("12.03.2026")?.toISOString().slice(0, 10)).toBe("2026-03-12")
  })

  // parseBalanceAmount
  it("parseBalanceAmount: '33,201.97' (US thousands + decimal dot) → 33201.97", async () => {
    const { parseBalanceAmount } = await import("@/lib/bank-import/normalize")
    expect(parseBalanceAmount("33,201.97")).toBeCloseTo(33201.97)
  })
  it("parseBalanceAmount: '217 568,45' (RU space-thousands + decimal comma) → 217568.45", async () => {
    const { parseBalanceAmount } = await import("@/lib/bank-import/normalize")
    expect(parseBalanceAmount("217 568,45")).toBeCloseTo(217568.45)
  })
  it("parseBalanceAmount: '159 576,11' → 159576.11", async () => {
    const { parseBalanceAmount } = await import("@/lib/bank-import/normalize")
    expect(parseBalanceAmount("159 576,11")).toBeCloseTo(159576.11)
  })
  it("parseBalanceAmount: '62 066,92' → 62066.92", async () => {
    const { parseBalanceAmount } = await import("@/lib/bank-import/normalize")
    expect(parseBalanceAmount("62 066,92")).toBeCloseTo(62066.92)
  })
  it("parseBalanceAmount: number 1234.5 → 1234.5", async () => {
    const { parseBalanceAmount } = await import("@/lib/bank-import/normalize")
    expect(parseBalanceAmount(1234.5)).toBe(1234.5)
  })
  it("parseBalanceAmount: '' → null, null → null", async () => {
    const { parseBalanceAmount } = await import("@/lib/bank-import/normalize")
    expect(parseBalanceAmount("")).toBeNull()
    expect(parseBalanceAmount(null)).toBeNull()
  })

  // parseRussianDate
  it("parseRussianDate: '10 июня 2026' → 2026-06-10", async () => {
    const { parseRussianDate } = await import("@/lib/bank-import/normalize")
    const d = parseRussianDate("10 июня 2026")
    expect(d?.toISOString().slice(0, 10)).toBe("2026-06-10")
  })
  it("parseRussianDate: '01 января 2026 г.' → 2026-01-01", async () => {
    const { parseRussianDate } = await import("@/lib/bank-import/normalize")
    const d = parseRussianDate("01 января 2026 г.")
    expect(d?.toISOString().slice(0, 10)).toBe("2026-01-01")
  })
  it("parseRussianDate: bad input → null", async () => {
    const { parseRussianDate } = await import("@/lib/bank-import/normalize")
    expect(parseRussianDate("10.06.2026")).toBeNull()
    expect(parseRussianDate(null)).toBeNull()
    expect(parseRussianDate("")).toBeNull()
  })
})

describe("computeFingerprint", () => {
  // Мы должны создать тестовую ParsedTransaction через import из types
  it("fingerprint детерминирован: одинаковый вход → одинаковый SHA-256", async () => {
    const { computeFingerprint } = await import("@/lib/bank-import/fingerprint")
    const tx = {
      accountNumber: "40702810800810087464",
      date: new Date(Date.UTC(2026, 2, 12)),
      direction: "DEBIT" as const,
      amount: 150000,
      docNumber: "42",
      counterpartyInn: "7707083893",
      purpose: "Оплата по счёту",
      // required fields (not part of fingerprint key)
      companyName: null,
      companyInn: null,
      currency: "RUR",
      operationType: null,
      debit: 150000,
      credit: null,
      counterpartyName: null,
      counterpartyBic: null,
      counterpartyAccount: null,
      sourceBank: "vtb" as const,
      rawRow: null,
    }
    const h1 = computeFingerprint(tx)
    const h2 = computeFingerprint(tx)
    expect(h1).toBe(h2)
    expect(h1).toHaveLength(64) // SHA-256 hex = 64 chars
  })

  it("fingerprint: изменение docNumber → другой hash", async () => {
    const { computeFingerprint } = await import("@/lib/bank-import/fingerprint")
    const base = {
      accountNumber: "40702810800810087464",
      date: new Date(Date.UTC(2026, 2, 12)),
      direction: "DEBIT" as const,
      amount: 150000,
      docNumber: "42",
      counterpartyInn: "7707083893",
      purpose: "Оплата по счёту",
      companyName: null, companyInn: null, currency: "RUR",
      operationType: null, debit: 150000, credit: null,
      counterpartyName: null, counterpartyBic: null, counterpartyAccount: null,
      sourceBank: "vtb" as const, rawRow: null,
    }
    const h1 = computeFingerprint(base)
    const h2 = computeFingerprint({ ...base, docNumber: "99" })
    expect(h1).not.toBe(h2)
  })

  it("fingerprint: незначимые пробелы в purpose → одинаковый hash (normalizePurpose)", async () => {
    const { computeFingerprint } = await import("@/lib/bank-import/fingerprint")
    const base = {
      accountNumber: "40702810800810087464",
      date: new Date(Date.UTC(2026, 2, 12)),
      direction: "DEBIT" as const,
      amount: 150000,
      docNumber: "42",
      counterpartyInn: "7707083893",
      purpose: "Оплата по счёту",
      companyName: null, companyInn: null, currency: "RUR",
      operationType: null, debit: 150000, credit: null,
      counterpartyName: null, counterpartyBic: null, counterpartyAccount: null,
      sourceBank: "vtb" as const, rawRow: null,
    }
    const h1 = computeFingerprint(base)
    // Extra spaces + mixed case → same after normalizePurpose
    const h2 = computeFingerprint({ ...base, purpose: "  Оплата  по   счёту  " })
    expect(h1).toBe(h2)
  })
})

// ──────────────────────────────────────────────────────────────────
// Task 2: VTB Adapter
// ──────────────────────────────────────────────────────────────────

describe("parseVtbStatement", () => {
  // Helper: строит рублёвый лист ВТБ с правильной структурой (10 колонок)
  function makeVtbRubSheet(
    accountNumber: string,
    dataRows: (string | number | null)[][]
  ): XLSX.WorkBook {
    const header: (string | number | null)[] = [
      null, null, null, null, null, null, null, null, null, null
    ]
    const rows: (string | number | null)[][] = [
      ["Номер счета", accountNumber, null, null, null, null, null, null, null, null], // row 0
      [null, null, null, null, null, null, null, null, null, null],                    // row 1
      ["Валюта 643, Российский рубль", null, null, null, null, null, null, null, null, null], // row 2
      [null, null, null, null, null, null, null, null, null, null],                    // row 3
      ["Владелец счёта", "ООО ТЕСТ", null, null, null, null, null, null, null, null], // row 4
      [null, null, null, null, null, null, null, null, null, null],                    // row 5
      // row 6 = заголовки (10 колонок, без CNY) — реальные заголовки с запятой: "Дебет, RUR"
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет, RUR", "Кредит, RUR", "Назначение"],
      // data rows
      ...dataRows,
    ]
    return makeXlsxMultiSheet([{ name: accountNumber, rows }])
  }

  function makeVtbCnySheet(
    accountNumber: string,
    dataRows: (string | number | null)[][]
  ): XLSX.WorkBook {
    const rows: (string | number | null)[][] = [
      ["Номер счета", accountNumber, null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null, null, null],
      ["Валюта 156, Китайский юань", null, null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null, null, null],
      ["Владелец счёта", "ООО ТЕСТ", null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null, null, null],
      // row 6 = заголовки (12 колонок: + CNY pair) — реальные заголовки с запятой
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет, CNY", "Кредит, CNY", "Дебет, RUR", "Кредит, RUR", "Назначение"],
      ...dataRows,
    ]
    return makeXlsxMultiSheet([{ name: accountNumber, rows }])
  }

  it("золотой тест: рублёвый счёт — DEBIT 150000 RUR", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbRubSheet("40702810800810087464", [
      ["12.03.2026", "42", "Перевод", "ООО Контрагент", "7707083893", "044525225", "40702810500000001234", 150000, null, "Оплата по счёту №12"],
    ])
    const { transactions: txs } = parseVtbStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.date.toISOString().slice(0, 10)).toBe("2026-03-12")
    expect(txs[0]!.direction).toBe("DEBIT")
    expect(txs[0]!.amount).toBe(150000)
    expect(txs[0]!.currency).toBe("RUR")
    expect(txs[0]!.accountNumber).toBe("40702810800810087464")
    expect(txs[0]!.counterpartyInn).toBe("7707083893")
    expect(txs[0]!.docNumber).toBe("42")
    expect(txs[0]!.purpose).toBe("Оплата по счёту №12")
    expect(txs[0]!.sourceBank).toBe("vtb")
  })

  it("CREDIT строка: кредит 200000 → direction CREDIT", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbRubSheet("40702810800810087464", [
      ["15.03.2026", "55", "Перевод", "ООО Покупатель", "5010012345", "044525225", "40702810500000009999", null, 200000, "Оплата за товар"],
    ])
    const { transactions: txs } = parseVtbStatement(wb)
    expect(txs[0]!.direction).toBe("CREDIT")
    expect(txs[0]!.amount).toBe(200000)
  })

  it("пропускает строку ИТОГО:", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbRubSheet("40702810800810087464", [
      ["12.03.2026", "42", "Перевод", "ООО Контрагент", "7707083893", "044525225", "40702810500000001234", 150000, null, "Оплата"],
      ["ИТОГО:", null, null, null, null, null, null, 150000, null, null], // должна быть пропущена
    ])
    const { transactions: txs } = parseVtbStatement(wb)
    expect(txs).toHaveLength(1)
  })

  it("CNY лист (12 колонок): currency CNY, amount из Дебет CNY", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbCnySheet("40702840500810087000", [
      ["20.03.2026", "10", "Перевод CNY", "Китайская компания", "91234567890", "044525225", "40702840500000001000", 50000, null, null, null, "Оплата CNY"],
    ])
    const { transactions: txs } = parseVtbStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.currency).toBe("CNY")
    expect(txs[0]!.amount).toBe(50000)
    expect(txs[0]!.direction).toBe("DEBIT")
  })

  it("header-driven: порядок колонок переставлен — маппит по тексту заголовка", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    // Поставим колонки в другом порядке: Назначение первым, потом остальное
    const accountNumber = "40702810800810099999"
    const rows: (string | number | null)[][] = [
      ["Номер счета", accountNumber, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Валюта 643, Российский рубль", null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Владелец счёта", "ООО ТЕСТ", null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      // Заголовки: Назначение на позиции 0, Дата на позиции 3 (поменяли местами)
      // Используем реальные заголовки с запятой: "Дебет, RUR" / "Кредит, RUR"
      ["Назначение", "Вид операции", "Номер", "Дата", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет, RUR", "Кредит, RUR"],
      // Данные в том же порядке
      ["Оплата по счёту", "Перевод", "77", "25.03.2026", "ООО Клиент", "1234567890", "044525225", "40702810500000005555", 300000, null],
    ]
    const wb = makeXlsxMultiSheet([{ name: accountNumber, rows }])
    const { transactions: txs } = parseVtbStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.date.toISOString().slice(0, 10)).toBe("2026-03-25")
    expect(txs[0]!.purpose).toBe("Оплата по счёту")
    expect(txs[0]!.docNumber).toBe("77")
    expect(txs[0]!.amount).toBe(300000)
  })

  it("лист без операций (только шапка) → 0 транзакций", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbRubSheet("40702810800810087000", [])
    const { transactions: txs } = parseVtbStatement(wb)
    expect(txs).toHaveLength(0)
  })

  it("несколько листов: транзакции из всех листов", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const sheet1Rows: (string | number | null)[][] = [
      ["Номер счета", "40702810800810000001", null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Валюта 643, Российский рубль", null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Владелец счёта", "ООО ТЕСТ", null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет, RUR", "Кредит, RUR", "Назначение"],
      ["01.01.2026", "1", "Перевод", "ООО А", "1111111111", "044525225", "40702810500000000001", "100", null, "Платёж А"],
    ]
    const sheet2Rows: (string | number | null)[][] = [
      ["Номер счета", "40702810800810000002", null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Валюта 643, Российский рубль", null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Владелец счёта", "ООО ТЕСТ", null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет, RUR", "Кредит, RUR", "Назначение"],
      ["02.01.2026", "2", "Перевод", "ООО Б", "2222222222", "044525225", "40702810500000000002", null, "200", "Платёж Б"],
    ]
    const wb = makeXlsxMultiSheet([
      { name: "40702810800810000001", rows: sheet1Rows },
      { name: "40702810800810000002", rows: sheet2Rows },
    ])
    const { transactions: txs } = parseVtbStatement(wb)
    expect(txs).toHaveLength(2)
    expect(txs[0]!.accountNumber).toBe("40702810800810000001")
    expect(txs[1]!.accountNumber).toBe("40702810800810000002")
  })
})

// ──────────────────────────────────────────────────────────────────
// Task 2: PSB Adapter
// ──────────────────────────────────────────────────────────────────

describe("parsePsbStatement", () => {
  function makePsbWorkbook(dataRows: (string | number | null)[][]): XLSX.WorkBook {
    const rows: (string | number | null)[][] = [
      ["ЯРОСЛАВСКИЙ Ф-Л ПАО \"Банк ПСБ\" (Промсвязьбанк)", null, null, null, null, null, null, null, null, null, null], // row 0
      [null, null, null, null, null, null, null, null, null, null, null],                                                   // row 1
      ["Выписка из лицевого счета 40702810100760000123 за 01.01.2026 - 10.06.2026", null, null, null, null, null, null, null, null, null, null], // row 2
      [null, null, null, null, null, null, null, null, null, null, null],                                                   // row 3
      ["ООО \"ГЕЙМ БЛОКС\"", null, null, null, null, null, null, null, null, null, null],                                  // row 4
      [null, null, null, null, null, null, null, null, null, null, null],                                                   // row 5
      // row 6 = заголовки: Дата | РО | Док. | КБ | Внеш.счет | Счет | Дебет | Кредит | Назначение | Контрагент | Контр. ИНН
      ["Дата", "РО", "Док.", "КБ", "Внеш.счет", "Счет", "Дебет", "Кредит", "Назначение", "Контрагент", "Контр. ИНН"],
      // row 7 = Входящее сальдо (пропустить)
      ["Входящее сальдо", null, null, null, null, null, 500000, null, null, null, null],
      // row 8+ = данные
      ...dataRows,
    ]
    return makeXlsx(rows, "Отчет 1")
  }

  it("золотой тест: DEBIT операция с КБ и Контр. ИНН", async () => {
    const { parsePsbStatement } = await import("@/lib/bank-import/psb-adapter")
    const wb = makePsbWorkbook([
      ["05.03.2026", "01", "P-001", "044525225", "40702810500000009876", "30101810400000000225", 75000, null, "Оплата услуг", "ООО ПОСТАВЩИК", "5010012345"],
    ])
    const { transactions: txs } = parsePsbStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.date.toISOString().slice(0, 10)).toBe("2026-03-05")
    expect(txs[0]!.direction).toBe("DEBIT")
    expect(txs[0]!.amount).toBe(75000)
    expect(txs[0]!.currency).toBe("RUR")
    expect(txs[0]!.counterpartyBic).toBe("044525225")
    expect(txs[0]!.counterpartyInn).toBe("5010012345")
    expect(txs[0]!.counterpartyName).toBe("ООО ПОСТАВЩИК")
    expect(txs[0]!.docNumber).toBe("P-001")
    expect(txs[0]!.accountNumber).toBe("40702810100760000123")
    expect(txs[0]!.sourceBank).toBe("psb")
    expect(txs[0]!.companyName).toBe("ООО \"ГЕЙМ БЛОКС\"")
  })

  it("CREDIT операция: direction CREDIT", async () => {
    const { parsePsbStatement } = await import("@/lib/bank-import/psb-adapter")
    const wb = makePsbWorkbook([
      ["10.04.2026", "01", "R-100", "044525225", "40702810500000099999", "30101810400000000225", null, 120000, "Поступление от покупателя", "ООО КЛИЕНТ", "7707123456"],
    ])
    const { transactions: txs } = parsePsbStatement(wb)
    expect(txs[0]!.direction).toBe("CREDIT")
    expect(txs[0]!.amount).toBe(120000)
  })

  it("строка «Входящее сальдо» (row 7) пропускается → 1 транзакция из данных", async () => {
    const { parsePsbStatement } = await import("@/lib/bank-import/psb-adapter")
    const wb = makePsbWorkbook([
      ["01.02.2026", "01", "X-01", "044525225", "40702810500000001111", "30101810400000000225", 10000, null, "Тест", "ООО А", "1234567890"],
    ])
    const { transactions: txs } = parsePsbStatement(wb)
    // Только 1 транзакция — входящее сальдо не попало
    expect(txs).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────────────────────────
// Task 2: Sber Adapter
// ──────────────────────────────────────────────────────────────────

describe("parseSberStatement", () => {
  // Реальная структура СберБизнес (23 колонки):
  //  col 0: пустой
  //  col 1: Дата проводки (Excel serial как строка, напр. "46024.18197")
  //  col 4: debit-side account (наш при DEBIT, контрагент при CREDIT) — "account\nINN\nName"
  //  col 8: credit-side account (контрагент при DEBIT, наш при CREDIT) — "account\nINN\nName"
  //  col 9: Сумма по дебету
  //  col 13: Сумма по кредиту
  //  col 14: № документа
  //  col 16: ВО
  //  col 17: Банк (БИК и наименование)
  //  col 20: Назначение платежа
  //
  // Row 9 (headers): col 4 = "Счет", col 9 = "Сумма по дебету", col 13 = "Сумма по кредиту",
  //                  col 14 = "№ документа", col 16 = "ВО", col 17 = "Банк (БИК и наименование)",
  //                  col 20 = "Назначение платежа"
  // Row 10 (sub-headers): col 4 = "Дебет", col 8 = "Кредит" — определяют стороны двойной записи.
  function makeSberWorkbook(dataRows: (string | number | null)[][]): XLSX.WorkBook {
    const accountNumber = "40702810417002000001"
    // Builds a 23-element row filled with nulls, overriding specific indices
    function r(overrides: Record<number, string | number | null>): (string | number | null)[] {
      const row: (string | number | null)[] = Array(23).fill(null)
      for (const [k, v] of Object.entries(overrides)) row[Number(k)] = v
      return row
    }
    const rows: (string | number | null)[][] = [
      r({}),                                                                              // row 0
      r({ 1: "ПАО СБЕРБАНК" }),                                                           // row 1
      r({}),                                                                              // row 2
      r({}),                                                                              // row 3
      r({ 11: accountNumber }),                                                           // row 4 — счёт
      r({ 0: "ООО ЗОЙТЕН" }),                                                             // row 5 — компания
      r({}),                                                                              // row 6
      r({}),                                                                              // row 7
      r({}),                                                                              // row 8
      // row 9 = заголовки уровень 1 (реальные позиции)
      r({ 1: "Дата проводки", 4: "Счет", 9: "Сумма по дебету", 13: "Сумма по кредиту",
          14: "№ документа", 16: "ВО", 17: "Банк (БИК и наименование)", 20: "Назначение платежа" }),
      // row 10 = подзаголовки — "Дебет" на col 4, "Кредит" на col 8 — определяют стороны записи
      r({ 4: "Дебет", 8: "Кредит" }),
      // row 11+ = данные
      ...dataRows,
    ]
    return makeXlsx(rows, accountNumber)
  }

  // Строит строку данных в реальном формате Сбер для теста.
  // debitAcct/creditAcct — "account\nINN"
  function makeSberDataRow(
    serial: string,
    debitAcct: string | null,
    creditAcct: string | null,
    debitAmt: string | null,
    creditAmt: string | null,
    docNum: string,
    vo: string,
    bank: string,
    purpose: string
  ): (string | number | null)[] {
    const row: (string | number | null)[] = Array(23).fill(null)
    row[1] = serial
    row[4] = debitAcct
    row[8] = creditAcct
    row[9] = debitAmt
    row[13] = creditAmt
    row[14] = docNum
    row[16] = vo
    row[17] = bank
    row[20] = purpose
    return row
  }

  it("золотой тест DEBIT: дата из Excel serial, контрагент = credit-side (col 8)", async () => {
    const { parseSberStatement } = await import("@/lib/bank-import/sber-adapter")
    // DEBIT: debitAcctCol (col4) = наш счёт, creditAcctCol (col8) = контрагент
    const wb = makeSberWorkbook([
      makeSberDataRow(
        "46024.1819675928",                            // Дата проводки — Excel serial
        "40702810217000000112\n3702268607",            // col 4 — наш счёт + ИНН
        "70601810817002780299\n7707083893",            // col 8 — контрагент + ИНН
        "990.00", null,                                // debit amount
        "484771", "17",
        "БИК 047003608 Ивановское отд. ПАО Сбербанк",
        "Комиссия за сервис"
      ),
    ])
    const { transactions: txs } = parseSberStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.date.toISOString().slice(0, 10)).toBe("2026-01-02")
    expect(txs[0]!.direction).toBe("DEBIT")
    expect(txs[0]!.amount).toBeCloseTo(990)
    // Контрагент = credit-side (col 8)
    expect(txs[0]!.counterpartyAccount).toBe("70601810817002780299")
    expect(txs[0]!.counterpartyInn).toBe("7707083893")
    expect(txs[0]!.counterpartyBic).toBe("047003608")
    expect(txs[0]!.docNumber).toBe("484771")
    expect(txs[0]!.purpose).toBe("Комиссия за сервис")
    expect(txs[0]!.accountNumber).toBe("40702810417002000001")
    expect(txs[0]!.sourceBank).toBe("sber")
    // companyInn извлечён из debit-side (наш счёт)
    expect(txs[0]!.companyInn).toBe("3702268607")
  })

  it("CREDIT строка: контрагент = debit-side (col 4), наш счёт = credit-side (col 8)", async () => {
    const { parseSberStatement } = await import("@/lib/bank-import/sber-adapter")
    // CREDIT: creditAcctCol (col8) = наш счёт, debitAcctCol (col4) = контрагент
    const wb = makeSberWorkbook([
      makeSberDataRow(
        "46024.19000",
        "40702810500000001111\n5010012345",            // col 4 — контрагент при CREDIT
        "40702810417002000001\n3702268607",            // col 8 — наш счёт при CREDIT
        null, "1200000.00",                            // credit amount
        "SB-002", "02",
        "БИК 044525225 Банк ВТБ",
        "Поступление оплаты"
      ),
    ])
    const { transactions: txs } = parseSberStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.direction).toBe("CREDIT")
    expect(txs[0]!.amount).toBeCloseTo(1200000)
    // Контрагент = debit-side (col 4)
    expect(txs[0]!.counterpartyAccount).toBe("40702810500000001111")
    expect(txs[0]!.counterpartyInn).toBe("5010012345")
    expect(txs[0]!.counterpartyBic).toBe("044525225")
    // companyInn извлечён из credit-side (наш счёт)
    expect(txs[0]!.companyInn).toBe("3702268607")
  })

  it("дата DD.MM.YYYY в строке тоже парсится (parseDateCell fallback)", async () => {
    const { parseSberStatement } = await import("@/lib/bank-import/sber-adapter")
    const wb = makeSberWorkbook([
      makeSberDataRow(
        "10.03.2026",                                  // DD.MM.YYYY (не serial)
        "40702810217000000112\n3702268607",
        "40702810500000009999\n7707083893",
        "5571064.72", null,
        "SB-001", "01",
        "БИК 047003608 Ивановское отд. ПАО Сбербанк",
        "Оплата товара"
      ),
    ])
    const { transactions: txs } = parseSberStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.date.toISOString().slice(0, 10)).toBe("2026-03-10")
    expect(txs[0]!.amount).toBeCloseTo(5571064.72)
  })
})

// ──────────────────────────────────────────────────────────────────
// Task 2: detectFormat
// ──────────────────────────────────────────────────────────────────

describe("detectFormat", () => {
  it("VTB_BankStatement_* → 'vtb'", async () => {
    const { detectFormat } = await import("@/lib/bank-import/index")
    const wb = makeXlsx([[null]])
    expect(detectFormat("VTB_BankStatement_some_accounts_20260101.xlsx", wb)).toBe("vtb")
  })

  it("'Выписка по счету...' → 'psb'", async () => {
    const { detectFormat } = await import("@/lib/bank-import/index")
    const wb = makeXlsx([[null]])
    expect(detectFormat("Выписка по счету 40702810100760000123 за 01.01.2026 - 10.06.2026.xlsx", wb)).toBe("psb")
  })

  it("'СберБизнес. Выписка ...' → 'sber'", async () => {
    const { detectFormat } = await import("@/lib/bank-import/index")
    const wb = makeXlsx([[null]])
    expect(detectFormat("СберБизнес. Выписка за 2026.01.01-2026.06.10 счёт 40702.xlsx", wb)).toBe("sber")
  })

  it("fallback по шапке: СБЕРБАНК в шапке → 'sber'", async () => {
    const { detectFormat } = await import("@/lib/bank-import/index")
    const wb = makeXlsx([
      [null, "ПАО СБЕРБАНК", null],
      [null, null, null],
    ])
    // имя файла не совпадает ни с одним шаблоном
    expect(detectFormat("выписка.xlsx", wb)).toBe("sber")
  })

  it("fallback по шапке: Банк ПСБ в шапке → 'psb'", async () => {
    const { detectFormat } = await import("@/lib/bank-import/index")
    const wb = makeXlsx([
      ["ЯРОСЛАВСКИЙ Ф-Л ПАО \"Банк ПСБ\"", null, null],
    ])
    expect(detectFormat("unknown.xlsx", wb)).toBe("psb")
  })
})

// ──────────────────────────────────────────────────────────────────
// Task 2: Fingerprint dedup (идемпотентность)
// ──────────────────────────────────────────────────────────────────

describe("fingerprint dedup", () => {
  function makeTx(overrides: Partial<{
    accountNumber: string
    date: Date
    direction: "DEBIT" | "CREDIT"
    amount: number
    docNumber: string | null
    counterpartyInn: string | null
    purpose: string
  }> = {}) {
    return {
      accountNumber: "40702810800810087464",
      date: new Date(Date.UTC(2026, 2, 12)),
      direction: "DEBIT" as const,
      amount: 150000,
      docNumber: "42",
      counterpartyInn: "7707083893",
      purpose: "Оплата по счёту",
      // non-fingerprint fields
      companyName: null,
      companyInn: null,
      currency: "RUR",
      operationType: null,
      debit: 150000,
      credit: null,
      counterpartyName: null,
      counterpartyBic: null,
      counterpartyAccount: null,
      sourceBank: "vtb" as const,
      rawRow: null,
      ...overrides,
    }
  }

  it("две идентичные ParsedTransaction → одинаковый fingerprint", async () => {
    const { computeFingerprint } = await import("@/lib/bank-import/fingerprint")
    const tx1 = makeTx()
    const tx2 = makeTx()
    expect(computeFingerprint(tx1)).toBe(computeFingerprint(tx2))
  })

  it("изменение docNumber → другой fingerprint", async () => {
    const { computeFingerprint } = await import("@/lib/bank-import/fingerprint")
    const h1 = computeFingerprint(makeTx({ docNumber: "42" }))
    const h2 = computeFingerprint(makeTx({ docNumber: "43" }))
    expect(h1).not.toBe(h2)
  })

  it("whitespace-only difference in purpose → одинаковый fingerprint", async () => {
    const { computeFingerprint } = await import("@/lib/bank-import/fingerprint")
    const h1 = computeFingerprint(makeTx({ purpose: "Оплата по счёту" }))
    const h2 = computeFingerprint(makeTx({ purpose: "  Оплата  по   счёту  " }))
    expect(h1).toBe(h2)
  })

  it("uppercase vs lowercase в purpose → одинаковый fingerprint (normalizePurpose lowercase)", async () => {
    const { computeFingerprint } = await import("@/lib/bank-import/fingerprint")
    const h1 = computeFingerprint(makeTx({ purpose: "Оплата по счёту" }))
    const h2 = computeFingerprint(makeTx({ purpose: "ОПЛАТА ПО СЧЁТУ" }))
    expect(h1).toBe(h2)
  })
})

// ──────────────────────────────────────────────────────────────────
// Task 22-06: Balance extraction — in-memory fixtures per adapter
// ──────────────────────────────────────────────────────────────────

describe("balance extraction — VTB", () => {
  function makeVtbWithBalance(accountNumber: string): XLSX.WorkBook {
    // Minimal VTB header rows 0-6 matching real structure
    const rows: (string | number | null)[][] = [
      ["ВЫПИСКА", null, null, null, null, null, null, null, null, null],
      ["Номер счета:", accountNumber, "Валюта:", "Валюта 643, Российский рубль", null, "Владелец счёта:", "ООО ТЕСТ", null, null, null],
      ["Начальная дата: ", "01.01.2026", "Конечная дата: ", "09.06.2026", null, null, null, null, null, null],
      ["Входящий остаток RUB:", "33,201.97", "Исходящий остаток RUB:", "20,000.00", null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет, RUR", "Кредит, RUR", "Назначение"],
      // no data rows
    ]
    return makeXlsxMultiSheet([{ name: accountNumber, rows }])
  }

  it("VTB: extracts openingBalance, closingBalance, balanceDate from header", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbWithBalance("40702810500810086998")
    const { balances } = parseVtbStatement(wb)
    expect(balances).toHaveLength(1)
    const b = balances[0]!
    expect(b.accountNumber).toBe("40702810500810086998")
    expect(b.openingBalance).toBeCloseTo(33201.97)
    expect(b.closingBalance).toBeCloseTo(20000.00)
    expect(b.balanceDate?.toISOString().slice(0, 10)).toBe("2026-06-09")
  })
})

describe("balance extraction — PSB", () => {
  function makePsbWithBalance(): XLSX.WorkBook {
    const rows: (string | number | null)[][] = [
      ["ЯРОСЛАВСКИЙ Ф-Л ПАО \"Банк ПСБ\"", null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null, null],
      ["Выписка из лицевого счета 40702810902000139975 с 01.01.2026 по 10.06.2026      Валюта: RUR", null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null, null],
      ["ООО \"ЗОЙТЕН\"", null, null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null, null],
      ["Дата", "РО", "Док.", "КБ", "Внеш.счет", "Счет", "Дебет", "Кредит", "Назначение", "Контрагент", "Контр. ИНН"],
      // row 7 — Входящее сальдо
      ["  30.12.2025 Входящее сальдо кредит: 217 568,45", null, null, null, null, null, null, null, null, null, null],
      // some data row (skipped by balance extraction, date would fail parsing)
      ["14.01.2026", "01", "315", "044525974", "40802810800008831649", "30101810300000000760", "74785.60", null, "Тест", "ИП ДЕНИСОВА А.Д.", "507804927088"],
      // Итог оборотов
      ["Итог оборотов дебет: 59 156 925,74 кредит: 59 098 933,4", null, null, null, null, null, null, null, null, null, null],
      // Исходящее сальдо
      ["10.06.2026 Исходящее сальдо дебет: 0 кредит: 159 576,11", null, null, null, null, null, null, null, null, null, null],
    ]
    return makeXlsx(rows, "Отчет 1")
  }

  it("PSB: extracts openingBalance from row 7, closingBalance + balanceDate from trailing row", async () => {
    const { parsePsbStatement } = await import("@/lib/bank-import/psb-adapter")
    const wb = makePsbWithBalance()
    const { balances } = parsePsbStatement(wb)
    expect(balances).toHaveLength(1)
    const b = balances[0]!
    expect(b.accountNumber).toBe("40702810902000139975")
    expect(b.openingBalance).toBeCloseTo(217568.45)
    expect(b.closingBalance).toBeCloseTo(159576.11)
    expect(b.balanceDate?.toISOString().slice(0, 10)).toBe("2026-06-10")
  })
})

describe("balance extraction — Sber", () => {
  function makeSberWithBalance(accountNumber: string): XLSX.WorkBook {
    // Minimal Sber structure with 23 columns; real balance rows at the tail
    function r(overrides: Record<number, string | number | null>): (string | number | null)[] {
      const row: (string | number | null)[] = Array(23).fill(null)
      for (const [k, v] of Object.entries(overrides)) row[Number(k)] = v
      return row
    }
    const rows: (string | number | null)[][] = [
      r({}),                                                                              // row 0
      r({ 1: "ПАО СБЕРБАНК" }),                                                           // row 1
      r({}),                                                                              // row 2
      r({}),                                                                              // row 3
      r({ 11: accountNumber }),                                                           // row 4 — счёт
      r({ 0: "ООО ДРИМ ЛАЙН" }),                                                          // row 5 — компания
      r({}),                                                                              // row 6
      r({}),                                                                              // row 7
      r({}),                                                                              // row 8
      // row 9 = заголовки
      r({ 1: "Дата проводки", 4: "Счет", 9: "Сумма по дебету", 13: "Сумма по кредиту",
          14: "№ документа", 16: "ВО", 17: "Банк (БИК и наименование)", 20: "Назначение платежа" }),
      // row 10 = подзаголовки
      r({ 4: "Дебет", 8: "Кредит" }),
      // row 11+ = one dummy data row
      r({ 1: "46182.72338", 4: `${accountNumber}\n3702259264`, 8: "40702810000000001234\n7707083893", 9: "100.00", 14: "1", 16: "01", 20: "тест" }),
      // balance rows (matching real Sber structure)
      r({ 1: "Входящий остаток", 7: "0,00", 11: "62 066,92", 17: "(П)", 19: "01 января 2026 г." }),
      r({}),
      r({ 1: "Исходящий остаток", 7: "0,00", 11: "107 489,58", 17: "(П)", 19: "10 июня 2026 г." }),
    ]
    return makeXlsx(rows, accountNumber)
  }

  it("Sber: extracts openingBalance, closingBalance + balanceDate from trailing summary rows", async () => {
    const { parseSberStatement } = await import("@/lib/bank-import/sber-adapter")
    const wb = makeSberWithBalance("40702810517000007284")
    const { balances } = parseSberStatement(wb)
    expect(balances).toHaveLength(1)
    const b = balances[0]!
    expect(b.accountNumber).toBe("40702810517000007284")
    expect(b.openingBalance).toBeCloseTo(62066.92)
    expect(b.closingBalance).toBeCloseTo(107489.58)
    expect(b.balanceDate?.toISOString().slice(0, 10)).toBe("2026-06-10")
  })
})
