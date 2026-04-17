// POST /api/support-sync — ручная синхронизация WB Feedbacks+Questions+Returns.
// Требует SUPPORT + MANAGE. Делегирует в lib/support-sync.ts.
// Phase 9: расширен вызовом syncReturns() — backward-compatible response shape.

import { NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import { syncSupport, syncReturns } from "@/lib/support-sync"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(): Promise<NextResponse> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const supportResult = await syncSupport({ isAnswered: false })
    const returnsResult = await syncReturns()

    // Backward-compatible response shape:
    // - spread supportResult на top-level → старые поля
    //   (feedbacksSynced, questionsSynced, mediaSaved) продолжают читаться
    //   клиентом SupportSyncButton.tsx Phase 8 без изменений.
    // - добавляем объединённый `synced` (support + returns) для общего summary.
    // - вложенные support/returns объекты для новых клиентов.
    // - errors union — ошибки обоих sync собираются в один массив.
    return NextResponse.json({
      ok: true,
      ...supportResult,
      synced:
        supportResult.feedbacksSynced +
        supportResult.questionsSynced +
        returnsResult.synced,
      support: supportResult,
      returns: returnsResult,
      errors: [...supportResult.errors, ...returnsResult.errors],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка синхронизации"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
