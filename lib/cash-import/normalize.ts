// lib/cash-import/normalize.ts
// Phase 23 (23-03): Cash-specific normalization helpers.
// Re-exports shared helpers from bank-import; adds cash-specific ones.
// Pure — no next-auth, next/*, or Prisma singleton imports.

export {
  excelSerialToDate,
  parseDateCell,
  parseBalanceAmount,
  normalizePurpose,
} from "../bank-import/normalize"

/**
 * Normalizes a department cell value.
 * "" / null / undefined → null
 * "офис+ склад" / "офис +склад" → "офис+склад"
 * "Офис" → "офис" (trim + lowercase)
 */
export function normalizeDepartment(v: string | null | undefined): string | null {
  if (v == null) return null
  const s = String(v).trim().toLowerCase().replace(/\s+/g, " ")
  if (s === "") return null
  // Нормализовать «офис+ склад» / «офис +склад» → «офис+склад»
  return s.replace(/\s*\+\s*/g, "+")
}

// Ключи lookup-таблицы — в lowercase + ё→е (нормализованный ключ).
// Значения — каноничный вид (с ё, если нужно).
const SURNAME_FIXES: Record<string, string> = {
  "федоров": "Фёдоров",
  "федорова": "Фёдорова",
  "чихова": "Чижова",
  "легоставева": "Легостаева",
  "легоставеа": "Легостаева",
}

/**
 * Normalizes a responsible person surname from a cash budget cell:
 * - Strips 1+ trailing initials: "Иванова Н." → "Иванова", "Иванова Н. В." → "Иванова"
 * - Fixes known typos via SURNAME_FIXES (lookup key uses ё→е, return value PRESERVES ё)
 * - Empty / null → "Иванова" (default responsible)
 * - ё in the surname is PRESERVED in the return value (e.g. "Королёва" → "Королёва")
 */
export function normalizeResponsibleSurname(v: string | null | undefined): string {
  let s = String(v ?? "").trim()
  if (s === "") return "Иванова"

  // Strip one OR MORE trailing initials: «Иванова Н.» / «Иванова Н. В.» / «Иванов А.Б.»
  // Regex: one or more groups of (whitespace + uppercase Cyrillic letter + optional dot)
  s = s.replace(/(\s+[А-ЯЁ]\.?)+\s*$/u, "").trim()

  // CRITICAL: ё→е applied ONLY to the lookup key for SURNAME_FIXES.
  // The return value PRESERVES ё (responsibleNameRaw must keep ё, e.g. «Королёва»).
  const key = s.toLowerCase().replace(/ё/g, "е")
  if (SURNAME_FIXES[key]) return SURNAME_FIXES[key]!

  // Not in fix table — return original (with ё preserved), capitalize first letter.
  return s.charAt(0).toUpperCase() + s.slice(1)
}
