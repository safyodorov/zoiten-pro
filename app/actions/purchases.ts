// app/actions/purchases.ts
// Server Actions для Закупок (D-05..D-08, D-21).
// createPurchase авто-генерирует депозит+баланс через lib/procurement-math (D-08).
// Multi-payment CRUD, status lifecycle, PLANNED-only hard delete (D-21).
// НИКОГДА не пишет в Supplier/SupplierProductLink (D-08: пользователь управляет платежами).
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import {
  computeDepositDueDate,
  computeBalanceDueDate,
  recomputeAmountFromPercent,
  computePurchaseTotal,
} from "@/lib/procurement-math"

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

// ── Schemas ─────────────────────────────────────────────────────────
// z.number() (НЕ z.coerce) — zod 4.x + RHF 7.72 совместимость (проектная конвенция).

const PurchaseItemSchema = z.object({
  id: z.string().optional().nullable(),
  productId: z.string().min(1, "Укажите товар"),
  quantity: z.number().int().positive("Количество > 0"),
  unitPrice: z.number().nonnegative("Цена ≥ 0"),
})

const CreatePurchaseSchema = z.object({
  supplierId: z.string().min(1, "Укажите поставщика"),
  currency: z.string().min(1).optional().nullable(),
  optionsDescription: z.string().optional().nullable(),
  optionsExtraCost: z.number().optional().nullable(),
  logisticsCost: z.number().optional().nullable(),
  logisticsComment: z.string().optional().nullable(),
  items: z.array(PurchaseItemSchema).min(1, "Добавьте хотя бы одну позицию"),
  // Параметры платежей — клиент берёт из SupplierProductLink выбранной позиции.
  depositPct: z.number().optional().nullable(),
  balancePct: z.number().optional().nullable(),
  leadTimeDays: z.number().int().optional().nullable(),
})

const UpdatePurchaseSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED"]),
  currency: z.string().min(1).optional().nullable(),
  optionsDescription: z.string().optional().nullable(),
  optionsExtraCost: z.number().optional().nullable(),
  logisticsCost: z.number().optional().nullable(),
  logisticsComment: z.string().optional().nullable(),
  items: z.array(PurchaseItemSchema).min(1, "Добавьте хотя бы одну позицию"),
})

const PaymentSchema = z.object({
  id: z.string().optional().nullable(),
  type: z.enum(["DEPOSIT", "BALANCE"]),
  ordinal: z.number().int().positive(),
  percent: z.number().optional().nullable(),
  amount: z.number().optional().nullable(),
  currency: z.string().min(1),
  dueDate: z.string().min(1, "Укажите дату платежа"),
  paidDate: z.string().optional().nullable(),
  status: z.enum(["PLANNED", "PAID", "OVERDUE"]).optional(),
  comment: z.string().optional().nullable(),
})

// ── createPurchase (D-05..D-08) ─────────────────────────────────────
// Авто-генерирует ровно один DEPOSIT (ordinal 1) + один BALANCE (ordinal 1)
// через procurement-math. Транзакция — verbatim из 20-RESEARCH §createPurchase.

export async function createPurchase(
  data: z.infer<typeof CreatePurchaseSchema>
): Promise<CreateResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const input = CreatePurchaseSchema.parse(data)
    const currency = input.currency || "CNY"

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchase.create({
        data: {
          supplierId: input.supplierId,
          currency,
          status: "PLANNED",
          optionsDescription: input.optionsDescription ?? null,
          optionsExtraCost: input.optionsExtraCost ?? null,
          logisticsCost: input.logisticsCost ?? null,
          logisticsComment: input.logisticsComment ?? null,
        },
      })

      // Позиции закупки (D-06) — unitPrice prefilled на клиенте, редактируем.
      const items = await Promise.all(
        input.items.map((item) =>
          tx.purchaseItem.create({
            data: {
              purchaseId: created.id,
              productId: item.productId,
              quantity: item.quantity,
              unitPrice: item.unitPrice,
            },
          })
        )
      )

      // Итог для расчёта платежей (D-08).
      const total = computePurchaseTotal(
        items.map((i) => ({
          quantity: i.quantity,
          unitPrice: Number(i.unitPrice),
        }))
      )

      // Параметры платежей из SupplierProductLink (через клиент) или дефолты 30/70/45.
      const depositPct = input.depositPct ?? 30
      const balancePct = input.balancePct ?? 70
      const leadTimeDays = input.leadTimeDays ?? 45

      const depositDue = computeDepositDueDate(created.createdAt)
      const balanceDue = computeBalanceDueDate(depositDue, leadTimeDays)

      await tx.purchasePayment.createMany({
        data: [
          {
            purchaseId: created.id,
            type: "DEPOSIT",
            ordinal: 1,
            percent: depositPct,
            amount: recomputeAmountFromPercent(total, depositPct),
            currency,
            dueDate: depositDue,
            status: "PLANNED",
          },
          {
            purchaseId: created.id,
            type: "BALANCE",
            ordinal: 1,
            percent: balancePct,
            amount: recomputeAmountFromPercent(total, balancePct),
            currency,
            dueDate: balanceDue,
            status: "PLANNED",
          },
        ],
      })

      return created
    })

    revalidatePath("/procurement/purchases")
    revalidatePath("/procurement/suppliers")
    return { ok: true, id: purchase.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    console.error("createPurchase error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updatePurchase (D-05, D-08) ─────────────────────────────────────
// Обновляет скалярные поля + статус + позиции (deleteMany notIn + upsert).
// Платежи НЕ пересчитываются автоматически (D-08 — пользователь управляет ими
// через savePurchasePayments). Supplier НЕ мутируется.

export async function updatePurchase(
  data: z.infer<typeof UpdatePurchaseSchema>
): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const input = UpdatePurchaseSchema.parse(data)

    await prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id: input.id },
        data: {
          status: input.status,
          currency: input.currency || "CNY",
          optionsDescription: input.optionsDescription ?? null,
          optionsExtraCost: input.optionsExtraCost ?? null,
          logisticsCost: input.logisticsCost ?? null,
          logisticsComment: input.logisticsComment ?? null,
        },
      })

      // Позиции: удаляем отсутствующие, upsert остальные.
      const keepIds = input.items
        .map((i) => i.id)
        .filter((id): id is string => Boolean(id))
      await tx.purchaseItem.deleteMany({
        where: {
          purchaseId: input.id,
          id: { notIn: keepIds.length ? keepIds : ["__none__"] },
        },
      })
      for (const item of input.items) {
        const fields = {
          productId: item.productId,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
        }
        if (item.id) {
          await tx.purchaseItem.update({ where: { id: item.id }, data: fields })
        } else {
          await tx.purchaseItem.create({ data: { purchaseId: input.id, ...fields } })
        }
      }
    })

    revalidatePath("/procurement/purchases")
    revalidatePath(`/procurement/purchases/${input.id}`)
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Закупка не найдена" }
    }
    console.error("updatePurchase error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── savePurchasePayments (D-08) ─────────────────────────────────────
// Upsert платежей (DEPOSIT|BALANCE, ordinal). Сюда попадают добавленные
// Депозит 2 / Баланс 2. percent/amount приходят уже согласованными с клиента;
// при наличии percent и отсутствии amount — сервер пересчитывает от текущего
// итога закупки через recomputeAmountFromPercent.
// НИКОГДА не пишет в Supplier/SupplierProductLink.

export async function savePurchasePayments(
  purchaseId: string,
  payments: z.infer<typeof PaymentSchema>[]
): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const parsed = z.array(PaymentSchema).parse(payments)

    await prisma.$transaction(async (tx) => {
      // Текущий итог закупки — для пересчёта amount из percent.
      const items = await tx.purchaseItem.findMany({
        where: { purchaseId },
        select: { quantity: true, unitPrice: true },
      })
      const total = computePurchaseTotal(
        items.map((i) => ({ quantity: i.quantity, unitPrice: Number(i.unitPrice) }))
      )

      const keepIds = parsed
        .map((p) => p.id)
        .filter((id): id is string => Boolean(id))
      await tx.purchasePayment.deleteMany({
        where: {
          purchaseId,
          id: { notIn: keepIds.length ? keepIds : ["__none__"] },
        },
      })

      for (const p of parsed) {
        const due = parseDate(p.dueDate)
        if (!due) throw new Error("BAD_DUE_DATE")
        // amount: явное значение приоритетнее; иначе из percent от итога.
        const amount =
          p.amount != null
            ? p.amount
            : p.percent != null
              ? recomputeAmountFromPercent(total, p.percent)
              : 0
        const fields = {
          type: p.type,
          ordinal: p.ordinal,
          percent: p.percent ?? null,
          amount,
          currency: p.currency,
          dueDate: due,
          paidDate: parseDate(p.paidDate),
          status: p.status ?? "PLANNED",
          comment: p.comment ?? null,
        }
        if (p.id) {
          await tx.purchasePayment.update({ where: { id: p.id }, data: fields })
        } else {
          await tx.purchasePayment.create({ data: { purchaseId, ...fields } })
        }
      }
    })

    revalidatePath("/procurement/purchases")
    revalidatePath(`/procurement/purchases/${purchaseId}`)
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    if (e instanceof Error && e.message === "BAD_DUE_DATE") {
      return { ok: false, error: "Некорректная дата платежа" }
    }
    console.error("savePurchasePayments error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── markPaymentPaid (D-08, Defaults #7) ─────────────────────────────
// PAID ставится вручную пользователем. paidDate — дата фактической оплаты.

export async function markPaymentPaid(
  paymentId: string,
  paidDate: string
): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const date = parseDate(paidDate)
    if (!date) return { ok: false, error: "Некорректная дата оплаты" }

    const payment = await prisma.purchasePayment.update({
      where: { id: paymentId },
      data: { status: "PAID", paidDate: date },
      select: { purchaseId: true },
    })

    revalidatePath("/procurement/purchases")
    revalidatePath(`/procurement/purchases/${payment.purchaseId}`)
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Платёж не найден" }
    }
    console.error("markPaymentPaid error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── deletePurchase (D-21) ───────────────────────────────────────────
// Hard delete разрешён ТОЛЬКО для status === PLANNED. Каскад на
// PurchaseItem + PurchasePayment через FK onDelete: Cascade.

export async function deletePurchase(id: string): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")

    const purchase = await prisma.purchase.findUnique({
      where: { id },
      select: { status: true },
    })
    if (!purchase) return { ok: false, error: "Закупка не найдена" }
    if (purchase.status !== "PLANNED") {
      return { ok: false, error: "Удалять можно только планируемые закупки" }
    }

    await prisma.purchase.delete({ where: { id } })

    revalidatePath("/procurement/purchases")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Закупка не найдена" }
    }
    console.error("deletePurchase error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
