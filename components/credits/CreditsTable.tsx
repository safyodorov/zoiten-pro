"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { TableBody, TableRow, TableCell } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { deleteLoan } from "@/app/actions/credits"
import { LoanModal } from "@/components/credits/LoanModal"
import type { CreditRow, LenderOption, CompanyOption } from "@/lib/credits-data"

// ── Types ──────────────────────────────────────────────────────────

interface CreditsTableProps {
  rows: CreditRow[]
  lenders: LenderOption[]
  companies: CompanyOption[]
  canManage: boolean
}

// ── Helpers ────────────────────────────────────────────────────────

function formatMoney(n: number): string {
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) + " ₽"
}

function formatDate(d: Date | null): string {
  if (!d) return "—"
  return d.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" })
}

function formatRate(pct: number): string {
  return pct.toLocaleString("ru-RU", { minimumFractionDigits: 1, maximumFractionDigits: 3 }) + "%"
}

// ── Status badge ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: "active" | "paid" }) {
  if (status === "paid") {
    return (
      <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
        Погашён
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400">
      Активен
    </span>
  )
}

// ── DeleteButton ───────────────────────────────────────────────────

function DeleteButton({ id, contractNumber }: { id: string; contractNumber: string }) {
  const [, startTransition] = useTransition()
  const [deleting, setDeleting] = useState(false)

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation()
    if (!window.confirm(`Удалить кредит «${contractNumber}»? (Мягкое удаление)`)) return
    setDeleting(true)
    startTransition(async () => {
      try {
        const result = await deleteLoan(id)
        if (result.ok) {
          toast.success("Кредит удалён")
        } else {
          toast.error(result.error)
        }
      } catch {
        toast.error("Ошибка сервера")
      } finally {
        setDeleting(false)
      }
    })
  }

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleDelete}
      disabled={deleting}
      className="h-7 px-2 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
    >
      {deleting ? "..." : "Удалить"}
    </Button>
  )
}

// ── LoanForModal type ──────────────────────────────────────────────

// LoanModal edit mode needs full loan data; here we pass CreditRow + payments from server.
// Since CreditRow is the aggregate view, we pass it as partial loan data for display;
// actual payments will be loaded lazily inside the modal (or passed as empty for re-entry).
// For editing, we reconstruct the shape LoanModal expects.
interface LoanForModal {
  id: string
  contractNumber: string
  companyId: string
  lenderId: string
  amount: number
  annualRatePct: number
  termMonths: number | null
  issueDate: Date | null
  notes: string | null
  payments: Array<{ date: Date; principal: number; interest: number }>
}

interface RowActionsProps {
  row: CreditRow
  lenders: LenderOption[]
  companies: CompanyOption[]
  loanForModal: LoanForModal
}

function RowActions({ row, lenders, companies, loanForModal }: RowActionsProps) {
  return (
    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <LoanModal
        mode="edit"
        loan={loanForModal}
        lenders={lenders}
        companies={companies}
        trigger={
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs">
            Изменить
          </Button>
        }
      />
      <DeleteButton id={row.id} contractNumber={row.contractNumber} />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────

export function CreditsTable({ rows, lenders, companies, canManage }: CreditsTableProps) {
  const router = useRouter()

  if (rows.length === 0) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="rounded-lg border bg-muted/20 py-12 px-8 text-center text-sm text-muted-foreground">
          <p className="font-medium mb-1">Кредитов пока нет</p>
          <p>Добавьте первый кредит через кнопку «Добавить кредит»</p>
        </div>
      </div>
    )
  }

  return (
    // CLAUDE.md sticky data-table pattern: single scroll container, no shadcn Table wrapper
    <div className="overflow-auto h-full rounded-lg border">
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="bg-background">
          <tr>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Организация
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Кредитор
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
              № КД
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Сумма
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Ставка %
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Срок
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Дата выдачи
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-right text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Текущий остаток
            </th>
            <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
              Статус
            </th>
            {canManage && (
              <th className="sticky top-0 z-20 bg-background border-b px-3 py-2 text-center text-xs font-semibold text-muted-foreground whitespace-nowrap">
                Действия
              </th>
            )}
          </tr>
        </thead>
        <TableBody>
          {rows.map((row) => {
            // Строим объект для LoanModal edit (payments — пустые, т.к. нет их в CreditRow)
            // Для редактирования modal может загрузить их или пользователь перезаполнит
            const companyObj = companies.find((c) => c.name === row.companyName)
            const lenderObj = lenders.find((l) => l.name === row.lenderName)
            const loanForModal: LoanForModal = {
              id: row.id,
              contractNumber: row.contractNumber,
              companyId: companyObj?.id ?? "",
              lenderId: lenderObj?.id ?? "",
              amount: row.amount,
              annualRatePct: row.annualRatePct,
              termMonths: row.termMonths,
              issueDate: row.issueDate,
              notes: null,
              payments: [],
            }

            return (
              <TableRow
                key={row.id}
                className="cursor-pointer hover:bg-muted/40"
                onClick={() => router.push(`/credits/${row.id}`)}
              >
                <TableCell className="px-3 py-2 whitespace-nowrap">
                  {row.companyName}
                </TableCell>
                <TableCell className="px-3 py-2 whitespace-nowrap">
                  {row.lenderName}
                </TableCell>
                <TableCell className="px-3 py-2 whitespace-nowrap font-mono text-xs">
                  {row.contractNumber}
                </TableCell>
                <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {formatMoney(row.amount)}
                </TableCell>
                <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {formatRate(row.annualRatePct)}
                </TableCell>
                <TableCell className="px-3 py-2 text-center whitespace-nowrap">
                  {row.termMonths !== null ? `${row.termMonths} мес` : "—"}
                </TableCell>
                <TableCell className="px-3 py-2 text-center whitespace-nowrap">
                  {row.effectiveIssueDate ? (
                    row.issueDate ? (
                      formatDate(row.effectiveIssueDate)
                    ) : (
                      // Fallback из первого платежа (D-07) — помечаем курсивом
                      <span
                        className="italic text-muted-foreground"
                        title="По дате первого платежа"
                      >
                        {formatDate(row.effectiveIssueDate)}
                      </span>
                    )
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
                  {formatMoney(row.currentBalance)}
                </TableCell>
                <TableCell className="px-3 py-2 text-center">
                  <StatusBadge status={row.status} />
                </TableCell>
                {canManage && (
                  <TableCell className="px-3 py-2 text-center">
                    <RowActions
                      row={row}
                      lenders={lenders}
                      companies={companies}
                      loanForModal={loanForModal}
                    />
                  </TableCell>
                )}
              </TableRow>
            )
          })}
        </TableBody>
      </table>
    </div>
  )
}
