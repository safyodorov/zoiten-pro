// app/(dashboard)/finance/pnl/page.tsx
// Phase 24 (24-01): заглушка ОПиУ — отдельная будущая фаза.
import { requireSection } from "@/lib/rbac"
import { FinanceTabs } from "@/components/finance/FinanceTabs"
import { ComingSoon } from "@/components/ui/ComingSoon"

export const metadata = { title: "Финансы — ОПиУ — Zoiten ERP" }

export default async function FinancePnlPage() {
  await requireSection("FINANCE")
  return (
    <div className="h-full flex flex-col gap-4">
      <FinanceTabs />
      <ComingSoon
        sectionName="ОПиУ"
        description="Отчёт о прибылях и убытках — будущая фаза."
      />
    </div>
  )
}
