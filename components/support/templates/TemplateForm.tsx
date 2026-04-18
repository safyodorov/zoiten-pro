"use client"

// components/support/templates/TemplateForm.tsx
// Общая форма create/edit шаблона ответа.
// react-hook-form + zodResolver, native <select> для channel (CLAUDE.md).
// Подсказка про переменные {имя_покупателя}, {название_товара} (substitute в picker'е).

import { useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { cn } from "@/lib/utils"
import { createTemplate, updateTemplate } from "@/app/actions/templates"

const schema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Минимум 2 символа")
    .max(80, "Максимум 80 символов"),
  text: z
    .string()
    .trim()
    .min(1, "Текст не может быть пустым")
    .max(5000, "Максимум 5000 символов"),
  channel: z.enum(["FEEDBACK", "QUESTION", "CHAT"] as const),
  situationTag: z.string().trim().max(60).optional().or(z.literal("")),
  nmId: z.number().int().positive().nullable(),
  isActive: z.boolean(),
})

export type TemplateFormValues = z.input<typeof schema>

export interface TemplateFormDefaults {
  name?: string
  text?: string
  channel?: "FEEDBACK" | "QUESTION" | "CHAT"
  situationTag?: string | null
  nmId?: number | null
  isActive?: boolean
}

export function TemplateForm({
  id,
  defaults,
}: {
  id?: string
  defaults?: TemplateFormDefaults
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<TemplateFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: defaults?.name ?? "",
      text: defaults?.text ?? "",
      channel: defaults?.channel ?? "FEEDBACK",
      situationTag: defaults?.situationTag ?? "",
      nmId: defaults?.nmId ?? null,
      isActive: defaults?.isActive ?? true,
    },
  })

  const onSubmit = form.handleSubmit((values) => {
    const payload = {
      name: values.name as string,
      text: values.text as string,
      channel: values.channel as "FEEDBACK" | "QUESTION" | "CHAT",
      situationTag:
        values.situationTag && values.situationTag.length > 0
          ? (values.situationTag as string)
          : null,
      nmId: values.nmId ?? null,
      isActive: values.isActive as boolean,
    }

    startTransition(async () => {
      const res = id ? await updateTemplate(id, payload) : await createTemplate(payload)
      if (res.ok) {
        toast.success(id ? "Шаблон обновлён" : "Шаблон создан")
        router.push("/support/templates")
        router.refresh()
      } else {
        toast.error(res.error)
      }
    })
  })

  return (
    <Form {...form}>
      <form onSubmit={onSubmit} className="space-y-4 max-w-2xl">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Название *</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={field.value as string}
                  placeholder="Например: Положительный отзыв — стандарт"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="channel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Канал *</FormLabel>
              <FormControl>
                <select
                  value={field.value as string}
                  onChange={(e) => field.onChange(e.target.value)}
                  className={cn(
                    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  )}
                >
                  <option value="FEEDBACK">Отзыв</option>
                  <option value="QUESTION">Вопрос</option>
                  <option value="CHAT">Чат</option>
                </select>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="situationTag"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Ситуация / тег (опционально)</FormLabel>
              <FormControl>
                <Input
                  {...field}
                  value={(field.value as string) ?? ""}
                  placeholder="Например: «Положительный», «Размер», «Негатив 1★»"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="nmId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Артикул WB / nmId (опционально)</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="numeric"
                  value={field.value == null ? "" : String(field.value)}
                  onChange={(e) => {
                    const v = e.target.value
                    field.onChange(v === "" ? null : parseInt(v, 10))
                  }}
                  placeholder="Оставьте пустым — шаблон будет общим"
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="text"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Текст шаблона *</FormLabel>
              <FormControl>
                <textarea
                  {...field}
                  value={field.value as string}
                  rows={8}
                  className="w-full rounded-md border bg-transparent p-2 text-sm resize-y"
                  placeholder="Здравствуйте, {имя_покупателя}! Благодарим за отзыв о товаре {название_товара}..."
                />
              </FormControl>
              <p className="text-xs text-muted-foreground">
                Переменные <code className="font-mono">{"{имя_покупателя}"}</code> и{" "}
                <code className="font-mono">{"{название_товара}"}</code> подставятся
                автоматически при выборе шаблона.
              </p>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={field.value as boolean}
                  onChange={(e) => field.onChange(e.target.checked)}
                />
                Активен (показывается в picker'е при ответе на тикет)
              </label>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex gap-2 pt-4 border-t">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Сохраняем..." : id ? "Сохранить" : "Создать"}
          </Button>
          <Link href="/support/templates">
            <Button type="button" variant="outline" disabled={isPending}>
              Отмена
            </Button>
          </Link>
        </div>
      </form>
    </Form>
  )
}
