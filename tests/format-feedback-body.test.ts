import { describe, it, expect } from "vitest"
import { formatFeedbackBody } from "@/lib/wb-support-api"

describe("formatFeedbackBody", () => {
  it("returns empty string when all parts empty", () => {
    expect(formatFeedbackBody({ text: "", pros: "", cons: "" })).toBe("")
    expect(formatFeedbackBody({})).toBe("")
    expect(formatFeedbackBody({ text: "   ", pros: "  ", cons: "\n\t" })).toBe("")
  })

  it("returns only text when pros/cons absent", () => {
    expect(formatFeedbackBody({ text: "Супер товар" })).toBe("Супер товар")
    expect(formatFeedbackBody({ text: "Супер товар", pros: "", cons: "" })).toBe(
      "Супер товар"
    )
  })

  it("formats only pros block", () => {
    expect(formatFeedbackBody({ pros: "Удобно" })).toBe("Достоинства: Удобно")
    expect(formatFeedbackBody({ text: "", pros: "Удобно", cons: "" })).toBe(
      "Достоинства: Удобно"
    )
  })

  it("formats only cons block", () => {
    expect(formatFeedbackBody({ cons: "Маломерит" })).toBe("Недостатки: Маломерит")
    expect(formatFeedbackBody({ text: "", pros: "", cons: "Маломерит" })).toBe(
      "Недостатки: Маломерит"
    )
  })

  it("combines all three parts with double newline separators", () => {
    expect(
      formatFeedbackBody({
        text: "Отличный товар",
        pros: "Удобно носить",
        cons: "Маломерит",
      })
    ).toBe(
      "Отличный товар\n\nДостоинства: Удобно носить\n\nНедостатки: Маломерит"
    )
  })

  it("skips leading empty text when pros/cons present", () => {
    expect(
      formatFeedbackBody({ text: "", pros: "Удобно", cons: "Маломерит" })
    ).toBe("Достоинства: Удобно\n\nНедостатки: Маломерит")
    expect(
      formatFeedbackBody({ text: "   ", pros: "Удобно", cons: "Маломерит" })
    ).toBe("Достоинства: Удобно\n\nНедостатки: Маломерит")
  })

  it("trims whitespace in each part", () => {
    expect(
      formatFeedbackBody({
        text: "  Отличный товар  ",
        pros: "\nУдобно\n",
        cons: " Маломерит ",
      })
    ).toBe(
      "Отличный товар\n\nДостоинства: Удобно\n\nНедостатки: Маломерит"
    )
  })

  it("treats null/undefined as empty", () => {
    expect(formatFeedbackBody({ text: null, pros: null, cons: null })).toBe("")
    expect(
      formatFeedbackBody({ text: "txt", pros: null, cons: undefined })
    ).toBe("txt")
    expect(
      formatFeedbackBody({ text: null, pros: "Удобно", cons: undefined })
    ).toBe("Достоинства: Удобно")
    expect(
      formatFeedbackBody({ text: undefined, pros: null, cons: "Маломерит" })
    ).toBe("Недостатки: Маломерит")
  })
})
