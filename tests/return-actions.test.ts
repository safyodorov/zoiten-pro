import { describe, it } from "vitest"

// Wave 0 stub — полная реализация в Plan 09-04 (server actions).
// Структура описывает контракт 3 server actions (approveReturn /
// rejectReturn / reconsiderReturn), включая state machine, RBAC и
// транзакционность ReturnDecision.
describe("return-actions (Wave 0 stub — Plan 09-04 will implement)", () => {
  it.skip("approveReturn: happy path PENDING → APPROVED + ReturnDecision создан", () => {
    // Реализация: Plan 09-04 задача 2 — mock patchClaim + Prisma
  })

  it.skip("approveReturn: reject если ticket.channel !== RETURN", () => {
    // Реализация: Plan 09-04
  })

  it.skip("approveReturn: reject если returnState === APPROVED (финал)", () => {
    // Реализация: Plan 09-04
  })

  it.skip("rejectReturn: happy path PENDING → REJECTED + ReturnDecision с reason", () => {
    // Реализация: Plan 09-04
  })

  it.skip("rejectReturn: validation reason < 10 или > 1000 символов", () => {
    // Реализация: Plan 09-04 — Zod на сервере
  })

  it.skip("reconsiderReturn: happy path REJECTED → APPROVED + Decision{reconsidered:true}", () => {
    // Реализация: Plan 09-04
  })

  it.skip("reconsiderReturn: reject если returnState === PENDING", () => {
    // Реализация: Plan 09-04
  })

  it.skip("Все 3 action требуют requireSection(\"SUPPORT\", \"MANAGE\") — VIEWER получает reject", () => {
    // Реализация: Plan 09-04 — RBAC guard test
  })

  it.skip("Все 3 action НЕ создают ReturnDecision если WB API вернул ошибку", () => {
    // Реализация: Plan 09-04 — order: patchClaim первым, Decision только после успеха
  })

  it.skip("Все 3 action вызывают revalidatePath('/support/returns') и revalidatePath('/support/[ticketId]')", () => {
    // Реализация: Plan 09-04
  })
})
