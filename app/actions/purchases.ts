// app/actions/purchases.ts
// Server Actions для Закупок (D-05..D-08, D-21).
// createPurchase авто-генерирует депозит+баланс через lib/procurement-math (D-08).
// Multi-payment CRUD, status lifecycle, PLANNED-only hard delete (D-21).
// НИКОГДА не пишет в Supplier/SupplierProductLink (D-08: пользователь управляет платежами).
// Quick 260702-j52: после каждой мутации items/stages/status — пересчёт «Производства»
// (ProductIncoming.orderedQty) через lib/production-sync. Сбой recompute логируется,
// но НЕ превращает результат action в ошибку (мутация закупки уже зафиксирована).
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
import { recomputeProductionForProducts } from "@/lib/production-sync"

// Ревалидация страниц, зависящих от денормализованного «Производства».
function revalidateProductionLinked() {
  revalidatePath("/stock")
  revalidatePath("/purchase-plan")
  revalidatePath("/sales-plan")
}

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
  // Конвертация виртуальной закупки (Phase 25 wave 6): анти-двойной счёт
  fromVirtualId: z.string().optional().nullable(),
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
  amountRub: z.number().nullable().optional(), // факт. оплачено ₽ (260704-go2)
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
            amountRub: null,
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
            amountRub: null,
          },
        ],
      })

      // Анти-двойной счёт: если создаётся из виртуальной закупки → CONVERTED (Phase 25 wave 6)
      if (input.fromVirtualId) {
        await tx.virtualPurchase.update({
          where: { id: input.fromVirtualId },
          data: {
            status: "CONVERTED",
            convertedPurchaseId: created.id,
          },
        })
      }

      return created
    })

    // Пересчёт «Производства» после коммита транзакции (читает зафиксированные данные).
    // Собственный try/catch: сбой денормализации НЕ должен превращаться в ok:false —
    // иначе пользователь повторит create и получит дубль закупки.
    try {
      await recomputeProductionForProducts(prisma, input.items.map((i) => i.productId))
    } catch (e) {
      console.error("[production-sync] recompute failed:", e)
    }

    // Ревалидация sales-plan если была конвертация виртуальной закупки
    if (input.fromVirtualId) {
      revalidatePath("/sales-plan")
      revalidatePath("/sales-plan/products")
      revalidatePath("/sales-plan/purchases")
    }

    revalidatePath("/procurement/purchases")
    revalidatePath("/procurement/suppliers")
    revalidateProductionLinked()
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

    // Старые productId ДО транзакции — union с новыми покрывает удалённые позиции
    // и смену статуса (напр. ACTIVE→COMPLETED).
    const before = await prisma.purchaseItem.findMany({
      where: { purchaseId: input.id },
      select: { productId: true },
    })

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

    try {
      await recomputeProductionForProducts(prisma, [
        ...before.map((i) => i.productId),
        ...input.items.map((i) => i.productId),
      ])
    } catch (e) {
      console.error("[production-sync] recompute failed:", e)
    }

    revalidatePath("/procurement/purchases")
    revalidatePath(`/procurement/purchases/${input.id}`)
    revalidateProductionLinked()
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
          amountRub: p.amountRub ?? null, // факт. оплачено ₽ (260704-go2)
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

    // productId позиций ДО удаления (каскад сотрёт PurchaseItem).
    const items = await prisma.purchaseItem.findMany({
      where: { purchaseId: id },
      select: { productId: true },
    })

    await prisma.purchase.delete({ where: { id } })

    try {
      await recomputeProductionForProducts(prisma, items.map((i) => i.productId))
    } catch (e) {
      console.error("[production-sync] recompute failed:", e)
    }

    revalidatePath("/procurement/purchases")
    revalidateProductionLinked()
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

// ── Группы инвойсов (объединение искусственно раздробленных закупок) ──

function ruDate(d: Date): string {
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// Объединить закупки в новую группу. Только один поставщик на группу.
// Имя генерируется автоматически: «Группа · {поставщик} · {дата}».
export async function createPurchaseGroup(
  purchaseIds: string[]
): Promise<CreateResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const ids = [...new Set(purchaseIds.filter(Boolean))]
    if (ids.length < 2) return { ok: false, error: "Выберите хотя бы две закупки" }

    const purchases = await prisma.purchase.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        groupId: true,
        supplierId: true,
        supplier: { select: { nameEnglish: true, nameForeign: true } },
      },
    })
    if (purchases.length !== ids.length) {
      return { ok: false, error: "Некоторые закупки не найдены" }
    }
    if (purchases.some((p) => p.groupId)) {
      return { ok: false, error: "Некоторые закупки уже в группе" }
    }
    const supplierIds = new Set(purchases.map((p) => p.supplierId))
    if (supplierIds.size > 1) {
      return { ok: false, error: "В группу можно объединять только закупки одного поставщика" }
    }

    const sup = purchases[0].supplier
    const name = `Группа · ${sup.nameEnglish || sup.nameForeign} · ${ruDate(new Date())}`

    const group = await prisma.purchaseGroup.create({ data: { name } })
    await prisma.purchase.updateMany({
      where: { id: { in: ids } },
      data: { groupId: group.id },
    })

    revalidatePath("/procurement/purchases")
    return { ok: true, id: group.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("createPurchaseGroup error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// Переименовать группу.
export async function renamePurchaseGroup(
  groupId: string,
  name: string
): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const trimmed = name.trim()
    if (!trimmed) return { ok: false, error: "Название не может быть пустым" }
    await prisma.purchaseGroup.update({ where: { id: groupId }, data: { name: trimmed } })
    revalidatePath("/procurement/purchases")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Группа не найдена" }
    }
    console.error("renamePurchaseGroup error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// Разгруппировать: снять groupId со всех закупок и удалить группу.
export async function ungroupPurchaseGroup(groupId: string): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    await prisma.purchase.updateMany({ where: { groupId }, data: { groupId: null } })
    await prisma.purchaseGroup.delete({ where: { id: groupId } }).catch(() => {})
    revalidatePath("/procurement/purchases")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("ungroupPurchaseGroup error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// Убрать одну закупку из группы. Если в группе осталось < 2 закупок — группа распускается.
export async function removePurchaseFromGroup(purchaseId: string): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: { groupId: true },
    })
    if (!purchase?.groupId) return { ok: true } // уже вне группы
    const groupId = purchase.groupId
    await prisma.purchase.update({ where: { id: purchaseId }, data: { groupId: null } })
    const remaining = await prisma.purchase.count({ where: { groupId } })
    if (remaining < 2) {
      await prisma.purchase.updateMany({ where: { groupId }, data: { groupId: null } })
      await prisma.purchaseGroup.delete({ where: { id: groupId } }).catch(() => {})
    }
    revalidatePath("/procurement/purchases")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("removePurchaseFromGroup error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── Этапы движения товара по позициям (производство → … → склад) ──

const STAGE_VALUES = ["PRODUCTION", "INSPECTION", "SHIPMENT", "TRANSIT", "WAREHOUSE"] as const

const StageEntrySchema = z.object({
  itemId: z.string().min(1),
  stage: z.enum(STAGE_VALUES),
  quantity: z.number().int().min(0),
  comment: z.string().nullable().optional(),
  date: z.string().nullable().optional(),
})

// Полная перезапись этапов для всех позиций закупки: клиент присылает только
// «достигнутые» этапы (с кол-вом), остальные удаляются. quantity на каждом этапе
// может быть меньше предыдущего (частичная готовность/отгрузка/приёмка).
export async function savePurchaseItemStages(
  purchaseId: string,
  entriesRaw: unknown
): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const entries = z.array(StageEntrySchema).parse(entriesRaw)

    const items = await prisma.purchaseItem.findMany({
      where: { purchaseId },
      select: { id: true, productId: true },
    })
    const validIds = new Set(items.map((i) => i.id))
    if (validIds.size === 0) return { ok: false, error: "В закупке нет позиций" }
    if (entries.some((e) => !validIds.has(e.itemId))) {
      return { ok: false, error: "Позиция не принадлежит закупке" }
    }

    await prisma.$transaction([
      prisma.purchaseItemStageProgress.deleteMany({
        where: { itemId: { in: [...validIds] } },
      }),
      prisma.purchaseItemStageProgress.createMany({
        data: entries.map((e) => ({
          itemId: e.itemId,
          stage: e.stage,
          quantity: e.quantity,
          comment: e.comment?.trim() || null,
          date: parseDate(e.date),
        })),
      }),
    ])

    // Частичная приёмка (WAREHOUSE) сразу уменьшает «Производство».
    try {
      await recomputeProductionForProducts(prisma, items.map((i) => i.productId))
    } catch (e) {
      console.error("[production-sync] recompute failed:", e)
    }

    revalidatePath("/procurement/purchases")
    revalidatePath(`/procurement/purchases/${purchaseId}`)
    revalidateProductionLinked()
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    console.error("savePurchaseItemStages error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── Инспекция: метаданные (даты, стоимость, инспектор + контакты) ──

const InspectionContactSchema = z.object({
  phone: z.string().nullable().optional(),
  wechat: z.string().nullable().optional(),
})

const InspectionSchema = z.object({
  plannedDate: z.string().nullable().optional(),
  actualDate: z.string().nullable().optional(),
  costRub: z.number().nullable().optional(),
  inspectorName: z.string().nullable().optional(),
  contacts: z.array(InspectionContactSchema).default([]),
})

export async function saveInspection(
  purchaseId: string,
  dataRaw: unknown
): Promise<ActionResult> {
  try {
    await requireSection("PROCUREMENT", "MANAGE")
    const data = InspectionSchema.parse(dataRaw)

    const purchase = await prisma.purchase.findUnique({
      where: { id: purchaseId },
      select: { id: true },
    })
    if (!purchase) return { ok: false, error: "Закупка не найдена" }

    const scalars = {
      plannedDate: parseDate(data.plannedDate ?? null),
      actualDate: parseDate(data.actualDate ?? null),
      costRub: data.costRub ?? null,
      inspectorName: data.inspectorName?.trim() || null,
    }
    const contactRows = data.contacts
      .map((c) => ({ phone: c.phone?.trim() || null, wechat: c.wechat?.trim() || null }))
      .filter((c) => c.phone || c.wechat)

    const insp = await prisma.purchaseInspection.upsert({
      where: { purchaseId },
      create: { purchaseId, ...scalars },
      update: scalars,
      select: { id: true },
    })
    await prisma.inspectionContact.deleteMany({ where: { inspectionId: insp.id } })
    if (contactRows.length) {
      await prisma.inspectionContact.createMany({
        data: contactRows.map((c) => ({ inspectionId: insp.id, ...c })),
      })
    }

    revalidatePath(`/procurement/purchases/${purchaseId}`)
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Некорректные данные" }
    }
    console.error("saveInspection error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
