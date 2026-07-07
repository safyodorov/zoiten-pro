"use client"

// components/sales-plan/PlanVersionBar.tsx
// Бар версий плана: native <select> + «Зафиксировать план» + read-only баннер + дрейф.
// Phase 25 wave 7 (25-08)

import Link from "next/link"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { Lock, Pencil } from "lucide-react"
import { toast } from "sonner"
import { FixPlanVersionDialog } from "./FixPlanVersionDialog"
import { EditPlanVersionDialog } from "./EditPlanVersionDialog"
import type { VersionDriftResult } from "@/lib/sales-plan/plan-fact"

// ── Props ─────────────────────────────────────────────────────────────────────

export interface PlanVersion {
  id: string
  label: string
  note?: string | null
  createdAt: string // ISO-строка (Date сериализован до передачи из RSC)
}

interface PlanVersionBarProps {
  versions: PlanVersion[]
  activeVersionId: string | null
  currentVersionId: string | null // null = черновик
  canManage: boolean
  readOnly: boolean
  /** Дрейф черновика vs активной версии (null если нет активной) */
  drift?: VersionDriftResult | null
}

// ── Форматирование ─────────────────────────────────────────────────────────────

function formatVersionDate(iso: string): string {
  try {
    const d = new Date(iso)
    const dd = String(d.getUTCDate()).padStart(2, "0")
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0")
    const yyyy = String(d.getUTCFullYear())
    return `${dd}.${mm}.${yyyy}`
  } catch {
    return iso.slice(0, 10)
  }
}

function formatDrift(drift: VersionDriftResult): string {
  const sign = drift.driftRub >= 0 ? "+" : ""
  const rubM = Math.abs(drift.driftRub) >= 1_000_000
    ? `${sign}${(drift.driftRub / 1_000_000).toFixed(1)} М ₽`
    : `${sign}${Math.round(drift.driftRub).toLocaleString("ru")} ₽`
  const pct = drift.driftPct != null
    ? ` (${drift.driftPct >= 0 ? "+" : ""}${drift.driftPct.toFixed(1)}%)`
    : ""
  return rubM + pct
}

// ── Component ─────────────────────────────────────────────────────────────────

export function PlanVersionBar({
  versions,
  activeVersionId: _activeVersionId,
  currentVersionId,
  canManage,
  readOnly,
  drift,
}: PlanVersionBarProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [, startTransition] = useTransition()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<PlanVersion | null>(null)

  const isDraft = !currentVersionId

  // Метка текущей версии (для баннера)
  const currentVersion = currentVersionId
    ? versions.find((v) => v.id === currentVersionId)
    : null

  // Изменение версии в select → URL
  function handleSelectChange(value: string) {
    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value === "draft") {
        params.delete("version")
      } else {
        params.set("version", value)
      }
      router.push(`${pathname}?${params.toString()}`)
    })
  }

  const hasDrift = drift != null && Math.abs(drift.driftRub) > 1

  return (
    <div className="flex flex-col gap-2">
      {/* Строка с селектором + кнопкой фиксации */}
      <div className="flex items-center gap-2 flex-wrap">
        <label className="text-xs text-muted-foreground shrink-0">Версия:</label>

        {/* native <select> версий — CLAUDE.md: НЕ base-ui Select */}
        <select
          value={currentVersionId ?? "draft"}
          onChange={(e) => handleSelectChange(e.target.value)}
          className="text-sm border rounded px-2 py-1 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
        >
          <option value="draft">Рабочий план (черновик)</option>
          {versions.map((v) => (
            <option key={v.id} value={v.id} title={v.note ?? undefined}>
              {v.label} — {formatVersionDate(v.createdAt)}
            </option>
          ))}
        </select>

        {/* «Изменить» — название и комментарий выбранной сохранённой версии */}
        {canManage && currentVersion && (
          <button
            type="button"
            onClick={() => setEditing(currentVersion)}
            className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium border rounded bg-background hover:bg-muted transition-colors"
            title="Изменить название и комментарий плана"
          >
            <Pencil size={13} />
            Изменить
          </button>
        )}

        {/* Кнопка «Зафиксировать план» — только canManage + черновик */}
        {canManage && isDraft && (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1 text-sm font-medium border rounded bg-background hover:bg-muted transition-colors"
          >
            <Lock size={14} />
            Зафиксировать план
          </button>
        )}

        {/* Дрейф черновика vs активной версии */}
        {isDraft && hasDrift && (
          <span
            className={[
              "text-xs px-2 py-0.5 rounded",
              drift!.driftRub >= 0
                ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-400"
                : "bg-red-50 text-red-700 dark:bg-red-950/20 dark:text-red-400",
            ].join(" ")}
            title="Дрейф черновика vs активной версии (разница плана выкупов ₽)"
          >
            Дрейф: {formatDrift(drift!)}
          </span>
        )}
      </div>

      {/* Amber-баннер при просмотре версии */}
      {!isDraft && currentVersion && (
        <div className="flex items-center gap-2 px-3 py-2 rounded bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-800 dark:text-amber-300">
          <span>
            Просмотр версии{" "}
            <span
              className={currentVersion.note ? "font-medium cursor-help underline decoration-dotted underline-offset-2" : "font-medium"}
              title={currentVersion.note ?? undefined}
            >
              «{currentVersion.label}»
            </span>
            {currentVersion.note ? " 💬" : ""}. Редактирование плана недоступно.
          </span>
          <Link
            href={pathname.replace(/\?.*$/, "")}
            className="underline underline-offset-2 hover:no-underline shrink-0"
          >
            Вернуться к рабочему плану
          </Link>
        </div>
      )}

      {/* Диалог фиксации */}
      <FixPlanVersionDialog
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        vpCount={0 /* передаётся из page при необходимости */}
        productCount={0}
        horizon="01.07.2026–31.12.2026"
      />

      {/* Диалог редактирования метаданных версии */}
      {editing && (
        <EditPlanVersionDialog
          key={editing.id}
          versionId={editing.id}
          initialLabel={editing.label}
          initialNote={editing.note ?? null}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
