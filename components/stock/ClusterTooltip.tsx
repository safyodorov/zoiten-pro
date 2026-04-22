"use client"

// components/stock/ClusterTooltip.tsx
// Phase 14 (STOCK-24): Tooltip с полным названием кластера + кол-во складов.
// Паттерн: PromoTooltip.tsx — base-ui render-prop (НЕ asChild).

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { CLUSTER_FULL_NAMES } from "@/lib/wb-clusters"

interface ClusterTooltipProps {
  shortName: string        // "ЦФО", "ЮГ", ...
  warehouseCount?: number  // опционально: количество складов в кластере
  children: React.ReactNode
}

export function ClusterTooltip({ shortName, warehouseCount, children }: ClusterTooltipProps) {
  const fullName = CLUSTER_FULL_NAMES[shortName] ?? shortName
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="cursor-help" />}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent>
        <div className="text-xs">
          <div className="font-medium">{fullName}</div>
          {warehouseCount !== undefined && (
            <div className="text-muted-foreground">Складов: {warehouseCount}</div>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
