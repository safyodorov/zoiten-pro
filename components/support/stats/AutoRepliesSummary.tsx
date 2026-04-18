// components/support/stats/AutoRepliesSummary.tsx
// Phase 13 D-02 — глобальный счётчик автоответов (не per-manager).

import { Bot } from "lucide-react"

export interface AutoRepliesSummaryProps {
  count: number
}

export function AutoRepliesSummary({ count }: AutoRepliesSummaryProps) {
  return (
    <div className="rounded-lg border p-4 flex items-center gap-3">
      <div className="rounded-full bg-muted p-2">
        <Bot className="h-5 w-5 text-muted-foreground" />
      </div>
      <div>
        <div className="text-2xl font-semibold">{count}</div>
        <div className="text-xs text-muted-foreground">Автоответов за период</div>
      </div>
    </div>
  )
}
