// prisma/seed-employees.ts
// Parses /Users/macmini/Desktop/Сотрудники.xlsx and seeds Company/Employee tables.
// Run: npm run seed:employees

import * as XLSX from "xlsx"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// ── Excel helpers ──────────────────────────────────────────────────

function excelSerialToDate(serial: number): Date | null {
  if (!serial || isNaN(serial)) return null
  // Excel epoch starts 1900-01-00 (but has leap year bug: 1900-02-29 counted)
  // JS: days since 1970-01-01
  const epoch = new Date(Date.UTC(1899, 11, 30)) // 1899-12-30
  const ms = epoch.getTime() + serial * 86400000
  return new Date(ms)
}

function parseDate(val: unknown): Date | null {
  if (!val || val === "") return null
  if (typeof val === "number") return excelSerialToDate(val)
  if (typeof val === "string") {
    const cleaned = val.trim()
    if (!cleaned || cleaned === "-") return null
    // Try DD.MM.YYYY
    const match = cleaned.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
    if (match) {
      return new Date(Date.UTC(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1])))
    }
    const d = new Date(cleaned)
    if (!isNaN(d.getTime())) return d
  }
  return null
}

function parseBoolean(val: unknown): boolean {
  const s = String(val ?? "").trim().toLowerCase()
  return s === "да" || s === "yes" || s === "true" || s === "1"
}

function normalizePhone(val: unknown): string | null {
  const s = String(val ?? "").trim()
  if (!s || s === "0" || s === "" || s === "нет") return null
  // Keep as string (may be numeric from Excel)
  return s.replace(/\D/g, "").length >= 7 ? s : null
}

function normalizeName(val: unknown): string {
  return String(val ?? "").trim()
}

// ── Parse "Сотрудники " sheet ─────────────────────────────────────

interface EmployeeRow {
  fullName: string
  position: string
  rate: number
  salary: number | null
  hireDate: Date | null
  fireDate: Date | null
  trudovoyDogovor: boolean
  prikazPriema: boolean
  soglasiePersDannyh: boolean
  nda: boolean
  lichnayaKartochka: boolean
  zayavlenieUvolneniya: boolean
  prikazUvolneniya: boolean
  workPhone: string | null
  isFired: boolean
  companyName: string
}

// Known company names from Excel
const KNOWN_COMPANIES = new Set([
  "ГЕЙМ БЛОКС", "ДРИМ ЛАЙН", "ЗОЙТЕН", "ПЕЛИКАН ХЭППИ ТОЙС", "СИКРЕТ ВЭЙ", "ХОУМ ЭНД БЬЮТИ",
])

function isCompanyHeader(val: string): boolean {
  return KNOWN_COMPANIES.has(val.toUpperCase()) || KNOWN_COMPANIES.has(val)
}

function parseEmployeesSheet(rows: unknown[][]): EmployeeRow[] {
  const result: EmployeeRow[] = []
  let currentCompany = ""
  let isFired = false

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const first = normalizeName(row[0])
    if (!first) continue

    // Company header: known company name
    if (isCompanyHeader(first)) {
      currentCompany = first
      isFired = false
      continue
    }

    // Section markers
    if (first === "Актуальное") {
      isFired = false
      continue
    }
    if (first === "Уволенные") {
      isFired = true
      continue
    }

    // Skip if no company context yet
    if (!currentCompany) continue

    // Skip if looks like a sub-header
    const secondCol = normalizeName(row[1])
    if (secondCol === "Должность" || secondCol === "NaN") continue

    // Parse employee row
    // col 0: ФИО, 1: Должность, 2: Ставка, 3: Оклад, 4: Часы, 5: эффективный оклад
    // 6: Дата приема, 7: Трудовой договор, 8: Приказ, 9: Согласие, 10: NDA
    // 11: Личная карточка, 12: Лист оз, 13: Раб тел, 14: Личн тел, 15: Карта
    // 16: Заявление увольнения, 17: Приказ увольнения, 18: Дата увольнения
    const fullName = first
    const position = secondCol
    const rate = parseFloat(String(row[2] ?? "0")) || 0
    const salary = row[5] !== "" && row[5] !== null && row[5] !== undefined
      ? parseInt(String(row[5])) || null
      : null
    const hireDate = parseDate(row[6])
    const trudovoyDogovor = parseBoolean(row[7])
    const prikazPriema = parseBoolean(row[8])
    const soglasiePersDannyh = parseBoolean(row[9])
    const nda = parseBoolean(row[10])
    const lichnayaKartochka = parseBoolean(row[11])
    const zayavlenieUvolneniya = parseBoolean(row[16])
    const prikazUvolneniya = parseBoolean(row[17])
    const fireDate = parseDate(row[18])
    const workPhone = normalizePhone(row[13])

    result.push({
      fullName,
      position,
      rate,
      salary,
      hireDate,
      fireDate: isFired && !fireDate ? null : fireDate,
      trudovoyDogovor,
      prikazPriema,
      soglasiePersDannyh,
      nda,
      lichnayaKartochka,
      zayavlenieUvolneniya,
      prikazUvolneniya,
      workPhone,
      isFired,
      companyName: currentCompany,
    })
  }

  return result
}

// ── Parse "Номера" sheet ───────────────────────────────────────────

interface PhoneRecord {
  fullName: string
  phone: string | null
  birthDate: Date | null
  passport: string | null
}

function parseNomeraSheet(rows: unknown[][]): PhoneRecord[] {
  const result: PhoneRecord[] = []
  // row 0 is header
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]
    const fullName = normalizeName(row[0])
    if (!fullName || fullName.startsWith("Служба поддержки") || fullName.startsWith("Зойтен Бот") || fullName.startsWith("Апотекс") || fullName === "мой номер") continue
    const phone = normalizePhone(row[1])
    const birthDate = parseDate(row[2])
    const passport = row[3] ? String(row[3]).trim() : null
    if (fullName) {
      result.push({ fullName, phone, birthDate, passport: passport || null })
    }
  }
  return result
}

// ── Name parsing ──────────────────────────────────────────────────

function splitFullName(fullName: string): { lastName: string; firstName: string; middleName: string | null } {
  const parts = fullName.trim().split(/\s+/)
  const lastName = parts[0] ?? ""
  const firstName = parts[1] ?? ""
  const middleName = parts.length > 2 ? parts.slice(2).join(" ") : null
  return { lastName, firstName, middleName }
}

function nameKey(fullName: string): string {
  return fullName.trim().toLowerCase().replace(/\s+/g, " ")
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  const xlPath = process.env.EXCEL_PATH ?? "/Users/macmini/Desktop/Сотрудники.xlsx"
  const wb = XLSX.readFile(xlPath)

  const employeesWs = wb.Sheets["Сотрудники "]
  const nomeraWs = wb.Sheets["Номера"]

  const employeeRows = XLSX.utils.sheet_to_json(employeesWs, { header: 1, defval: "" }) as unknown[][]
  const nomeraRows = XLSX.utils.sheet_to_json(nomeraWs, { header: 1, defval: "" }) as unknown[][]

  const employees = parseEmployeesSheet(employeeRows)
  const phoneRecords = parseNomeraSheet(nomeraRows)

  // Build lookup map for Номера sheet: nameKey -> record
  const nomeraMap = new Map<string, PhoneRecord>()
  for (const r of phoneRecords) {
    nomeraMap.set(nameKey(r.fullName), r)
  }

  // Collect unique company names
  const companyNames = [...new Set(employees.map((e) => e.companyName))]
  console.log(`Found ${companyNames.length} companies:`, companyNames)

  // Upsert companies
  const companyMap = new Map<string, string>() // name -> id
  for (const name of companyNames) {
    const company = await prisma.company.upsert({
      where: { name },
      update: {},
      create: { name },
    })
    companyMap.set(name, company.id)
  }
  console.log(`Seeded ${companyNames.length} companies`)

  // Group employee rows by unique person (lastName+firstName+middleName)
  // One employee can appear in multiple companies
  interface PersonData {
    fullName: string
    rows: EmployeeRow[]
  }
  const personMap = new Map<string, PersonData>()
  for (const row of employees) {
    const key = nameKey(row.fullName)
    if (!personMap.has(key)) {
      personMap.set(key, { fullName: row.fullName, rows: [] })
    }
    personMap.get(key)!.rows.push(row)
  }

  let employeeCount = 0

  for (const [key, person] of personMap) {
    const { lastName, firstName, middleName } = splitFullName(person.fullName)
    if (!lastName || !firstName) continue

    // Look up personal data from Номера sheet
    const nomeraRecord = nomeraMap.get(key)

    // Determine birthDate: from Номера sheet
    const birthDate = nomeraRecord?.birthDate ?? null

    // Determine fireDate: if ANY company entry has a fireDate, use it; if all are fired, use earliest non-null or null
    // Actually: use the most recent fireDate across all company entries where isFired
    const allFired = person.rows.every((r) => r.isFired)
    let fireDate: Date | null = null
    if (allFired) {
      // Find any non-null fireDate
      const fireDates = person.rows.map((r) => r.fireDate).filter((d): d is Date => d !== null)
      fireDate = fireDates.length > 0 ? fireDates[fireDates.length - 1] : null
    }

    // Use first row's hireDate and position (primary company entry)
    const primaryRow = person.rows[0]
    const hireDate = primaryRow.hireDate
    const position = primaryRow.position || null

    // Delete existing employee data (for idempotency)
    const existing = await prisma.employee.findFirst({
      where: { lastName, firstName, middleName: middleName ?? undefined },
    })
    if (existing) {
      await prisma.employee.delete({ where: { id: existing.id } })
    }

    // Create employee
    const emp = await prisma.employee.create({
      data: {
        lastName,
        firstName,
        middleName,
        position,
        birthDate,
        hireDate,
        fireDate,
      },
    })

    // Create EmployeeCompany entries for each company this person appears in
    for (const row of person.rows) {
      const companyId = companyMap.get(row.companyName)
      if (!companyId) continue

      // Check if this company entry already exists (shouldn't since we deleted employee)
      await prisma.employeeCompany.create({
        data: {
          employeeId: emp.id,
          companyId,
          rate: row.rate || 1,
          salary: row.salary,
          trudovoyDogovor: row.trudovoyDogovor,
          prikazPriema: row.prikazPriema,
          soglasiePersDannyh: row.soglasiePersDannyh,
          nda: row.nda,
          lichnayaKartochka: row.lichnayaKartochka,
          zayavlenieUvolneniya: row.zayavlenieUvolneniya,
          prikazUvolneniya: row.prikazUvolneniya,
        },
      })
    }

    // Work phone from main sheet (primary row)
    if (primaryRow.workPhone) {
      await prisma.employeePhone.create({
        data: {
          employeeId: emp.id,
          number: primaryRow.workPhone,
          type: "WORK",
        },
      })
    }

    // Personal phone from Номера sheet
    if (nomeraRecord?.phone) {
      await prisma.employeePhone.create({
        data: {
          employeeId: emp.id,
          number: nomeraRecord.phone,
          type: "PERSONAL",
        },
      })
    }

    // Passport from Номера sheet
    if (nomeraRecord?.passport) {
      await prisma.employeePass.create({
        data: {
          employeeId: emp.id,
          number: nomeraRecord.passport,
        },
      })
    }

    employeeCount++
  }

  console.log(`Seeded ${employeeCount} employees`)
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
