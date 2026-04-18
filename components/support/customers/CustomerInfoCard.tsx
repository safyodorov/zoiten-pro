// components/support/customers/CustomerInfoCard.tsx
// Server component — карточка данных покупателя (имя / phone / wbUserId / createdAt).
// Если wbUserId начинается с "chat:" — показываем badge «WB Chat» (auto-linked из Phase 12-01).

import { User, Phone, Calendar, Hash } from "lucide-react"

export interface CustomerInfoCardProps {
  name: string | null
  phone: string | null
  wbUserId: string | null
  createdAt: Date
}

function formatDate(d: Date): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Moscow",
  }).format(d)
}

export function CustomerInfoCard({
  name,
  phone,
  wbUserId,
  createdAt,
}: CustomerInfoCardProps) {
  const isChatCustomer = wbUserId?.startsWith("chat:") ?? false
  return (
    <section className="rounded-lg border p-4 space-y-2">
      <h2 className="text-base font-semibold flex items-center gap-2">
        <User className="w-4 h-4" />
        {name ?? "Покупатель"}
      </h2>
      {phone && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Phone className="w-3.5 h-3.5" />
          <span>{phone}</span>
        </div>
      )}
      {wbUserId && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <Hash className="w-3.5 h-3.5" />
          <code className="bg-muted px-1 rounded">{wbUserId}</code>
          {isChatCustomer && (
            <span className="text-[10px] uppercase bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-100 px-1 rounded">
              WB Chat
            </span>
          )}
        </div>
      )}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Calendar className="w-3.5 h-3.5" />
        <span>Создан {formatDate(createdAt)}</span>
      </div>
    </section>
  )
}
