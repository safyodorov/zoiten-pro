"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { SupplierModal, type BuyerOption, type SupplierForModal } from "@/components/procurement/SupplierModal"
import { softDeleteSupplier } from "@/app/actions/suppliers"
import {
  SupplierContactsTab,
  type ContactEntry,
} from "@/components/procurement/SupplierContactsTab"
import {
  SupplierProductsTab,
  type ProductLinkEntry,
  type ProductOption,
} from "@/components/procurement/SupplierProductsTab"
import {
  NegotiationsTab,
  type NegotiationEntry,
  type EmployeeOption,
  type ContactOption,
} from "@/components/procurement/NegotiationsTab"

interface SupplierDetailTabsProps {
  supplierId: string
  supplierBase: SupplierForModal
  buyers: BuyerOption[]
  frequentBuyerIds: string[]
  contacts: ContactEntry[]
  productLinks: ProductLinkEntry[]
  negotiations: NegotiationEntry[]
  products: ProductOption[]
  employees: EmployeeOption[]
  contactOptions: ContactOption[]
  canManage: boolean
}

type Tab = "contacts" | "products" | "negotiations"

const TABS: { key: Tab; label: string }[] = [
  { key: "contacts", label: "Контакты" },
  { key: "products", label: "Товары" },
  { key: "negotiations", label: "Переговоры" },
]

export function SupplierDetailTabs({
  supplierId,
  supplierBase,
  buyers,
  frequentBuyerIds,
  contacts,
  productLinks,
  negotiations,
  products,
  employees,
  contactOptions,
  canManage,
}: SupplierDetailTabsProps) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>("contacts")
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function handleDelete() {
    if (!window.confirm("Удалить поставщика? (Мягкое удаление, контакты и история сохранятся)"))
      return
    setDeleting(true)
    try {
      const result = await softDeleteSupplier(supplierId)
      if (result.ok) {
        toast.success("Поставщик удалён")
        router.push("/procurement/suppliers")
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)} className="ml-auto">
            Редактировать
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? "Удаление..." : "Удалить"}
          </Button>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={cn(
              "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              tab === t.key
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div>
        {tab === "contacts" && (
          <SupplierContactsTab
            supplierId={supplierId}
            supplierBase={{
              nameForeign: supplierBase.nameForeign,
              nameEnglish: supplierBase.nameEnglish,
              buyerEmployeeId: supplierBase.buyerEmployeeId,
              cooperationSummary: supplierBase.cooperationSummary,
            }}
            initialContacts={contacts}
            canManage={canManage}
          />
        )}
        {tab === "products" && (
          <SupplierProductsTab
            supplierId={supplierId}
            initialLinks={productLinks}
            products={products}
            canManage={canManage}
          />
        )}
        {tab === "negotiations" && (
          <NegotiationsTab
            supplierId={supplierId}
            initialNegotiations={negotiations}
            products={products}
            employees={employees}
            contacts={contactOptions}
            canManage={canManage}
          />
        )}
      </div>

      {canManage && (
        <SupplierModal
          open={editOpen}
          onOpenChange={setEditOpen}
          supplier={supplierBase}
          buyers={buyers}
          frequentBuyerIds={frequentBuyerIds}
        />
      )}
    </div>
  )
}
