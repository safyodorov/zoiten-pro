// tests/cash-import.test.ts
// Phase 23 (23-03): Golden tests for lib/cash-import/ pure functions.
// No DB, no next-auth — all tests are vitest-safe.

import { describe, it, expect } from "vitest"
import { categorize, FALLBACK_CATEGORY } from "@/lib/cash-import/categorize"
import { normalizeResponsibleSurname, normalizeDepartment } from "@/lib/cash-import/normalize"
import { computeCashFingerprint } from "@/lib/cash-import/fingerprint"

describe("categorize (first-match по rule-list, Прочее fallback)", () => {
  it("грузчики → Грузчики/разнорабочие", () => expect(categorize("оплата грузчики 5 чел")).toBe("Грузчики/разнорабочие"))
  it("заправка картриджей → Канцелярия (НЕ Такси)", () => expect(categorize("заправка картриджей")).toBe("Канцелярия/оргтехника"))
  it("выкуп аэрогриль → Выкупы товаров", () => expect(categorize("выкуп аэрогриль")).toBe("Выкупы товаров"))
  // BLOCKER: «аванс на склад» НЕ должно затеняться ключом "аванс" в «Зарплата/авансы»
  it("аванс на склад → Пополнение кассы (НЕ Зарплата)", () => expect(categorize("аванс на склад")).toBe("Пополнение кассы"))
  it("чистый аванс → Зарплата/авансы", () => expect(categorize("аванс")).toBe("Зарплата/авансы"))
  it("юля фонд → Пополнение кассы", () => expect(categorize("юля фонд")).toBe("Пополнение кассы"))
  it("такси → Такси/транспорт", () => expect(categorize("такси до склада")).toBe("Такси/транспорт"))
  it("чат gpt → Нейросети", () => expect(categorize("оплата чата gpt")).toBe("Нейросети"))
  it("подписка антропик → Нейросети", () => expect(categorize("подписка антропик")).toBe("Нейросети"))
  it("perplexity → Нейросети", () => expect(categorize("подписка perplexity от 14.01")).toBe("Нейросети"))
  it("клод код → Нейросети", () => expect(categorize("подписка клод код, фёдоров")).toBe("Нейросети"))
  it("'корзина для мусора' НЕ Нейросети (нет ложного 'сора')", () => expect(categorize("корзина для мусора")).toBe(FALLBACK_CATEGORY))
  it("'имидж' НЕ Нейросети (нет ложного 'мидж')", () => expect(categorize("услуги по имиджу")).not.toBe("Нейросети"))
  it("неизвестное → Прочее", () => expect(categorize("zzz непонятное")).toBe(FALLBACK_CATEGORY))
  it("вода для кулера → Вода", () => expect(categorize("вода для кулера")).toBe("Вода"))
})

describe("normalizeResponsibleSurname", () => {
  it("strip один инициал", () => expect(normalizeResponsibleSurname("Иванова Н.")).toBe("Иванова"))
  it("strip два инициала", () => expect(normalizeResponsibleSurname("Иванова Н. В.")).toBe("Иванова"))
  it("пусто → Иванова", () => expect(normalizeResponsibleSurname("")).toBe("Иванова"))
  it("опечатка Федоров → Фёдоров", () => expect(normalizeResponsibleSurname("Федоров")).toBe("Фёдоров"))
  // WARNING 2: ё в фамилии вне таблицы фиксов СОХРАНЯЕТСЯ
  it("Королёва сохраняет ё", () => expect(normalizeResponsibleSurname("Королёва")).toBe("Королёва"))
  it("null → Иванова", () => expect(normalizeResponsibleSurname(null)).toBe("Иванова"))
})

describe("normalizeDepartment", () => {
  it("пусто → null", () => expect(normalizeDepartment("")).toBe(null))
  it("офис+ склад → офис+склад", () => expect(normalizeDepartment("офис+ склад")).toBe("офис+склад"))
  it("null → null", () => expect(normalizeDepartment(null)).toBe(null))
  it("Офис → офис (lowercase trim)", () => expect(normalizeDepartment("  Офис  ")).toBe("офис"))
})

describe("computeCashFingerprint", () => {
  const base = {
    sheet: "yulya" as const,
    date: new Date("2025-03-01"),
    direction: "EXPENSE" as const,
    amount: 5000,
    department: null,
    purpose: "грузчики",
    responsibleNameRaw: "Иванова",
    categoryName: "Грузчики/разнорабочие",
    source: "budget-yulya" as const,
  }
  it("детерминирован", () => expect(computeCashFingerprint(base)).toBe(computeCashFingerprint(base)))
  it("разный amount → разный hash", () =>
    expect(computeCashFingerprint(base)).not.toBe(computeCashFingerprint({ ...base, amount: 6000 })))
  it("разный purpose → разный hash", () =>
    expect(computeCashFingerprint(base)).not.toBe(computeCashFingerprint({ ...base, purpose: "другое" })))
  it("SHA-256 длина 64 символа", () => expect(computeCashFingerprint(base)).toHaveLength(64))
})
