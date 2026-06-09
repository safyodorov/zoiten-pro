"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Trash2, Pencil } from "lucide-react"
import { CreatableCombobox } from "@/components/combobox/CreatableCombobox"
import { saveNegotiation, deleteNegotiation } from "@/app/actions/suppliers"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ── Types (D-04) ────────────────────────────────────────────────────

type ParticipantKind = "employee" | "supplierContact" | "custom"

export interface ParticipantEntry {
  kind: ParticipantKind
  employeeId: string | null
  supplierContactId: string | null
  customName: string
  customRole: string
}

export interface NegotiationEntry {
  id: string | null
  date: string // yyyy-mm-dd
  goals: string
  summary: string
  productIds: string[]
  participants: ParticipantEntry[]
}

export interface ProductOption {
  id: string
  name: string
}
export interface EmployeeOption {
  id: string
  name: string
}
export interface ContactOption {
  id: string
  name: string
}

interface NegotiationsTabProps {
  supplierId: string
  initialNegotiations: NegotiationEntry[]
  products: ProductOption[]
  employees: EmployeeOption[]
  contacts: ContactOption[]
  canManage: boolean
}

function emptyParticipant(): ParticipantEntry {
  return {
    kind: "employee",
    employeeId: null,
    supplierContactId: null,
    customName: "",
    customRole: "",
  }
}

function emptyNegotiation(): NegotiationEntry {
  return {
    id: null,
    date: new Date().toISOString().slice(0, 10),
    goals: "",
    summary: "",
    productIds: [],
    participants: [],
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

// ── Editor (один negotiation) ───────────────────────────────────────

function NegotiationEditor({
  supplierId,
  initial,
  products,
  employees,
  contacts,
  onDone,
  onCancel,
}: {
  supplierId: string
  initial: NegotiationEntry
  products: ProductOption[]
  employees: EmployeeOption[]
  contacts: ContactOption[]
  onDone: () => void
  onCancel: () => void
}) {
  const [neg, setNeg] = useState<NegotiationEntry>(initial)
  const [saving, setSaving] = useState(false)

  const fieldCls =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
  const labelCls = "text-xs font-medium text-muted-foreground"

  const productOptions = products.map((p) => ({ value: p.id, label: p.name }))
  const employeeOptions = employees.map((e) => ({ value: e.id, label: e.name }))

  function toggleProduct(id: string) {
    setNeg((prev) => ({
      ...prev,
      productIds: prev.productIds.includes(id)
        ? prev.productIds.filter((p) => p !== id)
        : [...prev.productIds, id],
    }))
  }

  function addParticipant() {
    setNeg((prev) => ({ ...prev, participants: [...prev.participants, emptyParticipant()] }))
  }
  function removeParticipant(idx: number) {
    setNeg((prev) => ({
      ...prev,
      participants: prev.participants.filter((_, i) => i !== idx),
    }))
  }
  function updateParticipant<K extends keyof ParticipantEntry>(
    idx: number,
    key: K,
    value: ParticipantEntry[K]
  ) {
    setNeg((prev) => ({
      ...prev,
      participants: prev.participants.map((p, i) => (i === idx ? { ...p, [key]: value } : p)),
    }))
  }

  async function save() {
    if (!neg.goals.trim()) {
      toast.error("Укажите цели переговоров")
      return
    }
    // Client mirror of server exactly-one-of-three rule (D-04).
    for (const p of neg.participants) {
      const filled =
        p.kind === "employee"
          ? [p.employeeId]
          : p.kind === "supplierContact"
            ? [p.supplierContactId]
            : [p.customName.trim() || null]
      if (!filled[0]) {
        toast.error("У каждого участника должен быть указан источник (сотрудник / контакт / своё имя)")
        return
      }
    }

    setSaving(true)
    try {
      const result = await saveNegotiation(supplierId, {
        id: neg.id ?? undefined,
        date: neg.date,
        goals: neg.goals.trim(),
        summary: neg.summary.trim() || null,
        productIds: neg.productIds,
        participants: neg.participants.map((p) => ({
          employeeId: p.kind === "employee" ? p.employeeId : null,
          supplierContactId: p.kind === "supplierContact" ? p.supplierContactId : null,
          customName: p.kind === "custom" ? p.customName.trim() || null : null,
          customRole: p.kind === "custom" ? p.customRole.trim() || null : null,
        })),
      })
      if (result.ok) {
        toast.success("Переговоры сохранены")
        onDone()
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
    <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="flex flex-col gap-1">
          <label className={labelCls}>Дата</label>
          <input
            type="date"
            value={neg.date}
            onChange={(e) => setNeg((p) => ({ ...p, date: e.target.value }))}
            className={fieldCls}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelCls}>
          Цели <span className="text-destructive">*</span>
        </label>
        <textarea
          value={neg.goals}
          onChange={(e) => setNeg((p) => ({ ...p, goals: e.target.value }))}
          rows={2}
          className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className={labelCls}>Итог (если прошли)</label>
        <textarea
          value={neg.summary}
          onChange={(e) => setNeg((p) => ({ ...p, summary: e.target.value }))}
          rows={2}
          className="w-full resize-y rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Обсуждаемые товары */}
      <div className="flex flex-col gap-1">
        <label className={labelCls}>Обсуждаемые товары</label>
        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto rounded-md border border-input bg-background p-2">
          {productOptions.length === 0 && (
            <span className="text-xs text-muted-foreground">Нет товаров</span>
          )}
          {productOptions.map((p) => (
            <label
              key={p.value}
              className="flex items-center gap-1 text-xs cursor-pointer rounded border px-1.5 py-0.5"
            >
              <input
                type="checkbox"
                checked={neg.productIds.includes(p.value)}
                onChange={() => toggleProduct(p.value)}
                className="h-3 w-3 accent-primary"
              />
              {p.label}
            </label>
          ))}
        </div>
      </div>

      {/* Участники */}
      <div className="flex flex-col gap-1.5">
        <label className={labelCls}>Участники</label>
        {neg.participants.map((part, idx) => (
          <div key={idx} className="rounded-md border bg-background p-2 space-y-1.5">
            <div className="flex items-center gap-2">
              <select
                value={part.kind}
                onChange={(e) =>
                  updateParticipant(idx, "kind", e.target.value as ParticipantKind)
                }
                className={fieldCls}
              >
                <option value="employee">Сотрудник</option>
                <option value="supplierContact">Контакт поставщика</option>
                <option value="custom">Своё имя</option>
              </select>
              <button
                type="button"
                onClick={() => removeParticipant(idx)}
                className="ml-auto text-muted-foreground hover:text-destructive"
                title="Удалить участника"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {part.kind === "employee" && (
              <CreatableCombobox
                options={employeeOptions}
                value={part.employeeId}
                onValueChange={(v) => updateParticipant(idx, "employeeId", v)}
                placeholder="Выберите сотрудника..."
              />
            )}
            {part.kind === "supplierContact" && (
              <select
                value={part.supplierContactId ?? ""}
                onChange={(e) =>
                  updateParticipant(idx, "supplierContactId", e.target.value || null)
                }
                className={fieldCls + " w-full"}
              >
                <option value="">Выберите контакт...</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}
            {part.kind === "custom" && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  value={part.customName}
                  onChange={(e) => updateParticipant(idx, "customName", e.target.value)}
                  placeholder="Имя"
                  className={fieldCls}
                />
                <input
                  type="text"
                  value={part.customRole}
                  onChange={(e) => updateParticipant(idx, "customRole", e.target.value)}
                  placeholder="Роль"
                  className={fieldCls}
                />
              </div>
            )}
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addParticipant}
          className="gap-1.5 w-fit"
        >
          <Plus className="h-3.5 w-3.5" />
          Участник
        </Button>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Отмена
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving} className="ml-auto">
          {saving ? "Сохранение..." : "Сохранить"}
        </Button>
      </div>
    </div>
  )
}

// ── Main ───────────────────────────────────────────────────────────

export function NegotiationsTab({
  supplierId,
  initialNegotiations,
  products,
  employees,
  contacts,
  canManage,
}: NegotiationsTabProps) {
  const router = useRouter()
  const [editingId, setEditingId] = useState<string | null>(null) // negotiation.id или "__new__"

  const employeeNameById = new Map(employees.map((e) => [e.id, e.name]))
  const contactNameById = new Map(contacts.map((c) => [c.id, c.name]))
  const productNameById = new Map(products.map((p) => [p.id, p.name]))

  async function handleDelete(id: string) {
    if (!window.confirm("Удалить запись переговоров?")) return
    try {
      const result = await deleteNegotiation(id)
      if (result.ok) {
        toast.success("Переговоры удалены")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Ошибка сервера")
    }
  }

  function participantLabel(p: ParticipantEntry): string {
    if (p.kind === "employee" && p.employeeId)
      return employeeNameById.get(p.employeeId) ?? "Сотрудник"
    if (p.kind === "supplierContact" && p.supplierContactId)
      return contactNameById.get(p.supplierContactId) ?? "Контакт"
    return [p.customName, p.customRole].filter(Boolean).join(" — ") || "—"
  }

  return (
    <div className="space-y-3">
      {initialNegotiations.length === 0 && editingId !== "__new__" && (
        <p className="text-sm text-muted-foreground py-4">Переговоров пока нет.</p>
      )}

      {initialNegotiations.map((neg) =>
        editingId === neg.id ? (
          <NegotiationEditor
            key={neg.id}
            supplierId={supplierId}
            initial={neg}
            products={products}
            employees={employees}
            contacts={contacts}
            onDone={() => {
              setEditingId(null)
              router.refresh()
            }}
            onCancel={() => setEditingId(null)}
          />
        ) : (
          <div key={neg.id} className="rounded-lg border p-3 space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{formatDate(neg.date)}</span>
              {canManage && (
                <div className="ml-auto flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setEditingId(neg.id)}
                    className="text-muted-foreground hover:text-foreground"
                    title="Редактировать"
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => neg.id && handleDelete(neg.id)}
                    className="text-muted-foreground hover:text-destructive"
                    title="Удалить"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>
            <p className="text-sm">
              <span className="text-muted-foreground">Цели: </span>
              {neg.goals}
            </p>
            {neg.summary && (
              <p className="text-sm">
                <span className="text-muted-foreground">Итог: </span>
                {neg.summary}
              </p>
            )}
            {neg.productIds.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Товары: {neg.productIds.map((id) => productNameById.get(id) ?? id).join(", ")}
              </p>
            )}
            {neg.participants.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Участники: {neg.participants.map(participantLabel).join(", ")}
              </p>
            )}
          </div>
        )
      )}

      {editingId === "__new__" && (
        <NegotiationEditor
          supplierId={supplierId}
          initial={emptyNegotiation()}
          products={products}
          employees={employees}
          contacts={contacts}
          onDone={() => {
            setEditingId(null)
            router.refresh()
          }}
          onCancel={() => setEditingId(null)}
        />
      )}

      {canManage && editingId !== "__new__" && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setEditingId("__new__")}
          className="gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Добавить переговоры
        </Button>
      )}
    </div>
  )
}
