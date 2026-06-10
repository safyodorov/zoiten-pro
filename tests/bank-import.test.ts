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
      // row 6 = заголовки (10 колонок, без CNY)
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет RUR", "Кредит RUR", "Назначение"],
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
      // row 6 = заголовки (12 колонок: + CNY pair)
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет CNY", "Кредит CNY", "Дебет RUR", "Кредит RUR", "Назначение"],
      ...dataRows,
    ]
    return makeXlsxMultiSheet([{ name: accountNumber, rows }])
  }

  it("золотой тест: рублёвый счёт — DEBIT 150000 RUR", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbRubSheet("40702810800810087464", [
      ["12.03.2026", "42", "Перевод", "ООО Контрагент", "7707083893", "044525225", "40702810500000001234", 150000, null, "Оплата по счёту №12"],
    ])
    const txs = parseVtbStatement(wb)
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
    const txs = parseVtbStatement(wb)
    expect(txs[0]!.direction).toBe("CREDIT")
    expect(txs[0]!.amount).toBe(200000)
  })

  it("пропускает строку ИТОГО:", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbRubSheet("40702810800810087464", [
      ["12.03.2026", "42", "Перевод", "ООО Контрагент", "7707083893", "044525225", "40702810500000001234", 150000, null, "Оплата"],
      ["ИТОГО:", null, null, null, null, null, null, 150000, null, null], // должна быть пропущена
    ])
    const txs = parseVtbStatement(wb)
    expect(txs).toHaveLength(1)
  })

  it("CNY лист (12 колонок): currency CNY, amount из Дебет CNY", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbCnySheet("40702840500810087000", [
      ["20.03.2026", "10", "Перевод CNY", "Китайская компания", "91234567890", "044525225", "40702840500000001000", 50000, null, null, null, "Оплата CNY"],
    ])
    const txs = parseVtbStatement(wb)
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
      ["Назначение", "Вид операции", "Номер", "Дата", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет RUR", "Кредит RUR"],
      // Данные в том же порядке
      ["Оплата по счёту", "Перевод", "77", "25.03.2026", "ООО Клиент", "1234567890", "044525225", "40702810500000005555", 300000, null],
    ]
    const wb = makeXlsxMultiSheet([{ name: accountNumber, rows }])
    const txs = parseVtbStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.date.toISOString().slice(0, 10)).toBe("2026-03-25")
    expect(txs[0]!.purpose).toBe("Оплата по счёту")
    expect(txs[0]!.docNumber).toBe("77")
    expect(txs[0]!.amount).toBe(300000)
  })

  it("лист без операций (только шапка) → 0 транзакций", async () => {
    const { parseVtbStatement } = await import("@/lib/bank-import/vtb-adapter")
    const wb = makeVtbRubSheet("40702810800810087000", [])
    const txs = parseVtbStatement(wb)
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
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет RUR", "Кредит RUR", "Назначение"],
      ["01.01.2026", "1", "Перевод", "ООО А", "1111111111", "044525225", "40702810500000000001", 100, null, "Платёж А"],
    ]
    const sheet2Rows: (string | number | null)[][] = [
      ["Номер счета", "40702810800810000002", null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Валюта 643, Российский рубль", null, null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Владелец счёта", "ООО ТЕСТ", null, null, null, null, null, null, null, null],
      [null, null, null, null, null, null, null, null, null, null],
      ["Дата", "Номер", "Вид операции", "Контрагент", "ИНН контрагента", "БИК банка контрагента", "Счет контрагента", "Дебет RUR", "Кредит RUR", "Назначение"],
      ["02.01.2026", "2", "Перевод", "ООО Б", "2222222222", "044525225", "40702810500000000002", null, 200, "Платёж Б"],
    ]
    const wb = makeXlsxMultiSheet([
      { name: "40702810800810000001", rows: sheet1Rows },
      { name: "40702810800810000002", rows: sheet2Rows },
    ])
    const txs = parseVtbStatement(wb)
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
    const txs = parsePsbStatement(wb)
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
    const txs = parsePsbStatement(wb)
    expect(txs[0]!.direction).toBe("CREDIT")
    expect(txs[0]!.amount).toBe(120000)
  })

  it("строка «Входящее сальдо» (row 7) пропускается → 1 транзакция из данных", async () => {
    const { parsePsbStatement } = await import("@/lib/bank-import/psb-adapter")
    const wb = makePsbWorkbook([
      ["01.02.2026", "01", "X-01", "044525225", "40702810500000001111", "30101810400000000225", 10000, null, "Тест", "ООО А", "1234567890"],
    ])
    const txs = parsePsbStatement(wb)
    // Только 1 транзакция — входящее сальдо не попало
    expect(txs).toHaveLength(1)
  })
})

// ──────────────────────────────────────────────────────────────────
// Task 2: Sber Adapter
// ──────────────────────────────────────────────────────────────────

describe("parseSberStatement", () => {
  function makeSberWorkbook(dataRows: (string | number | null)[][]): XLSX.WorkBook {
    const accountNumber = "40702810417002000001"
    const rows: (string | number | null)[][] = [
      [null, null, null, null, null, null, null, null, null, null, null, null], // row 0
      [null, "ПАО СБЕРБАНК", null, null, null, null, null, null, null, null, null, null], // row 1
      [null, null, null, null, null, null, null, null, null, null, null, null], // row 2
      [null, null, null, null, null, null, null, null, null, null, null, null], // row 3
      [null, null, null, null, null, null, null, null, null, null, null, accountNumber], // row 4 — счёт в ~колонке 11
      ["ООО ЗОЙТЕН", null, null, null, null, null, null, null, null, null, null, null],  // row 5 — наша компания
      [null, null, null, null, null, null, null, null, null, null, null, null], // row 6
      [null, null, null, null, null, null, null, null, null, null, null, null], // row 7
      [null, null, null, null, null, null, null, null, null, null, null, null], // row 8
      // row 9 = заголовки уровень 1
      [null, "Дата проводки", "Счет", "Сумма по дебету", "Сумма по кредиту", "№ документа", "ВО", "Банк (БИК и наименование)", "Назначение платежа", null, null, null],
      // row 10 = заголовки уровень 2 (подзаголовки, игнорируем)
      [null, null, null, null, null, null, null, null, null, null, null, null],
      // row 11+ = данные
      ...dataRows,
    ]
    return makeXlsx(rows, accountNumber)
  }

  it("золотой тест: extractBic, split счёт\\nИНН, дата из «Дата проводки»", async () => {
    const { parseSberStatement } = await import("@/lib/bank-import/sber-adapter")
    const wb = makeSberWorkbook([
      // Составной id | Дата проводки | Счет\nИНН | Дебет | Кредит | №doc | ВО | Банк(БИК) | Назначение
      [46024.18197, "10.03.2026", "40702810500000009999\n7707083893", "5,571,064.72", null, "SB-001", "01", "БИК 047003608 Ивановское отд. ПАО Сбербанк", "Оплата товара"],
    ])
    const txs = parseSberStatement(wb)
    expect(txs).toHaveLength(1)
    expect(txs[0]!.date.toISOString().slice(0, 10)).toBe("2026-03-10")
    expect(txs[0]!.direction).toBe("DEBIT")
    expect(txs[0]!.amount).toBeCloseTo(5571064.72)
    expect(txs[0]!.counterpartyAccount).toBe("40702810500000009999")
    expect(txs[0]!.counterpartyInn).toBe("7707083893")
    expect(txs[0]!.counterpartyBic).toBe("047003608")
    expect(txs[0]!.docNumber).toBe("SB-001")
    expect(txs[0]!.purpose).toBe("Оплата товара")
    expect(txs[0]!.accountNumber).toBe("40702810417002000001")
    expect(txs[0]!.sourceBank).toBe("sber")
  })

  it("CREDIT строка: direction CREDIT", async () => {
    const { parseSberStatement } = await import("@/lib/bank-import/sber-adapter")
    const wb = makeSberWorkbook([
      [46024.19000, "15.04.2026", "40702810500000001111\n5010012345", null, "1,200,000.00", "SB-002", "02", "БИК 044525225 Банк ВТБ", "Поступление оплаты"],
    ])
    const txs = parseSberStatement(wb)
    expect(txs[0]!.direction).toBe("CREDIT")
    expect(txs[0]!.amount).toBeCloseTo(1200000)
    expect(txs[0]!.counterpartyBic).toBe("044525225")
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
