// app/(dashboard)/credits/page.tsx
// RSC — список кредитов (D-12), Phase 21
// RBAC: requireSection("CREDITS")

import { requireSection } from "@/lib/rbac"
import { getSectionRole } from "@/lib/rbac"
import { loadCredits, loadLendersAndCompanies, loadCreditsDashboard } from "@/lib/credits-data"
import { CreditsTabs } from "@/components/credits/CreditsTabs"
import { CreditsDashboard } from "@/components/credits/CreditsDashboard"
import { CreditsFilters } from "@/components/credits/CreditsFilters"
import { CreditsTable } from "@/components/credits/CreditsTable"
import { LoanModal } from "@/components/credits/LoanModal"
import { Button } from "@/components/ui/button"

export default async function CreditsPage({
  searchParams,
}: {
  searchParams: Promise<{
    companies?: string
    lenders?: string
    status?: string
  }>
}) {
  await requireSection("CREDITS")

  // canManage через getSectionRole (не через try/catch — это anti-pattern)
  const canManage = (await getSectionRole("CREDITS")) === "MANAGE"

  const { companies: companiesParam, lenders: lendersParam, status: statusParam } =
    await searchParams

  const [allRows, { lenders, companies }, dashboard] = await Promise.all([
    loadCredits(),
    loadLendersAndCompanies(),
    loadCreditsDashboard(),
  ])

  // Фильтрация на сервере по searchParams
  const selectedCompanyIds = companiesParam ? companiesParam.split(",").filter(Boolean) : []
  const selectedLenderIds = lendersParam ? lendersParam.split(",").filter(Boolean) : []
  const statusFilter = statusParam === "active" || statusParam === "paid" ? statusParam : null

  const filteredRows = allRows.filter((row) => {
    if (selectedCompanyIds.length > 0) {
      const company = companies.find((c) => c.name === row.companyName)
      if (!company || !selectedCompanyIds.includes(company.id)) return false
    }
    if (selectedLenderIds.length > 0) {
      const lender = lenders.find((l) => l.name === row.lenderName)
      if (!lender || !selectedLenderIds.includes(lender.id)) return false
    }
    if (statusFilter && row.status !== statusFilter) return false
    return true
  })

  return (
    <div className="h-full flex flex-col gap-3">
      {/* ── Шапка: табы + кнопка добавить ── */}
      <div className="flex items-center justify-between">
        <CreditsTabs />
        {canManage && (
          <LoanModal
            mode="create"
            lenders={lenders}
            companies={companies}
            trigger={
              <Button size="sm" className="shrink-0">
                + Добавить кредит
              </Button>
            }
          />
        )}
      </div>

      {/* ── Дашборд-сводка (сверху списка) ── */}
      <CreditsDashboard data={dashboard} />

      {/* ── Фильтры ── */}
      <CreditsFilters
        lenders={lenders}
        companies={companies}
        selectedLenderIds={selectedLenderIds}
        selectedCompanyIds={selectedCompanyIds}
        statusFilter={statusFilter}
      />

      {/* ── Таблица (flex-1 min-h-0 → sticky таблица) ── */}
      <div className="flex-1 min-h-0">
        <CreditsTable
          rows={filteredRows}
          lenders={lenders}
          companies={companies}
          canManage={canManage}
        />
      </div>
    </div>
  )
}
