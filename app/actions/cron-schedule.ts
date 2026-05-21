"use server"
// app/actions/cron-schedule.ts
// 2026-05-15 (quick 260515-o4o): server actions для UI настройки cron расписаний.
// /admin/settings → таб «Расписание» (SUPERADMIN only).
//
// CRITICAL: requireSuperadmin() возвращает Promise<void> — НЕ присваивать в const session.
// updatedBy в AppSetting опциональное — не пишем (избегаем auth() chain).

import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireSuperadmin } from "@/lib/rbac"
import { revalidatePath } from "next/cache"
import { isValidCronHHMM } from "@/lib/wb-cron-schedule"

const HHMM_SCHEMA = z
  .string()
  .refine(isValidCronHHMM, "Формат HH:MM с шагом 5 минут (например 05:10)")

const CRON_KEYS = [
  "wbOrdersDailyCronTime",
  "wbPricesDailyCronTime",
  "wbCardsRefreshCronTime",
] as const
export type CronKey = (typeof CRON_KEYS)[number]

export interface CronSchedule {
  ordersTime: string
  pricesTime: string
  cardsRefreshTime: string
  ordersLastRun: string | null
  pricesLastRun: string | null
  cardsRefreshLastRun: string | null
}

export async function getCronSchedule(): Promise<CronSchedule> {
  // RSC page уже requireSuperadmin, но защитимся ещё раз.
  await requireSuperadmin()
  const rows = await prisma.appSetting.findMany({
    where: {
      key: {
        in: [
          "wbOrdersDailyCronTime",
          "wbPricesDailyCronTime",
          "wbCardsRefreshCronTime",
          "wbOrdersDailyLastRun",
          "wbPricesDailyLastRun",
          "wbCardsRefreshLastRun",
        ],
      },
    },
  })
  const m = Object.fromEntries(rows.map((r) => [r.key, r.value]))
  return {
    ordersTime: m.wbOrdersDailyCronTime ?? "05:00",
    pricesTime: m.wbPricesDailyCronTime ?? "05:10",
    cardsRefreshTime: m.wbCardsRefreshCronTime ?? "05:30",
    ordersLastRun: m.wbOrdersDailyLastRun ?? null,
    pricesLastRun: m.wbPricesDailyLastRun ?? null,
    cardsRefreshLastRun: m.wbCardsRefreshLastRun ?? null,
  }
}

export async function updateCronSchedule(
  key: CronKey,
  hhmm: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await requireSuperadmin() // returns Promise<void> — НЕ присваивать
    if (!CRON_KEYS.includes(key)) {
      return { ok: false, error: "Неизвестный ключ расписания" }
    }
    const parsed = HHMM_SCHEMA.safeParse(hhmm)
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Невалидный формат",
      }
    }
    // updatedBy опциональное — пропускаем (auth() chain не нужен).
    await prisma.appSetting.upsert({
      where: { key },
      create: { key, value: parsed.data },
      update: { value: parsed.data },
    })
    revalidatePath("/admin/settings")
    return { ok: true }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  }
}
