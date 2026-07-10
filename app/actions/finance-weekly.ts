"use server"

// app/actions/finance-weekly.ts
// Server action понедельного WB фин-отчёта (/finance/weekly, W2a).
// Сохранение ручных пулов затрат (placeholder до W3 банк-классификатора).
// RBAC: только FINANCE MANAGE.
//
// Phase quick-260710-evz (W2a, 2026-07-10)

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import {
  financeWeeklyPoolsKey,
  DEFAULT_MANUAL_POOLS,
  type ManualPools,
} from "@/lib/finance-weekly/data"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Сохраняет ручные пулы затрат для ISO-недели (ключ AppSetting
 * financeWeekly.pools.<weekISO>). Санитизирует значения → конечные числа (иначе 0).
 */
export async function saveWeeklyPools(
  weekStartISO: string,
  pools: ManualPools,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSection("FINANCE", "MANAGE")

    if (!ISO_DATE_RE.test(weekStartISO)) {
      return { ok: false, error: "Некорректная дата недели" }
    }

    // Санитизация: приводим к конечным числам, иначе 0
    const clean: ManualPools = { ...DEFAULT_MANUAL_POOLS }
    for (const k of Object.keys(clean) as (keyof ManualPools)[]) {
      const n = Number(pools?.[k])
      clean[k] = Number.isFinite(n) ? n : 0
    }

    const key = financeWeeklyPoolsKey(weekStartISO)
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: JSON.stringify(clean) },
      update: { value: JSON.stringify(clean) },
    })

    revalidatePath("/finance/weekly")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
