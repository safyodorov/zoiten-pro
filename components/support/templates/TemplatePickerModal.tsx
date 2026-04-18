"use client"

// components/support/templates/TemplatePickerModal.tsx
// Модалка выбора шаблона ответа в ReplyPanel (FEEDBACK/QUESTION) и
// ChatReplyPanel (CHAT, Phase 10 TODO).
// Группирует шаблоны: «Для этого товара» (template.nmId === ticket.nmId) + «Общие».
// При onPick вызывает substituteTemplateVars → передаёт готовый текст родителю.

import { useMemo, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { substituteTemplateVars } from "@/lib/template-vars"
import type { ResponseTemplate } from "@prisma/client"

export type PickerChannel = "FEEDBACK" | "QUESTION" | "CHAT"

export interface TemplatePickerModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  templates: ResponseTemplate[]
  ticketNmId: number | null
  channel: PickerChannel
  customerName: string | null
  productName: string | null
  onPick: (substitutedText: string) => void
}

// ── Pure helper (экспортируется для unit тестов) ───────────────────
// Возвращает две группы шаблонов: forNmId (точное совпадение с тикетом) и
// general (nmId=null или другой nmId). Фильтрует по channel, isActive и
// поисковому запросу (name/text/situationTag, регистронезависимо).

export function groupTemplatesForPicker(
  templates: ResponseTemplate[],
  opts: {
    channel: PickerChannel
    ticketNmId: number | null
    query?: string
  }
): { forNmId: ResponseTemplate[]; general: ResponseTemplate[] } {
  const query = opts.query?.trim().toLowerCase() ?? ""
  const filtered = templates.filter((t) => {
    if (!t.isActive) return false
    if (t.channel !== opts.channel) return false
    if (!query) return true
    return (
      t.name.toLowerCase().includes(query) ||
      t.text.toLowerCase().includes(query) ||
      (t.situationTag?.toLowerCase().includes(query) ?? false)
    )
  })
  const forNmId =
    opts.ticketNmId !== null
      ? filtered.filter((t) => t.nmId === opts.ticketNmId)
      : []
  const general = filtered.filter(
    (t) =>
      t.nmId === null ||
      (opts.ticketNmId !== null && t.nmId !== opts.ticketNmId)
  )
  return { forNmId, general }
}

// ── Компонент ──────────────────────────────────────────────────────

export function TemplatePickerModal({
  open,
  onOpenChange,
  templates,
  ticketNmId,
  channel,
  customerName,
  productName,
  onPick,
}: TemplatePickerModalProps) {
  const [q, setQ] = useState("")

  const { forNmId, general } = useMemo(
    () => groupTemplatesForPicker(templates, { channel, ticketNmId, query: q }),
    [templates, channel, ticketNmId, q]
  )
  const empty = forNmId.length === 0 && general.length === 0

  function handlePick(template: ResponseTemplate) {
    const result = substituteTemplateVars(template.text, {
      customerName,
      productName,
    })
    onPick(result)
    onOpenChange(false)
    setQ("")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Выбрать шаблон ответа</DialogTitle>
        </DialogHeader>
        <input
          type="text"
          placeholder="Поиск по названию, тексту или тегу..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
          autoFocus
        />
        <div className="max-h-[400px] overflow-y-auto space-y-4">
          {empty && (
            <div className="text-sm text-muted-foreground py-8 text-center">
              Нет шаблонов для этого канала
            </div>
          )}
          {forNmId.length > 0 && (
            <section>
              <h3 className="text-xs uppercase text-muted-foreground mb-2">
                Для этого товара
              </h3>
              <ul className="space-y-1">
                {forNmId.map((tpl) => (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(tpl)}
                      className="w-full text-left rounded border px-3 py-2 hover:bg-muted"
                    >
                      <div className="font-medium text-sm">{tpl.name}</div>
                      {tpl.situationTag && (
                        <div className="text-xs text-muted-foreground">
                          {tpl.situationTag}
                        </div>
                      )}
                      <div className="text-xs mt-1 line-clamp-2 text-muted-foreground">
                        {tpl.text}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {general.length > 0 && (
            <section>
              <h3 className="text-xs uppercase text-muted-foreground mb-2">
                Общие шаблоны
              </h3>
              <ul className="space-y-1">
                {general.map((tpl) => (
                  <li key={tpl.id}>
                    <button
                      type="button"
                      onClick={() => handlePick(tpl)}
                      className="w-full text-left rounded border px-3 py-2 hover:bg-muted"
                    >
                      <div className="font-medium text-sm">{tpl.name}</div>
                      {tpl.situationTag && (
                        <div className="text-xs text-muted-foreground">
                          {tpl.situationTag}
                        </div>
                      )}
                      <div className="text-xs mt-1 line-clamp-2 text-muted-foreground">
                        {tpl.text}
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
