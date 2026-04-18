"use client"

// components/support/templates/TemplatesTable.tsx
// Клиентская таблица шаблонов ответов.
// Колонки: Название, Канал (badge), Тег, Товар/Общий, Активен, Обновлено, Действия.
// Действия: редактировать (Link), переключить активность (toggleTemplateActive),
// удалить (deleteTemplate с confirm). Toast через sonner.

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTransition } from "react"
import { toast } from "sonner"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Pencil, Trash2, Power, PowerOff } from "lucide-react"
import {
  toggleTemplateActive,
  deleteTemplate,
} from "@/app/actions/templates"
import type { ResponseTemplate } from "@prisma/client"

const CHANNEL_LABEL: Record<string, string> = {
  FEEDBACK: "Отзыв",
  QUESTION: "Вопрос",
  CHAT: "Чат",
  RETURN: "Возврат",
  MESSENGER: "Мессенджер",
}

const dateFmt = new Intl.DateTimeFormat("ru-RU", {
  timeZone: "Europe/Moscow",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
})

export function TemplatesTable({
  templates,
}: {
  templates: ResponseTemplate[]
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function onToggle(id: string) {
    startTransition(async () => {
      const res = await toggleTemplateActive(id)
      if (res.ok) {
        toast.success(res.isActive ? "Шаблон активирован" : "Шаблон деактивирован")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  function onDelete(id: string, name: string) {
    if (!confirm(`Удалить шаблон «${name}»?`)) return
    startTransition(async () => {
      const res = await deleteTemplate(id)
      if (res.ok) {
        toast.success("Шаблон удалён")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  }

  if (templates.length === 0) {
    return (
      <div className="rounded-md border py-10 text-center text-sm text-muted-foreground">
        Шаблонов не найдено. Нажмите «Новый шаблон», чтобы создать первый.
      </div>
    )
  }

  return (
    <div className="rounded-md border overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-muted/40">
          <tr className="text-left">
            <th className="px-3 py-2 font-medium">Название</th>
            <th className="px-3 py-2 font-medium">Канал</th>
            <th className="px-3 py-2 font-medium">Тег</th>
            <th className="px-3 py-2 font-medium">Товар</th>
            <th className="px-3 py-2 font-medium">Активен</th>
            <th className="px-3 py-2 font-medium">Обновлено</th>
            <th className="px-3 py-2 font-medium text-right">Действия</th>
          </tr>
        </thead>
        <tbody>
          {templates.map((t) => (
            <tr key={t.id} className="border-t hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{t.name}</td>
              <td className="px-3 py-2">
                <Badge variant="secondary">{CHANNEL_LABEL[t.channel] ?? t.channel}</Badge>
              </td>
              <td className="px-3 py-2 text-muted-foreground">
                {t.situationTag ?? "—"}
              </td>
              <td className="px-3 py-2">
                {t.nmId ? (
                  <span className="font-mono text-xs">{t.nmId}</span>
                ) : (
                  <span className="text-muted-foreground">Общий</span>
                )}
              </td>
              <td className="px-3 py-2">
                {t.isActive ? (
                  <Badge>Да</Badge>
                ) : (
                  <Badge variant="outline">Нет</Badge>
                )}
              </td>
              <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                {dateFmt.format(t.updatedAt)}
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center justify-end gap-1">
                  <Link href={`/support/templates/${t.id}/edit`}>
                    <Button variant="ghost" size="icon-sm" title="Редактировать">
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onToggle(t.id)}
                    disabled={isPending}
                    title={t.isActive ? "Деактивировать" : "Активировать"}
                  >
                    {t.isActive ? (
                      <PowerOff className="h-4 w-4" />
                    ) : (
                      <Power className="h-4 w-4" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => onDelete(t.id, t.name)}
                    disabled={isPending}
                    title="Удалить"
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
