"use client"

import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { createEmployee, updateEmployee, deleteEmployee } from "@/app/actions/employees"
import { toast } from "sonner"

// ── Types ──────────────────────────────────────────────────────────

interface Company {
  id: string
  name: string
}

interface EmployeePhone {
  id: string
  number: string
  type: "PERSONAL" | "WORK"
}

interface EmployeeEmail {
  id: string
  email: string
  type: "PERSONAL" | "WORK"
}

interface EmployeePass {
  id: string
  number: string
}

interface EmployeeCompanyEntry {
  id: string
  companyId: string
  company: Company
  position: string | null
  hireDate: Date | string | null
  fireDate: Date | string | null
  rate: number | string
  salary: number | null
  trudovoyDogovor: boolean
  prikazPriema: boolean
  soglasiePersDannyh: boolean
  nda: boolean
  lichnayaKartochka: boolean
  zayavlenieUvolneniya: boolean
  prikazUvolneniya: boolean
}

interface Employee {
  id: string
  lastName: string
  firstName: string
  middleName: string | null
  department: string | null
  gender: string | null
  passNumbers: number[]
  birthDate: Date | string | null
  hireDate: Date | string | null
  fireDate: Date | string | null
  companies: EmployeeCompanyEntry[]
  phones: EmployeePhone[]
  emails: EmployeeEmail[]
  passes: EmployeePass[]
}

interface EmployeeModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  employee: Employee | null
  companies: Company[]
  onSuccess?: () => void
}

// ── Helpers ────────────────────────────────────────────────────────

function formatPhoneNumber(raw: string): string {
  let digits = raw.replace(/\D/g, "")
  if (digits.startsWith("8") && digits.length === 11) digits = "7" + digits.slice(1)
  if (!digits.startsWith("7") && digits.length > 0 && digits.length >= 10) digits = "7" + digits
  if (digits.length === 11 && digits.startsWith("7")) {
    return `+7 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7, 9)}-${digits.slice(9, 11)}`
  }
  return raw
}

function toDateInputValue(val: Date | string | null | undefined): string {
  if (!val) return ""
  const d = typeof val === "string" ? new Date(val) : val
  if (isNaN(d.getTime())) return ""
  return d.toISOString().split("T")[0]
}

// ── Subcomponents ──────────────────────────────────────────────────

function SectionDivider({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 pt-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap">
        {label}
      </span>
      <div className="flex-1 h-px bg-border" />
    </div>
  )
}

function InputField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  required,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
      />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────

export function EmployeeModal({
  open,
  onOpenChange,
  employee,
  companies,
  onSuccess,
}: EmployeeModalProps) {
  const isEdit = employee !== null

  // Basic fields
  const [lastName, setLastName] = useState("")
  const [firstName, setFirstName] = useState("")
  const [middleName, setMiddleName] = useState("")
  const [department, setDepartment] = useState("")
  const [gender, setGender] = useState("")
  const [passNumbers, setPassNumbers] = useState<string[]>([])
  const [birthDate, setBirthDate] = useState("")
  const [hireDate, setHireDate] = useState("")
  const [fireDate, setFireDate] = useState("")

  // Dynamic lists
  const [empCompanies, setEmpCompanies] = useState<
    {
      companyId: string
      position: string
      hireDate: string
      fireDate: string
      rate: string
      salary: string
      trudovoyDogovor: boolean
      prikazPriema: boolean
      soglasiePersDannyh: boolean
      nda: boolean
      lichnayaKartochka: boolean
      zayavlenieUvolneniya: boolean
      prikazUvolneniya: boolean
    }[]
  >([])

  const [phones, setPhones] = useState<{ number: string; type: "PERSONAL" | "WORK" }[]>([])
  const [emails, setEmails] = useState<{ email: string; type: "PERSONAL" | "WORK" }[]>([])
  const [passes, setPasses] = useState<{ number: string }[]>([])

  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Populate form when employee changes
  useEffect(() => {
    if (employee) {
      setLastName(employee.lastName)
      setFirstName(employee.firstName)
      setMiddleName(employee.middleName ?? "")
      setDepartment(employee.department ?? "")
      setGender(employee.gender ?? "")
      setPassNumbers(employee.passNumbers?.map(String) ?? [])
      setBirthDate(toDateInputValue(employee.birthDate))
      setHireDate(toDateInputValue(employee.hireDate))
      setFireDate(toDateInputValue(employee.fireDate))
      setEmpCompanies(
        employee.companies.map((c) => ({
          companyId: c.companyId,
          position: c.position ?? "",
          hireDate: toDateInputValue(c.hireDate),
          fireDate: toDateInputValue(c.fireDate),
          rate: String(c.rate),
          salary: c.salary !== null ? String(c.salary) : "",
          trudovoyDogovor: c.trudovoyDogovor,
          prikazPriema: c.prikazPriema,
          soglasiePersDannyh: c.soglasiePersDannyh,
          nda: c.nda,
          lichnayaKartochka: c.lichnayaKartochka,
          zayavlenieUvolneniya: c.zayavlenieUvolneniya,
          prikazUvolneniya: c.prikazUvolneniya,
        }))
      )
      setPhones(employee.phones.map((p) => ({ number: formatPhoneNumber(p.number), type: p.type })))
      setEmails(employee.emails.map((e) => ({ email: e.email, type: e.type })))
      setPasses(employee.passes.map((p) => ({ number: p.number })))
    } else {
      setLastName("")
      setFirstName("")
      setMiddleName("")
      setDepartment("")
      setGender("")
      setPassNumbers([])
      setBirthDate("")
      setHireDate("")
      setFireDate("")
      setEmpCompanies([])
      setPhones([])
      setEmails([])
      setPasses([])
    }
  }, [employee, open])

  // ── Company list handlers ─────────────────────────────────────

  function addCompany() {
    setEmpCompanies((prev) => [
      ...prev,
      {
        companyId: "",
        position: "",
        hireDate: "",
        fireDate: "",
        rate: "1",
        salary: "",
        trudovoyDogovor: false,
        prikazPriema: false,
        soglasiePersDannyh: false,
        nda: false,
        lichnayaKartochka: false,
        zayavlenieUvolneniya: false,
        prikazUvolneniya: false,
      },
    ])
  }

  function removeCompany(idx: number) {
    setEmpCompanies((prev) => prev.filter((_, i) => i !== idx))
  }

  function updateCompany<K extends keyof (typeof empCompanies)[0]>(
    idx: number,
    key: K,
    value: (typeof empCompanies)[0][K]
  ) {
    setEmpCompanies((prev) => prev.map((c, i) => (i === idx ? { ...c, [key]: value } : c)))
  }

  // ── Submit ────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)

    const payload = {
      lastName: lastName.trim(),
      firstName: firstName.trim(),
      middleName: middleName.trim() || null,
      department: (department === "OFFICE" || department === "WAREHOUSE" ? department : null) as "OFFICE" | "WAREHOUSE" | null,
      gender: (gender === "MALE" || gender === "FEMALE" ? gender : null) as "MALE" | "FEMALE" | null,
      passNumbers: passNumbers.map((p) => parseInt(p)).filter((n) => !isNaN(n) && n >= 1 && n <= 10000),
      birthDate: birthDate || null,
      hireDate: hireDate || null,
      fireDate: fireDate || null,
      companies: empCompanies.filter((c) => c.companyId).map((c) => ({
        companyId: c.companyId,
        position: c.position.trim() || null,
        hireDate: c.hireDate || null,
        fireDate: c.fireDate || null,
        rate: parseFloat(c.rate) || 1,
        salary: c.salary ? parseInt(c.salary) : null,
        trudovoyDogovor: c.trudovoyDogovor,
        prikazPriema: c.prikazPriema,
        soglasiePersDannyh: c.soglasiePersDannyh,
        nda: c.nda,
        lichnayaKartochka: c.lichnayaKartochka,
        zayavlenieUvolneniya: c.zayavlenieUvolneniya,
        prikazUvolneniya: c.prikazUvolneniya,
      })),
      phones: phones.filter((p) => p.number.trim()).map((p) => ({ ...p, number: formatPhoneNumber(p.number) })),
      emails: emails.filter((em) => em.email.trim()),
      passes: passes.filter((p) => p.number.trim()),
    }

    try {
      let result
      if (isEdit && employee) {
        result = await updateEmployee({ id: employee.id, ...payload })
      } else {
        result = await createEmployee(payload)
      }

      if (result.ok) {
        toast.success(isEdit ? "Сотрудник обновлён" : "Сотрудник создан")
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ────────────────────────────────────────────────────

  async function handleDelete() {
    if (!employee) return
    if (!window.confirm(`Удалить сотрудника ${employee.lastName} ${employee.firstName}? Это действие необратимо.`)) return

    setDeleting(true)
    try {
      const result = await deleteEmployee(employee.id)
      if (result.ok) {
        toast.success("Сотрудник удалён")
        onOpenChange(false)
        onSuccess?.()
      } else {
        toast.error(result.error)
      }
    } catch {
      toast.error("Ошибка сервера")
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ────────────────────────────────────────────────────

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "Редактировать сотрудника" : "Добавить сотрудника"}</DialogTitle>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            {/* ── ФИО ── */}
            <SectionDivider label="ФИО" />
            <div className="grid grid-cols-3 gap-3">
              <InputField
                label="Фамилия"
                value={lastName}
                onChange={setLastName}
                required
                placeholder="Иванов"
              />
              <InputField
                label="Имя"
                value={firstName}
                onChange={setFirstName}
                required
                placeholder="Иван"
              />
              <InputField
                label="Отчество"
                value={middleName}
                onChange={setMiddleName}
                placeholder="Иванович"
              />
            </div>

            {/* ── Подразделение и даты ── */}
            <SectionDivider label="Общие данные" />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Подразделение</label>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Не указано</option>
                  <option value="OFFICE">Офис</option>
                  <option value="WAREHOUSE">Склад</option>
                </select>
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground">Пол</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="">Не указан</option>
                  <option value="MALE">Мужской</option>
                  <option value="FEMALE">Женский</option>
                </select>
              </div>
              <InputField
                label="Дата рождения"
                value={birthDate}
                onChange={setBirthDate}
                type="date"
              />
            </div>

            {/* ── Компании ── */}
            <SectionDivider label="Компании" />
            <div className="space-y-3">
              {empCompanies.map((ec, idx) => (
                <div key={idx} className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Компания</label>
                      <select
                        value={ec.companyId}
                        onChange={(e) => updateCompany(idx, "companyId", e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      >
                        <option value="">Не трудоустроен</option>
                        {companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Должность</label>
                      <input
                        type="text"
                        value={ec.position}
                        onChange={(e) => updateCompany(idx, "position", e.target.value)}
                        placeholder="Менеджер"
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Дата приёма</label>
                      <input
                        type="date"
                        value={ec.hireDate}
                        onChange={(e) => updateCompany(idx, "hireDate", e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Дата увольнения</label>
                      <input
                        type="date"
                        value={ec.fireDate}
                        onChange={(e) => updateCompany(idx, "fireDate", e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div className="w-20 flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Ставка</label>
                      <input
                        type="number"
                        step="0.25"
                        min="0"
                        max="1"
                        value={ec.rate}
                        onChange={(e) => updateCompany(idx, "rate", e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <div className="w-28 flex flex-col gap-1">
                      <label className="text-xs font-medium text-muted-foreground">Оклад, ₽</label>
                      <input
                        type="number"
                        value={ec.salary}
                        onChange={(e) => updateCompany(idx, "salary", e.target.value)}
                        className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => removeCompany(idx)}
                      className="mt-4 text-muted-foreground hover:text-destructive text-lg leading-none"
                    >
                      ×
                    </button>
                  </div>
                  <div className="grid grid-cols-4 gap-x-4 gap-y-1.5 pt-1">
                    {(
                      [
                        ["trudovoyDogovor", "Трудовой договор"],
                        ["prikazPriema", "Приказ приёма"],
                        ["soglasiePersDannyh", "Согласие перс.данных"],
                        ["nda", "NDA"],
                        ["lichnayaKartochka", "Личная карточка"],
                        ["zayavlenieUvolneniya", "Заявление увольнения"],
                        ["prikazUvolneniya", "Приказ увольнения"],
                      ] as const
                    ).map(([field, label]) => (
                      <label key={field} className="flex items-center gap-1.5 cursor-pointer text-xs">
                        <input
                          type="checkbox"
                          checked={ec[field]}
                          onChange={(e) => updateCompany(idx, field, e.target.checked)}
                          className="h-3.5 w-3.5 accent-primary"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addCompany}>
                + Добавить компанию
              </Button>
            </div>

            {/* ── Телефоны ── */}
            <SectionDivider label="Телефоны" />
            <div className="space-y-2">
              {phones.map((ph, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="tel"
                    value={ph.number}
                    onChange={(e) => {
                      // Mask: +7 (XXX) XXX-XX-XX
                      let digits = e.target.value.replace(/\D/g, "")
                      if (digits.startsWith("8")) digits = "7" + digits.slice(1)
                      if (!digits.startsWith("7") && digits.length > 0) digits = "7" + digits
                      let formatted = ""
                      if (digits.length > 0) formatted = "+" + digits.slice(0, 1)
                      if (digits.length > 1) formatted += " (" + digits.slice(1, 4)
                      if (digits.length > 4) formatted += ") " + digits.slice(4, 7)
                      if (digits.length > 7) formatted += "-" + digits.slice(7, 9)
                      if (digits.length > 9) formatted += "-" + digits.slice(9, 11)
                      setPhones((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, number: formatted } : p))
                      )
                    }}
                    placeholder="+7 (___) ___-__-__"
                    className="w-48 h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <select
                    value={ph.type}
                    onChange={(e) =>
                      setPhones((prev) =>
                        prev.map((p, i) =>
                          i === idx ? { ...p, type: e.target.value as "PERSONAL" | "WORK" } : p
                        )
                      )
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="WORK">Рабочий</option>
                    <option value="PERSONAL">Личный</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setPhones((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPhones((prev) => [...prev, { number: "", type: "WORK" }])}
              >
                + Добавить телефон
              </Button>
            </div>

            {/* ── Email ── */}
            <SectionDivider label="Email" />
            <div className="space-y-2">
              {emails.map((em, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="email"
                    value={em.email}
                    onChange={(e) =>
                      setEmails((prev) =>
                        prev.map((m, i) => (i === idx ? { ...m, email: e.target.value } : m))
                      )
                    }
                    placeholder="name@example.com"
                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <select
                    value={em.type}
                    onChange={(e) =>
                      setEmails((prev) =>
                        prev.map((m, i) =>
                          i === idx ? { ...m, type: e.target.value as "PERSONAL" | "WORK" } : m
                        )
                      )
                    }
                    className="h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  >
                    <option value="WORK">Рабочий</option>
                    <option value="PERSONAL">Личный</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => setEmails((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEmails((prev) => [...prev, { email: "", type: "WORK" }])}
              >
                + Добавить email
              </Button>
            </div>

            {/* ── Пропуска ── */}
            <SectionDivider label="Пропуска" />
            <div className="space-y-2">
              {passNumbers.map((pn, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="10000"
                    value={pn}
                    onChange={(e) =>
                      setPassNumbers((prev) =>
                        prev.map((p, i) => (i === idx ? e.target.value : p))
                      )
                    }
                    placeholder="1–10000"
                    className="w-32 h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setPassNumbers((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPassNumbers((prev) => [...prev, ""])}
              >
                + Добавить пропуск
              </Button>
            </div>

            {/* ── Паспорта ── */}
            <SectionDivider label="Паспорта" />
            <div className="space-y-2">
              {passes.map((ps, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={ps.number}
                    onChange={(e) =>
                      setPasses((prev) =>
                        prev.map((p, i) => (i === idx ? { ...p, number: e.target.value } : p))
                      )
                    }
                    placeholder="0000 000000"
                    className="flex-1 h-8 rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setPasses((prev) => prev.filter((_, i) => i !== idx))}
                    className="text-muted-foreground hover:text-destructive text-lg leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setPasses((prev) => [...prev, { number: "" }])}
              >
                + Добавить паспорт
              </Button>
            </div>
          </div>

          <DialogFooter className="mt-6">
            {isEdit && (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDelete}
                disabled={deleting || saving}
                className="mr-auto"
              >
                {deleting ? "Удаление..." : "Удалить"}
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={saving || deleting}>
              {saving ? "Сохранение..." : isEdit ? "Сохранить" : "Создать"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
