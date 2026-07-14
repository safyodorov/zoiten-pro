// app/actions/credits.ts
// Server Actions для CRUD кредитов (Loan + nested LoanPayment[])
// Phase 21 (Credits) — D-11 RBAC, D-04 nested payments, U-03 lenderId
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Schemas ────────────────────────────────────────────────────────

const PaymentSchema = z.object({
  date: z.string().min(1),                             // ISO дата YYYY-MM-DD
  principal: z.number().nonnegative().default(0),
  interest: z.number().nonnegative().default(0),
})

const LoanSchema = z.object({
  contractNumber: z.string().min(1, "Укажите № КД").max(100),
  companyId: z.string().min(1),
  lenderId: z.string().min(1),                         // U-03: lenderId, НЕ bankId
  amount: z.number().positive(),
  annualRatePct: z.number().min(0).max(1000),          // 28.000 и т.п.
  termMonths: z.number().int().positive().nullable().optional(),
  issueDate: z.string().nullable().optional(),          // ISO или null (D-07)
  monthlyCommissionRub: z.number().nonnegative().nullable().optional(), // quick 260714-ij9
  monthlyNdflRub: z.number().nonnegative().nullable().optional(),       // quick 260714-ij9
  notes: z.string().max(2000).nullable().optional(),
  payments: z.array(PaymentSchema).default([]),
})

const UpdateLoanSchema = LoanSchema.extend({ id: z.string().min(1) })

// ── Error handler helper ──────────────────────────────────────────

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

// ── createLoan ────────────────────────────────────────────────────

export async function createLoan(
  data: z.infer<typeof LoanSchema>
): Promise<CreateResult> {
  try {
    await requireSection("CREDITS", "MANAGE")
    const parsed = LoanSchema.parse(data)

    const loan = await prisma.loan.create({
      data: {
        contractNumber: parsed.contractNumber,
        companyId: parsed.companyId,
        lenderId: parsed.lenderId,
        amount: parsed.amount,
        annualRatePct: parsed.annualRatePct,
        termMonths: parsed.termMonths ?? null,
        issueDate: parseDate(parsed.issueDate),
        monthlyCommissionRub: parsed.monthlyCommissionRub ?? null,
        monthlyNdflRub: parsed.monthlyNdflRub ?? null,
        notes: parsed.notes ?? null,
        payments: {
          create: parsed.payments.map((p) => ({
            date: new Date(p.date),
            principal: p.principal,
            interest: p.interest,
          })),
        },
      },
    })

    revalidatePath("/credits")
    revalidatePath("/credits/schedule")
    return { ok: true, id: loan.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ошибка валидации" }
    }
    console.error("createLoan error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updateLoan ────────────────────────────────────────────────────

export async function updateLoan(
  data: z.infer<typeof UpdateLoanSchema>
): Promise<ActionResult> {
  try {
    await requireSection("CREDITS", "MANAGE")
    const parsed = UpdateLoanSchema.parse(data)

    await prisma.$transaction(async (tx) => {
      // Обновляем скалярные поля кредита (включая lenderId, U-03)
      await tx.loan.update({
        where: { id: parsed.id },
        data: {
          contractNumber: parsed.contractNumber,
          companyId: parsed.companyId,
          lenderId: parsed.lenderId,
          amount: parsed.amount,
          annualRatePct: parsed.annualRatePct,
          termMonths: parsed.termMonths ?? null,
          issueDate: parseDate(parsed.issueDate),
          monthlyCommissionRub: parsed.monthlyCommissionRub ?? null,
          monthlyNdflRub: parsed.monthlyNdflRub ?? null,
          notes: parsed.notes ?? null,
        },
      })

      // Clean-replace платежей (удалить старые + создать новые)
      await tx.loanPayment.deleteMany({ where: { loanId: parsed.id } })
      if (parsed.payments.length > 0) {
        await tx.loanPayment.createMany({
          data: parsed.payments.map((p) => ({
            loanId: parsed.id,
            date: new Date(p.date),
            principal: p.principal,
            interest: p.interest,
          })),
        })
      }
    })

    revalidatePath("/credits")
    revalidatePath("/credits/schedule")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ошибка валидации" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Кредит не найден" }
    }
    console.error("updateLoan error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── deleteLoan ────────────────────────────────────────────────────

/**
 * Мягкое удаление кредита (D-05 soft delete, как Product).
 * Устанавливает deletedAt = now; реальные записи сохраняются.
 */
export async function deleteLoan(id: string): Promise<ActionResult> {
  try {
    await requireSection("CREDITS", "MANAGE")

    await prisma.loan.update({
      where: { id },
      data: { deletedAt: new Date() },
    })

    revalidatePath("/credits")
    revalidatePath("/credits/schedule")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Кредит не найден" }
    }
    console.error("deleteLoan error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── replaceLoanPayments ───────────────────────────────────────────

/**
 * Заменяет весь график платежей кредита (clean-replace).
 * Используется seed-скриптом и импортом данных (D-01).
 */
export async function replaceLoanPayments(
  loanId: string,
  payments: Array<{ date: string; principal: number; interest: number }>
): Promise<ActionResult> {
  try {
    await requireSection("CREDITS", "MANAGE")

    const parsed = z.array(PaymentSchema).parse(payments)

    await prisma.$transaction(async (tx) => {
      await tx.loanPayment.deleteMany({ where: { loanId } })
      if (parsed.length > 0) {
        await tx.loanPayment.createMany({
          data: parsed.map((p) => ({
            loanId,
            date: new Date(p.date),
            principal: p.principal,
            interest: p.interest,
          })),
        })
      }
    })

    revalidatePath("/credits")
    revalidatePath("/credits/schedule")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if (e instanceof z.ZodError) {
      return { ok: false, error: e.issues[0]?.message ?? "Ошибка валидации" }
    }
    console.error("replaceLoanPayments error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
