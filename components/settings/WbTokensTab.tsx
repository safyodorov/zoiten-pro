"use client"
// Quick 260512-jxh: UI tab «WB API токены» — 3 карточки + модалка replace.
// SUPERADMIN-only (RSC page.tsx уже отфильтровал; не-superadmin этот компонент не получает).

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { WB_SCOPE_LABELS } from "@/lib/wb-jwt"
import { replaceWbToken } from "@/app/actions/wb-tokens"
import type { WbTokenListItem, WbTokenName } from "@/app/actions/wb-tokens"

// ── Helpers ────────────────────────────────────────────────────────

function daysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null
  const now = Date.now()
  const exp = new Date(expiresAt).getTime()
  return Math.floor((exp - now) / (1000 * 60 * 60 * 24))
}

function colorForDaysLeft(days: number | null): string {
  if (days === null) return "text-muted-foreground"
  if (days < 0) return "text-red-700 dark:text-red-400 font-semibold"
  if (days <= 7) return "text-red-600"
  if (days <= 30) return "text-yellow-600"
  return "text-green-600"
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  return new Date(iso).toLocaleDateString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

// ── WbTokensTab (root export) ─────────────────────────────────────

export function WbTokensTab({ tokens }: { tokens: WbTokenListItem[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-1 lg:grid-cols-2 xl:grid-cols-4">
      {tokens.map((t) => (
        <WbTokenCard key={t.name} token={t} />
      ))}
    </div>
  )
}

// ── WbTokenCard ───────────────────────────────────────────────────

function WbTokenCard({ token }: { token: WbTokenListItem }) {
  const [open, setOpen] = useState(false)
  const [value, setValue] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const days = daysRemaining(token.expiresAt)

  function handleOpenChange(isOpen: boolean) {
    setOpen(isOpen)
    if (!isOpen) {
      setValue("")
      setError(null)
    }
  }

  function handleSubmit() {
    setError(null)
    startTransition(async () => {
      const result = await replaceWbToken({
        name: token.name as WbTokenName,
        value,
      })
      if (result.ok) {
        toast.success(`Токен ${token.displayName} обновлён`)
        setOpen(false)
        setValue("")
      } else {
        setError(result.error)
      }
    })
  }

  return (
    <div className="rounded-lg border p-4 space-y-3">
      {/* Заголовок + кнопка Заменить */}
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{token.displayName}</h3>
          <p className="text-xs text-muted-foreground font-mono">{token.name}</p>
        </div>
        <Dialog open={open} onOpenChange={handleOpenChange}>
          <DialogTrigger
            render={
              <Button size="sm" variant="outline">
                Заменить
              </Button>
            }
          />
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Заменить {token.displayName}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Вставьте новый JWT из Личного кабинета WB → Настройки → API-токены.
              </p>
              <textarea
                className="w-full min-h-32 rounded border p-2 font-mono text-xs resize-y bg-background text-foreground placeholder:text-muted-foreground"
                placeholder="Вставьте JWT токен из ЛК WB..."
                value={value}
                onChange={(e) => setValue(e.target.value)}
                disabled={isPending}
              />
              {error && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded p-2 whitespace-pre-wrap">
                  {error}
                </div>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Отмена
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={isPending || !value.trim()}
                >
                  {isPending ? "Проверяем..." : "Проверить и сохранить"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Тело карточки */}
      {!token.hasValue ? (
        <p className="text-sm text-muted-foreground italic">Токен не настроен</p>
      ) : (
        <>
          {/* Scope chips */}
          {token.scopeBits.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {token.scopeBits.map((bit) => (
                <span
                  key={bit}
                  className="bg-secondary text-xs px-2 py-0.5 rounded-full"
                >
                  {WB_SCOPE_LABELS[bit] ?? `bit ${bit}`}
                </span>
              ))}
            </div>
          )}

          {/* Метаданные */}
          <div className="text-sm space-y-1">
            <div>
              Выпущен:{" "}
              <span className="font-mono">{formatDate(token.issuedAt)}</span>
            </div>
            <div className="flex flex-wrap gap-1 items-baseline">
              <span>Истекает:</span>
              <span className="font-mono">{formatDate(token.expiresAt)}</span>
              {days !== null && (
                <span className={colorForDaysLeft(days)}>
                  {days < 0
                    ? `(истёк ${Math.abs(days)} дн. назад)`
                    : `(осталось ${days} дн.)`}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              Значение:{" "}
              <span className="font-mono">{token.maskedTail}</span>
            </div>
            {token.updatedBy && (
              <div className="text-xs text-muted-foreground">
                Обновил: {token.updatedBy.name} ({formatDate(token.updatedAt)})
              </div>
            )}
            {!token.updatedBy && token.updatedAt && (
              <div className="text-xs text-muted-foreground">
                Bootstrap из env ({formatDate(token.updatedAt)})
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
