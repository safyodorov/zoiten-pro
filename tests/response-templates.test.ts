import { describe, it, expect, vi, beforeEach } from "vitest"

// Phase 11 Plan 02 — integration тесты 6 server actions локальных шаблонов.
// Моки: prisma singleton, requireSection (RBAC guard), auth (getSessionUserId).
// resetAllMocks очищает .mockResolvedValueOnce queue между тестами.

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))

vi.mock("@/lib/rbac", () => ({
  requireSection: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/auth", () => ({
  auth: vi.fn().mockResolvedValue({ user: { id: "user-1" } }),
}))

const prismaMock = {
  responseTemplate: {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    upsert: vi.fn(),
  },
}
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }))

beforeEach(async () => {
  vi.resetAllMocks()
  // Восстанавливаем дефолты после reset (иначе requireSection возвращает undefined неявно)
  const rbac = await import("@/lib/rbac")
  const authMod = await import("@/lib/auth")
  ;(rbac.requireSection as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
    undefined
  )
  ;(authMod.auth as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    user: { id: "user-1" },
  })
})

// ── createTemplate ─────────────────────────────────────────────

describe("createTemplate", () => {
  it("создаёт шаблон с валидными данными и прокидывает createdById/updatedById", async () => {
    const { createTemplate } = await import("@/app/actions/templates")
    prismaMock.responseTemplate.create.mockResolvedValueOnce({ id: "t1" })

    const res = await createTemplate({
      name: "Спасибо 5 звёзд",
      text: "Привет, {имя_покупателя}!",
      channel: "FEEDBACK",
      situationTag: "Положительный",
      nmId: null,
      isActive: true,
    })

    expect(res).toEqual({ ok: true, id: "t1" })
    expect(prismaMock.responseTemplate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          name: "Спасибо 5 звёзд",
          channel: "FEEDBACK",
          createdById: "user-1",
          updatedById: "user-1",
        }),
      })
    )
  })

  it("отклоняет channel=RETURN с понятным сообщением", async () => {
    const { createTemplate } = await import("@/app/actions/templates")

    const res = await createTemplate({
      name: "Тест",
      text: "тест",
      channel: "RETURN" as never,
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("Канал")
    expect(prismaMock.responseTemplate.create).not.toHaveBeenCalled()
  })

  it("отклоняет короткое name (< 2 символов)", async () => {
    const { createTemplate } = await import("@/app/actions/templates")

    const res = await createTemplate({
      name: "A",
      text: "валидный текст",
      channel: "FEEDBACK",
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("Имя")
  })

  it("обрабатывает Prisma P2002 — duplicate name+channel", async () => {
    const { createTemplate } = await import("@/app/actions/templates")
    const { Prisma } = await import("@prisma/client")
    prismaMock.responseTemplate.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("unique violation", {
        code: "P2002",
        clientVersion: "x",
      })
    )

    const res = await createTemplate({
      name: "Дубликат",
      text: "текст",
      channel: "FEEDBACK",
    })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("уже существует")
  })

  it("бросает FORBIDDEN если RBAC не пропустил (VIEWER без MANAGE)", async () => {
    const { createTemplate } = await import("@/app/actions/templates")
    const rbac = await import("@/lib/rbac")
    ;(
      rbac.requireSection as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("FORBIDDEN"))

    const res = await createTemplate({
      name: "Тест",
      text: "текст",
      channel: "FEEDBACK",
    })

    expect(res).toEqual({ ok: false, error: "FORBIDDEN" })
    expect(prismaMock.responseTemplate.create).not.toHaveBeenCalled()
  })
})

// ── updateTemplate ─────────────────────────────────────────────

describe("updateTemplate", () => {
  it("обновляет шаблон и прокидывает updatedById", async () => {
    const { updateTemplate } = await import("@/app/actions/templates")
    prismaMock.responseTemplate.update.mockResolvedValueOnce({ id: "t1" })

    const res = await updateTemplate("t1", {
      name: "Обновлено",
      text: "новый текст",
      channel: "CHAT",
    })

    expect(res).toEqual({ ok: true })
    expect(prismaMock.responseTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: expect.objectContaining({
          name: "Обновлено",
          channel: "CHAT",
          updatedById: "user-1",
        }),
      })
    )
  })

  it("возвращает «Шаблон не найден» на P2025", async () => {
    const { updateTemplate } = await import("@/app/actions/templates")
    const { Prisma } = await import("@prisma/client")
    prismaMock.responseTemplate.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("not found", {
        code: "P2025",
        clientVersion: "x",
      })
    )

    const res = await updateTemplate("nope", {
      name: "Test",
      text: "текст",
      channel: "FEEDBACK",
    })

    expect(res).toEqual({ ok: false, error: "Шаблон не найден" })
  })
})

// ── deleteTemplate ─────────────────────────────────────────────

describe("deleteTemplate", () => {
  it("hard delete через prisma.delete", async () => {
    const { deleteTemplate } = await import("@/app/actions/templates")
    prismaMock.responseTemplate.delete.mockResolvedValueOnce({ id: "t1" })

    const res = await deleteTemplate("t1")

    expect(res).toEqual({ ok: true })
    expect(prismaMock.responseTemplate.delete).toHaveBeenCalledWith({
      where: { id: "t1" },
    })
  })

  it("возвращает ошибку при P2025", async () => {
    const { deleteTemplate } = await import("@/app/actions/templates")
    const { Prisma } = await import("@prisma/client")
    prismaMock.responseTemplate.delete.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("not found", {
        code: "P2025",
        clientVersion: "x",
      })
    )

    const res = await deleteTemplate("nope")

    expect(res).toEqual({ ok: false, error: "Шаблон не найден" })
  })
})

// ── toggleTemplateActive ───────────────────────────────────────

describe("toggleTemplateActive", () => {
  it("инвертирует isActive true → false", async () => {
    const { toggleTemplateActive } = await import("@/app/actions/templates")
    prismaMock.responseTemplate.findUnique.mockResolvedValueOnce({
      isActive: true,
    })
    prismaMock.responseTemplate.update.mockResolvedValueOnce({ isActive: false })

    const res = await toggleTemplateActive("t1")

    expect(res).toEqual({ ok: true, isActive: false })
    expect(prismaMock.responseTemplate.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "t1" },
        data: { isActive: false },
      })
    )
  })

  it("возвращает «Шаблон не найден» если findUnique вернул null", async () => {
    const { toggleTemplateActive } = await import("@/app/actions/templates")
    prismaMock.responseTemplate.findUnique.mockResolvedValueOnce(null)

    const res = await toggleTemplateActive("nope")

    expect(res).toEqual({ ok: false, error: "Шаблон не найден" })
    expect(prismaMock.responseTemplate.update).not.toHaveBeenCalled()
  })
})

// ── exportTemplatesJson ────────────────────────────────────────

describe("exportTemplatesJson", () => {
  it("возвращает JSON со структурой {version, exportedAt, templates}", async () => {
    const { exportTemplatesJson } = await import("@/app/actions/templates")
    prismaMock.responseTemplate.findMany.mockResolvedValueOnce([
      {
        name: "A",
        text: "tA",
        channel: "FEEDBACK",
        situationTag: null,
        nmId: null,
        isActive: true,
      },
    ])

    const res = await exportTemplatesJson()

    expect(res.ok).toBe(true)
    if (res.ok) {
      const parsed = JSON.parse(res.json)
      expect(parsed.version).toBe(1)
      expect(typeof parsed.exportedAt).toBe("string")
      expect(parsed.templates).toHaveLength(1)
      expect(parsed.templates[0]).not.toHaveProperty("id")
      expect(parsed.templates[0]).not.toHaveProperty("createdById")
      expect(parsed.templates[0]).toMatchObject({
        name: "A",
        channel: "FEEDBACK",
      })
    }
  })
})

// ── importTemplatesJson ────────────────────────────────────────

describe("importTemplatesJson", () => {
  it("upsert valid запись, считает added=1 при createdAt===updatedAt", async () => {
    const { importTemplatesJson } = await import("@/app/actions/templates")
    const now = new Date()
    prismaMock.responseTemplate.upsert.mockResolvedValueOnce({
      createdAt: now,
      updatedAt: now,
    })
    const json = JSON.stringify({
      version: 1,
      templates: [{ name: "X", text: "t", channel: "FEEDBACK" }],
    })

    const res = await importTemplatesJson(json)

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.added).toBe(1)
      expect(res.updated).toBe(0)
      expect(res.errors).toEqual([])
    }
    expect(prismaMock.responseTemplate.upsert).toHaveBeenCalledTimes(1)
  })

  it("считает updated=1 когда createdAt < updatedAt", async () => {
    const { importTemplatesJson } = await import("@/app/actions/templates")
    const createdAt = new Date("2026-01-01")
    const updatedAt = new Date("2026-04-18")
    prismaMock.responseTemplate.upsert.mockResolvedValueOnce({
      createdAt,
      updatedAt,
    })
    const json = JSON.stringify({
      version: 1,
      templates: [{ name: "Y", text: "t", channel: "CHAT" }],
    })

    const res = await importTemplatesJson(json)

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.added).toBe(0)
      expect(res.updated).toBe(1)
    }
  })

  it("собирает errors[] для невалидных записей, не падая на первой", async () => {
    const { importTemplatesJson } = await import("@/app/actions/templates")
    const now = new Date()
    prismaMock.responseTemplate.upsert.mockResolvedValueOnce({
      createdAt: now,
      updatedAt: now,
    })
    const json = JSON.stringify({
      version: 1,
      templates: [
        { name: "OK", text: "t", channel: "FEEDBACK" },
        { name: "BadChannel", text: "t", channel: "RETURN" },
      ],
    })

    const res = await importTemplatesJson(json)

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.added).toBe(1)
      expect(res.errors).toHaveLength(1)
      expect(res.errors[0].name).toBe("BadChannel")
      expect(res.errors[0].channel).toBe("RETURN")
    }
  })

  it("отклоняет невалидный JSON", async () => {
    const { importTemplatesJson } = await import("@/app/actions/templates")
    const res = await importTemplatesJson("not json")
    expect(res).toEqual({ ok: false, error: "Невалидный JSON" })
    expect(prismaMock.responseTemplate.upsert).not.toHaveBeenCalled()
  })

  it("отклоняет неподдерживаемую версию envelope", async () => {
    const { importTemplatesJson } = await import("@/app/actions/templates")
    const res = await importTemplatesJson(
      JSON.stringify({ version: 99, templates: [] })
    )
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.error).toContain("Неподдерживаемый формат")
  })

  it("блокируется RBAC FORBIDDEN до парсинга JSON", async () => {
    const { importTemplatesJson } = await import("@/app/actions/templates")
    const rbac = await import("@/lib/rbac")
    ;(
      rbac.requireSection as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValueOnce(new Error("FORBIDDEN"))

    const res = await importTemplatesJson(
      JSON.stringify({ version: 1, templates: [] })
    )

    expect(res).toEqual({ ok: false, error: "FORBIDDEN" })
    expect(prismaMock.responseTemplate.upsert).not.toHaveBeenCalled()
  })
})
