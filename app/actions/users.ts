// app/actions/users.ts
// Server Actions for user CRUD — superadmin only (D-13)
"use server"

import { requireSuperadmin } from "@/lib/rbac"
import { auth } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { revalidatePath } from "next/cache"
import type { UserRole, ERP_SECTION, SectionRole } from "@prisma/client"

// ── Schemas ────────────────────────────────────────────────────────

const SectionRoleEnum = z.enum(["VIEW", "MANAGE"])

const CreateUserSchema = z.object({
  employeeId: z.string().min(1, "Выберите сотрудника"),
  firstName: z.string().min(1, "Имя обязательно"),
  lastName: z.string().min(1, "Фамилия обязательна"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов"),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  sectionRoles: z.record(z.string(), SectionRoleEnum),
})

const UpdateUserSchema = z.object({
  id: z.string().min(1),
  firstName: z.string().min(1, "Имя обязательно").nullable(),
  lastName: z.string().min(1, "Фамилия обязательна").nullable(),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов").optional().or(z.literal("")),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  sectionRoles: z.record(z.string(), SectionRoleEnum),
  isActive: z.boolean(),
})

type ActionResult = { ok: true } | { ok: false; error: string }

// ── Helpers ────────────────────────────────────────────────────────

function sectionRolesToData(
  userId: string,
  sectionRoles: Record<string, "VIEW" | "MANAGE">
) {
  return Object.entries(sectionRoles).map(([section, role]) => ({
    userId,
    section: section as ERP_SECTION,
    role: role as SectionRole,
  }))
}

function fullName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.trim()
}

// ── Список доступных сотрудников для создания пользователя ───────

export async function getAvailableEmployees() {
  await requireSuperadmin()

  const employees = await prisma.employee.findMany({
    where: {
      user: null, // только те у кого нет пользователя
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      middleName: true,
      emails: {
        select: { id: true, email: true, type: true },
      },
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })

  return employees
}

// ── Actions ────────────────────────────────────────────────────────

export async function createUser(
  data: z.infer<typeof CreateUserSchema>
): Promise<ActionResult> {
  try {
    await requireSuperadmin() // D-13
    const parsed = CreateUserSchema.parse(data)

    // Проверка: сотрудник не привязан к другому пользователю
    const existingUser = await prisma.user.findUnique({
      where: { employeeId: parsed.employeeId },
    })
    if (existingUser) {
      return { ok: false, error: "У этого сотрудника уже есть пользователь" }
    }

    const hashedPassword = await bcrypt.hash(parsed.password, 10)

    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          employeeId: parsed.employeeId,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          name: fullName(parsed.firstName, parsed.lastName), // legacy поле
          email: parsed.email,
          password: hashedPassword,
          plainPassword: parsed.password,
          role: parsed.role as UserRole,
          allowedSections: Object.keys(parsed.sectionRoles) as ERP_SECTION[],
        },
      })

      if (Object.keys(parsed.sectionRoles).length > 0) {
        await tx.userSectionRole.createMany({
          data: sectionRolesToData(user.id, parsed.sectionRoles),
        })
      }
    })

    revalidatePath("/admin/users")
    return { ok: true }
  } catch (e) {
    if (e instanceof Error) {
      if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
      if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
    }
    if ((e as { code?: string })?.code === "P2002") {
      return { ok: false, error: "Email или сотрудник уже используются" }
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

    // Guard: prevent superadmin self-deactivation
    const session = await auth()
    if (session?.user?.id === data.id && data.isActive === false) {
      return { ok: false, error: "Нельзя деактивировать собственный аккаунт" }
    }

    const parsed = UpdateUserSchema.parse(data)

    // Имя для legacy поля name: если firstName/lastName есть — склеиваем, иначе не трогаем
    const computedName =
      parsed.firstName && parsed.lastName
        ? fullName(parsed.firstName, parsed.lastName)
        : undefined

    const updateData: {
      firstName: string | null
      lastName: string | null
      name?: string
      email: string
      role: UserRole
      allowedSections: ERP_SECTION[]
      isActive: boolean
      password?: string
      plainPassword?: string
    } = {
      firstName: parsed.firstName,
      lastName: parsed.lastName,
      email: parsed.email,
      role: parsed.role as UserRole,
      allowedSections: Object.keys(parsed.sectionRoles) as ERP_SECTION[],
      isActive: parsed.isActive,
    }

    if (computedName) {
      updateData.name = computedName
    }

    // D-06: only update password if provided (blank = keep current hash)
    if (parsed.password && parsed.password.trim() !== "") {
      updateData.password = await bcrypt.hash(parsed.password, 10)
      updateData.plainPassword = parsed.password
    }

    await prisma.$transaction([
      prisma.user.update({ where: { id: parsed.id }, data: updateData }),
      prisma.userSectionRole.deleteMany({ where: { userId: parsed.id } }),
      ...(Object.keys(parsed.sectionRoles).length > 0
        ? [
            prisma.userSectionRole.createMany({
              data: sectionRolesToData(parsed.id, parsed.sectionRoles),
            }),
          ]
        : []),
    ])

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
