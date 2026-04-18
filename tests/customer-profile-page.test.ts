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
