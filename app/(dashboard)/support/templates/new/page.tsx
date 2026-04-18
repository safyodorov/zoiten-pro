// app/(dashboard)/support/templates/new/page.tsx
// RSC — страница создания шаблона ответа. MANAGE-guard,
// рендерит общий клиентский TemplateForm без defaults.

import { requireSection } from "@/lib/rbac"
import { TemplateForm } from "@/components/support/templates/TemplateForm"

export const dynamic = "force-dynamic"

export default async function NewTemplatePage() {
  await requireSection("SUPPORT", "MANAGE")
  return (
    <div className="p-6">
      <TemplateForm />
    </div>
  )
}
