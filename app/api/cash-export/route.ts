// GET /api/cash-export — выгрузка кассовых операций в XLSX (с учётом фильтров URL).
// RBAC: requireSection("CASH"). Фильтры зеркалят /cash (fund/year/dateFrom/dateTo/
// direction/department/categories/responsibles/search). Без take — выгружаем всё.
import { requireSection } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import * as XLSX from "xlsx"

export const runtime = "nodejs"

export async function GET(req: Request) {
  try {
    await requireSection("CASH")
  } catch (e) {
    const msg = e instanceof Error ? e.message : ""
    if (msg === "FORBIDDEN") return new Response("Forbidden", { status: 403 })
    return new Response("Unauthorized", { status: 401 })
  }

  const sp = new URL(req.url).searchParams

  // ── Where-builder (зеркало app/(dashboard)/cash/page.tsx) ──
  const where: Prisma.CashEntryWhereInput = {}

  const fund = sp.get("fund") ?? "yulya"
  if (fund === "yulya") where.source = { in: ["budget-yulya", "manual"] }
  else if (fund === "pavel") where.source = "budget-pavel"

  const dateFrom = sp.get("dateFrom") ? new Date(sp.get("dateFrom") + "T00:00:00.000Z") : undefined
  const dateTo = sp.get("dateTo") ? new Date(sp.get("dateTo") + "T23:59:59.999Z") : undefined
  const year = sp.get("year") ? parseInt(sp.get("year")!, 10) : undefined
  if (dateFrom || dateTo) {
    where.date = {}
    if (dateFrom) (where.date as Prisma.DateTimeFilter).gte = dateFrom
    if (dateTo) (where.date as Prisma.DateTimeFilter).lte = dateTo
  } else if (year) {
    where.date = { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) }
  }

  const direction = sp.get("direction")
  if (direction === "INCOME" || direction === "EXPENSE") where.direction = direction

  const department = sp.get("department")?.trim()
  if (department) where.department = department

  const categoryIds = sp.get("categories")?.split(",").filter(Boolean) ?? []
  if (categoryIds.length > 0) where.categoryId = { in: categoryIds }

  const responsibleIds = sp.get("responsibles")?.split(",").filter(Boolean) ?? []
  if (responsibleIds.length > 0) where.responsibleEmployeeId = { in: responsibleIds }

  const search = sp.get("search")?.trim()
  if (search) where.purpose = { contains: search, mode: "insensitive" }

  const entries = await prisma.cashEntry.findMany({
    where,
    include: { category: true, responsibleEmployee: true },
    orderBy: { date: "desc" },
  })

  const rows = entries.map((e) => ({
    Дата: e.date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" }),
    Касса: e.source === "budget-pavel" ? "Павел" : "Юля",
    Направление: e.direction === "INCOME" ? "Приход" : "Расход",
    "Сумма, ₽": Number(e.amount),
    Подразделение: e.department ?? "",
    Категория: e.category?.name ?? "",
    Назначение: e.purpose,
    Ответственный: e.responsibleEmployee
      ? `${e.responsibleEmployee.lastName} ${e.responsibleEmployee.firstName}`
      : (e.responsibleNameRaw ?? ""),
    Комментарий: e.comment ?? "",
  }))

  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(rows)
  // Авто-ширина колонок
  const keys = Object.keys(rows[0] ?? { Дата: "", Касса: "", Направление: "", "Сумма, ₽": "", Подразделение: "", Категория: "", Назначение: "", Ответственный: "", Комментарий: "" })
  ws["!cols"] = keys.map((key) => ({
    wch: Math.min(60, Math.max(key.length, ...rows.map((r) => String((r as Record<string, unknown>)[key] ?? "").length)) + 2),
  }))
  XLSX.utils.book_append_sheet(wb, ws, "Касса")

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" })

  return new Response(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="cash_${new Date().toISOString().slice(0, 10)}.xlsx"`,
    },
  })
}
