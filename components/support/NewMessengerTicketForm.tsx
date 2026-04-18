"use client"

// components/support/NewMessengerTicketForm.tsx
// Phase 12 Plan 03 — форма ручного создания MESSENGER тикета.
// RHF + Zod validation, native <select> для messengerType (CLAUDE.md),
// submit → createManualMessengerTicket → router.push("/support/[ticketId]").
// Для MVP всегда создаёт нового Customer (customerId: null + customerName).

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { createManualMessengerTicket } from "@/app/actions/support"

const schema = z.object({
  messengerType: z.enum(["TELEGRAM", "WHATSAPP", "OTHER"]),
  customerName: z
    .string()
    .trim()
    .min(1, "Имя обязательно")
    .max(200, "Максимум 200 символов"),
  messengerContact: z
    .string()
    .trim()
    .min(3, "Минимум 3 символа")
    .max(100, "Максимум 100 символов"),
  nmId: z
    .union([z.string(), z.number()])
    .transform((v) => {
      if (v === "" || v === null || v === undefined) return null
      const n = typeof v === "number" ? v : parseInt(String(v), 10)
      return Number.isFinite(n) && n > 0 ? n : null
    })
    .nullable()
    .optional(),
  text: z
    .string()
    .trim()
    .min(1, "Текст обязателен")
    .max(10000, "Максимум 10000 символов"),
})

type FormInput = z.input<typeof schema>

export function NewMessengerTicketForm() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const form = useForm<FormInput>({
    resolver: zodResolver(schema),
    defaultValues: {
      messengerType: "TELEGRAM",
      customerName: "",
      messengerContact: "",
      nmId: null,
      text: "",
    },
  })

  const onSubmit = form.handleSubmit((raw) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Ошибка формы")
      return
    }
    const values = parsed.data
    startTransition(async () => {
      const res = await createManualMessengerTicket({
        messengerType: values.messengerType,
        customerId: null,
        customerName: values.customerName,
        messengerContact: values.messengerContact,
        text: values.text,
        nmId: values.nmId ?? null,
      })
      if (res.ok && res.ticketId) {
        toast.success("Тикет создан")
        router.push(`/support/${res.ticketId}`)
      } else if (!res.ok) {
        toast.error(res.error)
      }
    })
  })

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <label className="text-sm font-medium" htmlFor="messengerType">
          Канал *
        </label>
        <select
          id="messengerType"
          {...form.register("messengerType")}
          className="w-full h-9 rounded-md border bg-transparent px-2 mt-1"
          disabled={isPending}
        >
          <option value="TELEGRAM">Telegram</option>
          <option value="WHATSAPP">WhatsApp</option>
          <option value="OTHER">Другое</option>
        </select>
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="customerName">
          Имя покупателя *
        </label>
        <input
          id="customerName"
          type="text"
          {...form.register("customerName")}
          placeholder="Иван Петров"
          className="w-full h-9 rounded-md border bg-transparent px-2 mt-1"
          disabled={isPending}
          maxLength={200}
        />
        {form.formState.errors.customerName && (
          <p className="text-xs text-red-600 mt-1">
            {form.formState.errors.customerName.message}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="messengerContact">
          Контакт *
        </label>
        <input
          id="messengerContact"
          type="text"
          {...form.register("messengerContact")}
          placeholder="@username или +79991234567"
          className="w-full h-9 rounded-md border bg-transparent px-2 mt-1"
          disabled={isPending}
          maxLength={100}
        />
        {form.formState.errors.messengerContact && (
          <p className="text-xs text-red-600 mt-1">
            {form.formState.errors.messengerContact.message}
          </p>
        )}
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="nmId">
          Артикул WB (необязательно)
        </label>
        <input
          id="nmId"
          type="number"
          {...form.register("nmId")}
          placeholder="12345678"
          className="w-full h-9 rounded-md border bg-transparent px-2 mt-1"
          disabled={isPending}
        />
      </div>

      <div>
        <label className="text-sm font-medium" htmlFor="text">
          Текст обращения *
        </label>
        <textarea
          id="text"
          {...form.register("text")}
          rows={6}
          placeholder="Содержание обращения покупателя..."
          className="w-full rounded-md border bg-transparent p-2 mt-1 text-sm resize-y"
          disabled={isPending}
          maxLength={10000}
        />
        {form.formState.errors.text && (
          <p className="text-xs text-red-600 mt-1">
            {form.formState.errors.text.message}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push("/support")}
          disabled={isPending}
        >
          Отмена
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? "Создание..." : "Создать тикет"}
        </Button>
      </div>
    </form>
  )
}
