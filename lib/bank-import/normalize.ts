// lib/bank-import/normalize.ts
// Phase 22 (22-03): Pure normalization helpers for bank statement parsing.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

/**
 * Parses a DD.MM.YYYY date string (or number) into a UTC Date.
 * Returns null for invalid input.
 */
export function parseDDMMYYYY(s: string | number | null | undefined): Date | null {
  if (s == null) return null
  const m = String(s).trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  return new Date(Date.UTC(parseInt(m[3]!), parseInt(m[2]!) - 1, parseInt(m[1]!)))
}

/**
 * Converts an Excel serial date number (1900 date system) to a UTC Date.
 * Excel serial 1 = 1900-01-01 (with the infamous 1900 leap-year bug baked in).
 * Practical formula: Date.UTC(1899, 11, 30) + serial × 86400000.
 * Returns null if the serial is out of plausible range (30000–80000 ≈ 1982–2118).
 */
export function excelSerialToDate(serial: number): Date | null {
  const s = Math.floor(serial)
  if (s < 30000 || s > 80000) return null
  const d = new Date(Date.UTC(1899, 11, 30) + s * 86400000)
  return isNaN(d.getTime()) ? null : d
}

/**
 * Combined date cell parser: tries DD.MM.YYYY string first, then Excel serial fallback.
 * Accepts a string that may encode a serial as a decimal number ("46024.18197").
 * Returns null for invalid/null input.
 */
export function parseDateCell(v: string | number | null | undefined): Date | null {
  if (v == null) return null
  // Fast path: numeric value
  if (typeof v === "number") {
    const ddmmyyyy = parseDDMMYYYY(v)
    if (ddmmyyyy) return ddmmyyyy
    return excelSerialToDate(v)
  }
  const str = String(v).trim()
  // Try DD.MM.YYYY first
  const ddmmyyyy = parseDDMMYYYY(str)
  if (ddmmyyyy) return ddmmyyyy
  // Try Excel serial encoded as a numeric string (e.g. "46024.1819675928")
  const n = parseFloat(str)
  if (Number.isFinite(n) && n >= 30000 && n < 80000) {
    return excelSerialToDate(n)
  }
  return null
}

/**
 * Parses an amount value that may use commas as thousands separators
 * (e.g. "6,057,806.46" → 6057806.46).
 * Returns null for empty/null/NaN input.
 */
export function parseAmount(v: string | number | null | undefined): number | null {
  if (v == null || v === "") return null
  if (typeof v === "number") return Number.isFinite(v) ? v : null
  // Remove thousands separators (commas before groups of 3 digits); decimal = dot
  const cleaned = String(v)
    .replace(/\s/g, "")
    .replace(/,(?=\d{3}(\.|,|$))/g, "")
  const n = parseFloat(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Normalizes a payment purpose string:
 * trim + collapse whitespace + lowercase.
 * Used for fingerprint computation to absorb insignificant whitespace differences.
 */
export function normalizePurpose(s: string | null | undefined): string {
  return String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase()
}

/**
 * Extracts a 9-digit BIC from a bank description string
 * (e.g. "БИК 047003608 Ивановское отд…" → "047003608").
 * Returns null if not found.
 */
export function extractBic(s: string | null | undefined): string | null {
  if (!s) return null
  // Primary: explicit "БИК XXXXXXXXX" pattern
  const primary = String(s).match(/БИК\s*(\d{9})/i)
  if (primary) return primary[1]!
  // Fallback: any standalone 9-digit number
  const fallback = String(s).match(/\b(\d{9})\b/)
  return fallback ? fallback[1]! : null
}

/**
 * Extracts the bank name from a Sber "Банк (БИК и наименование)" cell.
 * Format: "БИК NNNNNNNNN ИМЯ БАНКА" → "ИМЯ БАНКА".
 * Strips the leading "БИК\s*\d{9}\s*" prefix and returns the remaining trimmed text.
 * Returns null if the input doesn't match the expected format or the name is empty.
 * Used to populate Bank.name for counterparty banks found in Sber statements.
 */
export function extractBankName(s: string | null | undefined): string | null {
  if (!s) return null
  const m = String(s).match(/^БИК\s*\d{9}\s+(.+)$/i)
  if (!m) return null
  const name = m[1]!.trim()
  return name || null
}

/**
 * Каноникализирует наименование компании из банковской выписки.
 * Разные банки пишут организационно-правовую форму по-разному
 * («ОБЩЕСТВО С ОГРАНИЧЕННОЙ ОТВЕТСТВЕННОСТЬЮ X» в Сбер/ВТБ vs «ООО X» в ПСБ).
 * Приводим к аббревиатуре + нормализуем кавычки/пробелы, чтобы одна компания
 * не плодила дубли (все варианты → `ООО "ЗОЙТЕН"`). Возвращает null для пустого ввода.
 */
// NB: без \b — в JS regex word-boundary работает только для ASCII, после кириллицы
// он не срабатывает. Опираемся на якорь ^ + следующий \s/кавычку в самих именах.
const COMPANY_LEGAL_FORMS: [RegExp, string][] = [
  [/^ПУБЛИЧНОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\s*/i, "ПАО "],
  [/^ЗАКРЫТОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\s*/i, "ЗАО "],
  [/^ОТКРЫТОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\s*/i, "ОАО "],
  [/^НЕПУБЛИЧНОЕ\s+АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\s*/i, "АО "],
  [/^АКЦИОНЕРНОЕ\s+ОБЩЕСТВО\s*/i, "АО "],
  [/^ОБЩЕСТВО\s+С\s+ОГРАНИЧЕННОЙ\s+ОТВЕТСТВЕННОСТЬЮ\s*/i, "ООО "],
  [/^ИНДИВИДУАЛЬНЫЙ\s+ПРЕДПРИНИМАТЕЛЬ\s*/i, "ИП "],
]

export function canonicalizeCompanyName(
  raw: string | null | undefined
): string | null {
  if (raw == null) return null
  // Нормализуем кавычки (« » “ ” „ ' → ") и пробелы
  let s = String(raw)
    .replace(/[«»“”„'']/g, '"')
    .replace(/\s+/g, " ")
    .trim()
  if (s === "") return null
  // Заменяем ведущую орг.-правовую форму на аббревиатуру (первое совпадение).
  // Аббревиатура с хвостовым пробелом → между формой и названием ровно один пробел.
  for (const [re, abbr] of COMPANY_LEGAL_FORMS) {
    if (re.test(s)) {
      s = s.replace(re, abbr)
      break
    }
  }
  return s.replace(/\s+/g, " ").trim()
}

/**
 * «Ядро» имени компании — без орг.-правовой формы и кавычек, UPPERCASE.
 * 'ООО "ГЕЙМ БЛОКС"' → 'ГЕЙМ БЛОКС'; 'ГЕЙМ БЛОКС' → 'ГЕЙМ БЛОКС'.
 * Используется для сопоставления компаний из выписок с уже существующими
 * (короткие имена в Кредитах/Сотрудниках) — чтобы импорт не плодил дубли.
 * Возвращает null для пустого ввода.
 */
export function companyCoreName(raw: string | null | undefined): string | null {
  const canon = canonicalizeCompanyName(raw)
  if (!canon) return null
  const core = canon
    .replace(/^(ООО|ПАО|АО|ЗАО|ОАО|ИП)\s+/i, "")
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
  return core || null
}

/**
 * Robust RU/US amount parser for bank balance cells.
 * Handles mixed formats:
 *   "33,201.97"   → 33201.97 (US thousands sep + decimal dot)
 *   "217 568,45"  → 217568.45 (RU space-thousands sep + decimal comma)
 *   "159 576,11"  → 159576.11
 *   1234.5 (number) → 1234.5
 * Returns null for empty/null/NaN.
 */
export function parseBalanceAmount(s: string | number | null | undefined): number | null {
  if (s == null || s === "") return null
  if (typeof s === "number") return Number.isFinite(s) ? s : null
  // Strip regular spaces and non-breaking spaces ( )
  let str = String(s).replace(/[\s ]/g, "")
  if (str === "") return null

  const hasComma = str.includes(",")
  const hasDot = str.includes(".")

  if (hasComma && hasDot) {
    // Both present: last-occurring separator is decimal, the other is thousands
    const lastComma = str.lastIndexOf(",")
    const lastDot = str.lastIndexOf(".")
    if (lastComma > lastDot) {
      // Comma is decimal: remove dots (thousands), replace comma with dot
      str = str.replace(/\./g, "").replace(",", ".")
    } else {
      // Dot is decimal: remove commas (thousands)
      str = str.replace(/,/g, "")
    }
  } else if (hasComma) {
    // Comma-only: treat as decimal separator (RU format)
    str = str.replace(",", ".")
  }
  // else dot-only or neither: already correct

  const n = parseFloat(str)
  return Number.isFinite(n) ? n : null
}

/** RU month name → 1-based month number (genitive forms used in written dates) */
const RU_MONTH_MAP: Record<string, number> = {
  январь: 1, января: 1,
  февраль: 2, февраля: 2,
  март: 3, марта: 3,
  апрель: 4, апреля: 4,
  май: 5, мая: 5,
  июнь: 6, июня: 6,
  июль: 7, июля: 7,
  август: 8, августа: 8,
  сентябрь: 9, сентября: 9,
  октябрь: 10, октября: 10,
  ноябрь: 11, ноября: 11,
  декабрь: 12, декабря: 12,
}

/**
 * Parses a Russian written date like "10 июня 2026" or "01 января 2026 г." → UTC Date.
 * Returns null if no match or month is unknown.
 */
export function parseRussianDate(s: string | null | undefined): Date | null {
  if (s == null) return null
  const m = String(s).trim().match(/(\d{1,2})\s+([а-яё]+)\s+(\d{4})/i)
  if (!m) return null
  const day = parseInt(m[1]!, 10)
  const monthName = m[2]!.toLowerCase()
  const year = parseInt(m[3]!, 10)
  const month = RU_MONTH_MAP[monthName]
  if (!month) return null
  return new Date(Date.UTC(year, month - 1, day))
}

/**
 * Builds a header→column-index map from a header row array.
 * Skips null/empty cells.
 */
export function buildHeaderMap(
  headerRow: (string | number | null | undefined)[]
): Record<string, number> {
  const map: Record<string, number> = {}
  headerRow.forEach((cell, idx) => {
    if (cell != null) {
      const key = String(cell).trim()
      if (key !== "") map[key] = idx
    }
  })
  return map
}
