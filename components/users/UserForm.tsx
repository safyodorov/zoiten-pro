// components/users/UserForm.tsx
"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Shuffle, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { cn } from "@/lib/utils"
import { SECTION_OPTIONS } from "@/lib/section-labels"
import { generatePassword } from "@/lib/password"
import { createUser, updateUser } from "@/app/actions/users"

// ── NativeSelect (по конвенции проекта — shadcn Select ломается с defaultValue) ──

function NativeSelect({
  value,
  onChange,
  children,
  className,
}: {
  value: string
  onChange: (value: string) => void
  children: React.ReactNode
  className?: string
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cn(
        "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className
      )}
    >
      {children}
    </select>
  )
}

// ── Types ──────────────────────────────────────────────────────────

export interface UserRow {
  id: string
  name: string
  email: string
  role: "SUPERADMIN" | "MANAGER" | "VIEWER"
  allowedSections: string[]
  sectionRoles: Record<string, "VIEW" | "MANAGE">
  plainPassword: string | null
  isActive: boolean
  createdAt: Date
}

// ── Schema ─────────────────────────────────────────────────────────

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
  sectionRoles: z.record(z.string(), z.enum(["VIEW", "MANAGE"])),
  isActive: z.boolean(),
})

type FormData = z.infer<typeof formSchema>

interface UserFormProps {
  user?: UserRow
  onSuccess: () => void
}

const ROLE_LABELS: Record<string, string> = {
  SUPERADMIN: "Суперадмин",
  MANAGER: "Менеджер",
  VIEWER: "Просмотр",
}

type SectionAccess = "NONE" | "VIEW" | "MANAGE"

// ── Component ──────────────────────────────────────────────────────

export function UserForm({ user, onSuccess }: UserFormProps) {
  const isEdit = !!user
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: user?.name ?? "",
      email: user?.email ?? "",
      password: "",
      role: user?.role ?? "VIEWER",
      sectionRoles: user?.sectionRoles ?? {},
      isActive: user?.isActive ?? true,
    },
  })

  const watchedRole = form.watch("role")
  const watchedSectionRoles = form.watch("sectionRoles")

  // Получить текущий access для раздела (NONE / VIEW / MANAGE)
  function getAccess(section: string): SectionAccess {
    const role = watchedSectionRoles[section]
    return role ?? "NONE"
  }

  // Установить access для раздела
  function setAccess(section: string, access: SectionAccess) {
    const current = { ...form.getValues("sectionRoles") }
    if (access === "NONE") {
      delete current[section]
    } else {
      current[section] = access
    }
    form.setValue("sectionRoles", current, { shouldDirty: true })
  }

  // При смене общей роли — проставить access ко всем разделам
  function handleRoleChange(newRole: string) {
    form.setValue("role", newRole as "SUPERADMIN" | "MANAGER" | "VIEWER")

    if (newRole === "SUPERADMIN") {
      // Суперадмин — sectionRoles не нужен (bypasses всё)
      form.setValue("sectionRoles", {})
      return
    }

    const defaultAccess: SectionAccess = newRole === "MANAGER" ? "MANAGE" : "VIEW"
    const next: Record<string, "VIEW" | "MANAGE"> = {}
    for (const opt of SECTION_OPTIONS) {
      next[opt.value] = defaultAccess
    }
    form.setValue("sectionRoles", next, { shouldDirty: true })
  }

  function handleGeneratePassword() {
    const generated = generatePassword(12)
    form.setValue("password", generated, { shouldDirty: true })
    setShowPassword(true)
  }

  async function onSubmit(data: FormData) {
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
          sectionRoles: data.sectionRoles,
          isActive: data.isActive,
        })
      } else {
        result = await createUser({
          name: data.name,
          email: data.email,
          password: data.password!,
          role: data.role,
          sectionRoles: data.sectionRoles,
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

        {/* Password + генератор + показать/скрыть */}
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>
                {isEdit ? "Новый пароль (оставьте пустым, чтобы не менять)" : "Пароль"}
              </FormLabel>
              <FormControl>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Input
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      {...field}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      aria-label={showPassword ? "Скрыть" : "Показать"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleGeneratePassword}
                    title="Сгенерировать случайный пароль"
                  >
                    <Shuffle className="h-4 w-4" />
                  </Button>
                </div>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Общая роль — NativeSelect */}
        <FormField
          control={form.control}
          name="role"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Общая роль</FormLabel>
              <FormControl>
                <NativeSelect value={field.value} onChange={handleRoleChange}>
                  {Object.entries(ROLE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </NativeSelect>
              </FormControl>
              <p className="text-xs text-muted-foreground mt-1">
                {watchedRole === "SUPERADMIN"
                  ? "Полный доступ ко всем разделам (настройка не требуется)"
                  : "Меняет права ко всем разделам — ниже можно уточнить по каждому"}
              </p>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Точечная настройка прав per раздел */}
        {watchedRole !== "SUPERADMIN" && (
          <div className="space-y-2">
            <FormLabel>Доступ к разделам</FormLabel>
            <div className="rounded-lg border divide-y">
              {SECTION_OPTIONS.map((option) => {
                const access = getAccess(option.value)
                return (
                  <div
                    key={option.value}
                    className="flex items-center justify-between p-2.5"
                  >
                    <span className="text-sm font-medium">{option.label}</span>
                    <div className="flex gap-1">
                      {(["NONE", "VIEW", "MANAGE"] as SectionAccess[]).map((a) => (
                        <button
                          key={a}
                          type="button"
                          onClick={() => setAccess(option.value, a)}
                          className={cn(
                            "px-2.5 py-1 text-xs rounded-md border transition-colors",
                            access === a
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-muted border-input"
                          )}
                        >
                          {a === "NONE" ? "Нет" : a === "VIEW" ? "Просмотр" : "Управление"}
                        </button>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* isActive toggle — edit mode only */}
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
