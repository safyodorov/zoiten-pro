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
