// lib/cash-import/persist.ts
// Phase 23 (23-03): Persist pipeline for ParsedCashEntry[] → DB.
// Accepts a PrismaClient instance — does NOT import next-auth or lib/prisma singleton.
// Mirror of lib/bank-import/persist.ts pattern.

import type { PrismaClient } from "@prisma/client"
import { computeCashFingerprint } from "./fingerprint"
import type { ParsedCashEntry } from "./types"

export interface CashPersistResult {
  imported: number
  skipped: number
  total: number
}

/**
 * ё-insensitive surname comparison for employee matching.
 * Both sides normalized to lowercase + ё→е.
 */
function eqSurname(a: string, b: string): boolean {
  const n = (s: string) => s.toLowerCase().replace(/ё/g, "е").trim()
  return n(a) === n(b)
}

/**
 * Persists parsed cash entries to the database.
 * Steps:
 *  1. Upsert CashCategory records by name (creates missing with sortOrder=0)
 *  2. Load employees for lastName matching (ё-insensitive)
 *  3. Compute fingerprints + intra-batch dedup
 *  4. createMany with skipDuplicates (idempotent via fingerprint @unique)
 *
 * @param prisma - PrismaClient instance (caller owns lifecycle)
 * @param entries - Parsed entries from parseYulyaSheet / parsePavelSheet
 */
export async function persistCashEntries(
  prisma: PrismaClient,
  entries: ParsedCashEntry[]
): Promise<CashPersistResult> {
  if (entries.length === 0) return { imported: 0, skipped: 0, total: 0 }

  // 1. Cache categories by name (seeded in 23-01; upsert in case of missing)
  const catCache = new Map<string, string>() // name → CashCategory.id
  const names = new Set(entries.map((e) => e.categoryName))
  for (const name of names) {
    const cat = await (prisma as any).cashCategory.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: 0 },
    })
    catCache.set(name, cat.id)
  }

  // 2. Match responsible → Employee by lastName (ё-insensitive). No match → null.
  const employees = await prisma.employee.findMany({ select: { id: true, lastName: true } })
  const empCache = new Map<string, string | null>() // responsibleNameRaw → employeeId | null

  function matchEmployee(raw: string): string | null {
    if (empCache.has(raw)) return empCache.get(raw)!
    const found = employees.find((e) => eqSurname(e.lastName, raw)) ?? null
    const id = found?.id ?? null
    empCache.set(raw, id)
    return id
  }

  // 3. Prepare rows + intra-batch dedup by fingerprint
  const seen = new Set<string>()
  const rows: Array<{
    date: Date
    direction: "INCOME" | "EXPENSE"
    amount: number
    department: string | null
    categoryId: string | null
    purpose: string
    responsibleEmployeeId: string | null
    responsibleNameRaw: string
    source: string
    fingerprint: string
  }> = []

  for (const e of entries) {
    const fingerprint = computeCashFingerprint(e)
    if (seen.has(fingerprint)) continue
    seen.add(fingerprint)
    rows.push({
      date: e.date,
      direction: e.direction,
      amount: e.amount,
      department: e.department,
      categoryId: catCache.get(e.categoryName) ?? null,
      purpose: e.purpose,
      responsibleEmployeeId: matchEmployee(e.responsibleNameRaw),
      responsibleNameRaw: e.responsibleNameRaw,
      source: e.source,
      fingerprint,
    })
  }

  // 4. createMany skipDuplicates (idempotent via fingerprint @unique)
  const res = await (prisma as any).cashEntry.createMany({ data: rows, skipDuplicates: true })
  return { imported: res.count, skipped: entries.length - res.count, total: entries.length }
}
