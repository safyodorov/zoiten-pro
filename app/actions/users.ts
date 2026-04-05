// app/actions/users.ts
// Server Actions for user CRUD — superadmin only (D-13)
"use server"

import { requireSuperadmin } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import type { ERP_SECTION, UserRole } from "@prisma/client"

// ── Schemas ────────────────────────────────────────────────────────

const CreateUserSchema = z.object({
  name: z.string().min(2, "Минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов"),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  allowedSections: z.array(z.string()),
})

const UpdateUserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(2, "Минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов").optional().or(z.literal("")),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  allowedSections: z.array(z.string()),
  isActive: z.boolean(),
})

type ActionResult = { ok: true } | { ok: false; error: string }

// ── Actions ────────────────────────────────────────────────────────

export async function createUser(
  data: z.infer<typeof CreateUserSchema>
): Promise<ActionResult> {
  try {
    await requireSuperadmin() // D-13
    const parsed = CreateUserSchema.parse(data)
    const hashedPassword = await bcrypt.hash(parsed.password, 10)
    await prisma.user.create({
      data: {
        name: parsed.name,
        email: parsed.email,
        password: hashedPassword,
        role: parsed.role as UserRole,
        allowedSections: parsed.allowedSections as ERP_SECTION[],
      },
    })
    revalidatePath("/admin/users")
    return { ok: true }
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
      if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
    }
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Email уже используется" }
    }
    console.error("createUser error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function updateUser(
  data: z.infer<typeof UpdateUserSchema>
): Promise<ActionResult> {
  try {
    await requireSuperadmin() // D-13

    // Guard: prevent superadmin self-deactivation (Pitfall 5 / D-12)
    const session = await auth()
    if (session?.user?.id === data.id && data.isActive === false) {
      return { ok: false, error: "Нельзя деактивировать собственный аккаунт" }
    }

    const parsed = UpdateUserSchema.parse(data)

    const updateData: {
      name: string
      email: string
      role: UserRole
      allowedSections: ERP_SECTION[]
      isActive: boolean
      password?: string
    } = {
      name: parsed.name,
      email: parsed.email,
      role: parsed.role as UserRole,
      allowedSections: parsed.allowedSections as ERP_SECTION[],
      isActive: parsed.isActive,
    }

    // D-06: only update password if provided (blank = keep current hash)
    if (parsed.password && parsed.password.trim() !== "") {
      updateData.password = await bcrypt.hash(parsed.password, 10)
    }

    await prisma.user.update({ where: { id: parsed.id }, data: updateData })
    revalidatePath("/admin/users")
    return { ok: true }
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
      if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
    }
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Email уже используется" }
    }
    console.error("updateUser error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  try {
    await requireSuperadmin() // D-13

    // Guard: prevent deleting own account
    const session = await auth()
    if (session?.user?.id === id) {
      return { ok: false, error: "Нельзя удалить собственный аккаунт" }
    }

    await prisma.user.delete({ where: { id } })
    revalidatePath("/admin/users")
    return { ok: true }
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
      if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
    }
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Пользователь не найден" }
    }
    console.error("deleteUser error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
