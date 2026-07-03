// app/(dashboard)/finance/balance/page.tsx
// Phase 24 (24-01): RSC-стаб. Полный отчёт «Баланс» придёт в Plan 24-07.
import { requireSection } from "@/lib/rbac"
import { FinanceTabs } from "@/components/finance/FinanceTabs"
import { ComingSoon } from "@/components/ui/ComingSoon"

export const metadata = { title: "Финансы — Баланс — Zoiten ERP" }

export default async function FinanceBalancePage() {
  await requireSection("FINANCE")
  return (
    <div className="h-full flex flex-col gap-4">
      <FinanceTabs />
      <ComingSoon sectionName="Баланс" description="Отчёт в разработке (Phase 24)." />
    </div>
  )
}
