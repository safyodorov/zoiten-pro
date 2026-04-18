"use client"

// components/support/customers/LinkCustomerButton.tsx
// Client — кнопка «Связать с покупателем» + модалка с 2 режимами:
//   «existing» — поиск existing Customer (debounced 300ms → searchCustomers)
//   «new» — форма создания (name обязательный + phone optional → createCustomerForTicket)
// Рендерится в TicketSidePanel только при customerId=null && channel !== "CHAT".

import { useRef, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { UserPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  linkTicketToCustomer,
  createCustomerForTicket,
  searchCustomers,
} from "@/app/actions/support"

type Mode = "existing" | "new"

interface SearchResult {
  id: string
  name: string | null
  phone: string | null
  wbUserId: string | null
}

export function LinkCustomerButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>("existing")
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<SearchResult[]>([])
  const [newName, setNewName] = useState("")
  const [newPhone, setNewPhone] = useState("")
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onQueryChange(v: string) {
    setQuery(v)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (v.trim().length < 2) {
      setResults([])
      return
    }
    searchTimerRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await searchCustomers(v)
        if (res.ok) setResults(res.customers)
        else toast.error(res.error)
      })
    }, 300)
  }

  function onPickExisting(customerId: string) {
    startTransition(async () => {
      const res = await linkTicketToCustomer(ticketId, customerId)
      if (res.ok) {
        toast.success("Покупатель связан")
        setOpen(false)
        setQuery("")
        setResults([])
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function onCreateNew() {
    if (newName.trim().length < 1) {
      toast.error("Имя обязательно")
      return
    }
    startTransition(async () => {
      const res = await createCustomerForTicket(ticketId, {
        name: newName.trim(),
        phone: newPhone.trim() || null,
      })
      if (res.ok) {
        toast.success("Покупатель создан и связан")
        setOpen(false)
        setNewName("")
        setNewPhone("")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="w-full"
      >
        <UserPlus className="w-4 h-4 mr-1" />
        Связать с покупателем
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Связать тикет с покупателем</DialogTitle>
          </DialogHeader>
          <div className="flex gap-2 border-b pb-2">
            <button
              type="button"
              onClick={() => setMode("existing")}
              className={`text-sm px-3 py-1 rounded ${
                mode === "existing"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Найти существующего
            </button>
            <button
              type="button"
              onClick={() => setMode("new")}
              className={`text-sm px-3 py-1 rounded ${
                mode === "new"
                  ? "bg-primary text-primary-foreground"
                  : "hover:bg-muted"
              }`}
            >
              Создать нового
            </button>
          </div>
          {mode === "existing" && (
            <div className="space-y-2">
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
                      Не найдено
                    </div>
                  )}
                <ul className="space-y-1">
                  {results.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        onClick={() => onPickExisting(c.id)}
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
          {mode === "new" && (
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Имя *</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Иван Петров"
                  className="w-full rounded-md border px-3 py-2 text-sm mt-1"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Телефон</label>
                <input
                  type="text"
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="+79991234567"
                  className="w-full rounded-md border px-3 py-2 text-sm mt-1"
                  maxLength={20}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => setOpen(false)}
                  disabled={isPending}
                >
                  Отмена
                </Button>
                <Button
                  onClick={onCreateNew}
                  disabled={isPending || newName.trim().length < 1}
                >
                  Создать и связать
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
