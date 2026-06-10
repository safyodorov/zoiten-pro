// app/(dashboard)/procurement/suppliers/[id]/page.tsx
// RSC детальная страница поставщика (D-02, D-03, D-04, D-15).
// Заголовок + 3 вкладки Контакты / Товары / Переговоры (client).
import { notFound } from "next/navigation"
import Link from "next/link"
import { requireSection, getSectionRole } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { SupplierDetailTabs } from "@/components/procurement/SupplierDetailTabs"
import type { ContactEntry } from "@/components/procurement/SupplierContactsTab"
import type { ProductLinkEntry } from "@/components/procurement/SupplierProductsTab"
import type { NegotiationEntry, ParticipantEntry } from "@/components/procurement/NegotiationsTab"

interface Props {
  params: Promise<{ id: string }>
}

// Decimal? → string для input value.
function decStr(v: { toString(): string } | null | undefined): string {
  return v == null ? "" : v.toString()
}

export default async function SupplierDetailPage({ params }: Props) {
  await requireSection("PROCUREMENT")
  const role = await getSectionRole("PROCUREMENT")
  const canManage = role === "MANAGE"

  const { id } = await params

  const supplier = await prisma.supplier.findFirst({
    where: { id, deletedAt: null },
    include: {
      buyer: { select: { id: true, lastName: true, firstName: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      productLinks: {
        include: {
          product: { select: { id: true, name: true, sku: true, photoUrl: true } },
        },
        orderBy: { createdAt: "asc" },
      },
      negotiations: {
        include: { products: true, participants: true },
        orderBy: { date: "desc" },
      },
    },
  })

  if (!supplier) notFound()

  const [products, employees] = await Promise.all([
    prisma.product.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.employee.findMany({
      where: { fireDate: null },
      select: { id: true, lastName: true, firstName: true },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    }),
  ])

  const buyers = employees.map((e) => ({ id: e.id, name: `${e.lastName} ${e.firstName}`.trim() }))

  const frequentBuyers = await prisma.supplier.findMany({
    where: { deletedAt: null, buyerEmployeeId: { not: null } },
    select: { buyerEmployeeId: true },
    distinct: ["buyerEmployeeId"],
  })
  const frequentBuyerIds = frequentBuyers
    .map((s) => s.buyerEmployeeId)
    .filter((bid): bid is string => Boolean(bid))

  // ── Map to client shapes (Decimal → string) ──

  const contacts: ContactEntry[] = supplier.contacts.map((c) => ({
    id: c.id,
    type: c.type,
    name: c.name,
    phone: c.phone ?? "",
    preferredContact: c.preferredContact,
    preferredContactCustom: c.preferredContactCustom ?? "",
    description: c.description ?? "",
    isPrimary: c.isPrimary,
  }))

  const productLinks: ProductLinkEntry[] = supplier.productLinks.map((l) => ({
    id: l.id,
    productId: l.productId,
    productNameFallback: l.productNameFallback ?? "",
    productPhotoUrl: l.product?.photoUrl ?? null,
    productName: l.product?.name ?? null,
    productSku: l.product?.sku ?? null,
    leadTimeDays: l.leadTimeDays != null ? String(l.leadTimeDays) : "",
    leadTimeComment: l.leadTimeComment ?? "",
    unitPrice: decStr(l.unitPrice),
    currency: l.currency ?? "",
    deliveryType: l.deliveryType ?? "",
    deliveryComment: l.deliveryComment ?? "",
    exclusivityStatus: l.exclusivityStatus,
    exclusivityTerms: l.exclusivityTerms ?? "",
    depositPct: decStr(l.depositPct),
    balancePct: decStr(l.balancePct),
    deferralPct: decStr(l.deferralPct),
    deferralTerms: l.deferralTerms ?? "",
    inspectionCity: l.inspectionCity ?? "",
    inspectionAddress: l.inspectionAddress ?? "",
    inspectionMapUrl: l.inspectionMapUrl ?? "",
  }))

  const negotiations: NegotiationEntry[] = supplier.negotiations.map((n) => ({
    id: n.id,
    date: n.date.toISOString().slice(0, 10),
    goals: n.goals,
    summary: n.summary ?? "",
    productIds: n.products.map((p) => p.productId),
    participants: n.participants.map((p): ParticipantEntry => {
      const kind = p.employeeId
        ? "employee"
        : p.supplierContactId
          ? "supplierContact"
          : "custom"
      return {
        kind,
        employeeId: p.employeeId,
        supplierContactId: p.supplierContactId,
        customName: p.customName ?? "",
        customRole: p.customRole ?? "",
      }
    }),
  }))

  const contactOptions = supplier.contacts.map((c) => ({ id: c.id, name: c.name }))

  const buyerName = supplier.buyer
    ? `${supplier.buyer.lastName} ${supplier.buyer.firstName}`.trim()
    : null

  return (
    <div className="h-full flex flex-col gap-4 p-4 overflow-auto">
      <div className="flex flex-col gap-1">
        <Link
          href="/procurement/suppliers"
          prefetch={false}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          ← Назад к списку
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-1">
          <h2 className="text-lg font-semibold">{supplier.nameEnglish}</h2>
          <span className="text-muted-foreground text-sm">{supplier.nameForeign}</span>
          {buyerName && (
            <>
              <span className="text-muted-foreground text-sm">·</span>
              <span className="text-sm">Закупщик: {buyerName}</span>
            </>
          )}
        </div>
        {supplier.cooperationSummary &&
          (() => {
            const MARKER = "📍 Адрес:"
            const raw = supplier.cooperationSummary
            const i = raw.indexOf(MARKER)
            const text = (i >= 0 ? raw.slice(0, i) : raw).trim()
            const addr = i >= 0 ? raw.slice(i + MARKER.length).trim() : ""
            const mapsUrl = addr
              ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                  addr.replace(/\s+/g, " ").trim()
                )}`
              : null
            return (
              <div className="mt-1 space-y-1.5">
                {text && (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{text}</p>
                )}
                {addr && mapsUrl && (
                  <a
                    href={mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="Открыть на Google Картах"
                    className="flex items-start gap-1.5 w-fit text-sm text-primary hover:underline"
                  >
                    <span aria-hidden className="leading-5">📍</span>
                    <span className="whitespace-pre-wrap">{addr}</span>
                  </a>
                )}
              </div>
            )
          })()}
      </div>

      <SupplierDetailTabs
        supplierId={supplier.id}
        supplierBase={{
          id: supplier.id,
          nameForeign: supplier.nameForeign,
          nameEnglish: supplier.nameEnglish,
          buyerEmployeeId: supplier.buyerEmployeeId,
          cooperationSummary: supplier.cooperationSummary,
        }}
        buyers={buyers}
        frequentBuyerIds={frequentBuyerIds}
        contacts={contacts}
        productLinks={productLinks}
        negotiations={negotiations}
        products={products}
        employees={buyers}
        contactOptions={contactOptions}
        canManage={canManage}
      />
    </div>
  )
}
