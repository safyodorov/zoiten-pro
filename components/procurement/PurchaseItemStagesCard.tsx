"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Package } from "lucide-react"
import { toast } from "sonner"
import { savePurchaseItemStages } from "@/app/actions/purchases"

// ── Этапы движения товара по позиции закупки ────────────────────────
// Заказано → Производство → Готов к инспекции → Готов к отгрузке → В пути → Принят.
// Кол-во на каждом этапе по умолчанию = предыдущему, но может быть скорректировано
// (частичная готовность/отгрузка/приёмка) с комментарием.

export const STAGES = [
  { key: "PRODUCTION", label: "Производство" },
  { key: "INSPECTION", label: "Готов к инспекции" },
  { key: "SHIPMENT", label: "Готов к отгрузке" },
  { key: "TRANSIT", label: "В пути" },
  { key: "WAREHOUSE", label: "Принят на складе" },
] as const

export type StageKey = (typeof STAGES)[number]["key"]

export interface ItemStageData {
  itemId: string
  productName: string
  productSku: string
  productPhotoUrl: string | null
  ordered: number
  // по этапам: фактическое введённое значение (если этап достигнут)
  stages: Partial<Record<StageKey, { quantity: number; comment: string }>>
}

interface Props {
  purchaseId: string
  items: ItemStageData[]
  canManage: boolean
}

// Локальное состояние редактора: для каждого этапа qty как строка ("" = не задано)
type Draft = Record<string, Record<StageKey, { qty: string; comment: string }>>

function buildDraft(items: ItemStageData[]): Draft {
  const d: Draft = {}
  for (const it of items) {
    d[it.itemId] = {} as Record<StageKey, { qty: string; comment: string }>
    for (const s of STAGES) {
      const v = it.stages[s.key]
      d[it.itemId][s.key] = {
        qty: v ? String(v.quantity) : "",
        comment: v?.comment ?? "",
      }
    }
  }
  return d
}

// Эффективное (с учётом наследования от предыдущего этапа) значение для placeholder.
function effectiveAt(
  ordered: number,
  cells: Record<StageKey, { qty: string; comment: string }>,
  upTo: StageKey
): number {
  let eff = ordered
  for (const s of STAGES) {
    const raw = cells[s.key].qty.trim()
    if (raw !== "" && !isNaN(Number(raw))) eff = Number(raw)
    if (s.key === upTo) break
  }
  return eff
}

export function PurchaseItemStagesCard({ purchaseId, items, canManage }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => buildDraft(items))
  const [saving, setSaving] = useState(false)

  if (items.length === 0) return null

  function setCell(itemId: string, stage: StageKey, field: "qty" | "comment", value: string) {
    setDraft((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [stage]: { ...prev[itemId][stage], [field]: value },
      },
    }))
  }

  async function save() {
    setSaving(true)
    try {
      const entries: { itemId: string; stage: StageKey; quantity: number; comment: string | null }[] =
        []
      for (const it of items) {
        const cells = draft[it.itemId]
        for (const s of STAGES) {
          const cell = cells[s.key]
          const raw = cell.qty.trim()
          const hasQty = raw !== "" && !isNaN(Number(raw))
          const hasComment = cell.comment.trim() !== ""
          if (!hasQty && !hasComment) continue
          // если задан только комментарий — берём унаследованное эффективное кол-во
          const quantity = hasQty ? Number(raw) : effectiveAt(it.ordered, cells, s.key)
          entries.push({
            itemId: it.itemId,
            stage: s.key,
            quantity,
            comment: hasComment ? cell.comment.trim() : null,
          })
        }
      }
      const res = await savePurchaseItemStages(purchaseId, entries)
      if (res.ok) {
        toast.success("Этапы сохранены")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setSaving(false)
    }
  }

  const cellInput =
    "h-7 w-16 rounded border border-input bg-background px-1.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
  const commentInput =
    "h-6 w-full rounded border border-input bg-background px-1.5 text-[11px] focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"

  return (
    <div className="rounded-lg border">
      <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <h3 className="text-sm font-semibold">Этапы товара</h3>
        {canManage && (
          <Button type="button" size="sm" onClick={save} disabled={saving}>
            {saving ? "Сохранение..." : "Сохранить этапы"}
          </Button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground border-b sticky left-0 bg-background z-10">
                Товар
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground border-b whitespace-nowrap">
                Заказано
              </th>
              {STAGES.map((s) => (
                <th
                  key={s.key}
                  className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground border-b whitespace-nowrap"
                >
                  {s.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {items.map((it) => {
              const cells = draft[it.itemId]
              return (
                <tr key={it.itemId} className="align-top">
                  <td className="px-3 py-2 border-b sticky left-0 bg-background z-10">
                    <div className="flex items-center gap-2 min-w-[180px]">
                      {it.productPhotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={it.productPhotoUrl}
                          alt={it.productName}
                          className="h-10 w-[30px] shrink-0 rounded border object-cover bg-muted"
                        />
                      ) : (
                        <div className="h-10 w-[30px] shrink-0 rounded border bg-muted flex items-center justify-center text-muted-foreground">
                          <Package className="h-4 w-4" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="truncate max-w-[220px]" title={it.productName}>
                          {it.productName}
                        </div>
                        <div className="font-mono text-[11px] text-muted-foreground">
                          {it.productSku}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums border-b font-medium">
                    {it.ordered}
                  </td>
                  {STAGES.map((s) => {
                    const inherited = effectiveAt(it.ordered, cells, s.key)
                    return (
                      <td key={s.key} className="px-2 py-2 border-b">
                        <div className="flex flex-col items-center gap-1">
                          <input
                            type="number"
                            min="0"
                            value={cells[s.key].qty}
                            onChange={(e) => setCell(it.itemId, s.key, "qty", e.target.value)}
                            disabled={!canManage}
                            placeholder={String(inherited)}
                            className={cellInput}
                          />
                          <input
                            type="text"
                            value={cells[s.key].comment}
                            onChange={(e) => setCell(it.itemId, s.key, "comment", e.target.value)}
                            disabled={!canManage}
                            placeholder="коммент."
                            className={commentInput}
                          />
                        </div>
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="px-3 py-2 text-[11px] text-muted-foreground border-t">
        По умолчанию подставляется кол-во с предыдущего этапа (серым). Введите число, если на
        этапе прошла только часть товара, и при необходимости комментарий.
      </p>
    </div>
  )
}
