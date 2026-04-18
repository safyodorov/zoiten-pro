// app/(dashboard)/support/customers/[customerId]/page.tsx
// RSC — профиль покупателя: Customer + tickets + aggregates (Phase 12 Plan 02).
// Layout: 2 колонки (левый aside — CustomerInfoCard/ChannelStats/NoteEditor, правый — TicketsTable).

import { notFound } from "next/navigation"
import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import {
  countTicketsByChannel,
  averageFeedbackRating,
} from "@/lib/customer-aggregations"
import { CustomerInfoCard } from "@/components/support/customers/CustomerInfoCard"
import { ChannelStats } from "@/components/support/customers/ChannelStats"
import { NoteEditor } from "@/components/support/customers/NoteEditor"
import { TicketsTable } from "@/components/support/customers/TicketsTable"

export const dynamic = "force-dynamic"

export default async function CustomerProfilePage({
  params,
}: {
  params: Promise<{ customerId: string }>
}) {
  await requireSection("SUPPORT")
  const { customerId } = await params

  const customer = await prisma.customer.findUnique({
    where: { id: customerId },
    include: {
      tickets: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          channel: true,
          status: true,
          nmId: true,
          rating: true,
          previewText: true,
          createdAt: true,
          assignedTo: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      },
    },
  })
  if (!customer) notFound()

  const aggregationTickets = customer.tickets.map((t) => ({
    channel: t.channel,
    rating: t.rating,
  }))
  const byChannel = countTicketsByChannel(aggregationTickets)
  const avgRating = averageFeedbackRating(aggregationTickets)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Link
          href="/support"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4 mr-1" />
          Назад к ленте
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-6">
        <aside className="space-y-4">
          <CustomerInfoCard
            name={customer.name}
            phone={customer.phone}
            wbUserId={customer.wbUserId}
            createdAt={customer.createdAt}
          />
          <ChannelStats byChannel={byChannel} avgRating={avgRating} />
          <NoteEditor
            customerId={customer.id}
            initialNote={customer.note ?? ""}
          />
        </aside>
        <section>
          <h2 className="text-lg font-semibold mb-3">
            История обращений ({customer.tickets.length})
          </h2>
          <TicketsTable tickets={customer.tickets} />
        </section>
      </div>
    </div>
  )
}
