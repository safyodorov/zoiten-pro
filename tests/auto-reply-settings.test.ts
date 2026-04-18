import { describe, it } from "vitest"

// Wave 0 stub — Plan 10-04 реализует saveAutoReplyConfig + UI страницу + тесты ниже.

describe("auto-reply-settings (Wave 0 stub — Plan 10-04 will implement)", () => {
  it.skip("saveAutoReplyConfig: Zod valid payload → upsert AutoReplyConfig{id:'default'} + updatedById", () => {
    // Реализация: Plan 10-04 задача 2 — server action в app/actions/auto-reply.ts
  })

  it.skip("saveAutoReplyConfig: Zod invalid workdayStart (не HH:MM) → reject", () => {
    // Реализация: Plan 10-04 — regex ^\\d{2}:\\d{2}$ валидация
  })

  it.skip("saveAutoReplyConfig: Zod invalid workDays (не в 1..7 ISO) → reject", () => {
    // Реализация: Plan 10-04 — z.array(z.number().min(1).max(7))
  })

  it.skip("saveAutoReplyConfig: messageText length 1..1000 enforced", () => {
    // Реализация: Plan 10-04
  })

  it.skip("saveAutoReplyConfig: RBAC SUPPORT,MANAGE — VIEWER получает reject", () => {
    // Реализация: Plan 10-04 — requireSection('SUPPORT', 'MANAGE')
  })
})
