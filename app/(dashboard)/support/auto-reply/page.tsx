// app/(dashboard)/support/auto-reply/page.tsx
// Phase 10 Plan 04: RSC страница настроек автоответа в WB-чате.
// Загружает AutoReplyConfig singleton (id='default'), передаёт в client AutoReplyForm.
// RBAC read: SUPPORT (VIEW достаточно); write через saveAutoReplyConfig (SUPPORT+MANAGE).
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { AutoReplyForm } from "@/components/support/AutoReplyForm"

export const dynamic = "force-dynamic"

export default async function AutoReplyPage() {
  await requireSection("SUPPORT")

  const config = await prisma.autoReplyConfig.findUnique({
    where: { id: "default" },
  })

  return (
    <div className="max-w-2xl space-y-4 p-4">
      <div>
        <h2 className="text-lg font-semibold">Автоответ в чате</h2>
        <p className="text-sm text-muted-foreground">
          Вне рабочих часов новым сообщениям покупателей в WB-чате уходит заранее
          подготовленный ответ. Локальная функция ERP — не синхронизируется с WB
          (WB API не имеет отдельного endpoint для настроек автоответа).
        </p>
      </div>
      <AutoReplyForm config={config} />
    </div>
  )
}
