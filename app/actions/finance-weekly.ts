"use server"

// app/actions/finance-weekly.ts
// Server actions понедельного WB фин-отчёта (/finance/weekly, W2a).
// Сохранение ручных пулов затрат (placeholder до W3 банк-классификатора).
// W3c (quick 260710-mih): фиксация недели — immutable-снапшот рендер-пейлоада
// (fixWeeklyReport / unfixWeeklyReport). RBAC: только FINANCE MANAGE.
//
// Phase quick-260710-evz (W2a, 2026-07-10)

import { revalidatePath } from "next/cache"
import { prisma } from "@/lib/prisma"
import { requireSection } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import {
  financeWeeklyPoolsKey,
  CLOTHING_OVERHEAD_FIXED_KEY,
  DEFAULT_MANUAL_POOLS,
  type ManualPools,
} from "@/lib/finance-weekly/data"
import { financeWeeklyJemOptionKey } from "@/lib/finance-weekly/jem-option"
import { loadWeeklyLiveBundle } from "@/lib/finance-weekly/live"
import { buildWeeklySnapshotPayload, toIsoMonday } from "@/lib/finance-weekly/snapshot"

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/**
 * Сохраняет ручные пулы затрат для ISO-недели (ключ AppSetting
 * financeWeekly.pools.<weekISO>). Санитизирует значения → конечные числа (иначе 0).
 * W3a (quick 260710-lmb): opts.clothingOverheadFixedRub — глобальная фикс-часть
 * общих расходов одежды → отдельный AppSetting (недельный ключ не меняется).
 * Quick 260714-gff: opts.jemOptionPct — ставка Опции Джема ТЕКУЩЕЙ недели →
 * AppSetting financeWeekly.jemOptionPct.<weekISO> (carry-forward резолвится
 * в data.ts при чтении).
 */
export async function saveWeeklyPools(
  weekStartISO: string,
  pools: ManualPools,
  opts?: { clothingOverheadFixedRub?: number; jemOptionPct?: number },
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

    // Quick 260714-gff: Опция Джема — ставка ТЕКУЩЕЙ недели, ≥ 0
    const jemRaw = Number(opts?.jemOptionPct)
    if (opts?.jemOptionPct !== undefined && Number.isFinite(jemRaw)) {
      const jem = Math.max(0, jemRaw)
      const jemKey = financeWeeklyJemOptionKey(weekStartISO)
      await prisma.appSetting.upsert({
        where: { key: jemKey },
        create: { key: jemKey, value: String(jem) },
        update: { value: String(jem) },
      })
    }

    revalidatePath("/finance/weekly")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/**
 * W3c: фиксирует неделю — СЕРВЕРНЫЙ пересбор live-пейлоада (клиенту не
 * доверяем) → clean-replace upsert в WeeklyFinReportSnapshot. Повторный вызов
 * («Перефиксировать») перезаписывает снапшот свежим расчётом.
 */
export async function fixWeeklyReport(
  weekStartISO: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSection("FINANCE", "MANAGE")

    if (!ISO_DATE_RE.test(weekStartISO)) {
      return { ok: false, error: "Некорректная дата недели" }
    }
    const mondayISO = toIsoMonday(weekStartISO)
    const weekStart = new Date(mondayISO + "T00:00:00Z")

    // Серверный пересбор live-расчёта — единственный источник пейлоада
    const bundle = await loadWeeklyLiveBundle(weekStart)
    if (bundle.data.articles.length === 0) {
      return { ok: false, error: "Нет данных за неделю — фиксировать нечего" }
    }
    const payload = buildWeeklySnapshotPayload(bundle.data, bundle.result, bundle.planFact)

    const fixedById = (await auth())?.user?.id ?? null

    await prisma.weeklyFinReportSnapshot.upsert({
      where: { weekStart },
      create: { weekStart, fixedById, payloadJson: payload as never },
      update: { payloadJson: payload as never, fixedAt: new Date(), fixedById },
    })

    revalidatePath("/finance/weekly")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}

/** W3c: снимает фиксацию недели — удаляет снапшот, страница возвращается в live. */
export async function unfixWeeklyReport(
  weekStartISO: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSection("FINANCE", "MANAGE")

    if (!ISO_DATE_RE.test(weekStartISO)) {
      return { ok: false, error: "Некорректная дата недели" }
    }
    const mondayISO = toIsoMonday(weekStartISO)
    const weekStart = new Date(mondayISO + "T00:00:00Z")

    await prisma.weeklyFinReportSnapshot.deleteMany({ where: { weekStart } })

    revalidatePath("/finance/weekly")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
