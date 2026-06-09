"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import { updateSupplier } from "@/app/actions/suppliers"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ── Types (D-02) ────────────────────────────────────────────────────

type ContactType = "SUPPLIER_MANAGER" | "SUPPLIER_BOSS"
type ContactMethod = "WECHAT" | "PHONE" | "ALIBABA" | "OTHER"

export interface ContactEntry {
  id: string | null
  type: ContactType
  name: string
  phone: string
  preferredContact: ContactMethod
  preferredContactCustom: string
  description: string
  isPrimary: boolean
}

interface SupplierContactsTabProps {
  supplierId: string
  // Supplier base fields нужны для updateSupplier (он принимает весь Supplier).
  supplierBase: {
    nameForeign: string
    nameEnglish: string
    buyerEmployeeId: string | null
    cooperationSummary: string | null
  }
  initialContacts: ContactEntry[]
  canManage: boolean
}

// E.164: +<country><number>, 7-15 цифр.
const E164 = /^\+[1-9]\d{6,14}$/

const TYPE_LABELS: Record<ContactType, string> = {
  SUPPLIER_MANAGER: "Менеджер",
  SUPPLIER_BOSS: "Босс",
}

// Порядок способов связи (D-02): WECHAT / PHONE / ALIBABA / OTHER.
const METHOD_OPTIONS: { value: ContactMethod; label: string }[] = [
  { value: "WECHAT", label: "WeChat" },
  { value: "PHONE", label: "Телефон" },
  { value: "ALIBABA", label: "Alibaba" },
  { value: "OTHER", label: "Свой вариант" },
]

function emptyContact(): ContactEntry {
  return {
    id: null,
    type: "SUPPLIER_MANAGER",
    name: "",
    phone: "",
    preferredContact: "WECHAT",
    preferredContactCustom: "",
    description: "",
    isPrimary: false,
  }
}

// ── Main ───────────────────────────────────────────────────────────

export function SupplierContactsTab({
  supplierId,
  supplierBase,
  initialContacts,
  canManage,
}: SupplierContactsTabProps) {
  const router = useRouter()
  const [contacts, setContacts] = useState<ContactEntry[]>(initialContacts)
  const [saving, setSaving] = useState(false)

  function update<K extends keyof ContactEntry>(idx: number, key: K, value: ContactEntry[K]) {
    setContacts((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)))
  }

  function add() {
    setContacts((prev) => [...prev, emptyContact()])
  }

  function remove(idx: number) {
    setContacts((prev) => prev.filter((_, i) => i !== idx))
  }

  async function save() {
    // Client-side validation (server enforces too).
    for (const c of contacts) {
      if (!c.name.trim()) {
        toast.error("У каждого контакта должно быть имя")
        return
      }
      if (c.phone.trim() && !E164.test(c.phone.trim())) {
        toast.error(`Телефон «${c.phone}» должен быть в формате E.164 (+86...)`)
        return
      }
      if (c.preferredContact === "OTHER" && !c.preferredContactCustom.trim()) {
        toast.error("Для способа «Свой вариант» укажите его название")
        return
      }
    }

    setSaving(true)
    try {
      const result = await updateSupplier({
        id: supplierId,
        nameForeign: supplierBase.nameForeign,
        nameEnglish: supplierBase.nameEnglish,
        buyerEmployeeId: supplierBase.buyerEmployeeId,
        cooperationSummary: supplierBase.cooperationSummary,
        contacts: contacts.map((c) => ({
          id: c.id ?? undefined,
          type: c.type,
          name: c.name.trim(),
          phone: c.phone.trim() || null,
          preferredContact: c.preferredContact,
          preferredContactCustom: c.preferredContactCustom.trim() || null,
          description: c.description.trim() || null,
          isPrimary: c.isPrimary,
        })),
      })
      if (result.ok) {
        toast.success("Контакты сохранены")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      {contacts.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">Контактов пока нет.</p>
      )}

      {contacts.map((c, idx) => (
        <div key={idx} className="rounded-lg border bg-muted/20 p-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Тип</label>
              <select
                value={c.type}
                onChange={(e) => update(idx, "type", e.target.value as ContactType)}
                disabled={!canManage}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {(Object.keys(TYPE_LABELS) as ContactType[]).map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Имя</label>
              <input
                type="text"
                value={c.name}
                onChange={(e) => update(idx, "name", e.target.value)}
                disabled={!canManage}
                placeholder="名字 / Name"
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Телефон (E.164)
              </label>
              <input
                type="tel"
                value={c.phone}
                onChange={(e) => update(idx, "phone", e.target.value)}
                disabled={!canManage}
                placeholder="+8613800138000"
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">Способ связи</label>
              <select
                value={c.preferredContact}
                onChange={(e) =>
                  update(idx, "preferredContact", e.target.value as ContactMethod)
                }
                disabled={!canManage}
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              >
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {c.preferredContact === "OTHER" && (
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Свой способ связи
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={c.preferredContactCustom}
                onChange={(e) => update(idx, "preferredContactCustom", e.target.value)}
                disabled={!canManage}
                placeholder="Telegram / WhatsApp / ..."
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-muted-foreground">Описание</label>
            <input
              type="text"
              value={c.description}
              onChange={(e) => update(idx, "description", e.target.value)}
              disabled={!canManage}
              placeholder="Должность, заметки..."
              className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          <div className="flex items-center justify-between">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs">
              <input
                type="checkbox"
                checked={c.isPrimary}
                onChange={(e) => update(idx, "isPrimary", e.target.checked)}
                disabled={!canManage}
                className="h-3.5 w-3.5 accent-primary"
              />
              Основной контакт ({TYPE_LABELS[c.type]})
            </label>
            {canManage && (
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-muted-foreground hover:text-destructive"
                title="Удалить контакт"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      ))}

      {canManage && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Добавить контакт
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving} className="ml-auto">
            {saving ? "Сохранение..." : "Сохранить контакты"}
          </Button>
        </div>
      )}
    </div>
  )
}
