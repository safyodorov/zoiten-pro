// app/(dashboard)/support/templates/[id]/edit/page.tsx
// RSC — страница редактирования шаблона. Загружает запись из Prisma,
// передаёт defaults в клиентский TemplateForm.

import { notFound } from "next/navigation"
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { TemplateForm } from "@/components/support/templates/TemplateForm"

export const dynamic = "force-dynamic"

export default async function EditTemplatePage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requireSection("SUPPORT", "MANAGE")
  const { id } = await params
  const t = await prisma.responseTemplate.findUnique({ where: { id } })
  if (!t) notFound()

  // Только FEEDBACK/QUESTION/CHAT в форме (RETURN/MESSENGER исключены в Zod
  // schema server action). Это соответствует типу TemplateFormDefaults.channel.
  const allowed = ["FEEDBACK", "QUESTION", "CHAT"] as const
  const channel = (allowed as readonly string[]).includes(t.channel)
    ? (t.channel as (typeof allowed)[number])
    : "FEEDBACK"

  return (
    <div className="p-6">
      <TemplateForm
        id={t.id}
        defaults={{
          name: t.name,
          text: t.text,
          channel,
          situationTag: t.situationTag,
          nmId: t.nmId,
          isActive: t.isActive,
        }}
      />
    </div>
  )
}
