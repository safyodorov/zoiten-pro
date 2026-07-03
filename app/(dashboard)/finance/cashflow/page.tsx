// app/(dashboard)/finance/cashflow/page.tsx
// Phase 24 (24-01): заглушка ОДДС — отдельная будущая фаза.
import { requireSection } from "@/lib/rbac"
import { FinanceTabs } from "@/components/finance/FinanceTabs"
import { ComingSoon } from "@/components/ui/ComingSoon"

export const metadata = { title: "Финансы — ОДДС — Zoiten ERP" }

export default async function FinanceCashflowPage() {
  await requireSection("FINANCE")
  return (
    <div className="h-full flex flex-col gap-4">
      <FinanceTabs />
      <ComingSoon
        sectionName="ОДДС"
        description="Отчёт о движении денежных средств — следующая фаза."
      />
    </div>
  )
}
