// lib/bank-import/fingerprint.ts
// Phase 22 (22-03): SHA-256 fingerprint for deduplication of bank transactions.
// NO imports of next-auth, next/*, or Prisma — vitest must run this without env.

import { createHash } from "crypto"
import { normalizePurpose } from "./normalize"
import type { ParsedTransaction } from "./types"

/**
 * Returns the ordered string fields used to compute the fingerprint.
 * Format: accountNumber | date(YYYY-MM-DD) | direction | amount(2dp) | docNumber | counterpartyInn | normalize(purpose)
 */
export function buildFingerprintFields(tx: ParsedTransaction): string[] {
  return [
    tx.accountNumber,
    tx.date.toISOString().slice(0, 10), // YYYY-MM-DD
    tx.direction,
    tx.amount.toFixed(2),
    tx.docNumber ?? "",
    tx.counterpartyInn ?? "",
    normalizePurpose(tx.purpose),
  ]
}

/**
 * Computes a SHA-256 hex fingerprint for a ParsedTransaction.
 * Deterministic: same logical transaction always → same hash.
 * Whitespace-insensitive on purpose field (normalizePurpose applied).
 */
export function computeFingerprint(tx: ParsedTransaction): string {
  return createHash("sha256")
    .update(buildFingerprintFields(tx).join("|"))
    .digest("hex")
}
