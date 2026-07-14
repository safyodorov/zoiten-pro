"use client"

// components/analytics/AnalyticsTokenBar.tsx
// Phase 30 (D-01) — ввод MPSTATS-токена в шапке раздела (паттерн GlobalRatesBar):
// debounced save (500ms) → saveMpstatsToken (MANAGE) → toast + router.refresh.
// type=password + маскировка: реальное значение НЕ показывается при повторном открытии (T-30-01),
// только placeholder «••••••••». Виден лишь пользователю с MANAGE (решается родителем).
import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveMpstatsToken } from "@/app/actions/analytics"

export function AnalyticsTokenBar({ hasToken }: { hasToken: boolean }) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [isPending, startTransition] = useTransition()
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleChange = useCallback(
    (v: string) => {
      setValue(v)
      if (timer.current) clearTimeout(timer.current)
      if (v.trim().length === 0) return
      timer.current = setTimeout(() => {
        startTransition(async () => {
          const res = await saveMpstatsToken(v.trim())
          if (res.ok) {
            toast.success("MPSTATS-токен сохранён")
            setValue("")
            router.refresh()
          } else {
            toast.error(res.error || "Не удалось сохранить токен")
          }
        })
      }, 500)
    },
    [router],
  )

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="mpstats-token" className="text-xs text-muted-foreground font-normal">
        MPSTATS-токен {hasToken && <span className="text-emerald-600 dark:text-emerald-500">✓ сохранён</span>}
      </Label>
      <Input
        id="mpstats-token"
        type="password"
        autoComplete="off"
        placeholder={hasToken ? "•••••••• (заменить)" : "Вставьте MPSTATS-токен"}
        className="h-8 w-64 text-sm"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        disabled={isPending}
      />
    </div>
  )
}
