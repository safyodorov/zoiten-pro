import { describe, it } from "vitest"

describe("response-templates actions (Wave 0 stub — Plan 11-02 will implement)", () => {
  it.skip("createTemplate валидирует name/text/channel + Zod отклоняет RETURN/MESSENGER", () => {
    // Реализация: Plan 11-02 — unit тесты с Prisma mock
  })
  it.skip("updateTemplate сохраняет updatedById/updatedAt", () => {
    // Реализация: Plan 11-02
  })
  it.skip("deleteTemplate — hard delete (чтобы @@unique([name, channel]) работал после пересоздания)", () => {
    // Реализация: Plan 11-02
  })
  it.skip("toggleTemplateActive инвертирует isActive", () => {
    // Реализация: Plan 11-02
  })
  it.skip("exportTemplatesJson возвращает валидный JSON со всеми активными шаблонами", () => {
    // Реализация: Plan 11-02
  })
  it.skip("importTemplatesJson upsert по name+channel, возвращает {added, updated, errors}", () => {
    // Реализация: Plan 11-02
  })
  it.skip("importTemplatesJson валидирует JSON schema и собирает errors[] для невалидных записей", () => {
    // Реализация: Plan 11-02
  })
  it.skip("createTemplate отклоняет duplicate name+channel через Prisma unique violation", () => {
    // Реализация: Plan 11-02
  })
})
