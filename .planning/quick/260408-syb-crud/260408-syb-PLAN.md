---
phase: quick
plan: 260408-syb
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - prisma/seed-employees.ts
  - app/actions/employees.ts
  - app/(dashboard)/employees/page.tsx
  - components/employees/EmployeesTable.tsx
  - components/employees/EmployeeFilters.tsx
  - components/employees/EmployeeModal.tsx
autonomous: true
requirements: [EMPLOYEES-CRUD]

must_haves:
  truths:
    - "Таблица сотрудников отображает ФИО, компанию, должность, дату рождения с возрастом, раб.телефон, раб.email"
    - "Статус-бейджи: зеленый (активный) / красный (уволен)"
    - "Подсветка дней рождения: свечение если ДР в пределах 10 дней, фейерверк-эмодзи в сам день"
    - "Фильтры: Все/Актуальная/Уволенные (по умолчанию Актуальная), MultiSelect по компании"
    - "Клик по строке открывает модалку со ВСЕМИ данными сотрудника, редактируемую"
    - "Кнопка Добавить сотрудника открывает ту же модалку в режиме создания"
    - "Кнопка Разбить по компаниям группирует таблицу"
    - "Сид-скрипт парсит Excel и заполняет БД компаниями и сотрудниками"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "Company, Employee, EmployeeCompany, EmployeePhone, EmployeeEmail, EmployeePass models"
      contains: "model Employee"
    - path: "app/actions/employees.ts"
      provides: "CRUD server actions for employees"
      exports: ["createEmployee", "updateEmployee", "deleteEmployee", "getEmployees"]
    - path: "components/employees/EmployeesTable.tsx"
      provides: "Table with status badges, birthday highlights, sorting"
    - path: "components/employees/EmployeeModal.tsx"
      provides: "Dialog for create/edit employee with all fields"
    - path: "prisma/seed-employees.ts"
      provides: "Excel parser + DB seeder"
  key_links:
    - from: "app/(dashboard)/employees/page.tsx"
      to: "app/actions/employees.ts"
      via: "server action calls for data fetching"
      pattern: "getEmployees"
    - from: "components/employees/EmployeeModal.tsx"
      to: "app/actions/employees.ts"
      via: "createEmployee/updateEmployee server actions"
      pattern: "createEmployee|updateEmployee"
    - from: "components/employees/EmployeesTable.tsx"
      to: "components/employees/EmployeeModal.tsx"
      via: "row click opens modal with employee data"
---

<objective>
Создать полнофункциональный модуль Сотрудники: модели БД, CRUD server actions, таблица с фильтрами, модалка создания/редактирования, сид-скрипт из Excel.

Purpose: Заменить заглушку раздела Сотрудники рабочим модулем с полным управлением данными сотрудников по компаниям.
Output: Работающая страница /employees с таблицей, фильтрами, модалкой, данными из Excel.
</objective>

<execution_context>
@.planning/quick/260408-syb-crud/260408-syb-PLAN.md
</execution_context>

<context>
@CLAUDE.md
@prisma/schema.prisma
@app/actions/products.ts (server actions pattern)
@app/(dashboard)/products/page.tsx (table page pattern)
@components/products/ProductFilters.tsx (MultiSelectDropdown pattern)
@components/ui/dialog.tsx (base-ui Dialog API)

<interfaces>
<!-- Dialog exports from components/ui/dialog.tsx (base-ui, NOT radix) -->
```typescript
// base-ui Dialog — uses data-open/data-closed (NOT data-state)
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogTitle, DialogTrigger }
// DialogContent has showCloseButton prop, max-w-sm by default — override className for wider modal
// DialogPrimitive from "@base-ui/react/dialog"
```

<!-- Server action pattern from app/actions/products.ts -->
```typescript
type ActionResult = { ok: true } | { ok: false; error: string }
type CreateResult = { ok: true; id: string } | { ok: false; error: string }
function handleAuthError(e: unknown): { ok: false; error: string } | null
// Pattern: "use server" → requireSection() → zod parse → prisma → revalidatePath → return
```

<!-- MultiSelectDropdown pattern from ProductFilters.tsx -->
```typescript
// Inline component (not exported from ui/), uses Checkbox, ChevronDown, useRef for outside click
function MultiSelectDropdown({ label, options, selected, onChange }: {
  label: string; options: FilterOption[]; selected: string[]; onChange: (values: string[]) => void
})
```

<!-- xlsx package available (^0.18.5) — import * as XLSX from "xlsx" -->
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Prisma schema + migration + seed script</name>
  <files>
    prisma/schema.prisma
    prisma/seed-employees.ts
  </files>
  <action>
1. Add enums and models to prisma/schema.prisma (APPEND after existing models, do NOT modify existing models):

```
enum PhoneType {
  PERSONAL
  WORK
}

enum EmailType {
  PERSONAL
  WORK
}

model Company {
  id        String            @id @default(cuid())
  name      String            @unique
  employees EmployeeCompany[]
  createdAt DateTime          @default(now())
}

model Employee {
  id         String            @id @default(cuid())
  lastName   String
  firstName  String
  middleName String?
  position   String?
  birthDate  DateTime?
  hireDate   DateTime?
  fireDate   DateTime?
  companies  EmployeeCompany[]
  phones     EmployeePhone[]
  emails     EmployeeEmail[]
  passes     EmployeePass[]
  createdAt  DateTime          @default(now())
  updatedAt  DateTime          @updatedAt
}

model EmployeeCompany {
  id                    String   @id @default(cuid())
  employeeId            String
  employee              Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  companyId             String
  company               Company  @relation(fields: [companyId], references: [id], onDelete: Restrict)
  rate                  Decimal  @default(1) @db.Decimal(3,2)
  salary                Int?
  trudovoyDogovor       Boolean  @default(false)
  prikazPriema          Boolean  @default(false)
  soglasiePersDannyh    Boolean  @default(false)
  nda                   Boolean  @default(false)
  lichnayaKartochka     Boolean  @default(false)
  zayavlenieUvolneniya  Boolean  @default(false)
  prikazUvolneniya      Boolean  @default(false)

  @@unique([employeeId, companyId])
}

model EmployeePhone {
  id         String    @id @default(cuid())
  employeeId String
  employee   Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  number     String
  type       PhoneType @default(WORK)
}

model EmployeeEmail {
  id         String    @id @default(cuid())
  employeeId String
  employee   Employee  @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  email      String
  type       EmailType @default(WORK)
}

model EmployeePass {
  id         String   @id @default(cuid())
  employeeId String
  employee   Employee @relation(fields: [employeeId], references: [id], onDelete: Cascade)
  number     String
}
```

2. Run `npx prisma migrate dev --name add_employees_module` to create migration.

3. Create `prisma/seed-employees.ts` — a standalone script that:
   - Uses `import * as XLSX from "xlsx"` to read `/Users/macmini/Desktop/Сотрудники.xlsx`
   - Sheet "Сотрудники " (with trailing space) contains: company names in merged header rows, employee rows with columns for ФИО, должность, ставка, оклад, дата приёма, дата увольнения, document booleans, work phone, work email, pass numbers
   - Sheet "Номера" contains: ФИО, дата рождения, личный телефон
   - First: parse all unique company names, upsert into Company table
   - Then: for each employee row, create Employee with lastName/firstName/middleName (split ФИО by space), position, hireDate, fireDate
   - Create EmployeeCompany with rate, salary, document booleans
   - Create EmployeePhone for work phones (from main sheet) and personal phones (from "Номера" sheet)
   - Create EmployeeEmail for work emails
   - Create EmployeePass for passport numbers
   - Match employees between sheets by lastName+firstName (case-insensitive trim)
   - Handle date parsing: Excel serial numbers via XLSX.SSF.parse_date_code() or string dates
   - Log progress: "Seeded N companies, M employees"
   - Add to package.json scripts: `"seed:employees": "npx tsx prisma/seed-employees.ts"`
   - IMPORTANT: Read the Excel file first to understand actual column layout before hardcoding column indices. Use `XLSX.utils.sheet_to_json` with `{ header: 1 }` to get raw arrays, then inspect headers.

4. Run the seed script: `npm run seed:employees`
  </action>
  <verify>
    <automated>npx prisma migrate status && npx tsx -e "const { PrismaClient } = require('@prisma/client'); const p = new PrismaClient(); p.company.count().then(c => console.log('Companies:', c)); p.employee.count().then(c => console.log('Employees:', c)).finally(() => p.\$disconnect())"</automated>
  </verify>
  <done>Migration applied, Company/Employee/EmployeeCompany/EmployeePhone/EmployeeEmail/EmployeePass tables exist, seed data loaded from Excel</done>
</task>

<task type="auto">
  <name>Task 2: Server actions + page + table + filters + modal</name>
  <files>
    app/actions/employees.ts
    app/(dashboard)/employees/page.tsx
    components/employees/EmployeesTable.tsx
    components/employees/EmployeeFilters.tsx
    components/employees/EmployeeModal.tsx
  </files>
  <action>
1. **app/actions/employees.ts** — Server actions following products.ts pattern:
   - `"use server"` + `requireSection("EMPLOYEES")` + try/catch + handleAuthError
   - `getEmployees(params)` — fetch with filters (status: all/active/fired, companyIds[], search query), include all relations (companies.company, phones, emails, passes), sort by company name then lastName. Active = fireDate is null, fired = fireDate is not null.
   - `createEmployee(data)` — zod-validated, create Employee + nested EmployeeCompany/Phone/Email/Pass in transaction
   - `updateEmployee(data)` — zod-validated, update Employee, replace nested relations (delete + recreate pattern from products.ts)
   - `deleteEmployee(id)` — hard delete (no soft delete for employees)
   - All actions: `revalidatePath("/employees")`
   - Zod schemas: EmployeeSchema with nested arrays for companies, phones, emails, passes. Each company entry has companyId, rate, salary, 7 boolean document fields.

2. **app/(dashboard)/employees/page.tsx** — RSC page:
   - `await requireSection("EMPLOYEES")`
   - Parse searchParams: `status` (default "active"), `companies` (comma-separated IDs), `q` (search), `group` (boolean for group-by-company)
   - Fetch employees via direct Prisma query (not server action — RSC pattern from products page): include companies with company relation, phones, emails, passes
   - WHERE logic: status "active" = fireDate IS NULL, "fired" = fireDate IS NOT NULL, "all" = no filter
   - If companyIds filter: filter employees that have at least one EmployeeCompany with matching companyId
   - If search query: filter by lastName/firstName contains (insensitive)
   - Fetch all companies for filter dropdown
   - Render: h1 "Сотрудники", "Добавить сотрудника" button, EmployeeFilters, EmployeesTable
   - Pass `allCompanies` to both filters and modal

3. **components/employees/EmployeeFilters.tsx** — Client component:
   - Status tabs: "Актуальная база" (default), "Уволенные", "Все" — same pattern as ProductStatusTabs, using URL searchParams
   - MultiSelectDropdown for Company (copy MultiSelectDropdown inline from ProductFilters.tsx)
   - "Разбить по компаниям" toggle button — sets `group=true` in URL
   - Search input (same pattern as ProductSearchInput — debounced, updates URL `q` param)

4. **components/employees/EmployeesTable.tsx** — Client component:
   - Table columns: Фамилия, Имя, Отчество, Компания (first company name or comma-separated), Должность, Дата рождения (DD.MM.YYYY + возраст в скобках), Раб.телефон, Раб.email
   - Status badge per row: green "Активен" if no fireDate, red "Уволен" if fireDate exists — use inline span with bg-green-100/text-green-700 and bg-red-100/text-red-700
   - Birthday highlight logic (computed from birthDate, using Moscow timezone new Date()):
     - Calculate days until next birthday (compare month+day to today)
     - If birthday is TODAY: show firework emoji before name
     - If birthday within 10 days: add ring-2 ring-amber-400 glow class to row
   - Group-by-company mode (when `grouped` prop is true): render company name as section header, then employee rows under it
   - Sort: by company name ascending, then lastName ascending
   - Row click: call `onRowClick(employee)` prop to open modal
   - Responsive: horizontal scroll on mobile

5. **components/employees/EmployeeModal.tsx** — Client component:
   - Uses Dialog from `@/components/ui/dialog` (base-ui, NOT radix)
   - Override DialogContent className to `sm:max-w-3xl` (wider than default sm:max-w-sm) for all the fields
   - Props: `open`, `onOpenChange`, `employee` (null for create mode), `companies` (all companies list)
   - Form with react-hook-form + zod resolver
   - Sections with visual dividers:
     a. ФИО: lastName, firstName, middleName (text inputs)
     b. Должность, Дата рождения, Дата приёма, Дата увольнения (text + date inputs)
     c. Компании: dynamic list — for each: select company, rate (number 0.00-1.00), salary (number), 7 checkboxes for documents (Трудовой договор, Приказ приёма, Согласие перс.данных, NDA, Личная карточка, Заявление увольнения, Приказ увольнения). Add/remove company buttons.
     d. Телефоны: dynamic list — number (text) + type select (Личный/Рабочий). Add/remove.
     e. Email: dynamic list — email (text) + type select. Add/remove.
     f. Паспорта: dynamic list — number (text). Add/remove.
   - For dynamic lists, use simple useState arrays (not useFieldArray — simpler for this case)
   - Submit: calls createEmployee or updateEmployee server action
   - On success: close modal, show toast (if sonner available, otherwise alert)
   - Delete button in edit mode: calls deleteEmployee, confirms with window.confirm
   - Use native HTML `<select>` for dropdowns (per CLAUDE.md convention — NOT base-ui Select)
   - Date inputs: use `<input type="date">` for date fields
  </action>
  <verify>
    <automated>npx next build 2>&1 | tail -20</automated>
  </verify>
  <done>
    - /employees page renders table with seeded employee data
    - Status tabs filter active/fired/all employees correctly
    - Company multi-select filter works
    - "Разбить по компаниям" groups table by company
    - Row click opens modal with all employee data pre-filled
    - "Добавить сотрудника" opens empty modal
    - Create/update/delete work through modal
    - Birthday highlights: glow within 10 days, firework emoji on day
    - Status badges: green active, red fired
  </done>
</task>

</tasks>

<verification>
1. `npx prisma migrate status` — migration applied
2. `npx next build` — no TypeScript/build errors
3. Navigate to /employees — table shows seeded employees
4. Filter by status and company — rows update
5. Click row — modal opens with full data
6. Edit and save — changes persist
7. Create new employee — appears in table
</verification>

<success_criteria>
- Employees page fully replaces ComingSoon stub
- All CRUD operations work through modal dialog
- Filters (status, company, search, group-by) functional
- Seed data from Excel loaded correctly
- Birthday highlights visible for employees with upcoming birthdays
- Follows existing codebase patterns (server actions, RSC, Tailwind, base-ui Dialog)
</success_criteria>

<output>
After completion, verify the page works at http://localhost:3001/employees
</output>
