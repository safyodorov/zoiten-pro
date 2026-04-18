// app/(dashboard)/support/new/page.tsx
// RSC — страница ручного создания MESSENGER тикета (Phase 12 Plan 03).
// Требует SUPPORT+MANAGE. Рендерит клиентскую форму NewMessengerTicketForm.

import Link from "next/link"
import { ChevronLeft } from "lucide-react"
import { requireSection } from "@/lib/rbac"
import { NewMessengerTicketForm } from "@/components/support/NewMessengerTicketForm"

export const dynamic = "force-dynamic"

export default async function NewMessengerTicketPage() {
  await requireSection("SUPPORT", "MANAGE")

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <Link
        href="/support"
        className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4 mr-1" />
        Назад к ленте
      </Link>
      <div>
        <h1 className="text-xl font-semibold">Новый тикет (MESSENGER)</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Для обращений из Telegram/WhatsApp/других каналов вне Wildberries
        </p>
      </div>
      <NewMessengerTicketForm />
    </div>
  )
}
