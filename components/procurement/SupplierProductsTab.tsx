"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Plus, Trash2 } from "lucide-react"
import { CreatableCombobox } from "@/components/combobox/CreatableCombobox"
import { saveSupplierProductLinks } from "@/app/actions/suppliers"
import { toast } from "sonner"
import { useRouter } from "next/navigation"

// ── Types (D-03) ────────────────────────────────────────────────────

type DeliveryType = "CARGO" | "WHITE"

export interface ProductLinkEntry {
  id: string | null
  productId: string | null
  productNameFallback: string
  leadTimeDays: string
  leadTimeComment: string
  unitPrice: string
  currency: string
  deliveryType: DeliveryType | ""
  deliveryComment: string
  exclusivityStatus: boolean
  exclusivityTerms: string
  depositPct: string
  balancePct: string
  deferralPct: string
  deferralTerms: string
  inspectionCity: string
  inspectionAddress: string
  inspectionMapUrl: string
}

export interface ProductOption {
  id: string
  name: string
}

interface SupplierProductsTabProps {
  supplierId: string
  initialLinks: ProductLinkEntry[]
  products: ProductOption[]
  canManage: boolean
}

function emptyLink(): ProductLinkEntry {
  return {
    id: null,
    productId: null,
    productNameFallback: "",
    leadTimeDays: "",
    leadTimeComment: "",
    unitPrice: "",
    currency: "CNY",
    deliveryType: "",
    deliveryComment: "",
    exclusivityStatus: false,
    exclusivityTerms: "",
    depositPct: "",
    balancePct: "",
    deferralPct: "",
    deferralTerms: "",
    inspectionCity: "",
    inspectionAddress: "",
    inspectionMapUrl: "",
  }
}

function numOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = Number(t.replace(",", "."))
  return isNaN(n) ? null : n
}

function intOrNull(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  const n = parseInt(t, 10)
  return isNaN(n) ? null : n
}

// ── Main ───────────────────────────────────────────────────────────

export function SupplierProductsTab({
  supplierId,
  initialLinks,
  products,
  canManage,
}: SupplierProductsTabProps) {
  const router = useRouter()
  const [links, setLinks] = useState<ProductLinkEntry[]>(initialLinks)
  const [saving, setSaving] = useState(false)

  const productOptions = products.map((p) => ({ value: p.id, label: p.name }))

  function update<K extends keyof ProductLinkEntry>(
    idx: number,
    key: K,
    value: ProductLinkEntry[K]
  ) {
    setLinks((prev) => prev.map((l, i) => (i === idx ? { ...l, [key]: value } : l)))
  }

  function add() {
    setLinks((prev) => [...prev, emptyLink()])
  }

  function remove(idx: number) {
    setLinks((prev) => prev.filter((_, i) => i !== idx))
  }

  async function save() {
    setSaving(true)
    try {
      const result = await saveSupplierProductLinks(
        supplierId,
        links.map((l) => ({
          id: l.id ?? undefined,
          productId: l.productId || null,
          productNameFallback: l.productId ? null : l.productNameFallback.trim() || null,
          leadTimeDays: intOrNull(l.leadTimeDays),
          leadTimeComment: l.leadTimeComment.trim() || null,
          unitPrice: numOrNull(l.unitPrice),
          currency: l.currency.trim() || null,
          deliveryType: l.deliveryType || null,
          deliveryComment: l.deliveryComment.trim() || null,
          exclusivityStatus: l.exclusivityStatus,
          exclusivityTerms: l.exclusivityTerms.trim() || null,
          depositPct: numOrNull(l.depositPct),
          balancePct: numOrNull(l.balancePct),
          deferralPct: numOrNull(l.deferralPct),
          deferralTerms: l.deferralTerms.trim() || null,
          inspectionCity: l.inspectionCity.trim() || null,
          inspectionAddress: l.inspectionAddress.trim() || null,
          inspectionMapUrl: l.inspectionMapUrl.trim() || null,
        }))
      )
      if (result.ok) {
        toast.success("Привязки товаров сохранены")
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

  const fieldCls =
    "h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
  const labelCls = "text-xs font-medium text-muted-foreground"

  return (
    <div className="space-y-3">
      {links.length === 0 && (
        <p className="text-sm text-muted-foreground py-4">Привязанных товаров пока нет.</p>
      )}

      {links.map((l, idx) => (
        <div key={idx} className="rounded-lg border bg-muted/20 p-3 space-y-2">
          {/* Товар */}
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Товар</label>
            <CreatableCombobox
              options={productOptions}
              value={l.productId}
              onValueChange={(v) => update(idx, "productId", v)}
              placeholder="Выберите товар..."
              disabled={!canManage}
            />
            {!l.productId && (
              <input
                type="text"
                value={l.productNameFallback}
                onChange={(e) => update(idx, "productNameFallback", e.target.value)}
                disabled={!canManage}
                placeholder="Текстовое имя товара (если нет в базе)"
                className={fieldCls + " mt-1"}
              />
            )}
          </div>

          {/* Срок + цена */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Срок готовности, дн</label>
              <input
                type="number"
                value={l.leadTimeDays}
                onChange={(e) => update(idx, "leadTimeDays", e.target.value)}
                disabled={!canManage}
                className={fieldCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Цена за ед.</label>
              <input
                type="number"
                step="0.0001"
                value={l.unitPrice}
                onChange={(e) => update(idx, "unitPrice", e.target.value)}
                disabled={!canManage}
                className={fieldCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Валюта</label>
              <input
                type="text"
                value={l.currency}
                onChange={(e) => update(idx, "currency", e.target.value.toUpperCase())}
                disabled={!canManage}
                placeholder="CNY"
                className={fieldCls}
              />
            </div>
          </div>
          <input
            type="text"
            value={l.leadTimeComment}
            onChange={(e) => update(idx, "leadTimeComment", e.target.value)}
            disabled={!canManage}
            placeholder="Комментарий к сроку готовности"
            className={fieldCls + " w-full"}
          />

          {/* Доставка */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Тип доставки</label>
              <select
                value={l.deliveryType}
                onChange={(e) =>
                  update(idx, "deliveryType", e.target.value as DeliveryType | "")
                }
                disabled={!canManage}
                className={fieldCls}
              >
                <option value="">Не указан</option>
                <option value="CARGO">Карго</option>
                <option value="WHITE">Белая</option>
              </select>
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Комментарий доставки</label>
              <input
                type="text"
                value={l.deliveryComment}
                onChange={(e) => update(idx, "deliveryComment", e.target.value)}
                disabled={!canManage}
                className={fieldCls}
              />
            </div>
          </div>

          {/* Эксклюзивность */}
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 cursor-pointer text-xs whitespace-nowrap">
              <input
                type="checkbox"
                checked={l.exclusivityStatus}
                onChange={(e) => update(idx, "exclusivityStatus", e.target.checked)}
                disabled={!canManage}
                className="h-3.5 w-3.5 accent-primary"
              />
              Эксклюзив
            </label>
            <input
              type="text"
              value={l.exclusivityTerms}
              onChange={(e) => update(idx, "exclusivityTerms", e.target.value)}
              disabled={!canManage}
              placeholder="Условия эксклюзивности"
              className={fieldCls + " flex-1"}
            />
          </div>

          {/* Платёжные условия */}
          <div className="grid grid-cols-3 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Депозит, %</label>
              <input
                type="number"
                step="0.01"
                value={l.depositPct}
                onChange={(e) => update(idx, "depositPct", e.target.value)}
                disabled={!canManage}
                className={fieldCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Баланс, %</label>
              <input
                type="number"
                step="0.01"
                value={l.balancePct}
                onChange={(e) => update(idx, "balancePct", e.target.value)}
                disabled={!canManage}
                className={fieldCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Отсрочка, %</label>
              <input
                type="number"
                step="0.01"
                value={l.deferralPct}
                onChange={(e) => update(idx, "deferralPct", e.target.value)}
                disabled={!canManage}
                className={fieldCls}
              />
            </div>
          </div>
          <input
            type="text"
            value={l.deferralTerms}
            onChange={(e) => update(idx, "deferralTerms", e.target.value)}
            disabled={!canManage}
            placeholder="Условия отсрочки"
            className={fieldCls + " w-full"}
          />

          {/* Инспекция (D-03: только город + адрес + URL, без lat/lng) */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Город инспекции</label>
              <input
                type="text"
                value={l.inspectionCity}
                onChange={(e) => update(idx, "inspectionCity", e.target.value)}
                disabled={!canManage}
                className={fieldCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className={labelCls}>Адрес инспекции</label>
              <input
                type="text"
                value={l.inspectionAddress}
                onChange={(e) => update(idx, "inspectionAddress", e.target.value)}
                disabled={!canManage}
                className={fieldCls}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <label className={labelCls}>Ссылка на карту (Google / Yandex)</label>
            <input
              type="url"
              value={l.inspectionMapUrl}
              onChange={(e) => update(idx, "inspectionMapUrl", e.target.value)}
              disabled={!canManage}
              placeholder="https://maps.google.com/..."
              className={fieldCls + " w-full"}
            />
          </div>

          {canManage && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => remove(idx)}
                className="text-muted-foreground hover:text-destructive"
                title="Удалить привязку"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      ))}

      {canManage && (
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={add} className="gap-1.5">
            <Plus className="h-4 w-4" />
            Добавить товар
          </Button>
          <Button type="button" size="sm" onClick={save} disabled={saving} className="ml-auto">
            {saving ? "Сохранение..." : "Сохранить товары"}
          </Button>
        </div>
      )}
    </div>
  )
}
