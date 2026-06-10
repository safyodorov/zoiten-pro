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
