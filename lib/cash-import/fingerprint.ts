// lib/cash-import/fingerprint.ts
// Phase 23 (23-03): SHA-256 fingerprint for dedup-safe import.
// Pure — no next-auth, next/*, or Prisma singleton imports.

import { createHash } from "crypto"
import { normalizePurpose } from "../bank-import/normalize"
import type { ParsedCashEntry } from "./types"

/**
 * Computes a deterministic SHA-256 fingerprint for a ParsedCashEntry.
 * Fields: sheet | date(YYYY-MM-DD) | direction | amount(2dp) | normalizePurpose(purpose) | responsibleNameRaw
 * Identical input → identical hash. Enables idempotent re-import via fingerprint @unique.
 */
export function computeCashFingerprint(e: ParsedCashEntry): string {
  const fields = [
    e.sheet,
    e.date.toISOString().slice(0, 10),
    e.direction,
    e.amount.toFixed(2),
    normalizePurpose(e.purpose),
    e.responsibleNameRaw,
  ]
  return createHash("sha256").update(fields.join("|")).digest("hex")
}
