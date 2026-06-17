// app/(dashboard)/procurement/purchases/[id]/page.tsx
// RSC детальная страница закупки (D-05, D-06, D-08, D-16, D-21).
// Шапка (edit/delete) + позиции + multi-payment editor (PurchasePaymentsCard).
import { notFound } from "next/navigation"
import Link from "next/link"
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { getLatestRate } from "@/lib/cbr-rates"
import { computePurchaseTotal } from "@/lib/procurement-math"
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"
import { PurchaseDetailActions } from "@/components/procurement/PurchaseDetailActions"
import {
  PurchasePaymentsCard,
  type PaymentDraft,
} from "@/components/procurement/PurchasePaymentsCard"
import {
  PurchaseItemStagesCard,
  type ItemStageData,
  type StageKey,
} from "@/components/procurement/PurchaseItemStagesCard"
import {
  PurchaseDocumentsCard,
  type DocItem,
} from "@/components/procurement/PurchaseDocumentsCard"
import type { DocCategory } from "@/lib/purchase-documents"
import type {
  PurchaseForModal,
  SupplierOption,
  ProductOption,
  ProductLinkMap,
} from "@/components/procurement/PurchaseModal"

interface Props {
  params: Promise<{ id: string }>
}

const STATUS_LABEL: Record<"PLANNED" | "ACTIVE" | "COMPLETED", string> = {
  PLANNED: "Планируемая",
  ACTIVE: "Текущая",
  COMPLETED: "Завершённая",
}

function formatDate(d: Date | null): string {
  if (!d) return "—"
  return d.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
}

function toDateInput(d: Date): string {
  return d.toISOString().split("T")[0]
}

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

export default async function PurchaseDetailPage({ params }: Props) {
  await requireSection("PROCUREMENT")
  const canManage = (await getSectionRole("PROCUREMENT")) === "MANAGE"

  const { id } = await params

  const purchase = await prisma.purchase.findUnique({
    where: { id },
    include: {
      supplier: {
        select: {
          id: true,
          nameEnglish: true,
          nameForeign: true,
          buyer: { select: { lastName: true, firstName: true } },
        },
      },
      items: {
        include: {
          product: { select: { id: true, name: true, sku: true, photoUrl: true } },
          stages: true,
        },
      },
      payments: { orderBy: [{ type: "asc" }, { ordinal: "asc" }] },
      documents: { orderBy: [{ category: "asc" }, { createdAt: "asc" }] },
    },
  })

  if (!purchase) notFound()

  // ── Итог + курс ──
  const total = computePurchaseTotal(
    purchase.items.map((i) => ({
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
    }))
  )
  const rateRow =
    purchase.currency !== "RUB" ? await getLatestRate(purchase.currency, prisma) : null
  const rateToRub = rateRow ? Number(rateRow.rateToRub) : null

  // ── Этапы движения товара по позициям ──
  const itemStages: ItemStageData[] = purchase.items.map((i) => {
    const stages: ItemStageData["stages"] = {}
    for (const sp of i.stages) {
      stages[sp.stage as StageKey] = {
        quantity: sp.quantity,
        comment: sp.comment ?? "",
        date: sp.date ? sp.date.toISOString().split("T")[0] : null,
      }
    }
    return {
      itemId: i.id,
      productName: i.product.name,
      productSku: i.product.sku,
      productPhotoUrl: i.product.photoUrl,
      ordered: i.quantity,
      stages,
    }
  })

  // ── Документы ──
  const docItems: DocItem[] = purchase.documents.map((d) => ({
    id: d.id,
    category: d.category as DocCategory,
    fileName: d.fileName,
    sizeBytes: d.sizeBytes,
  }))

  // ── Платежи → drafts ──
  const initialPayments: PaymentDraft[] = purchase.payments.map((p) => ({
    id: p.id,
    type: p.type,
    ordinal: p.ordinal,
    percent: p.percent != null ? Number(p.percent) : null,
    amount: Number(p.amount),
    currency: p.currency,
    dueDate: toDateInput(p.dueDate),
    paidDate: p.paidDate ? toDateInput(p.paidDate) : null,
    status: p.status,
    comment: p.comment,
  }))

  // ── Данные для модалки редактирования ──
  const [suppliersAll, products, links] = await Promise.all([
    prisma.supplier.findMany({
      where: { deletedAt: null },
      select: { id: true, nameEnglish: true, nameForeign: true },
      orderBy: { nameEnglish: "asc" },
    }),
    prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, sku: true },
      orderBy: PRODUCT_HIERARCHY_ORDER_BY,
    }),
    prisma.supplierProductLink.findMany({
      where: { productId: { not: null }, supplier: { deletedAt: null } },
      select: {
        supplierId: true,
        productId: true,
        unitPrice: true,
        currency: true,
        depositPct: true,
        balancePct: true,
        leadTimeDays: true,
      },
    }),
  ])

  const supplierOptions: SupplierOption[] = suppliersAll.map((s) => ({
    id: s.id,
    name: s.nameEnglish || s.nameForeign,
  }))
  const productOptions: ProductOption[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
  }))
  const productLinkMap: ProductLinkMap = {}
  for (const l of links) {
    if (!l.productId) continue
    if (!productLinkMap[l.supplierId]) productLinkMap[l.supplierId] = {}
    productLinkMap[l.supplierId][l.productId] = {
      unitPrice: l.unitPrice != null ? Number(l.unitPrice) : null,
      currency: l.currency ?? null,
      depositPct: l.depositPct != null ? Number(l.depositPct) : null,
      balancePct: l.balancePct != null ? Number(l.balancePct) : null,
      leadTimeDays: l.leadTimeDays ?? null,
    }
  }

  const purchaseForModal: PurchaseForModal = {
    id: purchase.id,
    supplierId: purchase.supplier.id,
    currency: purchase.currency,
    status: purchase.status,
    optionsDescription: purchase.optionsDescription,
    optionsExtraCost:
      purchase.optionsExtraCost != null ? Number(purchase.optionsExtraCost) : null,
    logisticsCost: purchase.logisticsCost != null ? Number(purchase.logisticsCost) : null,
    logisticsComment: purchase.logisticsComment,
    items: purchase.items.map((i) => ({
      id: i.id,
      productId: i.productId,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
    })),
  }

  const buyerName = purchase.supplier.buyer
    ? `${purchase.supplier.buyer.lastName} ${purchase.supplier.buyer.firstName}`.trim()
    : null

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto">
      {/* Шапка */}
      <div className="flex flex-col gap-1">
        <Link
          href="/procurement/purchases"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          prefetch={false}
        >
          ← Назад к списку
        </Link>
        <div className="flex items-center justify-between gap-3 flex-wrap mt-1">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-semibold">{purchase.supplier.nameEnglish}</h2>
            {buyerName && (
              <span className="text-sm text-muted-foreground">Закупщик: {buyerName}</span>
            )}
            <span className="text-sm text-muted-foreground">·</span>
            <span className="text-sm font-medium">{STATUS_LABEL[purchase.status]}</span>
            <span className="text-xs text-muted-foreground">
              Создано: {formatDate(purchase.createdAt)}
            </span>
          </div>
          {canManage && (
            <PurchaseDetailActions
              purchase={purchaseForModal}
              suppliers={supplierOptions}
              products={productOptions}
              productLinkMap={productLinkMap}
            />
          )}
        </div>
      </div>

      {/* Позиции */}
      <div className="rounded-lg border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/30">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                Товар
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-muted-foreground">
                УКТ
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                Кол-во
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                Цена за ед.
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-muted-foreground">
                Сумма
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {purchase.items.map((i) => (
              <tr key={i.id}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    {i.product.photoUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={i.product.photoUrl}
                        alt={i.product.name}
                        className="h-12 w-9 shrink-0 rounded border object-cover bg-muted"
                      />
                    ) : (
                      <div className="h-12 w-9 shrink-0 rounded border bg-muted" />
                    )}
                    <span>{i.product.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{i.product.sku}</td>
                <td className="px-3 py-2 text-right tabular-nums">{i.quantity}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(Number(i.unitPrice))} {purchase.currency}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(i.quantity * Number(i.unitPrice))} {purchase.currency}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-3 py-2" colSpan={4}>
                Итого
              </td>
              <td className="px-3 py-2 text-right tabular-nums">
                {formatMoney(total)} {purchase.currency}
                {rateToRub != null && (
                  <span className="text-xs text-muted-foreground ml-2">
                    ≈ {formatMoney(total * rateToRub)} ₽
                  </span>
                )}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Этапы движения товара */}
      <PurchaseItemStagesCard
        purchaseId={purchase.id}
        items={itemStages}
        canManage={canManage}
      />

      {/* Multi-payment editor (D-08, D-16) */}
      <PurchasePaymentsCard
        purchaseId={purchase.id}
        currency={purchase.currency}
        total={total}
        rateToRub={rateToRub}
        initialPayments={initialPayments}
        canManage={canManage}
      />

      {/* Документы (таможня + прочие) */}
      <PurchaseDocumentsCard
        purchaseId={purchase.id}
        documents={docItems}
        canManage={canManage}
      />
    </div>
  )
}
