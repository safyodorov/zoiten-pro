// tests/funnel-zip-extract.test.ts
// Smoke test: extractCsvFromResponse vs реальный WB Analytics ZIP-ответ.
// Файл /tmp/funnel_raw_last.bin — реальный download response WB
// (DETAIL_HISTORY_REPORT за 2026-05-12..2026-05-19 для 226 nmIds).

import { describe, it, expect } from "vitest"
import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"
import { extractCsvFromResponse, parseCsvLine } from "@/lib/wb-funnel-api"

const RAW = resolve(__dirname, "fixtures/funnel-raw-sample.bin")

describe.skipIf(!existsSync(RAW))("extractCsvFromResponse — real WB ZIP", () => {
  it("extracts CSV from WB streaming ZIP (flag bit 3 set, sizes in data descriptor)", () => {
    const bytes = readFileSync(RAW)
    const csv = extractCsvFromResponse(bytes)
    expect(csv).not.toBeNull()
    expect(csv!.startsWith("nmID,dt,")).toBe(true)
    const lines = csv!.split(/\r?\n/).filter(l => l.trim())
    expect(lines.length).toBeGreaterThan(10)
  })

  it("parses funnel rows correctly for nmId 848977827 on 2026-05-18", () => {
    const bytes = readFileSync(RAW)
    const csv = extractCsvFromResponse(bytes)!
    const lines = csv.split(/\r?\n/).filter(l => l.trim())
    const target = lines
      .slice(1) // skip header
      .map(l => parseCsvLine(l))
      .find(cols => cols[0] === "848977827" && cols[1] === "2026-05-18")
    expect(target).toBeDefined()
    if (target) {
      expect(parseInt(target[4], 10)).toBe(128) // ordersCount — ДОЛЖНО совпасть с cabinet!
    }
  })
})
