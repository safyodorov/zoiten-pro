import { describe, it } from "vitest"

// Wave 0 stub — полная реализация в Plan 09-02 (syncReturns).
// Структура описывает контракт sync, который должен быть покрыт
// integration-тестами (mock fetch + real Prisma client).
describe("support-sync-returns (Wave 0 stub — Plan 09-02 will implement)", () => {
  it.skip("syncReturns() создаёт SupportTicket с channel=RETURN, returnState=PENDING", () => {
    // Реализация: Plan 09-02 задача 1 — integration test с mock fetch + real Prisma
  })

  it.skip("syncReturns() идемпотентен по @@unique([channel, wbExternalId])", () => {
    // Реализация: Plan 09-02 — двойной вызов не создаёт дубликаты
  })

  it.skip("syncReturns() создаёт SupportMedia с https: префиксом для photos и video_paths", () => {
    // Реализация: Plan 09-02 — //photos.wbstatic.net/... → https://photos.wbstatic.net/...
  })

  it.skip("syncReturns() вызывает обе страницы is_archive=false и is_archive=true", () => {
    // Реализация: Plan 09-02
  })

  it.skip("syncReturns() НЕ перезаписывает returnState при update (защита локальных решений)", () => {
    // Реализация: Plan 09-02 — update только wbClaimStatus/wbActions/previewText
  })
})
