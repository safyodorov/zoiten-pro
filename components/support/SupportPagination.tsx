"use client"

import Link from "next/link"
import { useSearchParams, usePathname } from "next/navigation"
import { ChevronLeft, ChevronRight } from "lucide-react"

export function SupportPagination({
  page,
  pageSize,
  total,
}: {
  page: number
  pageSize: number
  total: number
}) {
  const sp = useSearchParams()
  const pathname = usePathname()
  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  function href(p: number): string {
    const next = new URLSearchParams(sp.toString())
    next.set("page", String(p))
    return `${pathname}?${next.toString()}`
  }

  const prevDisabled = page <= 1
  const nextDisabled = page >= totalPages
  const btnClass =
    "inline-flex items-center justify-center h-9 w-9 rounded-md border bg-transparent hover:bg-accent disabled:opacity-50 disabled:pointer-events-none transition-colors"

  return (
    <div className="flex items-center justify-between pt-4 text-sm text-muted-foreground">
      <span>Всего: {total}</span>
      <div className="flex items-center gap-2">
        {prevDisabled ? (
          <button type="button" disabled className={btnClass}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Link href={href(Math.max(1, page - 1))} className={btnClass}>
            <ChevronLeft className="h-3.5 w-3.5" />
          </Link>
        )}
        <span>
          Стр. {page} из {totalPages}
        </span>
        {nextDisabled ? (
          <button type="button" disabled className={btnClass}>
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        ) : (
          <Link
            href={href(Math.min(totalPages, page + 1))}
            className={btnClass}
          >
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  )
}
