"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { Input } from "@/components/ui/input"

interface SalesForecastEndDateProps {
  value: string
  minDate: string
}

export function SalesForecastEndDate({ value, minDate }: SalesForecastEndDateProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const newVal = e.target.value
    if (!newVal) return
    const params = new URLSearchParams(searchParams.toString())
    params.set("end", newVal)
    const qs = params.toString()
    router.push(`/sales-plan${qs ? `?${qs}` : ""}`)
  }

  return (
    <div className="flex items-center gap-2">
      <label className="text-xs text-muted-foreground whitespace-nowrap">
        Прогноз до:
      </label>
      <Input
        type="date"
        value={value}
        min={minDate}
        onChange={handleChange}
        className="h-8 w-40"
      />
    </div>
  )
}
