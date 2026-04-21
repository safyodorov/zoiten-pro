import { describe, it, expect } from "vitest"
import { normalizeSku } from "@/lib/normalize-sku"

describe("normalizeSku", () => {
  // ── Канонические случаи (GREEN) ──────────────────────────────────

  it("уже канонический формат → без изменений", () => {
    expect(normalizeSku("УКТ-000001")).toBe("УКТ-000001")
  })

  it("короткий номер с префиксом → padStart до 6 цифр", () => {
    expect(normalizeSku("УКТ-1")).toBe("УКТ-000001")
  })

  it("только цифры без префикса → добавляет УКТ-", () => {
    expect(normalizeSku("1")).toBe("УКТ-000001")
  })

  it("lowercase + пробелы → trim + toUpperCase", () => {
    expect(normalizeSku(" укт-000001 ")).toBe("УКТ-000001")
  })

  it("em-dash (U+2014) вместо дефиса → заменяется", () => {
    expect(normalizeSku("УКТ\u2014000001")).toBe("УКТ-000001")
  })

  it("6-значный номер без ведущих нулей → padStart", () => {
    expect(normalizeSku("123")).toBe("УКТ-000123")
  })

  it("префикс без дефиса → нормализуется", () => {
    expect(normalizeSku("УКТ000001")).toBe("УКТ-000001")
  })

  it("максимальный номер (6 цифр) → без изменений", () => {
    expect(normalizeSku("УКТ-999999")).toBe("УКТ-999999")
  })

  // ── Невалидные случаи (throws Error) ────────────────────────────

  it("произвольная строка 'abc' → throws Error", () => {
    expect(() => normalizeSku("abc")).toThrow("Невалидный УКТ")
  })

  it("УКТ- без цифр → throws Error", () => {
    expect(() => normalizeSku("УКТ-")).toThrow("Невалидный УКТ")
  })

  it("пустая строка → throws Error", () => {
    expect(() => normalizeSku("")).toThrow("Невалидный УКТ")
  })
})
