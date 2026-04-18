// app/api/cron/support-stats-refresh/route.ts
// Phase 13 — cron endpoint для обновления ManagerSupportStats (SUP-39).
// Systemd timer вызывает GET раз в сутки в 03:00 МСК (D-08).
// Upsert per user с sectionRoles SUPPORT по @@unique([userId, period]).

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { computeManagerStatsForPeriod } from "@/lib/support-stats"
import { startOfMonthMsk } from "@/lib/date-periods"

export const runtime = "nodejs"
export const maxDuration = 300

export async function GET(req: NextRequest): Promise<NextResponse> {
  const secret = req.headers.get("x-cron-secret")
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Не авторизован" }, { status: 401 })
  }

  try {
    const monthStart = startOfMonthMsk(new Date())
    const monthEnd = new Date()

    const users = await prisma.user.findMany({
      where: {
        isActive: true,
        sectionRoles: { some: { section: "SUPPORT" } },
      },
      select: { id: true },
    })

    const errors: Array<{ userId: string; error: string }> = []
    let upsertedCount = 0

    for (const user of users) {
      try {
        const stats = await computeManagerStatsForPeriod(user.id, monthStart, monthEnd)
        await prisma.managerSupportStats.upsert({
          where: { userId_period: { userId: user.id, period: monthStart } },
          create: {
            userId: user.id,
            period: monthStart,
            ...stats,
          },
          update: {
            ...stats,
          },
        })
        upsertedCount++
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error"
        errors.push({ userId: user.id, error: msg })
        console.error(`[support-stats-refresh] user=${user.id}:`, msg)
      }
    }

    return NextResponse.json({
      ok: true,
      usersProcessed: upsertedCount,
      usersTotal: users.length,
      period: monthStart.toISOString(),
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка cron"
    console.error("[support-stats-refresh] fatal:", msg)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
