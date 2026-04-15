// components/prices/PromoTooltip.tsx
// Phase 7 (PRICES-15, D-11): Tooltip на названии акции с description + advantages + сроки.
//
// Используется в PriceCalculatorTable для строк типа "regular" и "auto".
// Обёртка над shadcn Tooltip (base-ui под капотом). Если нет ни description,
// ни advantages, ни дат — рендерит детей без обёртки (early return).

"use client"

import * as React from "react"

import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip"

interface PromoTooltipProps {
  /** Содержимое триггера (обычно название акции). */
  children: React.ReactNode
  /** Подробное описание акции (WbPromotion.description). */
  description?: string | null
  /** Список преимуществ акции (WbPromotion.advantages). */
  advantages?: readonly string[] | null
  /** ISO-строка начала акции (WbPromotion.startDateTime). */
  startDateTime?: string | null
  /** ISO-строка конца акции (WbPromotion.endDateTime). */
  endDateTime?: string | null
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
})

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return dateFmt.format(d)
}

export function PromoTooltip({
  children,
  description,
  advantages,
  startDateTime,
  endDateTime,
}: PromoTooltipProps) {
  const startFormatted = formatDate(startDateTime)
  const endFormatted = formatDate(endDateTime)
  const hasDates = !!(startFormatted || endFormatted)
  const hasContent =
    hasDates ||
    (description && description.trim().length > 0) ||
    (advantages && advantages.length > 0)

  if (!hasContent) {
    return <>{children}</>
  }

  // Строка срока: «с 01.04.2026 по 30.04.2026» / «до 30.04.2026» / «с 01.04.2026»
  let dateLine: string | null = null
  if (startFormatted && endFormatted) {
    dateLine = `с ${startFormatted} по ${endFormatted}`
  } else if (startFormatted) {
    dateLine = `с ${startFormatted}`
  } else if (endFormatted) {
    dateLine = `до ${endFormatted}`
  }

  return (
    <Tooltip>
      <TooltipTrigger
        // base-ui Trigger по умолчанию рендерит <button>; мы подменяем на
        // <span> через render-prop (shadcn/base-ui паттерн из dialog.tsx).
        render={
          <span className="text-sm hover:underline cursor-help" />
        }
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        <div className="max-w-sm text-xs space-y-2">
          {dateLine && (
            <p className="font-semibold text-primary">{dateLine}</p>
          )}
          {description && (
            <p className="leading-relaxed">{description}</p>
          )}
          {advantages && advantages.length > 0 && (
            <ul className="list-disc list-inside space-y-0.5">
              {advantages.map((advantage, idx) => (
                <li key={idx}>{advantage}</li>
              ))}
            </ul>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
