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
  CLOTHING_OVERHEAD_FIXED_KEY,
  DEFAULT_MANUAL_POOLS,
  type ManualPools,
} from "@/lib/finance-weekly/data"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Сохраняет ручные пулы затрат для ISO-недели (ключ AppSetting
 * financeWeekly.pools.<weekISO>). Санитизирует значения → конечные числа (иначе 0).
 * W3a (quick 260710-lmb): opts.clothingOverheadFixedRub — глобальная фикс-часть
 * общих расходов одежды → отдельный AppSetting (недельный ключ не меняется).
 */
export async function saveWeeklyPools(
  weekStartISO: string,
  pools: ManualPools,
  opts?: { clothingOverheadFixedRub?: number },
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

    // W3a: фикс одежды — глобальная константа (НЕ per неделя), ≥ 0
    const fixedRaw = Number(opts?.clothingOverheadFixedRub)
    if (opts?.clothingOverheadFixedRub !== undefined && Number.isFinite(fixedRaw)) {
      const fixed = Math.max(0, fixedRaw)
      await prisma.appSetting.upsert({
        where: { key: CLOTHING_OVERHEAD_FIXED_KEY },
        create: { key: CLOTHING_OVERHEAD_FIXED_KEY, value: String(fixed) },
        update: { value: String(fixed) },
      })
    }

    revalidatePath("/finance/weekly")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
