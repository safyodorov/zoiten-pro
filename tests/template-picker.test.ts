import { describe, it, expect } from "vitest"
import { groupTemplatesForPicker } from "@/components/support/templates/TemplatePickerModal"
import type { ResponseTemplate } from "@prisma/client"

// Test factory для ResponseTemplate.
function t(
  overrides: Partial<Omit<ResponseTemplate, "createdAt" | "updatedAt">> = {}
): ResponseTemplate {
  return {
    id: overrides.id ?? "t-" + Math.random().toString(36).slice(2),
    name: overrides.name ?? "Name",
    text: overrides.text ?? "Text",
    channel: overrides.channel ?? "FEEDBACK",
    situationTag: overrides.situationTag ?? null,
    nmId: overrides.nmId ?? null,
    isActive: overrides.isActive ?? true,
    createdById: overrides.createdById ?? null,
    updatedById: overrides.updatedById ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

describe("groupTemplatesForPicker", () => {
  it("отделяет шаблоны с nmId === ticketNmId в forNmId, остальные в general", () => {
    const templates = [
      t({ name: "Для кружки", nmId: 12345 }),
      t({ name: "Общий", nmId: null }),
      t({ name: "Для другого", nmId: 99999 }),
    ]
    const { forNmId, general } = groupTemplatesForPicker(templates, {
      channel: "FEEDBACK",
      ticketNmId: 12345,
    })
    expect(forNmId.map((x) => x.name)).toEqual(["Для кружки"])
    expect(general.map((x) => x.name).sort()).toEqual([
      "Для другого",
      "Общий",
    ])
  })

  it("при ticketNmId=null forNmId пустой, все остальные в general", () => {
    const templates = [t({ name: "A", nmId: null }), t({ name: "B", nmId: 555 })]
    const { forNmId, general } = groupTemplatesForPicker(templates, {
      channel: "FEEDBACK",
      ticketNmId: null,
    })
    expect(forNmId).toEqual([])
    expect(general).toHaveLength(2)
  })

  it("фильтрует по каналу — показывает только совпадающие", () => {
    const templates = [
      t({ name: "F1", channel: "FEEDBACK" }),
      t({ name: "Q1", channel: "QUESTION" }),
      t({ name: "C1", channel: "CHAT" }),
    ]
    const { general } = groupTemplatesForPicker(templates, {
      channel: "QUESTION",
      ticketNmId: null,
    })
    expect(general.map((x) => x.name)).toEqual(["Q1"])
  })

  it("исключает шаблоны с isActive=false", () => {
    const templates = [
      t({ name: "Active", isActive: true }),
      t({ name: "Inactive", isActive: false }),
    ]
    const { general } = groupTemplatesForPicker(templates, {
      channel: "FEEDBACK",
      ticketNmId: null,
    })
    expect(general.map((x) => x.name)).toEqual(["Active"])
  })

  it("фильтрует по query регистронезависимо (по name)", () => {
    const templates = [
      t({ name: "Привет", text: "Спасибо" }),
      t({ name: "Отказ", text: "К сожалению" }),
    ]
    const { general } = groupTemplatesForPicker(templates, {
      channel: "FEEDBACK",
      ticketNmId: null,
      query: "ПРИвет",
    })
    expect(general).toHaveLength(1)
    expect(general[0].name).toBe("Привет")
  })

  it("query ищет по situationTag", () => {
    const templates = [t({ name: "N1", situationTag: "Положительный" })]
    const { general } = groupTemplatesForPicker(templates, {
      channel: "FEEDBACK",
      ticketNmId: null,
      query: "положительный",
    })
    expect(general).toHaveLength(1)
  })

  it("пустой query возвращает все шаблоны канала", () => {
    const templates = [t({ name: "A" }), t({ name: "B" })]
    const { general } = groupTemplatesForPicker(templates, {
      channel: "FEEDBACK",
      ticketNmId: null,
      query: "",
    })
    expect(general).toHaveLength(2)
  })

  it("query ищет по text поля шаблона", () => {
    const templates = [
      t({ name: "N1", text: "Спасибо за обратную связь" }),
      t({ name: "N2", text: "К сожалению, возврат невозможен" }),
    ]
    const { general } = groupTemplatesForPicker(templates, {
      channel: "FEEDBACK",
      ticketNmId: null,
      query: "возврат",
    })
    expect(general).toHaveLength(1)
    expect(general[0].name).toBe("N2")
  })
})
