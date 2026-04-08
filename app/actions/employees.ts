// app/actions/employees.ts
// Server Actions for Employees CRUD
"use server"

import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { z } from "zod"
import { revalidatePath } from "next/cache"

// ── Types ─────────────────────────────────────────────────────────

type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }

// ── Schemas ────────────────────────────────────────────────────────

const EmployeeCompanySchema = z.object({
  companyId: z.string().min(1),
  position: z.string().optional().nullable(),
  rate: z.number().min(0).max(1).default(1),
  salary: z.number().int().nullable().optional(),
  trudovoyDogovor: z.boolean().default(false),
  prikazPriema: z.boolean().default(false),
  soglasiePersDannyh: z.boolean().default(false),
  nda: z.boolean().default(false),
  lichnayaKartochka: z.boolean().default(false),
  zayavlenieUvolneniya: z.boolean().default(false),
  prikazUvolneniya: z.boolean().default(false),
})

const EmployeePhoneSchema = z.object({
  number: z.string().min(1),
  type: z.enum(["PERSONAL", "WORK"]).default("WORK"),
})

const EmployeeEmailSchema = z.object({
  email: z.string().min(1),
  type: z.enum(["PERSONAL", "WORK"]).default("WORK"),
})

const EmployeePassSchema = z.object({
  number: z.string().min(1),
})

const EmployeeSchema = z.object({
  lastName: z.string().min(1),
  firstName: z.string().min(1),
  middleName: z.string().optional().nullable(),
  department: z.enum(["OFFICE", "WAREHOUSE"]).optional().nullable(),
  birthDate: z.string().optional().nullable(),
  hireDate: z.string().optional().nullable(),
  fireDate: z.string().optional().nullable(),
  companies: z.array(EmployeeCompanySchema).default([]),
  phones: z.array(EmployeePhoneSchema).default([]),
  emails: z.array(EmployeeEmailSchema).default([]),
  passes: z.array(EmployeePassSchema).default([]),
})

const UpdateEmployeeSchema = EmployeeSchema.extend({
  id: z.string().min(1),
})

// ── Error handler helper ──────────────────────────────────────────

function handleAuthError(e: unknown): { ok: false; error: string } | null {
  if (e instanceof Error) {
    if (e.message === "UNAUTHORIZED") return { ok: false, error: "Не авторизован" }
    if (e.message === "FORBIDDEN") return { ok: false, error: "Нет доступа" }
  }
  return null
}

function parseDate(val: string | null | undefined): Date | null {
  if (!val) return null
  const d = new Date(val)
  return isNaN(d.getTime()) ? null : d
}

// ── getEmployees ───────────────────────────────────────────────────

export async function getEmployees(params?: {
  status?: "active" | "fired" | "all"
  companyIds?: string[]
  q?: string
}) {
  await requireSection("EMPLOYEES")

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}

  const status = params?.status ?? "active"
  if (status === "active") {
    where.fireDate = null
  } else if (status === "fired") {
    where.fireDate = { not: null }
  }
  // "all" — no filter on fireDate

  if (params?.companyIds && params.companyIds.length > 0) {
    where.companies = {
      some: {
        companyId: { in: params.companyIds },
      },
    }
  }

  if (params?.q && params.q.trim()) {
    const q = params.q.trim()
    where.OR = [
      { lastName: { contains: q, mode: "insensitive" } },
      { firstName: { contains: q, mode: "insensitive" } },
      { middleName: { contains: q, mode: "insensitive" } },
    ]
  }

  return prisma.employee.findMany({
    where,
    include: {
      companies: {
        include: { company: true },
        orderBy: { company: { name: "asc" } },
      },
      phones: true,
      emails: true,
      passes: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
  })
}

// ── createEmployee ────────────────────────────────────────────────

export async function createEmployee(
  data: z.infer<typeof EmployeeSchema>
): Promise<CreateResult> {
  try {
    await requireSection("EMPLOYEES")
    const parsed = EmployeeSchema.parse(data)

    const emp = await prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({
        data: {
          lastName: parsed.lastName,
          firstName: parsed.firstName,
          middleName: parsed.middleName ?? null,
          department: parsed.department ?? null,
          birthDate: parseDate(parsed.birthDate),
          hireDate: parseDate(parsed.hireDate),
          fireDate: parseDate(parsed.fireDate),
        },
      })

      if (parsed.companies.length > 0) {
        await tx.employeeCompany.createMany({
          data: parsed.companies.map((c) => ({
            employeeId: employee.id,
            companyId: c.companyId,
            position: c.position ?? null,
            rate: c.rate,
            salary: c.salary ?? null,
            trudovoyDogovor: c.trudovoyDogovor,
            prikazPriema: c.prikazPriema,
            soglasiePersDannyh: c.soglasiePersDannyh,
            nda: c.nda,
            lichnayaKartochka: c.lichnayaKartochka,
            zayavlenieUvolneniya: c.zayavlenieUvolneniya,
            prikazUvolneniya: c.prikazUvolneniya,
          })),
        })
      }

      if (parsed.phones.length > 0) {
        await tx.employeePhone.createMany({
          data: parsed.phones.map((p) => ({
            employeeId: employee.id,
            number: p.number,
            type: p.type,
          })),
        })
      }

      if (parsed.emails.length > 0) {
        await tx.employeeEmail.createMany({
          data: parsed.emails.map((e) => ({
            employeeId: employee.id,
            email: e.email,
            type: e.type,
          })),
        })
      }

      if (parsed.passes.length > 0) {
        await tx.employeePass.createMany({
          data: parsed.passes.map((p) => ({
            employeeId: employee.id,
            number: p.number,
          })),
        })
      }

      return employee
    })

    revalidatePath("/employees")
    return { ok: true, id: emp.id }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    console.error("createEmployee error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── updateEmployee ────────────────────────────────────────────────

export async function updateEmployee(
  data: z.infer<typeof UpdateEmployeeSchema>
): Promise<ActionResult> {
  try {
    await requireSection("EMPLOYEES")
    const parsed = UpdateEmployeeSchema.parse(data)

    await prisma.$transaction(async (tx) => {
      await tx.employee.update({
        where: { id: parsed.id },
        data: {
          lastName: parsed.lastName,
          firstName: parsed.firstName,
          middleName: parsed.middleName ?? null,
          department: parsed.department ?? null,
          birthDate: parseDate(parsed.birthDate),
          hireDate: parseDate(parsed.hireDate),
          fireDate: parseDate(parsed.fireDate),
        },
      })

      // Replace all nested relations (delete + recreate)
      await tx.employeeCompany.deleteMany({ where: { employeeId: parsed.id } })
      if (parsed.companies.length > 0) {
        await tx.employeeCompany.createMany({
          data: parsed.companies.map((c) => ({
            employeeId: parsed.id,
            companyId: c.companyId,
            position: c.position ?? null,
            rate: c.rate,
            salary: c.salary ?? null,
            trudovoyDogovor: c.trudovoyDogovor,
            prikazPriema: c.prikazPriema,
            soglasiePersDannyh: c.soglasiePersDannyh,
            nda: c.nda,
            lichnayaKartochka: c.lichnayaKartochka,
            zayavlenieUvolneniya: c.zayavlenieUvolneniya,
            prikazUvolneniya: c.prikazUvolneniya,
          })),
        })
      }

      await tx.employeePhone.deleteMany({ where: { employeeId: parsed.id } })
      if (parsed.phones.length > 0) {
        await tx.employeePhone.createMany({
          data: parsed.phones.map((p) => ({
            employeeId: parsed.id,
            number: p.number,
            type: p.type,
          })),
        })
      }

      await tx.employeeEmail.deleteMany({ where: { employeeId: parsed.id } })
      if (parsed.emails.length > 0) {
        await tx.employeeEmail.createMany({
          data: parsed.emails.map((e) => ({
            employeeId: parsed.id,
            email: e.email,
            type: e.type,
          })),
        })
      }

      await tx.employeePass.deleteMany({ where: { employeeId: parsed.id } })
      if (parsed.passes.length > 0) {
        await tx.employeePass.createMany({
          data: parsed.passes.map((p) => ({
            employeeId: parsed.id,
            number: p.number,
          })),
        })
      }
    })

    revalidatePath("/employees")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Сотрудник не найден" }
    }
    console.error("updateEmployee error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}

// ── deleteEmployee ────────────────────────────────────────────────

export async function deleteEmployee(id: string): Promise<ActionResult> {
  try {
    await requireSection("EMPLOYEES")
    await prisma.employee.delete({ where: { id } })
    revalidatePath("/employees")
    return { ok: true }
  } catch (e) {
    const authErr = handleAuthError(e)
    if (authErr) return authErr
    if ((e as { code?: string })?.code === "P2025") {
      return { ok: false, error: "Сотрудник не найден" }
    }
    console.error("deleteEmployee error:", e)
    return { ok: false, error: "Ошибка сервера" }
  }
}
