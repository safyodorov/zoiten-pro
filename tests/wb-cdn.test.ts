import { describe, it, expect } from "vitest"
import { toWbCdnThumb } from "@/lib/wb-cdn"

describe("toWbCdnThumb", () => {
  it("заменяет big/ на tm/", () => {
    expect(
      toWbCdnThumb(
        "https://basket-12.wb.ru/vol1807/part180712/180712345/images/big/1.webp"
      )
    ).toBe(
      "https://basket-12.wb.ru/vol1807/part180712/180712345/images/tm/1.webp"
    )
  })

  it("заменяет c246x328/ на tm/", () => {
    expect(
      toWbCdnThumb(
        "https://basket-01.wb.ru/vol100/part10000/100001/images/c246x328/2.webp"
      )
    ).toBe(
      "https://basket-01.wb.ru/vol100/part10000/100001/images/tm/2.webp"
    )
  })

  it("идемпотентен для tm/", () => {
    const url =
      "https://basket-12.wb.ru/vol1807/part180712/180712345/images/tm/1.webp"
    expect(toWbCdnThumb(url)).toBe(url)
  })

  it("возвращает null для null/undefined/пусто", () => {
    expect(toWbCdnThumb(null)).toBeNull()
    expect(toWbCdnThumb(undefined)).toBeNull()
    expect(toWbCdnThumb("")).toBeNull()
  })

  it("не трогает не-WB URL", () => {
    const url = "https://example.com/images/big/1.jpg"
    expect(toWbCdnThumb(url)).toBe(url)
  })
})
