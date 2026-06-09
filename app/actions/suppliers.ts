// app/actions/suppliers.ts
// Server Actions для Поставщиков (D-01..D-04, D-20).
// CRUD Supplier + nested контакты/product-links/переговоры + soft delete.
// isPrimary enforcement через pure helper lib/supplier-primary.ts (D-02).
// Polymorphic participant constraint (D-04) enforced здесь.
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { resolvePrimaryWrites } from "@/lib/supplier-primary"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Error handler ─────────────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
  }
  return null
}

function parseDate(val: string | null | undefined): Date | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

// ── Schemas (D-02) ─────────────────────────────────────────────────

const ContactSchema = z
  .object({
    id: z.string().optional().nullable(),
    type: z.enum(["SUPPLIER_MANAGER", "SUPPLIER_BOSS"]),
    name: z.string().min(1),
    phone: z.string().optional().nullable(),
    preferredContact: z.enum(["WECHAT", "PHONE", "ALIBABA", "OTHER"]),
    preferredContactCustom: z.string().optional().nullable(),
    description: z.string().optional().nullable(),
    isPrimary: z.boolean().default(false),
  })
  .refine(
    (c) =>
      c.preferredContact !== "OTHER" ||
      (c.preferredContactCustom && c.preferredContactCustom.trim().length > 0),
    {
      message: "Для способа «Свой вариант» укажите его название",
      path: ["preferredContactCustom"],
    }
  )

const SupplierSchema = z.object({
  nameForeign: z.string().min(1),
  nameEnglish: z.string().min(1),
  buyerEmployeeId: z.string().optional().nullable(),
  cooperationSummary: z.string().optional().nullable(),
  contacts: z.array(ContactSchema).default([]),
})

const UpdateSupplierSchema = SupplierSchema.extend({
  id: z.string().min(1),
})

// SupplierProductLink (D-03)
const ProductLinkSchema = z.object({
  id: z.string().optional().nullable(),
  productId: z.string().optional().nullable(),
  productNameFallback: z.string().optional().nullable(),
  leadTimeDays: z.number().int().optional().nullable(),
  leadTimeComment: z.string().optional().nullable(),
  unitPrice: z.number().optional().nullable(),
  currency: z.string().optional().nullable(),
  deliveryType: z.enum(["CARGO", "WHITE"]).optional().nullable(),
  deliveryComment: z.string().optional().nullable(),
  exclusivityStatus: z.boolean().default(false),
  exclusivityTerms: z.string().optional().nullable(),
  depositPct: z.number().optional().nullable(),
  balancePct: z.number().optional().nullable(),
  deferralPct: z.number().optional().nullable(),
  deferralTerms: z.string().optional().nullable(),
  inspectionCity: z.string().optional().nullable(),
  inspectionAddress: z.string().optional().nullable(),
  inspectionMapUrl: z.string().optional().nullable(),
})

// Negotiation (D-04)
const ParticipantSchema = z.object({
  id: z.string().optional().nullable(),
  employeeId: z.string().optional().nullable(),
  supplierContactId: z.string().optional().nullable(),
  customName: z.string().optional().nullable(),
  customRole: z.string().optional().nullable(),
})

const NegotiationSchema = z.object({
  id: z.string().optional().nullable(),
  date: z.string().min(1),
  goals: z.string().min(1),
  summary: z.string().optional().nullable(),
  productIds: z.array(z.string()).default([]),
  participants: z.array(ParticipantSchema).default([]),
})

// ── createSupplier ──────────────────────────────────────────────────

export async function createSupplier(
  data: z.infer<typeof SupplierSchema>
): Promise<CreateResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const parsed = SupplierSchema.parse(data)

    const supplier = await prisma.$transaction(async (tx) => {
      const created = await tx.supplier.create({
        data: {
          nameForeign: parsed.nameForeign,
          nameEnglish: parsed.nameEnglish,
          buyerEmployeeId: parsed.buyerEmployeeId || null,
          cooperationSummary: parsed.cooperationSummary ?? null,
        },
      })

      // Контакты с enforcement isPrimary (D-02) — supplierId известен только
      // после create, поэтому resolvePrimaryWrites вызываем здесь.
      if (parsed.contacts.length > 0) {
        const resolved = resolvePrimaryWrites(
          parsed.contacts.map((c) => ({
            id: c.id ?? undefined,
            supplierId: created.id,
            type: c.type,
            isPrimary: c.isPrimary,
          }))
        )
        await tx.supplierContact.createMany({
          data: parsed.contacts.map((c, i) => ({
            supplierId: created.id,
            type: c.type,
            name: c.name,
            phone: c.phone ?? null,
            preferredContact: c.preferredContact,
            preferredContactCustom: c.preferredContactCustom ?? null,
            description: c.description ?? null,
            isPrimary: resolved[i].isPrimary,
          })),
        })
      }

      return created
    })

    revalidatePath("/procurement/suppliers")
    return { ok: true, id: supplier.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    console.error("createSupplier error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updateSupplier ──────────────────────────────────────────────────

export async function updateSupplier(
  data: z.infer<typeof UpdateSupplierSchema>
): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const parsed = UpdateSupplierSchema.parse(data)

    await prisma.$transaction(async (tx) => {
      await tx.supplier.update({
        where: { id: parsed.id },
        data: {
          nameForeign: parsed.nameForeign,
          nameEnglish: parsed.nameEnglish,
          buyerEmployeeId: parsed.buyerEmployeeId || null,
          cooperationSummary: parsed.cooperationSummary ?? null,
        },
      })

      // isPrimary enforcement (D-02): корректируем флаги перед upsert.
      const resolved = resolvePrimaryWrites(
        parsed.contacts.map((c) => ({
          id: c.id ?? undefined,
          supplierId: parsed.id,
          type: c.type,
          isPrimary: c.isPrimary,
        }))
      )

      // Удаляем контакты, которых больше нет в форме (deleteMany notIn keepIds).
      const keepIds = parsed.contacts
        .map((c) => c.id)
        .filter((id): id is string => Boolean(id))
      await tx.supplierContact.deleteMany({
        where: { supplierId: parsed.id, id: { notIn: keepIds.length ? keepIds : ["__none__"] } },
      })

      // Upsert каждый контакт с исправленным isPrimary.
      for (let i = 0; i < parsed.contacts.length; i++) {
        const c = parsed.contacts[i]
        const isPrimary = resolved[i].isPrimary
        const fields = {
          type: c.type,
          name: c.name,
          phone: c.phone ?? null,
          preferredContact: c.preferredContact,
          preferredContactCustom: c.preferredContactCustom ?? null,
          description: c.description ?? null,
          isPrimary,
        }
        if (c.id) {
          await tx.supplierContact.update({
            where: { id: c.id },
            data: fields,
          })
        } else {
          await tx.supplierContact.create({
            data: { supplierId: parsed.id, ...fields },
          })
        }
      }
    })

    revalidatePath("/procurement/suppliers")
    revalidatePath(`/procurement/suppliers/${parsed.id}`)
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Поставщик не найден" }
    }
    console.error("updateSupplier error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── softDeleteSupplier (D-20) ───────────────────────────────────────
// НЕ каскадит на children; Purchase записи не трогаются.

export async function softDeleteSupplier(id: string): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    await prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date() },
    })
    revalidatePath("/procurement/suppliers")
    revalidatePath(`/procurement/suppliers/${id}`)
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Поставщик не найден" }
    }
    console.error("softDeleteSupplier error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── restoreSupplier (optional) ──────────────────────────────────────

export async function restoreSupplier(id: string): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    await prisma.supplier.update({
      where: { id },
      data: { deletedAt: null },
    })
    revalidatePath("/procurement/suppliers")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("restoreSupplier error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── saveSupplierProductLinks (D-03) ─────────────────────────────────

export async function saveSupplierProductLinks(
  supplierId: string,
  links: z.infer<typeof ProductLinkSchema>[]
): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const parsedLinks = z.array(ProductLinkSchema).parse(links)

    await prisma.$transaction(async (tx) => {
      const keepIds = parsedLinks
        .map((l) => l.id)
        .filter((id): id is string => Boolean(id))
      await tx.supplierProductLink.deleteMany({
        where: { supplierId, id: { notIn: keepIds.length ? keepIds : ["__none__"] } },
      })

      for (const l of parsedLinks) {
        const fields = {
          productId: l.productId || null,
          productNameFallback: l.productNameFallback ?? null,
          leadTimeDays: l.leadTimeDays ?? null,
          leadTimeComment: l.leadTimeComment ?? null,
          unitPrice: l.unitPrice ?? null,
          currency: l.currency ?? null,
          deliveryType: l.deliveryType ?? null,
          deliveryComment: l.deliveryComment ?? null,
          exclusivityStatus: l.exclusivityStatus,
          exclusivityTerms: l.exclusivityTerms ?? null,
          depositPct: l.depositPct ?? null,
          balancePct: l.balancePct ?? null,
          deferralPct: l.deferralPct ?? null,
          deferralTerms: l.deferralTerms ?? null,
          inspectionCity: l.inspectionCity ?? null,
          inspectionAddress: l.inspectionAddress ?? null,
          inspectionMapUrl: l.inspectionMapUrl ?? null,
        }
        if (l.id) {
          await tx.supplierProductLink.update({ where: { id: l.id }, data: fields })
        } else {
          await tx.supplierProductLink.create({ data: { supplierId, ...fields } })
        }
      }
    })

    revalidatePath(`/procurement/suppliers/${supplierId}`)
    revalidatePath("/procurement/suppliers")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    console.error("saveSupplierProductLinks error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── saveNegotiation (D-04) ──────────────────────────────────────────
// Polymorphic participant constraint: ровно одно из
// (employeeId | supplierContactId | customName) заполнено.

function validateParticipant(p: z.infer<typeof ParticipantSchema>): boolean {
  const filled = [p.employeeId, p.supplierContactId, p.customName].filter(
    (v) => v && String(v).trim().length > 0
  )
  return filled.length === 1
}

export async function saveNegotiation(
  supplierId: string,
  input: z.infer<typeof NegotiationSchema>
): Promise<CreateResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const parsed = NegotiationSchema.parse(input)

    // Enforce exactly-one-of для каждого участника (D-04, Pitfall 6).
    for (const p of parsed.participants) {
      if (!validateParticipant(p)) {
        return {
          ok: false,
          error:
            "Каждый участник должен быть либо сотрудником, либо контактом поставщика, либо своим именем+ролью",
        }
      }
    }

    const date = parseDate(parsed.date)
    if (!date) return { ok: false, error: "Некорректная дата переговоров" }

    const result = await prisma.$transaction(async (tx) => {
      const negotiation = parsed.id
        ? await tx.negotiation.update({
            where: { id: parsed.id },
            data: { date, goals: parsed.goals, summary: parsed.summary ?? null },
          })
        : await tx.negotiation.create({
            data: { supplierId, date, goals: parsed.goals, summary: parsed.summary ?? null },
          })

      // M:N обсуждаемые товары — пересоздаём.
      await tx.negotiationProduct.deleteMany({ where: { negotiationId: negotiation.id } })
      const uniqueProductIds = [...new Set(parsed.productIds.filter(Boolean))]
      if (uniqueProductIds.length > 0) {
        await tx.negotiationProduct.createMany({
          data: uniqueProductIds.map((productId) => ({
            negotiationId: negotiation.id,
            productId,
          })),
        })
      }

      // Участники — пересоздаём.
      await tx.negotiationParticipant.deleteMany({ where: { negotiationId: negotiation.id } })
      if (parsed.participants.length > 0) {
        await tx.negotiationParticipant.createMany({
          data: parsed.participants.map((p) => ({
            negotiationId: negotiation.id,
            employeeId: p.employeeId || null,
            supplierContactId: p.supplierContactId || null,
            customName: p.customName || null,
            customRole: p.customRole || null,
          })),
        })
      }

      return negotiation
    })

    revalidatePath(`/procurement/suppliers/${supplierId}`)
    return { ok: true, id: result.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    console.error("saveNegotiation error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── deleteNegotiation (D-04) ────────────────────────────────────────

export async function deleteNegotiation(id: string): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const neg = await prisma.negotiation.findUnique({
      where: { id },
      select: { supplierId: true },
    })
    await prisma.negotiation.delete({ where: { id } })
    if (neg) revalidatePath(`/procurement/suppliers/${neg.supplierId}`)
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Переговоры не найдены" }
    }
    console.error("deleteNegotiation error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
