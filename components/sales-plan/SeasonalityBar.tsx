"use client"

// components/sales-plan/SeasonalityBar.tsx
// Панель индекса сезонности над таблицей «Товары» (/sales-plan/products).
// Scope: Глобально / Направление / Категория / Подкатегория. Месяцы горизонта:
// текущий = 100% (якорь), будущие редактируются (%). Значения — эффективные
// (нормированы на текущий месяц); сохранение debounced → saveSeasonalityIndex.
// Quick 260706-q5a.

import { useState, useRef, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RotateCcw } from "lucide-react"
import { saveSeasonalityIndex, resetSeasonality } from "@/app/actions/sales-plan"
import { cn } from "@/lib/utils"

type Scope = "GLOBAL" | "DIRECTION" | "CATEGORY" | "SUBCATEGORY"
interface Named { id: string; name: string }
interface Row { scope: string; scopeId: string | null; month: string; indexPct: number }

interface Props {
  directions: Named[]
  categories: Named[]
  subcategories: Named[]
  months: string[] // ISO "YYYY-MM-01" (горизонт)
  currentMonth: string // ISO "YYYY-MM-01"
  rows: Row[] // stored (черновик или версия)
  readOnly: boolean
}

const MONTH_RU = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"]
function monthLabel(iso: string): string {
  return `${MONTH_RU[Number(iso.slice(5, 7)) - 1]} ${iso.slice(2, 4)}`
}
function keyOf(scope: string, scopeId: string | null): string {
  return `${scope}|${scopeId ?? ""}`
}

const SCOPE_OPTIONS: { value: Scope; label: string }[] = [
  { value: "GLOBAL", label: "Глобально" },
  { value: "DIRECTION", label: "Направление" },
  { value: "CATEGORY", label: "Категория" },
  { value: "SUBCATEGORY", label: "Подкатегория" },
]

const SELECT_CLS =
  "rounded border bg-background px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-ring"

export function SeasonalityBar({
  directions, categories, subcategories, months, currentMonth, rows, readOnly,
}: Props) {
  const router = useRouter()
  const [isPending, start] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Группировка stored по scope
  const grouped = new Map<string, Map<string, number>>()
  for (const r of rows) {
    const k = keyOf(r.scope, r.scopeId)
    let inner = grouped.get(k)
    if (!inner) { inner = new Map(); grouped.set(k, inner) }
    inner.set(r.month, r.indexPct)
  }

  const anchorInHorizon = months.includes(currentMonth)
  const futureMonths = months.filter((m) => m > currentMonth)

  // Эффективная кривая для scope (нормировка на текущий месяц)
  function effectiveFor(scope: Scope, scopeId: string | null): Record<string, number> {
    const curve = grouped.get(keyOf(scope, scopeId)) ?? new Map<string, number>()
    const divisor = curve.get(currentMonth) ?? 100
    const out: Record<string, number> = {}
    for (const m of futureMonths) {
      const stored = curve.get(m) ?? 100
      out[m] = divisor ? Math.round((stored / divisor) * 100) : 100
    }
    return out
  }

  const [scope, setScope] = useState<Scope>("GLOBAL")
  const [scopeId, setScopeId] = useState<string | null>(null)
  const [values, setValues] = useState<Record<string, number>>(() => effectiveFor("GLOBAL", null))

  function selectScope(nextScope: Scope, nextId: string | null) {
    setScope(nextScope)
    setScopeId(nextId)
    setValues(effectiveFor(nextScope, nextId))
  }

  function scopeItems(): Named[] {
    return scope === "DIRECTION" ? directions
      : scope === "CATEGORY" ? categories
      : scope === "SUBCATEGORY" ? subcategories
      : []
  }

  const canEdit = !readOnly && (scope === "GLOBAL" || Boolean(scopeId))

  function doSave(next: Record<string, number>) {
    if (scope !== "GLOBAL" && !scopeId) return
    const monthValues: Record<string, number> = { [currentMonth]: 100 }
    for (const m of futureMonths) monthValues[m] = next[m] ?? 100
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      start(async () => {
        const res = await saveSeasonalityIndex({ scope, scopeId, monthValues })
        if (!res.ok) toast.error(res.error)
        else router.refresh()
      })
    }, 600)
  }

  function onInput(m: string, raw: string) {
    const v = raw === "" ? 100 : Math.max(1, Math.min(1000, Math.round(Number(raw) || 0)))
    const next = { ...values, [m]: v }
    setValues(next)
    doSave(next)
  }

  function resetAll() {
    start(async () => {
      const res = await resetSeasonality()
      if (!res.ok) toast.error(res.error)
      else { toast.success("Индексы сброшены"); selectScope(scope, scopeId); router.refresh() }
    })
  }
  function resetScope(s: Scope, id: string | null) {
    start(async () => {
      const res = await resetSeasonality({ scope: s, scopeId: id })
      if (!res.ok) toast.error(res.error)
      else { if (s === scope && id === scopeId) setValues(effectiveFor(s, id)); router.refresh() }
    })
  }

  function nameFor(s: string, id: string | null): string {
    if (s === "GLOBAL") return "Глобально"
    const list = s === "DIRECTION" ? directions : s === "CATEGORY" ? categories : subcategories
    return list.find((x) => x.id === id)?.name ?? "—"
  }

  const activeKeys = [...grouped.keys()]

  return (
    <div className="rounded-md border bg-card px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2">
      <span className="text-sm font-medium whitespace-nowrap">Сезонность</span>

      {/* Выбор области */}
      <div className="flex items-center gap-2">
        <select
          value={scope}
          disabled={readOnly}
          onChange={(e) => selectScope(e.target.value as Scope, null)}
          className={SELECT_CLS}
        >
          {SCOPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {scope !== "GLOBAL" && (
          <select
            value={scopeId ?? ""}
            disabled={readOnly}
            onChange={(e) => selectScope(scope, e.target.value || null)}
            className={SELECT_CLS}
          >
            <option value="">— выберите —</option>
            {scopeItems().map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}
          </select>
        )}
      </div>

      {/* Инпуты по месяцам */}
      <div className="flex items-end gap-1.5">
        {anchorInHorizon && (
          <div className="flex flex-col items-center">
            <span className="text-[10px] text-muted-foreground">{monthLabel(currentMonth)}</span>
            <input
              value="100"
              disabled
              title="текущий месяц — 100% (якорь)"
              className="w-14 rounded border bg-muted/40 px-1 py-0.5 text-center text-sm tabular-nums text-muted-foreground"
            />
          </div>
        )}
        {futureMonths.map((m) => (
          <div key={m} className="flex flex-col items-center">
            <span className="text-[10px] text-muted-foreground">{monthLabel(m)}</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={values[m] ?? 100}
              disabled={!canEdit}
              onChange={(e) => onInput(m, e.target.value)}
              className={cn(
                "w-14 rounded border bg-background px-1 py-0.5 text-center text-sm tabular-nums focus:outline-none focus:ring-1 focus:ring-ring",
                (values[m] ?? 100) !== 100 && "border-primary/50 font-medium",
              )}
            />
          </div>
        ))}
        <span className="text-xs text-muted-foreground pb-1">%</span>
      </div>

      {/* Активные наборы */}
      {activeKeys.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-xs text-muted-foreground">Активны:</span>
          {activeKeys.map((k) => {
            const idx = k.indexOf("|")
            const s = k.slice(0, idx)
            const id = k.slice(idx + 1) || null
            const selected = s === scope && id === scopeId
            return (
              <span
                key={k}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs",
                  selected ? "border-primary bg-primary/10" : "bg-muted/40",
                )}
              >
                <button type="button" onClick={() => selectScope(s as Scope, id)} className="hover:underline">
                  {nameFor(s, id)}
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => resetScope(s as Scope, id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Сбросить этот набор"
                  >
                    ×
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* Правая зона */}
      <div className="flex items-center gap-3 ml-auto">
        {isPending && <span className="text-xs text-muted-foreground">сохранение…</span>}
        {readOnly && <span className="text-xs text-muted-foreground">только просмотр</span>}
        {!readOnly && activeKeys.length > 0 && (
          <button
            type="button"
            onClick={resetAll}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Сбросить индексы
          </button>
        )}
      </div>
    </div>
  )
}
