"use client"

// Phase 9 — блок «Информация о возврате» в левой колонке диалога /support/[ticketId].
// Рендерится только если ticket.channel === "RETURN" (conditional в page.tsx).
// Содержит: сумму (₽), Shipment ID (srid), раскрываемую инструкцию WB (wbComment).

import { useState } from "react"

export interface ReturnInfoPanelProps {
  price: number | null
  wbComment: string | null
  srid: string | null
}

export function ReturnInfoPanel({
  price,
  wbComment,
  srid,
}: ReturnInfoPanelProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <section className="mt-4 pt-4 border-t space-y-2">
      <h3 className="text-xs uppercase text-muted-foreground mb-2">
        Информация о возврате
      </h3>
      {price !== null && price !== undefined && (
        <div className="text-sm">
          <span className="text-muted-foreground">Сумма: </span>
          <span className="font-medium">{price.toFixed(2)} ₽</span>
        </div>
      )}
      {srid && (
        <div className="text-xs">
          <span className="text-muted-foreground">Shipment ID: </span>
          <code className="bg-muted px-1 rounded">{srid}</code>
        </div>
      )}
      {wbComment && (
        <div className="text-xs">
          <button
            type="button"
            className="text-primary hover:underline"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Свернуть инструкцию WB" : "Показать инструкцию WB"}
          </button>
          {expanded && (
            <p className="mt-1 text-muted-foreground whitespace-pre-wrap">
              {wbComment}
            </p>
          )}
        </div>
      )}
    </section>
  )
}
