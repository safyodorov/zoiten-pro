// tests/wb-funnel-csv.test.ts
// Quick 260519-funnel: unit-тесты на CSV-парсер строки funnel report
// (с поддержкой "..." quoting для Russian decimal commas).

import { describe, it, expect } from "vitest"
import { parseCsvLine } from "@/lib/wb-funnel-api"

describe("parseCsvLine", () => {
  it("splits simple unquoted CSV", () => {
    const cols = parseCsvLine("1,2,3,abc,def")
    expect(cols).toEqual(["1", "2", "3", "abc", "def"])
  })

  it("preserves comma inside quoted field (Russian decimal)", () => {
    const cols = parseCsvLine(`848977827,2026-05-18,1774,255,128,623360,0,0,0,0,"14,00","50,00","0,00"`)
    expect(cols).toHaveLength(13)
    expect(cols[0]).toBe("848977827")
    expect(cols[10]).toBe("14,00")
    expect(cols[11]).toBe("50,00")
    expect(cols[12]).toBe("0,00")
  })

  it("handles escaped quotes (\"\" inside field)", () => {
    const cols = parseCsvLine(`a,"b ""quoted"" c",d`)
    expect(cols).toEqual(["a", 'b "quoted" c', "d"])
  })

  it("returns empty string for trailing comma", () => {
    const cols = parseCsvLine("a,b,")
    expect(cols).toEqual(["a", "b", ""])
  })

  it("handles real WB funnel row from sheet (row 121)", () => {
    const line = `848977827,2026-05-18,1774,255,128,623360,0,0,0,0,"14,00","50,00","0,00",18.05.2026,"14,37429538","50,19607843"`
    const cols = parseCsvLine(line)
    expect(cols[0]).toBe("848977827")
    expect(cols[4]).toBe("128") // ordersCount
    expect(cols[5]).toBe("623360") // ordersSumRub
    expect(cols[10]).toBe("14,00") // addToCartConversion (display)
    expect(cols[14]).toBe("14,37429538") // unrounded
  })
})
