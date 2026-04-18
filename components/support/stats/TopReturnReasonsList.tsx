// components/support/stats/TopReturnReasonsList.tsx
// Phase 13 D-03 — топ-10 причин отказов по возвратам (глобально, D-07 без графиков).

export interface TopReturnReasonsListProps {
  reasons: Array<{ reason: string; count: number }>
}

export function TopReturnReasonsList({ reasons }: TopReturnReasonsListProps) {
  if (reasons.length === 0) {
    return (
      <div className="rounded-lg border p-4 text-sm text-muted-foreground">
        Нет отклонённых возвратов за выбранный период
      </div>
    )
  }
  const max = Math.max(...reasons.map((r) => r.count))

  return (
    <section className="rounded-lg border p-4">
      <h3 className="text-sm font-semibold mb-3">Топ причин отказов по возвратам</h3>
      <ul className="space-y-2">
        {reasons.map((r, i) => (
          <li key={i} className="flex items-center gap-3">
            <span className="text-sm flex-1 truncate" title={r.reason}>
              {r.reason}
            </span>
            <div className="flex-[2] relative h-5 bg-muted rounded overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 bg-primary/70"
                style={{ width: `${(r.count / max) * 100}%` }}
              />
            </div>
            <span className="text-xs font-medium w-10 text-right">{r.count}</span>
          </li>
        ))}
      </ul>
    </section>
  )
}
