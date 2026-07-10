// app/api/cron/wb-realization-weekly/route.ts
// W1 (quick 260710-jgs): еженедельный cron импорта отчёта реализации WB.
// Дёргается dispatcher'ом ЕЖЕДНЕВНО в wbRealizationWeeklyCronTime (05:50 МСК),
// Tuesday-guard внутри: работает только во вторник МСК (отчёт закрытой недели
// появляется у WB в понедельник; вторник = буфер на формирование).
// ?week=YYYY-MM-DD — ручной backfill произвольной недели (обходит Tuesday-guard).
// lastRun обновляется ТОЛЬКО при успехе → упавший вторничный запуск НЕ ретраится
// автоматически для той недели — восстановление кнопкой «Реализация WB» или ?week.
// Защищён x-cron-secret. Образец: wb-sales-daily.

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getMskTodayString } from "@/lib/wb-cron-schedule"
import { syncRealizationWeek } from "@/lib/wb-realization-sync"

export const runtime = "nodejs"
export const maxDuration = 600

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

/** Нормализует произвольную ISO-дату к её ISO-понедельнику (UTC). */
function toIsoMonday(iso: string): string {
  const d = new Date(iso + "T00:00:00Z")
  const jsDay = d.getUTCDay() // 0=вс, 1=пн
  const isoDay = jsDay === 0 ? 7 : jsDay
  d.setUTCDate(d.getUTCDate() - (isoDay - 1))
  return d.toISOString().slice(0, 10)
}

/** ISO-понедельник ПРОШЛОЙ недели: понедельник текущей MSK-недели − 7 дней. */
function previousIsoMondayMsk(): string {
  const mskIso = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10)
  const d = new Date(toIsoMonday(mskIso) + "T00:00:00Z")
  d.setUTCDate(d.getUTCDate() - 7)
  return d.toISOString().slice(0, 10)
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get("x-cron-secret") !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  const url = new URL(req.url)
  const weekParam = url.searchParams.get("week")
  const weekOverride =
    weekParam && ISO_DATE_RE.test(weekParam) ? toIsoMonday(weekParam) : null

  // Tuesday-guard (MSK-день недели): dispatcher дёргает ежедневно, работаем
  // только во вторник. Ручной ?week-backfill обходит guard. skipped БЕЗ
  // обновления lastRun — в прочие дни ответ no-op.
  const mskDay = new Date(Date.now() + 3 * 3600_000).getUTCDay() // 2 = вторник
  if (!weekOverride && mskDay !== 2) {
    return NextResponse.json({ ok: true, skipped: "not-tuesday" })
  }

  const week = weekOverride ?? previousIsoMondayMsk()

  try {
    console.log(`[wb-realization-weekly cron] start week=${week}`)
    const result = await syncRealizationWeek(new Date(week + "T00:00:00Z"))

    // lastRun ТОЛЬКО при успехе (упавший запуск не помечается выполненным)
    const todayStr = getMskTodayString()
    await prisma.appSetting.upsert({
      where: { key: "wbRealizationWeeklyLastRun" },
      create: { key: "wbRealizationWeeklyLastRun", value: todayStr },
      update: { value: todayStr },
    })

    console.log(
      `[wb-realization-weekly cron] done reports=${result.reports} rows=${result.rows} written=${result.written}`,
    )
    return NextResponse.json({ ok: true, week, ...result })
  } catch (err) {
    console.error("[wb-realization-weekly cron] error:", err)
    return NextResponse.json(
      { ok: false, error: (err as Error).message },
      { status: 500 },
    )
  }
}
