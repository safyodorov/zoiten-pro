// Phase 19 / Plan 19-05: client-only селектор группировки таблицы /ads/wb.
// 4 режима: По товару (default) / По связке (imt) / По кампании / По типу РК.
// Мутирует ?groupBy в URL.
"use client"

import { useRouter, useSearchParams, usePathname } from "next/navigation"

const OPTIONS = [
  { value: "product", label: "По товару" },
  { value: "imt", label: "По связке" },
  { value: "campaign", label: "По кампании" },
  { value: "type", label: "По типу РК" },
] as const

export function AdsGroupByToggle() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()
  const current = sp.get("groupBy") ?? "product"

  const handle = (v: string) => {
    const next = new URLSearchParams(sp.toString())
    if (v === "product") next.delete("groupBy")
    else next.set("groupBy", v)
    const qs = next.toString()
    router.push(`${pathname}${qs ? `?${qs}` : ""}`)
  }

  return (
    <div className="inline-flex rounded border bg-card">
      {OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => handle(o.value)}
          className={`px-3 py-1.5 text-sm transition-colors ${
            current === o.value
              ? "bg-accent text-accent-foreground"
              : "hover:bg-muted"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}
