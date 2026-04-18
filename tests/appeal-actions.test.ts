import { describe, it } from "vitest"

describe("appeal actions (Wave 0 stub — Plan 11-04 will implement)", () => {
  it.skip("createAppeal: валидная reason+text → AppealRecord(PENDING) + ticket.status=APPEALED + appealedAt=now", () => {
    // Реализация: Plan 11-04 — $transaction mock
  })
  it.skip("createAppeal отклоняет reason не из APPEAL_REASONS", () => {
    // Реализация: Plan 11-04
  })
  it.skip("createAppeal отклоняет text < 10 или > 1000 символов", () => {
    // Реализация: Plan 11-04
  })
  it.skip("createAppeal отклоняет дубликат — если AppealRecord уже существует для ticketId", () => {
    // Реализация: Plan 11-04
  })
  it.skip("createAppeal отклоняет не-FEEDBACK тикеты", () => {
    // Реализация: Plan 11-04
  })
  it.skip("updateAppealStatus: PENDING→APPROVED обновляет status + appealResolvedAt + resolvedById", () => {
    // Реализация: Plan 11-04 — $transaction mock
  })
  it.skip("updateAppealStatus: RBAC — VIEWER получает отказ", () => {
    // Реализация: Plan 11-04
  })
})
