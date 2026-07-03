"use client"

// components/finance/TaxSettingsModal.tsx
// Phase 24 Plan 24-08 — настройки налогов раздела «Финансы → Баланс»:
// (а) ставки НДС/налога на доходы (D-15, AppSetting finance.vatPct/finance.incomeTaxPct)
// (б) факт НДС/налога за закрытый квартал (D-17) — перекрывает расчёт в балансе.
// Текущий (незакрытый) квартал всегда расчётный — факт вводится только для прошлых кварталов.
// CLAUDE.md: native <select>, base-ui Dialog (render={...} NOT asChild), sonner toast.

import { useEffect, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Landmark } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { saveTaxRates, saveTaxPeriodActual } from "@/app/actions/finance-balance"

// ── Types ──────────────────────────────────────────────────────────────────

export interface TaxPeriodActualRow {
  year: number
  quarter: number
  vatActualRub: number | null
  incomeTaxActualRub: number | null
}

interface TaxSettingsModalProps {
  vatPct: number
  incomeTaxPct: number
  actuals: TaxPeriodActualRow[]
}

// ── Helpers ────────────────────────────────────────────────────────────────

const inputCls =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
const selectCls =
  "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"

const HISTORY_START_YEAR = 2026

function currentQuarter(): { year: number; quarter: number } {
  const now = new Date()
  return { year: now.getFullYear(), quarter: Math.floor(now.getMonth() / 3) + 1 }
}

/** Последний ЗАКРЫТЫЙ квартал (предыдущий относительно текущего) — дефолт для формы факта. */
function previousQuarter({ year, quarter }: { year: number; quarter: number }) {
  return quarter === 1 ? { year: year - 1, quarter: 4 } : { year, quarter: quarter - 1 }
}

// ── Main component ─────────────────────────────────────────────────────────

export function TaxSettingsModal({ vatPct, incomeTaxPct, actuals }: TaxSettingsModalProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)

  // ── (a) Ставки ─────────────────────────────────────────────────────────
  const [vat, setVat] = useState(String(vatPct))
  const [incomeTax, setIncomeTax] = useState(String(incomeTaxPct))

  function handleSaveRates(e: React.FormEvent) {
    e.preventDefault()
    const vatNum = Number(vat)
    const incomeTaxNum = Number(incomeTax)
    if (Number.isNaN(vatNum) || Number.isNaN(incomeTaxNum)) {
      toast.error("Ставки должны быть числом")
      return
    }
    startTransition(async () => {
      const result = await saveTaxRates({ vatPct: vatNum, incomeTaxPct: incomeTaxNum })
      if (result.ok) {
        toast.success("Ставки сохранены")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  // ── (б) Факт по кварталам ─────────────────────────────────────────────
  const nowQuarter = currentQuarter()
  const defaultPeriod = previousQuarter(nowQuarter)

  const [selectedYear, setSelectedYear] = useState(defaultPeriod.year)
  const [selectedQuarter, setSelectedQuarter] = useState(defaultPeriod.quarter)
  const [vatActual, setVatActual] = useState("")
  const [incomeTaxActual, setIncomeTaxActual] = useState("")

  const years: number[] = []
  for (let y = HISTORY_START_YEAR; y <= nowQuarter.year; y++) years.push(y)
  if (years.length === 0) years.push(nowQuarter.year)

  // При смене периода — подтягиваем уже сохранённый факт (если есть)
  useEffect(() => {
    const existing = actuals.find((a) => a.year === selectedYear && a.quarter === selectedQuarter)
    setVatActual(existing?.vatActualRub != null ? String(existing.vatActualRub) : "")
    setIncomeTaxActual(existing?.incomeTaxActualRub != null ? String(existing.incomeTaxActualRub) : "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedYear, selectedQuarter])

  const isCurrentPeriod = selectedYear === nowQuarter.year && selectedQuarter === nowQuarter.quarter

  function handleSaveActual(e: React.FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const result = await saveTaxPeriodActual({
        year: selectedYear,
        quarter: selectedQuarter,
        vatActualRub: vatActual.trim() === "" ? null : Number(vatActual),
        incomeTaxActualRub: incomeTaxActual.trim() === "" ? null : Number(incomeTaxActual),
      })
      if (result.ok) {
        toast.success("Факт квартала сохранён")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" size="sm" className="gap-1.5">
            <Landmark className="h-3.5 w-3.5" />
            Налоги
          </Button>
        }
      />

      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Настройки налогов</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* (a) Ставки */}
          <form onSubmit={handleSaveRates} className="flex flex-col gap-3">
            <div className="text-sm font-medium">Ставки</div>
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-vat">НДС, %</Label>
                <input
                  id="tax-vat"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={vat}
                  onChange={(e) => setVat(e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-income">Налог на доходы, %</Label>
                <input
                  id="tax-income"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={incomeTax}
                  onChange={(e) => setIncomeTax(e.target.value)}
                  className={inputCls}
                  required
                />
              </div>
            </div>
            <Button type="submit" size="sm" disabled={isPending} className="self-start">
              Сохранить ставки
            </Button>
          </form>

          <Separator />

          {/* (б) Факт по кварталам */}
          <form onSubmit={handleSaveActual} className="flex flex-col gap-3">
            <div className="text-sm font-medium">Факт закрытого квартала (D-17)</div>
            <p className="text-xs text-muted-foreground">
              Факт закрытого квартала заменяет расчёт; текущий квартал всегда расчётный.
            </p>

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-year">Год</Label>
                {/* native <select> — CLAUDE.md */}
                <select
                  id="tax-year"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  className={selectCls}
                >
                  {years.map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-quarter">Квартал</Label>
                <select
                  id="tax-quarter"
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                  className={selectCls}
                >
                  {[1, 2, 3, 4].map((q) => (
                    <option key={q} value={q}>
                      Q{q}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {isCurrentPeriod && (
              <p className="text-xs text-amber-600">
                Выбранный квартал — текущий (незакрытый), расчёт всегда используется вместо факта.
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-vat-actual">Факт НДС, ₽</Label>
                <input
                  id="tax-vat-actual"
                  type="number"
                  step="0.01"
                  value={vatActual}
                  onChange={(e) => setVatActual(e.target.value)}
                  placeholder="пусто = расчёт"
                  className={inputCls}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="tax-income-actual">Факт налог, ₽</Label>
                <input
                  id="tax-income-actual"
                  type="number"
                  step="0.01"
                  value={incomeTaxActual}
                  onChange={(e) => setIncomeTaxActual(e.target.value)}
                  placeholder="пусто = расчёт"
                  className={inputCls}
                />
              </div>
            </div>

            <Button type="submit" size="sm" disabled={isPending} className="self-start">
              Сохранить факт
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  )
}
