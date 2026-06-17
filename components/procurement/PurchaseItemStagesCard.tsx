"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Package } from "lucide-react"
import { toast } from "sonner"
import { savePurchaseItemStages } from "@/app/actions/purchases"
import {
  STAGE_ORDER,
  STAGE_LABELS,
  STAGE_FILL_CLASS,
  BASELINE_LABEL,
  stageIndex,
  type StageKey,
} from "@/lib/purchase-stages"

// Реэкспорт для обратной совместимости с [id]/page.tsx
export type { StageKey } from "@/lib/purchase-stages"

export interface ItemStageData {
  itemId: string
  productName: string
  productSku: string
  productPhotoUrl: string | null
  ordered: number
  // по этапам: фактическое введённое значение (если этап достигнут)
  stages: Partial<Record<StageKey, { quantity: number; comment: string; date: string | null }>>
}

interface Props {
  purchaseId: string
  items: ItemStageData[]
  canManage: boolean
}

// Локальное состояние редактора: для каждого этапа qty как строка ("" = не задано)
type Draft = Record<string, Record<StageKey, { qty: string; comment: string; date: string }>>

function buildDraft(items: ItemStageData[]): Draft {
  const d: Draft = {}
  for (const it of items) {
    d[it.itemId] = {} as Record<StageKey, { qty: string; comment: string; date: string }>
    for (const key of STAGE_ORDER) {
      const v = it.stages[key]
      d[it.itemId][key] = {
        qty: v ? String(v.quantity) : "",
        comment: v?.comment ?? "",
        date: v?.date ?? "",
      }
    }
  }
  return d
}

// Сегодня в Moscow tz как yyyy-mm-dd для <input type="date">.
// en-CA даёт YYYY-MM-DD; timeZone сдвигает на МСК.
function todayMoscow(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Moscow" })
}

// Эффективное (с учётом наследования от предыдущего этапа) значение для placeholder.
// Семантика сохранена: идём по STAGE_ORDER; берём последнее заданное qty до и включая upTo;
// иначе ordered.
function effectiveAt(
  ordered: number,
  cells: Record<StageKey, { qty: string; comment: string; date: string }>,
  upTo: StageKey
): number {
  let eff = ordered
  for (const key of STAGE_ORDER) {
    const raw = cells[key].qty.trim()
    if (raw !== "" && !isNaN(Number(raw))) eff = Number(raw)
    if (key === upTo) break
  }
  return eff
}

// Самый дальний этап с заданным qty в draft для конкретной позиции.
function farthestReachedKey(
  cells: Record<StageKey, { qty: string; comment: string; date: string }>
): StageKey | null {
  let best: StageKey | null = null
  let bestIdx = -1
  for (const key of STAGE_ORDER) {
    const raw = cells[key].qty.trim()
    if (raw !== "" && !isNaN(Number(raw))) {
      const idx = stageIndex(key)
      if (idx > bestIdx) {
        bestIdx = idx
        best = key
      }
    }
  }
  return best
}

export function PurchaseItemStagesCard({ purchaseId, items, canManage }: Props) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => buildDraft(items))
  // Текущий выбранный (активный) этап per позиция (null = Заказано)
  const [activeStage, setActiveStage] = useState<Record<string, StageKey | null>>(() => {
    const m: Record<string, StageKey | null> = {}
    for (const it of items) {
      const cells = {} as Record<StageKey, { qty: string; comment: string; date: string }>
      for (const key of STAGE_ORDER) {
        const v = it.stages[key]
        cells[key] = { qty: v ? String(v.quantity) : "", comment: v?.comment ?? "", date: v?.date ?? "" }
      }
      m[it.itemId] = farthestReachedKey(cells)
    }
    return m
  })
  const [saving, setSaving] = useState(false)

  if (items.length === 0) return null

  function setCell(itemId: string, stage: StageKey, field: "qty" | "comment" | "date", value: string) {
    setDraft((prev) => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [stage]: { ...prev[itemId][stage], [field]: value },
      },
    }))
  }

  // Клик по сегменту stepper'а: делает его текущим достигнутым.
  // Автозаполняет qty по цепочке (наследованное значение), очищает более поздние.
  // Проставляет date=сегодня (МСК) для всех этапов ≤ кликнутого где date пустая.
  function handleStageClick(itemId: string, clickedKey: StageKey) {
    if (!canManage) return
    const it = items.find((x) => x.itemId === itemId)
    if (!it) return
    const clickedIdx = stageIndex(clickedKey)
    const prevCells = draft[itemId]

    // Вычислим унаследованные кол-ва для всех этапов до кликнутого (включительно).
    // Для этапов после кликнутого — очистить qty и date.
    const newCells = { ...prevCells }
    for (const key of STAGE_ORDER) {
      const idx = stageIndex(key)
      if (idx <= clickedIdx) {
        // Если qty пустой — заполнить унаследованным значением (effectiveAt до данного этапа)
        const rawQty = newCells[key].qty.trim()
        if (rawQty === "" || isNaN(Number(rawQty))) {
          const eff = effectiveAt(it.ordered, prevCells, key)
          newCells[key] = { ...newCells[key], qty: String(eff) }
        }
        // Если date пустая — проставить сегодня (МСК)
        if (!newCells[key].date) {
          newCells[key] = { ...newCells[key], date: todayMoscow() }
        }
      } else {
        // Этапы после кликнутого — очистить qty, date И комментарий
        // (иначе оставшийся комментарий «воскрешал» этап при сохранении).
        newCells[key] = { ...newCells[key], qty: "", date: "", comment: "" }
      }
    }

    setDraft((prev) => ({ ...prev, [itemId]: newCells }))
    setActiveStage((prev) => ({ ...prev, [itemId]: clickedKey }))
  }

  async function save() {
    setSaving(true)
    try {
      const entries: {
        itemId: string
        stage: StageKey
        quantity: number
        comment: string | null
        date: string | null
      }[] = []
      for (const it of items) {
        const cells = draft[it.itemId]
        for (const key of STAGE_ORDER) {
          const cell = cells[key]
          const raw = cell.qty.trim()
          const hasQty = raw !== "" && !isNaN(Number(raw))
          // Этап считается достигнутым ТОЛЬКО при заданном кол-ве. Комментарий —
          // метаданные достигнутого этапа (вводится лишь для активного этапа),
          // сам по себе этап не создаёт — иначе откат не сохранялся бы.
          if (!hasQty) continue
          entries.push({
            itemId: it.itemId,
            stage: key,
            quantity: Number(raw),
            comment: cell.comment.trim() || null,
            date: cell.date.trim() || null,
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
    "h-7 w-20 rounded border border-input bg-background px-1.5 text-xs text-right tabular-nums focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
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

      <div className="divide-y">
        {items.map((it) => {
          const cells = draft[it.itemId]
          const curKey = activeStage[it.itemId] ?? farthestReachedKey(cells)
          const curIdx = curKey ? stageIndex(curKey) : -1

          return (
            <div key={it.itemId} className="p-3 space-y-3">
              {/* Шапка позиции: фото + название + SKU + Заказано */}
              <div className="flex items-center gap-3">
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
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium" title={it.productName}>
                    {it.productName}
                  </div>
                  <div className="font-mono text-[11px] text-muted-foreground">{it.productSku}</div>
                </div>
                <div className="text-xs text-muted-foreground whitespace-nowrap shrink-0">
                  {BASELINE_LABEL}: <span className="font-semibold tabular-nums">{it.ordered}</span>
                </div>
              </div>

              {/* Горизонтальный stepper */}
              <div className="flex items-center gap-0 w-full select-none">
                {STAGE_ORDER.map((key, idx) => {
                  const isReached = stageIndex(key) <= curIdx && curIdx >= 0
                  const isCurrent = key === curKey
                  const isLast = idx === STAGE_ORDER.length - 1

                  return (
                    <div key={key} className="flex items-center flex-1 min-w-0">
                      {/* Сегмент */}
                      <button
                        type="button"
                        title={STAGE_LABELS[key]}
                        disabled={!canManage}
                        onClick={() => handleStageClick(it.itemId, key)}
                        className={[
                          "flex-1 min-w-0 flex flex-col items-center justify-center py-2 px-1 rounded-md text-[10px] font-medium transition-colors",
                          "disabled:cursor-default",
                          isReached
                            ? `${STAGE_FILL_CLASS[key]} text-white`
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                          isCurrent ? "ring-2 ring-primary ring-offset-1" : "",
                          canManage && !isReached ? "cursor-pointer" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span className="leading-tight text-center line-clamp-2 w-full">
                          {STAGE_LABELS[key]}
                        </span>
                        {isReached && (
                          <span className="mt-0.5 text-[9px] leading-none opacity-90 text-center">
                            {cells[key].date
                              ? cells[key].date.split("-").reverse().join(".")
                              : "—"}
                            {" · "}
                            {cells[key].qty || effectiveAt(it.ordered, cells, key)} шт
                          </span>
                        )}
                      </button>
                      {/* Соединительная линия между сегментами */}
                      {!isLast && (
                        <div
                          className={`h-0.5 w-2 shrink-0 ${
                            stageIndex(key) < curIdx && curIdx >= 0
                              ? STAGE_FILL_CLASS[STAGE_ORDER[idx + 1]]
                              : "bg-muted"
                          }`}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Поля для текущего (самого дальнего) этапа */}
              {curKey && (
                <div className="flex items-start gap-3 pt-1">
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted-foreground font-medium">
                      Кол-во ({STAGE_LABELS[curKey]})
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={cells[curKey].qty}
                      onChange={(e) => setCell(it.itemId, curKey, "qty", e.target.value)}
                      disabled={!canManage}
                      placeholder={String(effectiveAt(it.ordered, cells, curKey))}
                      className={cellInput}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Дата</label>
                    <input
                      type="date"
                      value={cells[curKey].date}
                      onChange={(e) => setCell(it.itemId, curKey, "date", e.target.value)}
                      disabled={!canManage}
                      className="h-7 rounded border border-input bg-background px-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-60"
                    />
                  </div>
                  <div className="flex flex-col gap-1 flex-1">
                    <label className="text-[11px] text-muted-foreground font-medium">Комментарий</label>
                    <input
                      type="text"
                      value={cells[curKey].comment}
                      onChange={(e) => setCell(it.itemId, curKey, "comment", e.target.value)}
                      disabled={!canManage}
                      placeholder="необязательно"
                      className={commentInput}
                    />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      <p className="px-3 py-2 text-[11px] text-muted-foreground border-t">
        Кликните по этапу, чтобы отметить его достигнутым — кол-во подставится с предыдущего.
        Дата этапа ставится сегодняшней при клике — измените при необходимости.
        Скорректируйте кол-во для частичной партии и при необходимости добавьте комментарий.
      </p>
    </div>
  )
}
