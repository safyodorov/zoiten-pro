import { describe, it, expect } from "vitest"
import { substituteTemplateVars } from "@/lib/template-vars"

describe("substituteTemplateVars", () => {
  it("подставляет customerName в {имя_покупателя}", () => {
    expect(
      substituteTemplateVars("Привет, {имя_покупателя}!", { customerName: "Иван" })
    ).toBe("Привет, Иван!")
  })

  it("подставляет productName в {название_товара}", () => {
    expect(
      substituteTemplateVars("Спасибо за отзыв о {название_товара}.", {
        productName: "Кружка",
      })
    ).toBe("Спасибо за отзыв о Кружка.")
  })

  it("fallback на «покупатель» когда customerName null", () => {
    expect(
      substituteTemplateVars("Добрый день, {имя_покупателя}!", { customerName: null })
    ).toBe("Добрый день, покупатель!")
  })

  it("fallback на «покупатель» когда customerName пустая строка или whitespace", () => {
    expect(
      substituteTemplateVars("Здравствуйте, {имя_покупателя}.", { customerName: "   " })
    ).toBe("Здравствуйте, покупатель.")
  })

  it("fallback на пустую строку для productName null", () => {
    expect(
      substituteTemplateVars("Отзыв о товаре «{название_товара}» получен.", {
        productName: null,
      })
    ).toBe("Отзыв о товаре «» получен.")
  })

  it("заменяет все вхождения одной переменной (global)", () => {
    expect(
      substituteTemplateVars(
        "{имя_покупателя}, спасибо! До встречи, {имя_покупателя}.",
        { customerName: "Мария" }
      )
    ).toBe("Мария, спасибо! До встречи, Мария.")
  })

  it("не трогает другой текст и не-шаблонные плейсхолдеры", () => {
    expect(
      substituteTemplateVars("Код {xyz} и {имя_покупателя}.", { customerName: "Пётр" })
    ).toBe("Код {xyz} и Пётр.")
  })

  it("обрабатывает оба параметра одновременно", () => {
    expect(
      substituteTemplateVars(
        "{имя_покупателя}, благодарим за покупку «{название_товара}»!",
        { customerName: "Анна", productName: "Миска" }
      )
    ).toBe("Анна, благодарим за покупку «Миска»!")
  })

  it("trim'ит пробелы в customerName/productName", () => {
    expect(
      substituteTemplateVars(
        "{имя_покупателя} купил {название_товара}",
        { customerName: "  Иван  ", productName: "  Книга  " }
      )
    ).toBe("Иван купил Книга")
  })
})
