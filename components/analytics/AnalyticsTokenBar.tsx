"use client"

// components/analytics/AnalyticsTokenBar.tsx
// Phase 30 (D-01) — ввод MPSTATS-токена в шапке раздела (паттерн GlobalRatesBar):
// debounced save (500ms) → saveMpstatsToken (MANAGE) → toast + router.refresh.
// Поле type="text" (видно при вводе — можно сверить) + подавление менеджеров паролей
// (autoComplete/data-lpignore/data-1p-ignore), т.к. type="password" вызывал ложный промпт
// «обновить пароль аккаунта» и скрывал ввод. Полное сохранённое значение на клиент НЕ уходит —
// показывается только отпечаток (первые/последние 4 символа). Кнопка «Проверить» — живой тест MPSTATS.
// Виден лишь пользователю с MANAGE (решается родителем).
import { useCallback, useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { saveMpstatsToken, testMpstatsToken } from "@/app/actions/analytics"

interface Props {
  hasToken: boolean
  /** Отпечаток сохранённого токена (напр. «6a03…6529») — для сверки без полного показа. */
  tokenFingerprint?: string
}

export function AnalyticsTokenBar({ hasToken, tokenFingerprint }: Props) {
  const router = useRouter()
  const [value, setValue] = useState("")
  const [isPending, startTransition] = useTransition()
  const [isTesting, startTest] = useTransition()
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

  const handleTest = useCallback(() => {
    startTest(async () => {
      const res = await testMpstatsToken()
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }, [])

  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor="mpstats-token" className="text-xs text-muted-foreground font-normal">
        MPSTATS-токен{" "}
        {hasToken && (
          <span className="text-emerald-600 dark:text-emerald-500">
            ✓ сохранён{tokenFingerprint ? ` (${tokenFingerprint})` : ""}
          </span>
        )}
      </Label>
      <div className="flex items-center gap-2">
        <Input
          id="mpstats-token"
          name="mpstats-api-token"
          type="text"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          data-lpignore="true"
          data-1p-ignore="true"
          data-form-type="other"
          placeholder={hasToken ? "Вставьте новый токен для замены" : "Вставьте MPSTATS-токен"}
          className="h-8 w-72 text-sm font-mono"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          disabled={isPending}
        />
        {hasToken && (
          <button
            type="button"
            onClick={handleTest}
            disabled={isTesting}
            className="h-8 shrink-0 rounded-md border px-2.5 text-xs hover:bg-muted/40 disabled:opacity-50"
          >
            {isTesting ? "Проверка…" : "Проверить"}
          </button>
        )}
      </div>
    </div>
  )
}
