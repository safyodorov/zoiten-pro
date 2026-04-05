// components/users/UserForm.tsx
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { SECTION_OPTIONS } from "@/lib/section-labels"
import { createUser, updateUser } from "@/app/actions/users"

// UserRow is the shape from prisma.user.findMany select — passed from page → UserTable → UserDialog → UserForm
export interface UserRow {
  id: string
  name: string
  email: string
  role: "SUPERADMIN" | "MANAGER" | "VIEWER"
  allowedSections: string[]
  isActive: boolean
  createdAt: Date
}

// Single unified schema — password optional, required-on-create enforced in onSubmit
const formSchema = z.object({
  name: z.string().min(2, "Минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  password: z
    .string()
    .optional()
    .refine((v) => !v || v.length === 0 || v.length >= 8, {
      message: "Минимум 8 символов",
    }),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  allowedSections: z.array(z.string()),
  isActive: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

interface UserFormProps {
  user?: UserRow // undefined = create mode, defined = edit mode
  onSuccess: () => void
}

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Суперадмин",
  MANAGER: "Менеджер",
  VIEWER: "Просмотр",
}

export function UserForm({ user, onSuccess }: UserFormProps) {
  const isEdit = !!user
  const [isLoading, setIsLoading] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      role: user?.role ?? "VIEWER",
      allowedSections: user?.allowedSections ?? [],
      isActive: user?.isActive ?? true,
    },
  })

  const watchedRole = form.watch("role")

  async function onSubmit(data: FormData) {
    // Create mode: password is required
    if (!isEdit && (!data.password || data.password.length < 8)) {
      form.setError("password", { message: "Минимум 8 символов" })
      return
    }

    setIsLoading(true)
    try {
      let result
      if (isEdit && user) {
        result = await updateUser({
          id: user.id,
          name: data.name,
          email: data.email,
          password: data.password || "",
          role: data.role,
          allowedSections: data.allowedSections,
          isActive: data.isActive,
        })
      } else {
        result = await createUser({
          name: data.name,
          email: data.email,
          password: data.password!,
          role: data.role,
          allowedSections: data.allowedSections,
        })
      }
      if (result.ok) {
        toast.success(isEdit ? "Пользователь обновлён" : "Пользователь создан")
        onSuccess()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">

        {/* Name */}
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Имя</FormLabel>
              <FormControl><Input placeholder="Иван Иванов" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Email */}
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl><Input type="email" placeholder="user@zoiten.ru" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Password */}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{isEdit ? "Новый пароль (оставьте пустым, чтобы не менять)" : "Пароль"}</FormLabel>
              <FormControl><Input type="password" autoComplete="new-password" {...field} /></FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Role */}
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Роль</FormLabel>
              <Select onValueChange={field.onChange} defaultValue={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Выберите роль" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Section access — hidden for SUPERADMIN (bypasses section checks per lib/rbac.ts) */}
        {watchedRole !== "SUPERADMIN" && (
          <FormField
            control={form.control}
            name="allowedSections"
            render={() => (
              <FormItem>
                <FormLabel>Доступ к разделам</FormLabel>
                <div className="grid grid-cols-2 gap-2 pt-1">
                  {SECTION_OPTIONS.map((option) => (
                    <FormField
                      key={option.value}
                      control={form.control}
                      name="allowedSections"
                      render={({ field }) => (
                        <FormItem className="flex items-center space-x-2 space-y-0">
                          <FormControl>
                            <Checkbox
                              checked={(field.value as string[])?.includes(option.value)}
                              onCheckedChange={(checked) => {
                                const current = (field.value as string[]) ?? []
                                field.onChange(
                                  checked
                                    ? [...current, option.value]
                                    : current.filter((v) => v !== option.value)
                                )
                              }}
                            />
                          </FormControl>
                          <FormLabel className="font-normal text-sm">{option.label}</FormLabel>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        {watchedRole === "SUPERADMIN" && (
          <p className="text-sm text-muted-foreground">
            Суперадмин имеет доступ ко всем разделам
          </p>
        )}

        {/* isActive toggle — edit mode only (D-09) */}
        {isEdit && (
          <FormField
            control={form.control}
            name="isActive"
            render={({ field }) => (
              <FormItem className="flex items-center justify-between rounded-lg border p-3">
                <FormLabel>Активен</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        )}

        <Button type="submit" className="w-full" disabled={isLoading}>
          {isLoading ? "Сохранение..." : isEdit ? "Сохранить" : "Создать пользователя"}
        </Button>

      </form>
    </Form>
  )
}
