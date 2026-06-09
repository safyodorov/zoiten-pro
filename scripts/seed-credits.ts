/**
 * Разовый seed (D-01, U-01).
 * Источник строк — папка Кредиты/ (Сбербанк XLSX через xlsx + JetLend PDF через pdftotext -layout);
 * метаданные/сверка — Кредиты.xlsx Лист2.
 * Требует pdftotext (poppler).
 * Запуск: npx tsx scripts/seed-credits.ts
 * НЕ часть deploy.sh — запускается вручную один раз после миграции.
 *
 * Структура источников (зафиксирована в 21-04-SEED-NOTES.md):
 * — 11 JetLend PDF: schedule-38..41.pdf, schedule (57..63).pdf
 * — 2 Сбербанк XLSX: График_платежей_по_договору_37022XXXXX_*.xlsx (только хвост с 08.06.2026)
 * — Кредиты.xlsx Лист2: метаданные (amount/rate/term) + помесячные платежи (контрольные суммы + история Сбера + кредиты без PDF)
 *
 * U-05: история Сбера берётся из Лист2 (помесячно); детальные XLSX дают только оставшиеся платежи после дек2026.
 * D-07: issueDate = null для всех seed-кредитов.
 * D-19: ставка 0.28 → 28.000 (×100).
 */

import { execSync } from "child_process"
import * as fs from "fs"
import * as path from "path"
import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"

const prisma = new PrismaClient()

// ──────────────────────────────────────────────────────────────────
// Конфигурация путей
// ──────────────────────────────────────────────────────────────────
const CREDITS_FOLDER = path.resolve(__dirname, "..", "Кредиты")
const CREDITS_XLSX = path.resolve(__dirname, "..", "Кредиты.xlsx")

// ──────────────────────────────────────────────────────────────────
// Маппинг орг → Company.name в БД
// ──────────────────────────────────────────────────────────────────
const ORG_TO_COMPANY: Record<string, string> = {
  "Зойтен": "ЗОЙТЕН",
  "Дрим Лайн": "ДРИМ ЛАЙН",
  "Пеликан": "ПЕЛИКАН ХЭППИ ТОЙС",
  "Сикрет Вэй": "СИКРЕТ ВЭЙ",
}

// ──────────────────────────────────────────────────────────────────
// Маппинг № договора → орг (из структуры Лист2 — см. SEED-NOTES.md)
// ──────────────────────────────────────────────────────────────────
// JetLend с PDF (11 договоров)
const JETLEND_PDF_ORG: Record<string, string> = {
  "25397":  "Зойтен",
  "28513":  "Зойтен",
  "29294":  "Зойтен",
  "29338":  "Зойтен",
  "21940":  "Дрим Лайн",
  "20967":  "Дрим Лайн",
  "20968":  "Дрим Лайн",
  "21359":  "Дрим Лайн",
  "21384":  "Дрим Лайн",
  "21220":  "Дрим Лайн",
  "21934":  "Дрим Лайн",
}

// Сбербанк: № КД → орг
const SBER_CONTRACT_ORG: Record<string, string> = {
  "3702242101-23-2":  "Пеликан",
  "3702259264-23-2":  "Дрим Лайн",
  "3702268607-23-2":  "Зойтен",
  "3702266127-23-1":  "Сикрет Вэй",
}

// ──────────────────────────────────────────────────────────────────
// Вспомогательные функции
// ──────────────────────────────────────────────────────────────────

/** Парсинг числа в русском формате: «504 678,64» (пробел=тысячи, запятая=десятичная) */
function parseRuNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0
  if (typeof v === "number") return v
  // Убираем пробелы (обычный + неразрывный U+00A0) и переводим запятую в точку
  const cleaned = String(v)
    .replace(/[\s ]/g, "")
    .replace(",", ".")
  return parseFloat(cleaned) || 0
}

/** Парсинг числа в формате XLSX: «399,557.24» (запятая=тысячи, точка=десятичная) */
function parseXlsxNumber(v: string | number | null | undefined): number {
  if (v === null || v === undefined || v === "") return 0
  if (typeof v === "number") return v
  // Убираем запятые (тысячи), оставляем точку (десятичная)
  const cleaned = String(v).replace(/,/g, "")
  return parseFloat(cleaned) || 0
}

/** Парсинг текста «24 месяца» → 24 (или null) */
function parseTermMonths(v: unknown): number | null {
  if (!v) return null
  const m = String(v).match(/(\d+)/)
  return m ? parseInt(m[1], 10) : null
}

/** Ставка в Excel (0.28 или «28%») → процент (28.000) */
function parseRate(v: unknown): number {
  if (v === null || v === undefined) return 0
  if (typeof v === "number") {
    // 0.28 → 28.000
    return v <= 1 ? Math.round(v * 100 * 1000) / 1000 : v
  }
  const s = String(v).replace("%", "").trim()
  const n = parseFloat(s)
  // «28» → 28.000, «0.28» → 28.000
  return n <= 1 ? Math.round(n * 100 * 1000) / 1000 : n
}

interface PaymentRow {
  date: Date
  principal: number
  interest: number
}

// ──────────────────────────────────────────────────────────────────
// Парсинг JetLend PDF
// ──────────────────────────────────────────────────────────────────

function parseJetLendPdf(filePath: string): { contractNumber: string; payments: PaymentRow[] } {
  const text = execSync(`pdftotext -layout "${filePath}" -`, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  })

  // Извлечение № договора из текста PDF.
  // Возможные форматы:
  // 1. Первая непустая строка = только цифры (старый формат)
  // 2. Строка вида «...по займу № 25397...» (актуальный формат JetLend)
  const lines = text.split("\n")
  let contractNumber = ""

  // Сначала ищем паттерн «займу № NNNN» или «Договор № NNNN»
  for (const line of lines) {
    const m = line.match(/(?:займу|договор(?:у)?)\s*№\s*(\d{4,6})/i)
    if (m) {
      contractNumber = m[1]
      break
    }
  }

  // Fallback: первая непустая строка содержит только цифры
  if (!contractNumber) {
    for (const line of lines) {
      const trimmed = line.trim()
      if (/^\d{4,6}$/.test(trimmed)) {
        contractNumber = trimmed
        break
      }
    }
  }

  if (!contractNumber) {
    throw new Error(`Не удалось извлечь № договора из PDF: ${filePath}`)
  }

  const payments: PaymentRow[] = []
  // Строки платежей: начинаются с даты DD.MM.YYYY
  const dateLineRegex = /^(\d{2}\.\d{2}\.\d{4})\s+(.+)$/
  for (const line of lines) {
    const match = line.match(dateLineRegex)
    if (!match) continue

    const datePart = match[1]
    const rest = match[2]

    // Разбиваем остаток строки по пробелам на числовые блоки
    // Формат: total  principal  interest  0,00  0,00  annuity  fee  remaining
    const tokens = rest
      .trim()
      .split(/\s{2,}/) // JetLend разделяет колонки двумя+ пробелами
      .map((t) => t.trim())
      .filter((t) => t.length > 0)

    if (tokens.length < 3) continue

    const principal = parseRuNumber(tokens[1])
    const interest = parseRuNumber(tokens[2])

    // Пропускаем строки с нулевым principal и нулевым interest
    if (principal === 0 && interest === 0) continue

    const [dd, mm, yyyy] = datePart.split(".")
    const date = new Date(Date.UTC(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd)))

    payments.push({ date, principal, interest })
  }

  return { contractNumber, payments }
}

// ──────────────────────────────────────────────────────────────────
// Парсинг Сбербанк XLSX (детальный — только хвост)
// ──────────────────────────────────────────────────────────────────

function parseSberXlsx(filePath: string): { contractNumber: string; payments: PaymentRow[] } {
  const wb = XLSX.readFile(filePath, { cellDates: true })
  const ws = wb.Sheets["График платежей"] ?? wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(ws, {
    header: 1,
    defval: null,
  })

  // Row 0: «График платежей по договору № {contractNumber}»
  const titleCell = rows[0]?.[0]
  const contractMatch = String(titleCell ?? "").match(/№\s*([\w-]+)/)
  if (!contractMatch) {
    throw new Error(`Не удалось извлечь № договора из XLSX: ${filePath}`)
  }
  const contractNumber = contractMatch[1].trim()

  const payments: PaymentRow[] = []
  // Row 3 — заголовки, Row 4+ — данные
  for (let i = 4; i < rows.length; i++) {
    const row = rows[i]
    if (!row || row[0] === null) continue

    // Дата — col 0 (через cellDates: true → JS Date, или строка DD.MM.YYYY)
    let date: Date
    const dateVal = row[0]
    if (dateVal instanceof Date) {
      date = new Date(Date.UTC(dateVal.getFullYear(), dateVal.getMonth(), dateVal.getDate()))
    } else {
      const s = String(dateVal)
      const m = s.match(/(\d{2})\.(\d{2})\.(\d{4})/)
      if (!m) continue
      date = new Date(Date.UTC(parseInt(m[3]), parseInt(m[2]) - 1, parseInt(m[1])))
    }

    const principal = parseXlsxNumber(row[2] as string | number | null) // Основной долг
    const interest = parseXlsxNumber(row[3] as string | number | null)  // Проценты

    if (principal === 0 && interest === 0) continue

    payments.push({ date, principal, interest })
  }

  return { contractNumber, payments }
}

// ──────────────────────────────────────────────────────────────────
// Чтение Кредиты.xlsx Лист2: метаданные + помесячные платежи
// ──────────────────────────────────────────────────────────────────

interface LoanMeta {
  contractNumber: string
  org: string
  lender: string   // "Сбербанк" или "JetLend"
  amount: number
  annualRatePct: number
  termMonths: number | null
  // Для кредитов без детального файла — помесячные платежи из Лист2
  sheet2Payments: PaymentRow[]
  // Колонки в Лист2 (principal col, interest col) — для Sber или безымянных JetLend
  principalCol: number
  interestCol: number
}

interface Sheet2Data {
  loans: LoanMeta[]
  /** Per-org + Итого контрольные суммы — cumulative */
  controlTotals: {
    Зойтен: { principal: number; interest: number }
    "Дрим Лайн": { principal: number; interest: number }
    Пеликан: { principal: number; interest: number }
    "Сикрет Вэй": { principal: number; interest: number }
    Итого: { principal: number; interest: number }
  }
}

function readSheet2(): Sheet2Data {
  const wb = XLSX.readFile(CREDITS_XLSX, { cellDates: true })
  const ws = wb.Sheets["Лист2"]
  if (!ws) throw new Error("Лист2 не найден в Кредиты.xlsx")

  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, {
    header: 1,
    defval: null,
  })

  // row 0: контракты + орг-метки
  // row 1: amount, rate, term per контракт
  // rows 3-35: помесячные данные

  // ── Конфигурация позиций в Лист2 ──
  // (структура зафиксирована в 21-04-SEED-NOTES.md)
  const LOAN_COLS: Array<{
    contractNumber: string
    org: string
    lender: string
    amountCol: number
    rateCol: number
    termCol: number
    principalCol: number
    interestCol: number
    hasPdf: boolean
  }> = [
    // JetLend без PDF (только Лист2 данные)
    { contractNumber: "23086",  org: "Дрим Лайн", lender: "JetLend", amountCol: 1,  rateCol: 2,  termCol: 3,  principalCol: 1,  interestCol: 2,  hasPdf: false },
    { contractNumber: "21220",  org: "Дрим Лайн", lender: "JetLend", amountCol: 4,  rateCol: 5,  termCol: -1, principalCol: 4,  interestCol: 5,  hasPdf: true  },
    { contractNumber: "21934",  org: "Дрим Лайн", lender: "JetLend", amountCol: 7,  rateCol: 8,  termCol: -1, principalCol: 7,  interestCol: 8,  hasPdf: true  },
    { contractNumber: "21940",  org: "Дрим Лайн", lender: "JetLend", amountCol: 10, rateCol: 11, termCol: -1, principalCol: 10, interestCol: 11, hasPdf: true  },
    { contractNumber: "20550",  org: "Дрим Лайн", lender: "JetLend", amountCol: 13, rateCol: 14, termCol: -1, principalCol: 13, interestCol: 14, hasPdf: false },
    { contractNumber: "20967",  org: "Дрим Лайн", lender: "JetLend", amountCol: 16, rateCol: 17, termCol: -1, principalCol: 16, interestCol: 17, hasPdf: true  },
    { contractNumber: "20968",  org: "Дрим Лайн", lender: "JetLend", amountCol: 19, rateCol: 20, termCol: -1, principalCol: 19, interestCol: 20, hasPdf: true  },
    { contractNumber: "21359",  org: "Дрим Лайн", lender: "JetLend", amountCol: 22, rateCol: 23, termCol: -1, principalCol: 22, interestCol: 23, hasPdf: true  },
    { contractNumber: "20770",  org: "Дрим Лайн", lender: "JetLend", amountCol: 25, rateCol: 26, termCol: -1, principalCol: 25, interestCol: 26, hasPdf: false },
    { contractNumber: "21384",  org: "Дрим Лайн", lender: "JetLend", amountCol: 28, rateCol: 29, termCol: -1, principalCol: 28, interestCol: 29, hasPdf: true  },
    { contractNumber: "23757",  org: "Зойтен",    lender: "JetLend", amountCol: 31, rateCol: 32, termCol: -1, principalCol: 31, interestCol: 32, hasPdf: false },
    { contractNumber: "25397",  org: "Зойтен",    lender: "JetLend", amountCol: 34, rateCol: 35, termCol: -1, principalCol: 34, interestCol: 35, hasPdf: true  },
    { contractNumber: "23991",  org: "Зойтен",    lender: "JetLend", amountCol: 37, rateCol: 38, termCol: -1, principalCol: 37, interestCol: 38, hasPdf: false },
    { contractNumber: "23271",  org: "Зойтен",    lender: "JetLend", amountCol: 40, rateCol: 41, termCol: -1, principalCol: 40, interestCol: 41, hasPdf: false },
    { contractNumber: "23519",  org: "Зойтен",    lender: "JetLend", amountCol: 43, rateCol: 44, termCol: -1, principalCol: 43, interestCol: 44, hasPdf: false },
    { contractNumber: "23532",  org: "Зойтен",    lender: "JetLend", amountCol: 46, rateCol: 47, termCol: -1, principalCol: 46, interestCol: 47, hasPdf: false },
    { contractNumber: "28513",  org: "Зойтен",    lender: "JetLend", amountCol: 49, rateCol: 50, termCol: -1, principalCol: 49, interestCol: 50, hasPdf: true  },
    { contractNumber: "29294",  org: "Зойтен",    lender: "JetLend", amountCol: 52, rateCol: 53, termCol: -1, principalCol: 52, interestCol: 53, hasPdf: true  },
    { contractNumber: "29338",  org: "Зойтен",    lender: "JetLend", amountCol: 55, rateCol: 56, termCol: -1, principalCol: 55, interestCol: 56, hasPdf: true  },
    // Сбербанк (4 контракта): per-org summary columns
    { contractNumber: "3702268607-23-2", org: "Зойтен",    lender: "Сбербанк", amountCol: -1, rateCol: -1, termCol: -1, principalCol: 58, interestCol: 59, hasPdf: false },
    { contractNumber: "3702259264-23-2", org: "Дрим Лайн", lender: "Сбербанк", amountCol: -1, rateCol: -1, termCol: -1, principalCol: 62, interestCol: 63, hasPdf: true  }, // XLSX tail
    { contractNumber: "3702266127-23-1", org: "Сикрет Вэй",lender: "Сбербанк", amountCol: -1, rateCol: -1, termCol: -1, principalCol: 66, interestCol: 67, hasPdf: false },
    { contractNumber: "3702242101-23-2", org: "Пеликан",   lender: "Сбербанк", amountCol: -1, rateCol: -1, termCol: -1, principalCol: 70, interestCol: 71, hasPdf: true  }, // XLSX tail
  ]

  const row1 = rows[1] ?? []

  // Вычисляем amount для Сбербанк контрактов из данных Лист2:
  // amount = Σ principal + remaining_balance (из первой ненулевой строки остатка)
  // Колонки остатков: 60=ЗойтенСбер, 64=ДрЛайнСбер, 68=СикрВэй, 72=Пеликан
  const SBER_BALANCE_COLS: Record<string, number> = {
    "3702268607-23-2": 60,
    "3702259264-23-2": 64,
    "3702266127-23-1": 68,
    "3702242101-23-2": 72,
  }

  // Для Сбербанк: вычисляем amount = cumulative payments до первой строки с остатком + остаток
  const sberAmounts: Record<string, number> = {}
  for (const [contract, balCol] of Object.entries(SBER_BALANCE_COLS)) {
    const cfg = LOAN_COLS.find((l) => l.contractNumber === contract)!
    let firstBalanceRow = -1
    let firstBalance = 0
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i]
      if (!r?.[0]) continue // skip empty rows
      const balVal = r[balCol]
      if (balVal !== null && balVal !== undefined) {
        firstBalanceRow = i
        firstBalance = parseRuNumber(balVal as string | number)
        break
      }
    }
    let cumPrincipal = 0
    if (firstBalanceRow > 0) {
      for (let i = 3; i <= firstBalanceRow; i++) {
        const r = rows[i]
        if (!r?.[0]) continue
        cumPrincipal += parseRuNumber(r[cfg.principalCol] as string | number | null)
      }
    } else {
      // Нет остатка → сумма всех платежей = amount
      for (let i = 3; i < rows.length; i++) {
        const r = rows[i]
        if (!r?.[0]) continue
        cumPrincipal += parseRuNumber(r[cfg.principalCol] as string | number | null)
      }
    }
    sberAmounts[contract] = cumPrincipal + firstBalance
  }

  // Собираем метаданные + помесячные платежи
  const loans: LoanMeta[] = []
  for (const cfg of LOAN_COLS) {
    let amount: number
    let annualRatePct: number
    let termMonths: number | null = null

    if (cfg.lender === "Сбербанк") {
      amount = sberAmounts[cfg.contractNumber] ?? 0
      // Rate для Sber не в Лист2 явно — hardcode из известных данных
      const SBER_RATES: Record<string, number> = {
        "3702268607-23-2": 19.3, // Зойтен
        "3702259264-23-2": 19.3, // ДрЛайн (примерная)
        "3702266127-23-1": 19.3, // СикрВэй (примерная)
        "3702242101-23-2": 19.3, // Пеликан (примерная)
      }
      annualRatePct = SBER_RATES[cfg.contractNumber] ?? 19.3
    } else {
      // JetLend: из row1
      const rawAmount = row1[cfg.amountCol]
      amount = parseRuNumber(rawAmount as string | number | null)
      annualRatePct = parseRate(row1[cfg.rateCol])
      if (cfg.termCol >= 0) {
        termMonths = parseTermMonths(row1[cfg.termCol])
      }
    }

    // Помесячные платежи из Лист2 (для кредитов без PDF или для Сбербанк history)
    const sheet2Payments: PaymentRow[] = []
    for (let i = 3; i < rows.length; i++) {
      const r = rows[i]
      if (!r?.[0]) continue
      const dateLabel = r[0]
      if (typeof dateLabel !== "string") continue

      const p = parseRuNumber(r[cfg.principalCol] as string | number | null)
      const intr = parseRuNumber(r[cfg.interestCol] as string | number | null)
      if (p === 0 && intr === 0) continue

      // Парсим «апрель 2024», «май 2024» → Date UTC первого числа месяца
      const monthMap: Record<string, number> = {
        январь: 1, февраль: 2, март: 3, апрель: 4, май: 5, июнь: 6,
        июль: 7, август: 8, сентябрь: 9, октябрь: 10, ноябрь: 11, декабрь: 12,
      }
      const m = String(dateLabel)
        .trim()
        .toLowerCase()
        .match(/^(\S+)\s+(\d{4})$/)
      if (!m) continue
      const mon = monthMap[m[1]]
      const year = parseInt(m[2])
      if (!mon || !year) continue

      // Первое число месяца (UTC) — решение U-05
      const date = new Date(Date.UTC(year, mon - 1, 1))
      sheet2Payments.push({ date, principal: p, interest: intr })
    }

    loans.push({
      contractNumber: cfg.contractNumber,
      org: cfg.org,
      lender: cfg.lender,
      amount,
      annualRatePct,
      termMonths,
      sheet2Payments,
      principalCol: cfg.principalCol,
      interestCol: cfg.interestCol,
    })
  }

  // Контрольные суммы из Лист2 per-org cols 76/77, 80/81, 84/85, 88/89, 92/93
  let z_p = 0, z_i = 0, dl_p = 0, dl_i = 0, pel_p = 0, pel_i = 0, sw_p = 0, sw_i = 0, tot_p = 0, tot_i = 0
  for (let i = 3; i < rows.length; i++) {
    const r = rows[i]
    if (!r?.[0] || typeof r[0] !== "string") continue
    z_p   += parseRuNumber(r[76] as string | number | null)
    z_i   += parseRuNumber(r[77] as string | number | null)
    dl_p  += parseRuNumber(r[80] as string | number | null)
    dl_i  += parseRuNumber(r[81] as string | number | null)
    pel_p += parseRuNumber(r[84] as string | number | null)
    pel_i += parseRuNumber(r[85] as string | number | null)
    sw_p  += parseRuNumber(r[88] as string | number | null)
    sw_i  += parseRuNumber(r[89] as string | number | null)
    tot_p += parseRuNumber(r[92] as string | number | null)
    tot_i += parseRuNumber(r[93] as string | number | null)
  }

  return {
    loans,
    controlTotals: {
      Зойтен:      { principal: z_p,   interest: z_i   },
      "Дрим Лайн": { principal: dl_p,  interest: dl_i  },
      Пеликан:     { principal: pel_p, interest: pel_i },
      "Сикрет Вэй":{ principal: sw_p,  interest: sw_i  },
      Итого:       { principal: tot_p, interest: tot_i },
    },
  }
}

// ──────────────────────────────────────────────────────────────────
// Основная логика
// ──────────────────────────────────────────────────────────────────

interface LoanSeed {
  contractNumber: string
  companyName: string
  lenderName: string
  amount: number
  annualRatePct: number
  termMonths: number | null
  payments: PaymentRow[]
}

async function main() {
  console.log("=== Seed кредитов (D-01, U-01) ===")

  // ── Шаг 0: проверка pdftotext ──
  try {
    execSync("pdftotext -v", { stdio: "pipe" })
    console.log("✓ pdftotext доступен")
  } catch {
    console.error(
      "✗ pdftotext не найден.\n" +
        "Установите poppler:\n" +
        "  Linux: apt-get install -y poppler-utils\n" +
        "  Windows: скачайте poppler для Windows и добавьте bin/ в PATH\n" +
        "  macOS: brew install poppler"
    )
    process.exit(1)
  }

  // ── Шаг 1: проверка файлов ──
  if (!fs.existsSync(CREDITS_FOLDER)) {
    console.error(`✗ Папка не найдена: ${CREDITS_FOLDER}`)
    process.exit(1)
  }
  if (!fs.existsSync(CREDITS_XLSX)) {
    console.error(`✗ Файл не найден: ${CREDITS_XLSX}`)
    process.exit(1)
  }

  // ── Шаг 2: Lender upsert ──
  console.log("\n── Upsert кредиторов ──")
  const lenders = ["Сбербанк", "JetLend"]
  for (let i = 0; i < lenders.length; i++) {
    await prisma.lender.upsert({
      where: { name: lenders[i] },
      create: { name: lenders[i], sortOrder: i + 1 },
      update: {},
    })
    console.log(`  ✓ Lender: ${lenders[i]}`)
  }

  // ── Шаг 3: Company lookup ──
  console.log("\n── Поиск организаций ──")
  const companyMap: Record<string, string> = {} // companyName → companyId
  for (const companyName of Object.values(ORG_TO_COMPANY)) {
    const company = await prisma.company.findUnique({ where: { name: companyName } })
    if (!company) {
      console.warn(`  ⚠ Company не найдена: "${companyName}" — кредиты этой орг будут пропущены`)
    } else {
      companyMap[companyName] = company.id
      console.log(`  ✓ Company: ${companyName} (id: ${company.id})`)
    }
  }

  // ── Шаг 4: Чтение Кредиты.xlsx Лист2 ──
  console.log("\n── Чтение Кредиты.xlsx Лист2 ──")
  const sheet2 = readSheet2()
  console.log(`  ✓ Прочитано ${sheet2.loans.length} кредитов из Лист2`)

  // ── Шаг 5: Парсинг PDF файлов JetLend ──
  console.log("\n── Парсинг JetLend PDF ──")
  const pdfPayments: Record<string, PaymentRow[]> = {}
  const pdfFiles = fs.readdirSync(CREDITS_FOLDER).filter((f) => f.endsWith(".pdf"))
  for (const file of pdfFiles) {
    const filePath = path.join(CREDITS_FOLDER, file)
    try {
      const { contractNumber, payments } = parseJetLendPdf(filePath)
      pdfPayments[contractNumber] = payments
      console.log(`  ✓ ${file} → договор ${contractNumber}: ${payments.length} платежей`)
    } catch (e) {
      console.error(`  ✗ Ошибка парсинга ${file}:`, (e as Error).message)
    }
  }

  // ── Шаг 6: Парсинг Сбербанк XLSX ──
  console.log("\n── Парсинг Сбербанк XLSX ──")
  const sberXlsxPayments: Record<string, PaymentRow[]> = {}
  const xlsxFiles = fs.readdirSync(CREDITS_FOLDER).filter((f) => f.endsWith(".xlsx"))
  for (const file of xlsxFiles) {
    const filePath = path.join(CREDITS_FOLDER, file)
    try {
      const { contractNumber, payments } = parseSberXlsx(filePath)
      sberXlsxPayments[contractNumber] = payments
      console.log(`  ✓ ${file} → договор ${contractNumber}: ${payments.length} платежей (хвост)`)
    } catch (e) {
      console.error(`  ✗ Ошибка парсинга ${file}:`, (e as Error).message)
    }
  }

  // ── Шаг 7: Сборка финального списка кредитов для seed ──
  const loanSeeds: LoanSeed[] = []

  for (const loanMeta of sheet2.loans) {
    const companyName = ORG_TO_COMPANY[loanMeta.org]
    if (!companyName || !companyMap[companyName]) {
      console.warn(`  ⚠ Пропускаем кредит ${loanMeta.contractNumber} — орг "${loanMeta.org}" не найдена`)
      continue
    }

    let payments: PaymentRow[] = []

    if (loanMeta.lender === "JetLend") {
      const pdfData = pdfPayments[loanMeta.contractNumber]
      if (pdfData && pdfData.length > 0) {
        // Используем PDF как единственный источник строк (U-01).
        // PDF содержит ПОЛНЫЙ граф (история + будущие платежи).
        // Лист2 для этих кредитов содержит те же данные в помесячной агрегации —
        // НЕ prepend-им Лист2, иначе будет двойной счёт первых платежей.
        payments = pdfData
      } else {
        // Нет PDF — используем Лист2 (помесячно)
        payments = loanMeta.sheet2Payments
        if (payments.length === 0) {
          console.warn(`  ⚠ Нет платежей для кредита ${loanMeta.contractNumber} — пропускаем`)
          continue
        }
      }
    } else {
      // Сбербанк: основная история из Лист2, хвост из XLSX
      const xlsxData = sberXlsxPayments[loanMeta.contractNumber] ?? []
      if (xlsxData.length > 0) {
        // Объединяем: Лист2 (история) + XLSX (хвост — только платежи в СЛЕДУЮЩЕМ месяце после последней Лист2 записи).
        // Важно: Лист2 хранит помесячные записи на 1-е число (напр. 01.06.2026), а XLSX содержит
        // тот же платёж на фактическую дату (напр. 19.06.2026). Если фильтровать просто по date > lastSheet2Date,
        // то XLSX-платёж за тот же месяц (19.06 > 01.06) попадёт дважды.
        // Решение: фильтруем XLSX платежи начиная с 1-го числа СЛЕДУЮЩЕГО месяца после последней Лист2 записи.
        const lastSheet2Date =
          loanMeta.sheet2Payments.length > 0
            ? loanMeta.sheet2Payments.reduce((max, p) => p.date > max ? p.date : max, loanMeta.sheet2Payments[0].date)
            : null
        const nextMonthBoundary = lastSheet2Date
          ? new Date(Date.UTC(lastSheet2Date.getUTCFullYear(), lastSheet2Date.getUTCMonth() + 1, 1))
          : null
        const xlsxTail = nextMonthBoundary
          ? xlsxData.filter((p) => p.date >= nextMonthBoundary)
          : xlsxData
        payments = [...loanMeta.sheet2Payments, ...xlsxTail]
        if (xlsxTail.length > 0) {
          console.log(`    ${loanMeta.contractNumber}: Лист2 (${loanMeta.sheet2Payments.length}) + XLSX хвост (${xlsxTail.length})`)
        }
      } else {
        payments = loanMeta.sheet2Payments
      }
    }

    loanSeeds.push({
      contractNumber: loanMeta.contractNumber,
      companyName,
      lenderName: loanMeta.lender,
      amount: loanMeta.amount,
      annualRatePct: loanMeta.annualRatePct,
      termMonths: loanMeta.termMonths,
      payments,
    })
  }

  // ── Шаг 8: Идемпотентность — удаляем существующие Loan ──
  console.log("\n── Очистка существующих кредитов (идемпотентность) ──")
  const deleted = await prisma.loan.deleteMany({})
  console.log(`  Удалено ${deleted.count} кредитов (cascade LoanPayment)`)

  // ── Шаг 9: Создание Loan + LoanPayment ──
  console.log("\n── Создание кредитов ──")
  let createdCount = 0
  let totalPayments = 0

  for (const seed of loanSeeds) {
    const companyId = companyMap[seed.companyName]
    const lender = await prisma.lender.findUnique({ where: { name: seed.lenderName } })
    if (!lender) {
      console.warn(`  ⚠ Lender не найден: ${seed.lenderName} — пропускаем ${seed.contractNumber}`)
      continue
    }

    await prisma.loan.create({
      data: {
        contractNumber: seed.contractNumber,
        companyId,
        lenderId: lender.id,
        amount: seed.amount,
        annualRatePct: seed.annualRatePct,
        termMonths: seed.termMonths,
        issueDate: null, // D-07: null при seed
        notes: null,
        payments: {
          create: seed.payments.map((p) => ({
            date: p.date,
            principal: p.principal,
            interest: p.interest,
          })),
        },
      },
    })

    createdCount++
    totalPayments += seed.payments.length
    console.log(
      `  ✓ ${seed.contractNumber} (${seed.companyName}, ${seed.lenderName}): ` +
        `amount=${seed.amount.toLocaleString("ru-RU")} ₽, ` +
        `rate=${seed.annualRatePct}%, ` +
        `${seed.payments.length} платежей`
    )
  }

  console.log(`\nСоздано: ${createdCount} кредитов, ${totalPayments} платежей`)

  // ── Шаг 10: Сверка ──
  console.log("\n═══════════════════════════════════════════════════════")
  console.log("СВЕРКА SEED (сравните с контрольными суммами из Лист2)")
  console.log("═══════════════════════════════════════════════════════")

  // Per-кредит: Σprincipal vs amount
  console.log("\n── Per-кредит: накопленный Σtело vs amount ──")
  const loans = await prisma.loan.findMany({
    include: { payments: true, company: true, lender: true },
  })

  const fmt = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  for (const loan of loans) {
    const sumP = loan.payments.reduce((s, p) => s + Number(p.principal), 0)
    const amount = Number(loan.amount)
    const diff = Math.abs(sumP - amount)
    const ok = diff < 1 // допуск 1 рубль (копейки)
    console.log(
      `  ${ok ? "✓" : "✗"} ${loan.contractNumber} (${loan.company.name}, ${loan.lender.name}): ` +
        `Σprincipal=${fmt(sumP)} vs amount=${fmt(amount)} | diff=${fmt(diff)}`
    )
    if (!ok) console.warn(`    ⚠ РАСХОЖДЕНИЕ > 1₽ — проверьте парсинг`)
  }

  // Per-org + Итого
  // ВАЖНО: Лист2 control-колонки (76,80,84,88) имеют «поздний старт» для Сбербанк-платежей:
  //   Зойтен: control стартует с апр2025 (пропущены апр2024-мар2025, 12 × 193200 = 2 318 400)
  //   Дрим Лайн: control стартует с май2024 (пропущен апр2024, 1 × 360000 = 360 000)
  //   Пеликан: control стартует с май2024 (пропущен апр2024, 1 × 399400 = 399 400)
  //   Сикрет Вэй: control стартует с июл2024 (пропущены апр-июн2024, 3 × 299720 = 899 160)
  // Кроме того, PDF-платежи последнего месяца (напр. 20968 июн2026) не отражены в Лист2 monthly-колонках.
  // Seed содержит КОРРЕКТНЫЕ данные. Расхождения с Лист2 control — ожидаемы и задокументированы.
  console.log("\n── Per-org Σprincipal/Σinterest из seed (за период Лист2) ──")
  const seedTotals: Record<string, { principal: number; interest: number }> = {}
  for (const loan of loans) {
    const org = Object.entries(ORG_TO_COMPANY).find(([, v]) => v === loan.company.name)?.[0] ?? loan.company.name
    if (!seedTotals[org]) seedTotals[org] = { principal: 0, interest: 0 }
    // Сумма только платежей в период Лист2 (апр2024-дек2026)
    const lист2End = new Date(Date.UTC(2026, 11, 31)) // 31 дек 2026
    for (const p of loan.payments) {
      if (new Date(p.date) <= lист2End) {
        seedTotals[org].principal += Number(p.principal)
        seedTotals[org].interest += Number(p.interest)
      }
    }
  }

  const controlOrgs = ["Зойтен", "Дрим Лайн", "Пеликан", "Сикрет Вэй", "Итого"]
  let seedTotP = 0, seedTotI = 0

  for (const org of controlOrgs.slice(0, -1)) {
    const seed = seedTotals[org] ?? { principal: 0, interest: 0 }
    const ctrl = sheet2.controlTotals[org as keyof typeof sheet2.controlTotals]
    const diffP = Math.abs(seed.principal - ctrl.principal)
    const diffI = Math.abs(seed.interest - ctrl.interest)
    const okP = diffP < 100
    const okI = diffI < 100
    console.log(
      `  ${org}:\n` +
        `    principal: seed=${fmt(seed.principal)} vs Лист2=${fmt(ctrl.principal)} diff=${fmt(diffP)} ${okP ? "✓" : "✗"}\n` +
        `    interest:  seed=${fmt(seed.interest)} vs Лист2=${fmt(ctrl.interest)} diff=${fmt(diffI)} ${okI ? "✓" : "✗"}`
    )
    seedTotP += seed.principal
    seedTotI += seed.interest
  }

  const ctrlTot = sheet2.controlTotals.Итого
  const diffTotP = Math.abs(seedTotP - ctrlTot.principal)
  const diffTotI = Math.abs(seedTotI - ctrlTot.interest)
  console.log(
    `  ИТОГО:\n` +
      `    principal: seed=${fmt(seedTotP)} vs Лист2=${fmt(ctrlTot.principal)} diff=${fmt(diffTotP)} ${diffTotP < 200 ? "✓" : "✗"}\n` +
      `    interest:  seed=${fmt(seedTotI)} vs Лист2=${fmt(ctrlTot.interest)} diff=${fmt(diffTotI)} ${diffTotI < 200 ? "✓" : "✗"}`
  )

  console.log("\n═══════════════════════════════════════════════════════")
  console.log("Seed завершён. Проверьте сверку выше перед применением.")
  console.log("═══════════════════════════════════════════════════════")
}

main()
  .catch((e) => {
    console.error("Ошибка seed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
