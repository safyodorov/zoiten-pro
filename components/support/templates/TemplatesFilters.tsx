"use client"

// components/support/templates/TemplatesFilters.tsx
// Фильтры страницы /support/templates:
// — MultiSelectDropdown «Канал» (FEEDBACK/QUESTION/CHAT),
// — native <select> «Активность» (all/active/inactive),
// — debounced поисковый input (по name/text/situationTag).
// Синхронизация состояния через URLSearchParams + router.push (паттерн SupportFilters).

import { useCallback, useEffect, useState } from "react"
import { useRouter, usePathname, useSearchParams } from "next/navigation"
import { Button } from "@/components/ui/button"
import { MultiSelectDropdown } from "@/components/ui/multi-select-dropdown"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const CHANNEL_OPTIONS = [
  { id: "FEEDBACK", name: "Отзыв" },
  { id: "QUESTION", name: "Вопрос" },
  { id: "CHAT", name: "Чат" },
]

export function TemplatesFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const channels = (sp.get("channel") ?? "").split(",").filter(Boolean)
  const active = sp.get("active") ?? "all"
  const qFromUrl = sp.get("q") ?? ""

  const [qLocal, setQLocal] = useState(qFromUrl)

  // Sync local → URL when URL changes externally (e.g. сброс).
  useEffect(() => {
    setQLocal(qFromUrl)
  }, [qFromUrl])

  const updateParam = useCallback(
    (key: string, value: string | null) => {
      const next = new URLSearchParams(sp.toString())
      if (!value) next.delete(key)
      else next.set(key, value)
      router.push(`${pathname}?${next.toString()}`)
    },
    [sp, pathname, router]
  )

  // Debounce search input → URL.
  useEffect(() => {
    if (qLocal === qFromUrl) return
    const t = setTimeout(() => {
      updateParam("q", qLocal || null)
    }, 350)
    return () => clearTimeout(t)
  }, [qLocal, qFromUrl, updateParam])

  const hasFilters = channels.length > 0 || active !== "all" || qFromUrl.length > 0

  return (
    <div className="flex flex-wrap items-center gap-2">
      <MultiSelectDropdown
        label="Канал"
        options={CHANNEL_OPTIONS}
        selected={channels}
        onChange={(v) => updateParam("channel", v.join(",") || null)}
      />
      <select
        value={active}
        onChange={(e) => updateParam("active", e.target.value === "all" ? null : e.target.value)}
        className={cn(
          "flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        )}
      >
        <option value="all">Все</option>
        <option value="active">Только активные</option>
        <option value="inactive">Только неактивные</option>
      </select>
      <input
        type="text"
        placeholder="Поиск по названию, тексту, тегу..."
        value={qLocal}
        onChange={(e) => setQLocal(e.target.value)}
        className="h-9 w-[280px] rounded-md border bg-transparent px-3 text-sm"
      />
      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => router.push(pathname)}>
          <X className="h-3.5 w-3.5 mr-1" />
          Сбросить
        </Button>
      ) : null}
    </div>
  )
}
