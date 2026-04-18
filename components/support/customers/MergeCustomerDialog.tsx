"use client"

// components/support/customers/MergeCustomerDialog.tsx
// Phase 12 Plan 03 — 2-шаговая модалка объединения Customer (search → confirm).
// Шаг 1: search existing Customer через searchCustomers (исключая current).
// Шаг 2: AlertDialog-like warning → mergeCustomers → router.push(/support/customers/targetId).
// Операция необратима: source Customer удаляется, tickets переносятся к target.

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Merge, AlertTriangle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { mergeCustomers, searchCustomers } from "@/app/actions/support"

interface SearchResult {
  id: string
  name: string | null
  phone: string | null
  wbUserId: string | null
}

type Step = "search" | "confirm"

export function MergeCustomerDialog({
  currentCustomerId,
  currentCustomerName,
  ticketsCount,
}: {
  currentCustomerId: string
  currentCustomerName: string | null
  ticketsCount: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState<Step>("search")
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [target, setTarget] = useState<SearchResult | null>(null)
  const [isPending, startTransition] = useTransition()

  function onQueryChange(v: string) {
    setQuery(v)
    if (v.trim().length < 2) {
      setResults([])
      return
    }
    startTransition(async () => {
      const res = await searchCustomers(v)
      if (res.ok) {
        // Исключаем текущего покупателя из списка — merge с самим собой бессмысленен
        setResults(res.customers.filter((c) => c.id !== currentCustomerId))
      } else {
        toast.error(res.error)
      }
    })
  }

  function onPickTarget(c: SearchResult) {
    setTarget(c)
    setStep("confirm")
  }

  function onConfirmMerge() {
    if (!target) return
    startTransition(async () => {
      const res = await mergeCustomers({
        sourceId: currentCustomerId,
        targetId: target.id,
      })
      if (res.ok) {
        toast.success(
          res.ticketsMoved !== undefined
            ? `Перенесено ${res.ticketsMoved} тикет(ов)`
            : "Покупатели объединены"
        )
        setOpen(false)
        router.push(`/support/customers/${target.id}`)
      } else {
        toast.error(res.error)
      }
    })
  }

  function onClose() {
    setOpen(false)
    // Сброс state через таймаут — чтобы не мигало во время анимации закрытия
    setTimeout(() => {
      setStep("search")
      setQuery("")
      setResults([])
      setTarget(null)
    }, 200)
  }

  return (
    <>
      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Дубликат?</h3>
        <p className="text-xs text-muted-foreground">
          Если это тот же покупатель что в другом профиле — объедините.
        </p>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
          className="w-full"
        >
          <Merge className="w-4 h-4 mr-1" />
          Связать с другим
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : onClose())}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {step === "search"
                ? "Выбрать целевого покупателя"
                : "Подтвердите объединение"}
            </DialogTitle>
          </DialogHeader>

          {step === "search" && (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Все тикеты{" "}
                {currentCustomerName
                  ? `«${currentCustomerName}»`
                  : "этого покупателя"}{" "}
                будут перенесены к выбранному.
              </p>
              <input
                type="text"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                placeholder="Поиск по имени или телефону (от 2 символов)"
                className="w-full rounded-md border px-3 py-2 text-sm"
                autoFocus
              />
              <div className="max-h-[300px] overflow-y-auto">
                {query.trim().length >= 2 &&
                  results.length === 0 &&
                  !isPending && (
                    <div className="text-sm text-muted-foreground py-4 text-center">
                      Не найдено (текущий покупатель исключён из списка)
                    </div>
                  )}
                <ul className="space-y-1">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onPickTarget(c)}
                        disabled={isPending}
                        className="w-full text-left rounded border px-3 py-2 hover:bg-muted disabled:opacity-50"
                      >
                        <div className="text-sm font-medium">
                          {c.name ?? "Без имени"}
                        </div>
                        {c.phone && (
                          <div className="text-xs text-muted-foreground">
                            {c.phone}
                          </div>
                        )}
                        {c.wbUserId && (
                          <div className="text-[10px] text-muted-foreground font-mono">
                            {c.wbUserId}
                          </div>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {step === "confirm" && target && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-300 bg-amber-50 dark:bg-amber-900/20 p-3 flex gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-sm space-y-2">
                  <p className="font-medium">Операция необратима.</p>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    <li>
                      Профиль{" "}
                      <strong>
                        {currentCustomerName ?? "текущего покупателя"}
                      </strong>{" "}
                      будет удалён
                    </li>
                    <li>
                      <strong>{ticketsCount}</strong> тикет(ов) перенесётся к{" "}
                      <strong>{target.name ?? "Без имени"}</strong>
                    </li>
                    <li>Внутренняя заметка будет потеряна</li>
                  </ul>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => setStep("search")}
                  disabled={isPending}
                >
                  Назад
                </Button>
                <Button
                  variant="destructive"
                  onClick={onConfirmMerge}
                  disabled={isPending}
                >
                  {isPending ? "Объединение..." : "Объединить"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
