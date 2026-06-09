"use client"

import { useState, useEffect, useRef } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { CreatableCombobox } from "@/components/combobox/CreatableCombobox"
import { createSupplier, updateSupplier } from "@/app/actions/suppliers"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ── Types ──────────────────────────────────────────────────────────

export interface BuyerOption {
  id: string
  name: string
}

export interface SupplierForModal {
  id: string
  nameForeign: string
  nameEnglish: string
  buyerEmployeeId: string | null
  cooperationSummary: string | null
}

interface SupplierModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  supplier: SupplierForModal | null
  buyers: BuyerOption[]
  frequentBuyerIds: string[]
  onSuccess?: () => void
}

// ── Auto-resize textarea ────────────────────────────────────────────

function AutoResizeTextarea({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    const el = ref.current
    if (el) {
      el.style.height = "auto"
      el.style.height = `${el.scrollHeight}px`
    }
  }, [value])
  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={2}
      className="w-full min-h-[3rem] resize-none rounded-md border border-input bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
    />
  )
}

// ── Main ───────────────────────────────────────────────────────────

export function SupplierModal({
  open,
  onOpenChange,
  supplier,
  buyers,
  frequentBuyerIds,
  onSuccess,
}: SupplierModalProps) {
  const router = useRouter()
  const isEdit = supplier !== null

  const [nameForeign, setNameForeign] = useState("")
  const [nameEnglish, setNameEnglish] = useState("")
  const [buyerEmployeeId, setBuyerEmployeeId] = useState<string | null>(null)
  const [cooperationSummary, setCooperationSummary] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (supplier) {
      setNameForeign(supplier.nameForeign)
      setNameEnglish(supplier.nameEnglish)
      setBuyerEmployeeId(supplier.buyerEmployeeId)
      setCooperationSummary(supplier.cooperationSummary ?? "")
    } else {
      setNameForeign("")
      setNameEnglish("")
      setBuyerEmployeeId(null)
      setCooperationSummary("")
    }
  }, [supplier, open])

  // D-01 quick-select: часто выбираемые закупщики сверху, затем остальные.
  const frequentSet = new Set(frequentBuyerIds)
  const buyerOptions = [
    ...buyers.filter((b) => frequentSet.has(b.id)),
    ...buyers.filter((b) => !frequentSet.has(b.id)),
  ].map((b) => ({
    value: b.id,
    label: frequentSet.has(b.id) ? `★ ${b.name}` : b.name,
  }))

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nameForeign.trim() || !nameEnglish.trim()) {
      toast.error("Укажите оба названия поставщика")
      return
    }
    setSaving(true)
    const payload = {
      nameForeign: nameForeign.trim(),
      nameEnglish: nameEnglish.trim(),
      buyerEmployeeId: buyerEmployeeId || null,
      cooperationSummary: cooperationSummary.trim() || null,
      contacts: [], // контакты редактируются на detail page (вкладка Контакты)
    }
    try {
      const result =
        isEdit && supplier
          ? await updateSupplier({ id: supplier.id, ...payload })
          : await createSupplier(payload)
      if (result.ok) {
        toast.success(isEdit ? "Поставщик обновлён" : "Поставщик создан")
        onOpenChange(false)
        onSuccess?.()
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>
              {isEdit ? "Редактировать поставщика" : "Новый поставщик"}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Название (исходное / китайское)
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={nameForeign}
                onChange={(e) => setNameForeign(e.target.value)}
                placeholder="深圳..."
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Название (английское)
                <span className="text-destructive ml-0.5">*</span>
              </label>
              <input
                type="text"
                value={nameEnglish}
                onChange={(e) => setNameEnglish(e.target.value)}
                placeholder="Shenzhen ..."
                className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Закупщик
              </label>
              <CreatableCombobox
                options={buyerOptions}
                value={buyerEmployeeId}
                onValueChange={setBuyerEmployeeId}
                placeholder="Выберите закупщика..."
              />
              <p className="text-[11px] text-muted-foreground">
                ★ — часто выбираемые закупщики
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-muted-foreground">
                Резюме сотрудничества
              </label>
              <AutoResizeTextarea
                value={cooperationSummary}
                onChange={setCooperationSummary}
                placeholder="Свободный текст: история работы, особенности..."
              />
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
