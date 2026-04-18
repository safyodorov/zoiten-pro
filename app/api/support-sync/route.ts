// POST /api/support-sync — ручная синхронизация WB Feedbacks+Questions+Returns+Chat+AutoReply.
// Требует SUPPORT + MANAGE. Делегирует в lib/support-sync.ts + lib/auto-reply.ts.
// Phase 9: расширен вызовом syncReturns().
// Phase 10: расширен вызовом syncChats() + runAutoReplies() — backward-compat response shape.

import { NextResponse } from "next/server"
import { requireSection } from "@/lib/rbac"
import { syncSupport, syncReturns, syncChats } from "@/lib/support-sync"
import { runAutoReplies } from "@/lib/auto-reply"

export const runtime = "nodejs"
export const maxDuration = 300

export async function POST(): Promise<NextResponse> {
  try {
    await requireSection("SUPPORT", "MANAGE")
    const supportResult = await syncSupport({ isAnswered: false })
    const returnsResult = await syncReturns()

    // Phase 10: chat + autoReply — партийное падение не ломает 200.
    // Если WB Chat API возвращает 403 (нет scope bit 9) или network error,
    // возвращаем graceful fallback с errors, чтобы feedbacks/questions/returns
    // результаты не терялись.
    let chatResult
    try {
      chatResult = await syncChats()
    } catch (err) {
      chatResult = {
        newChats: 0,
        newMessages: 0,
        mediaDownloaded: 0,
        errors: [err instanceof Error ? err.message : "syncChats failure"],
      }
    }
    let autoReplyResult
    try {
      autoReplyResult = await runAutoReplies()
    } catch (err) {
      autoReplyResult = {
        sent: 0,
        skipped: 0,
        errors: [err instanceof Error ? err.message : "runAutoReplies failure"],
      }
    }

    // Backward-compatible response shape:
    // - spread supportResult на top-level → старые поля
    //   (feedbacksSynced, questionsSynced, mediaSaved) продолжают читаться
    //   клиентом SupportSyncButton.tsx Phase 8 без изменений.
    // - добавляем объединённый `synced` (support + returns + chat) для общего summary.
    // - вложенные support/returns/chat/autoReply объекты для новых клиентов.
    // - errors union — ошибки всех sync собираются в один массив.
    return NextResponse.json({
      ok: true,
      ...supportResult,
      synced:
        supportResult.feedbacksSynced +
        supportResult.questionsSynced +
        returnsResult.synced +
        chatResult.newChats +
        chatResult.newMessages,
      support: supportResult,
      returns: returnsResult,
      chat: chatResult,
      autoReply: autoReplyResult,
      errors: [
        ...supportResult.errors,
        ...returnsResult.errors,
        ...chatResult.errors,
        ...autoReplyResult.errors,
      ],
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Ошибка синхронизации"
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
