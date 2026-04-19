"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"
import { useState } from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"

const PAGE_SIZES = [20, 50, 100] as const

export function SupportPagination({
  page,
  pageSize,
  total,
}: {
  page: number
  pageSize: number
  total: number
}) {
  const router = useRouter()
  const sp = useSearchParams()
  const pathname = usePathname()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const [gotoValue, setGotoValue] = useState<string>("")

  function buildUrl(overrides: Record<string, string | number>) {
    const next = new URLSearchParams(sp.toString())
    for (const [k, v] of Object.entries(overrides)) {
      next.set(k, String(v))
    }
    return `${pathname}?${next.toString()}`
  }

  function goPage(p: number) {
    const clamped = Math.max(1, Math.min(totalPages, p))
    router.push(buildUrl({ page: clamped }))
  }

  function onSizeChange(e: React.ChangeEvent<HTMLSelectElement>) {
    router.push(buildUrl({ size: e.target.value, page: 1 }))
  }

  function onGotoSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const n = parseInt(gotoValue, 10)
    if (!isNaN(n)) {
      goPage(n)
      setGotoValue("")
    }
  }

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages
  const btnClass =
    "inline-flex items-center justify-center h-9 w-9 rounded-md border bg-transparent hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4 text-sm text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>Всего: {total}</span>
        <span>·</span>
        <label className="flex items-center gap-1.5">
          На странице:
          <select
            value={pageSize}
            onChange={onSizeChange}
            className="h-7 rounded border border-input bg-transparent px-2 text-xs"
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={prevDisabled}
          onClick={() => goPage(page - 1)}
          className={btnClass}
          aria-label="Предыдущая страница"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="whitespace-nowrap">
          Стр. {page} из {totalPages}
        </span>
        <button
          type="button"
          disabled={nextDisabled}
          onClick={() => goPage(page + 1)}
          className={btnClass}
          aria-label="Следующая страница"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        {totalPages > 5 && (
          <form onSubmit={onGotoSubmit} className="flex items-center gap-1 ml-2">
            <span className="text-xs">Перейти:</span>
            <input
              type="number"
              min={1}
              max={totalPages}
              value={gotoValue}
              onChange={(e) => setGotoValue(e.target.value)}
              placeholder={String(page)}
              className="h-7 w-16 rounded border border-input bg-transparent px-2 text-xs text-center"
            />
          </form>
        )}
      </div>
    </div>
  )
}
