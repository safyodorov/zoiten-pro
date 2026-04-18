import { describe, it } from "vitest"

// Wave 0 stub — Plan 10-02 реализует syncChats() + тесты ниже.
// На этом этапе тесты SKIPPED (NyQuist compliance — ссылки на downstream план).

describe("support-sync-chats (Wave 0 stub — Plan 10-02 will implement)", () => {
  it.skip("syncChats() Phase B: обновляет chatReplySign + customerNameSnapshot + previewText для всех chats", () => {
    // Реализация: Plan 10-02 задача 1 — upsert по @@unique([channel, wbExternalId])
  })

  it.skip("syncChats() Phase A: создаёт SupportMessage INBOUND по wbEventId unique — идемпотентно", () => {
    // Реализация: Plan 10-02 — повторный sync не создаёт дубликаты (ON CONFLICT на wbEventId)
  })

  it.skip("syncChats(): isNewChat=true создаёт тикет если не найден по channel=CHAT + wbExternalId=chatID", () => {
    // Реализация: Plan 10-02
  })

  it.skip("syncChats(): sender=client → direction=INBOUND; sender=seller → direction=OUTBOUND", () => {
    // Реализация: Plan 10-02
  })

  it.skip("syncChats(): attachments.images/files → SupportMedia IMAGE/DOCUMENT с expiresAt = createdAt + 1 год", () => {
    // Реализация: Plan 10-02 — DOCUMENT из Phase 10 MediaType
  })

  it.skip("syncChats(): обновляет AppSetting.support.chat.lastEventNext после каждого tick", () => {
    // Реализация: Plan 10-02 — cursor persistence между cron-вызовами
  })
})
