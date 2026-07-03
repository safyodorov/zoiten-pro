"use client"

// components/finance/RecalcButton.tsx
// Phase 24 Plan 24-08 — «Пересчитать дату» (D-04): переоценка FinanceStockSnapshot по текущей
// ProductCost на выбранную дату баланса. Количества снапшота НЕ меняются, WB Balance API не
// вызывается (дебиторка прошлой даты не восстановима, Pitfall 6).

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { recalcBalanceDate } from "@/app/actions/finance-balance"

interface RecalcButtonProps {
  date: string // YYYY-MM-DD — дата баланса, которую пересчитываем
}

export function RecalcButton({ date }: RecalcButtonProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await recalcBalanceDate(date)
      if (result.ok) {
        toast.success("Дата пересчитана по текущей себестоимости")
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <Button
      onClick={handleClick}
      disabled={isPending}
      variant="outline"
      size="sm"
      className="gap-1.5"
      title="Переоценка остатков по текущей себестоимости; количества не меняются"
    >
      <RefreshCw className={`h-3.5 w-3.5 ${isPending ? "animate-spin" : ""}`} />
      Пересчитать дату
    </Button>
  )
}
