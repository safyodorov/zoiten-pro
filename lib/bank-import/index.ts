// lib/bank-import/index.ts
// Phase 22 (22-03): Public entry point for lib/bank-import/.
// Re-exports types, adapters, helpers.
// detectFormat: 2-level detection (filename → header signature).
// parseStatement: dispatcher for 3 adapters.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

import * as XLSX from "xlsx"
import { parseVtbStatement } from "./vtb-adapter"
import { parsePsbStatement } from "./psb-adapter"
import { parseSberStatement } from "./sber-adapter"
import type { BankFormat, ParseResult } from "./types"

export * from "./types"
export { computeFingerprint, buildFingerprintFields } from "./fingerprint"
export { parseDDMMYYYY, parseAmount, normalizePurpose, extractBic, buildHeaderMap } from "./normalize"
export { parseVtbStatement, parsePsbStatement, parseSberStatement }

/**
 * Detects the bank format from the file name and/or the workbook header.
 * Two-level strategy:
 *   1) filename pattern (most reliable for VTB)
 *   2) fallback: scan first 8 rows for known signatures
 */
export function detectFormat(fileName: string, workbook: XLSX.WorkBook): BankFormat {
  // Level 1: by file name
  if (/^VTB_BankStatement/i.test(fileName)) return "vtb"
  if (/^СберБизнес/i.test(fileName) || /Сбербизнес/i.test(fileName)) return "sber"
  if (/Выписка по счету/i.test(fileName)) return "psb"

  // Level 2: fallback by header signature in first sheet
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) return "vtb"
  const sheet = workbook.Sheets[sheetName]!
  const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    defval: null,
  })
  const head = rows
    .slice(0, 8)
    .flat()
    .map((c) => String(c ?? ""))
    .join(" ")

  if (/СБЕРБАНК/i.test(head) || /ПАО СБЕРБАНК/i.test(head)) return "sber"
  if (/Банк ПСБ|ПРОМСВЯЗ/i.test(head)) return "psb"

  // Default: VTB
  return "vtb"
}

/**
 * Parses a bank statement workbook using the detected format adapter.
 */
export function parseStatement(format: BankFormat, workbook: XLSX.WorkBook): ParseResult {
  const transactions =
    format === "vtb"
      ? parseVtbStatement(workbook)
      : format === "psb"
        ? parsePsbStatement(workbook)
        : parseSberStatement(workbook)
  return { format, transactions }
}
