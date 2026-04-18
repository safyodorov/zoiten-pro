import { describe, it } from "vitest"

// Wave 0 stub — Plan 10-03 реализует ChatReplyPanel + sendChatMessageAction + тесты ниже.

describe("chat-reply-panel (Wave 0 stub — Plan 10-03 will implement)", () => {
  it.skip("ChatReplyPanel: textarea maxLength=1000, счётчик символов", () => {
    // Реализация: Plan 10-03 задача 1 — components/support/ChatReplyPanel.tsx
  })

  it.skip("ChatReplyPanel: file input accept='image/jpeg,image/png,application/pdf' multiple", () => {
    // Реализация: Plan 10-03
  })

  it.skip("ChatReplyPanel: клиентская валидация — файл > 5 МБ отклоняется с toast", () => {
    // Реализация: Plan 10-03 — sync валидация до отправки
  })

  it.skip("ChatReplyPanel: клиентская валидация — сумма файлов > 30 МБ отклоняется с toast", () => {
    // Реализация: Plan 10-03
  })

  it.skip("sendChatMessageAction: требует requireSection('SUPPORT','MANAGE'), VIEWER получает reject", () => {
    // Реализация: Plan 10-03 задача 2 — server action в app/actions/support.ts
  })

  it.skip("sendChatMessageAction: создаёт OUTBOUND SupportMessage + SupportMedia per file + revalidatePath", () => {
    // Реализация: Plan 10-03
  })

  it.skip("sendChatMessageAction: reject если ticket.channel !== 'CHAT' или chatReplySign == null", () => {
    // Реализация: Plan 10-03 — защита от отправки в неверный канал
  })
})
