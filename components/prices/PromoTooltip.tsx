// components/prices/PromoTooltip.tsx
// Phase 7 (PRICES-15, D-11): Tooltip на названии акции с description + advantages.
//
// Используется в PriceCalculatorTable для строк типа "regular" и "auto".
// Обёртка над shadcn Tooltip (base-ui под капотом). Если нет ни description,
// ни advantages — рендерит детей без обёртки (early return).

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
}

export function PromoTooltip({
  children,
  description,
  advantages,
}: PromoTooltipProps) {
  const hasContent =
    (description && description.trim().length > 0) ||
    (advantages && advantages.length > 0)

  if (!hasContent) {
    return <>{children}</>
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
