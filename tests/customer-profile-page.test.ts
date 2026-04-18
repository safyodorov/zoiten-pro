import { describe, it, expect } from "vitest"
import {
  countTicketsByChannel,
  averageFeedbackRating,
} from "@/lib/customer-aggregations"

// Phase 12 Plan 01 — unit тесты pure helpers для профиля покупателя.
// Plan 12-02 использует эти хелперы в RSC /support/customers/[id].

describe("countTicketsByChannel", () => {
  it("считает тикеты по каналам", () => {
    const result = countTicketsByChannel([
      { channel: "FEEDBACK", rating: 5 },
      { channel: "FEEDBACK", rating: 4 },
      { channel: "QUESTION", rating: null },
      { channel: "CHAT", rating: null },
      { channel: "RETURN", rating: null },
      { channel: "MESSENGER", rating: null },
    ])
    expect(result).toEqual({
      FEEDBACK: 2,
      QUESTION: 1,
      CHAT: 1,
      RETURN: 1,
      MESSENGER: 1,
    })
  })

  it("пустой массив → все нули", () => {
    const result = countTicketsByChannel([])
    expect(result).toEqual({
      FEEDBACK: 0,
      QUESTION: 0,
      CHAT: 0,
      RETURN: 0,
      MESSENGER: 0,
    })
  })

  it("только MESSENGER тикеты", () => {
    const result = countTicketsByChannel([
      { channel: "MESSENGER", rating: null },
      { channel: "MESSENGER", rating: null },
    ])
    expect(result.MESSENGER).toBe(2)
    expect(result.FEEDBACK).toBe(0)
    expect(result.CHAT).toBe(0)
  })
})

describe("averageFeedbackRating", () => {
  it("возвращает средний рейтинг FEEDBACK тикетов", () => {
    const result = averageFeedbackRating([
      { channel: "FEEDBACK", rating: 5 },
      { channel: "FEEDBACK", rating: 4 },
      { channel: "FEEDBACK", rating: 3 },
      { channel: "QUESTION", rating: null },
    ])
    expect(result).toBe(4)
  })

  it("игнорирует FEEDBACK с rating=null", () => {
    const result = averageFeedbackRating([
      { channel: "FEEDBACK", rating: 5 },
      { channel: "FEEDBACK", rating: null },
    ])
    expect(result).toBe(5)
  })

  it("null при отсутствии FEEDBACK", () => {
    const result = averageFeedbackRating([
      { channel: "QUESTION", rating: null },
      { channel: "CHAT", rating: null },
    ])
    expect(result).toBeNull()
  })

  it("null при пустом массиве", () => {
    expect(averageFeedbackRating([])).toBeNull()
  })

  it("округляет до 2 знаков после запятой", () => {
    const result = averageFeedbackRating([
      { channel: "FEEDBACK", rating: 1 },
      { channel: "FEEDBACK", rating: 2 },
      { channel: "FEEDBACK", rating: 2 },
    ])
    expect(result).toBe(1.67)
  })

  it("игнорирует рейтинг у не-FEEDBACK тикетов", () => {
    const result = averageFeedbackRating([
      { channel: "FEEDBACK", rating: 5 },
      { channel: "QUESTION", rating: 1 }, // must be ignored
    ])
    expect(result).toBe(5)
  })
})

// ── Phase 12 Plan 02 — дополнительные сценарии профиля покупателя ────────────

describe("countTicketsByChannel — Plan 12-02 сценарии", () => {
  it("Customer со всеми 5 каналами — корректная раскладка", () => {
    const tickets = [
      { channel: "FEEDBACK" as const, rating: 5 },
      { channel: "FEEDBACK" as const, rating: 4 },
      { channel: "QUESTION" as const, rating: null },
      { channel: "QUESTION" as const, rating: null },
      { channel: "QUESTION" as const, rating: null },
      { channel: "CHAT" as const, rating: null },
      { channel: "RETURN" as const, rating: null },
      { channel: "RETURN" as const, rating: null },
      { channel: "MESSENGER" as const, rating: null },
    ]
    const result = countTicketsByChannel(tickets)
    expect(result).toEqual({
      FEEDBACK: 2,
      QUESTION: 3,
      CHAT: 1,
      RETURN: 2,
      MESSENGER: 1,
    })
  })

  it("Customer только с CHAT (типичный auto-linked случай)", () => {
    const tickets = [
      { channel: "CHAT" as const, rating: null },
      { channel: "CHAT" as const, rating: null },
      { channel: "CHAT" as const, rating: null },
    ]
    const result = countTicketsByChannel(tickets)
    expect(result.CHAT).toBe(3)
    expect(result.FEEDBACK).toBe(0)
    expect(result.QUESTION).toBe(0)
    expect(result.RETURN).toBe(0)
    expect(result.MESSENGER).toBe(0)
  })

  it("Customer только с MESSENGER (ручные тикеты из Telegram/WhatsApp)", () => {
    const tickets = [
      { channel: "MESSENGER" as const, rating: null },
      { channel: "MESSENGER" as const, rating: null },
      { channel: "MESSENGER" as const, rating: null },
      { channel: "MESSENGER" as const, rating: null },
    ]
    const result = countTicketsByChannel(tickets)
    expect(result.MESSENGER).toBe(4)
    expect(result.CHAT).toBe(0)
  })
})

describe("averageFeedbackRating — Plan 12-02 сценарии", () => {
  it("Customer с отличным рейтингом 5.0", () => {
    const tickets = [
      { channel: "FEEDBACK" as const, rating: 5 },
      { channel: "FEEDBACK" as const, rating: 5 },
      { channel: "FEEDBACK" as const, rating: 5 },
    ]
    expect(averageFeedbackRating(tickets)).toBe(5)
  })

  it("Customer с плохим рейтингом (mix каналов не влияет)", () => {
    const tickets = [
      { channel: "FEEDBACK" as const, rating: 1 },
      { channel: "FEEDBACK" as const, rating: 2 },
      { channel: "QUESTION" as const, rating: null }, // игнорируется
      { channel: "RETURN" as const, rating: null }, // игнорируется
    ]
    expect(averageFeedbackRating(tickets)).toBe(1.5)
  })

  it("Customer без FEEDBACK (только CHAT/MESSENGER) — null", () => {
    const tickets = [
      { channel: "CHAT" as const, rating: null },
      { channel: "MESSENGER" as const, rating: null },
      { channel: "RETURN" as const, rating: null },
    ]
    expect(averageFeedbackRating(tickets)).toBeNull()
  })

  it("Customer со смешанными рейтингами — среднее до 2 знаков", () => {
    const tickets = [
      { channel: "FEEDBACK" as const, rating: 5 },
      { channel: "FEEDBACK" as const, rating: 4 },
      { channel: "FEEDBACK" as const, rating: 3 },
      { channel: "FEEDBACK" as const, rating: 2 },
      { channel: "FEEDBACK" as const, rating: 1 },
    ]
    // (5+4+3+2+1)/5 = 3
    expect(averageFeedbackRating(tickets)).toBe(3)
  })
})
