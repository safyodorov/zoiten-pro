"use client"

// Header actions для детальной страницы закупки: Редактировать (PurchaseModal)
// + Удалить (deletePurchase, доступно только для status PLANNED, D-21).

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { deletePurchase } from "@/app/actions/purchases"
import {
  PurchaseModal,
  type PurchaseForModal,
  type SupplierOption,
  type ProductOption,
  type ProductLinkMap,
} from "@/components/procurement/PurchaseModal"

interface PurchaseDetailActionsProps {
  purchase: PurchaseForModal
  suppliers: SupplierOption[]
  products: ProductOption[]
  productLinkMap: ProductLinkMap
}

export function PurchaseDetailActions({
  purchase,
  suppliers,
  products,
  productLinkMap,
}: PurchaseDetailActionsProps) {
  const router = useRouter()
  const [editOpen, setEditOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [, startTransition] = useTransition()

  const canDelete = purchase.status === "PLANNED"

  function handleDelete() {
    if (!canDelete) return
    if (!window.confirm("Удалить закупку? Это действие необратимо.")) return
    setDeleting(true)
    startTransition(async () => {
      try {
        const result = await deletePurchase(purchase.id)
        if (result.ok) {
          toast.success("Закупка удалена")
          router.push("/procurement/purchases")
        } else {
          toast.error(result.error)
          setDeleting(false)
        }
      } catch {
        toast.error("Ошибка сервера")
        setDeleting(false)
      }
    })
  }

  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
        Редактировать
      </Button>
      <span title={canDelete ? undefined : "Удалять можно только планируемые закупки"}>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={!canDelete || deleting}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          {deleting ? "..." : "Удалить"}
        </Button>
      </span>

      <PurchaseModal
        open={editOpen}
        onOpenChange={setEditOpen}
        mode="edit"
        purchase={purchase}
        suppliers={suppliers}
        products={products}
        productLinkMap={productLinkMap}
      />
    </div>
  )
}
