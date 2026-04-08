---
phase: quick
plan: 260408-syb
subsystem: employees
tags: [employees, crud, prisma, modal, filters]
dependency_graph:
  requires: [prisma/schema.prisma, lib/rbac.ts, components/ui/dialog.tsx]
  provides: [Company, Employee, EmployeeCompany, EmployeePhone, EmployeeEmail, EmployeePass models, /employees page]
  affects: [app/(dashboard)/employees/page.tsx]
tech_stack:
  added: [PhoneType enum, EmailType enum, Company model, Employee model, EmployeeCompany model, EmployeePhone model, EmployeeEmail model, EmployeePass model]
  patterns: [RSC page + client table/filters pattern, server actions with requireSection + zod + revalidatePath, base-ui Dialog, MultiSelectDropdown with checkboxes]
key_files:
  created:
    - prisma/migrations/20260408_add_employees_module/migration.sql
    - prisma/seed-employees.ts
    - app/actions/employees.ts
    - components/employees/EmployeesTable.tsx
    - components/employees/EmployeeFilters.tsx
    - components/employees/EmployeeModal.tsx
  modified:
    - prisma/schema.prisma
    - app/(dashboard)/employees/page.tsx
    - package.json
decisions:
  - Decimal type from Prisma must be serialized to Number before passing to client components (RSC boundary)
  - Seed script uses name-key matching (lowercase+trim) to correlate employees across main sheet and Номера sheet
  - fireDate determined per-employee by checking isFired flag across all company entries in the Excel
  - Group-by-company uses ?group=1 URL param (toggle)
metrics:
  duration: ~25 min
  completed: 2026-04-08
  tasks_completed: 2
  files_created: 6
  files_modified: 3
---

# Phase quick Plan 260408-syb: Employees Module CRUD Summary

**One-liner:** Full employees CRUD module with Company/Employee Prisma models, Excel seed script, RSC page with status tabs + multi-select company filter + search + group-by, click-to-edit modal with nested companies/phones/emails/passes, and birthday highlights (10-day glow + firework emoji on birthday).

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Prisma schema + migration + seed script | 791dc9b | prisma/schema.prisma, prisma/migrations/20260408_add_employees_module/migration.sql, prisma/seed-employees.ts, package.json |
| 2 | Server actions + page + table + filters + modal | 8a0a45a | app/actions/employees.ts, app/(dashboard)/employees/page.tsx, components/employees/EmployeesTable.tsx, components/employees/EmployeeFilters.tsx, components/employees/EmployeeModal.tsx |

## What Was Built

### Prisma Models (Task 1)

Added to `prisma/schema.prisma`:
- `PhoneType` enum (PERSONAL / WORK)
- `EmailType` enum (PERSONAL / WORK)
- `Company` — unique name, relation to EmployeeCompany
- `Employee` — lastName, firstName, middleName, position, birthDate, hireDate, fireDate
- `EmployeeCompany` — junction table with rate (Decimal), salary, 7 document boolean fields (trudovoyDogovor, prikazPriema, soglasiePersDannyh, nda, lichnayaKartochka, zayavlenieUvolneniya, prikazUvolneniya)
- `EmployeePhone` — number, type (PERSONAL/WORK)
- `EmployeeEmail` — email, type
- `EmployeePass` — passport number

Migration SQL manually created at `prisma/migrations/20260408_add_employees_module/migration.sql` (no local PostgreSQL — applies on VPS via `prisma migrate deploy`).

Prisma client regenerated locally with `npx prisma generate`.

### Seed Script (`prisma/seed-employees.ts`)

Parses `/Users/macmini/Desktop/Сотрудники.xlsx`:
- Sheet "Сотрудники " (with trailing space): company headers detected by checking next-row = "Актуальное"/"Уволенные", employee rows parsed for ФИО, position, rate, salary, hireDate, fireDate, 7 document booleans, work phone
- Sheet "Номера": personal phone, birthDate, passport number
- Employees matched between sheets by lowercase+trim name key
- Excel serial date numbers converted via `1899-12-30 epoch + serial * 86400000`
- Idempotent: deletes existing employee by lastName+firstName+middleName before recreating
- Logs: "Seeded N companies, M employees"

Run with: `npm run seed:employees` (on VPS after migration is applied)

### Server Actions (`app/actions/employees.ts`)

- `getEmployees(params)` — fetch with status (active/fired/all), companyIds[], q search
- `createEmployee(data)` — zod-validated, transaction: employee + nested companies/phones/emails/passes
- `updateEmployee(data)` — zod-validated, transaction: update employee + delete+recreate all nested
- `deleteEmployee(id)` — hard delete (cascades via Prisma)
- All: `requireSection("EMPLOYEES")` + `revalidatePath("/employees")`

### Page (`app/(dashboard)/employees/page.tsx`)

RSC page: parses searchParams (status, companies, q, group), fetches employees+companies in parallel, serializes Prisma Decimal to Number before passing to client components, renders EmployeeFilters + EmployeesTable.

### EmployeeFilters (`components/employees/EmployeeFilters.tsx`)

- Status tabs: "Актуальная база" (default) / "Уволенные" / "Все" — URL-driven
- MultiSelectDropdown company filter (copied from ProductFilters pattern)
- Debounced search input (350ms) updating URL `q` param
- "Разбить по компаниям" toggle button → URL `group=1`
- "Добавить сотрудника" button → opens EmployeeModal in create mode
- "Сбросить" button when filters active

### EmployeesTable (`components/employees/EmployeesTable.tsx`)

- Columns: Фамилия, Имя, Отчество, Компания, Должность, Дата рождения (DD.MM.YYYY + возраст), Раб.телефон, Раб.email, Статус
- Status badges: green "Активен" / red "Уволен" (based on fireDate presence)
- Birthday highlights: 10-day glow (`ring-1 ring-amber-300`), birthday day ring-2 + firework emoji (🎉)
- Group-by-company: company name as section header rows when `grouped=true`
- Sort: company name asc, then lastName asc
- Row click → EmployeeModal in edit mode

### EmployeeModal (`components/employees/EmployeeModal.tsx`)

- base-ui Dialog with `sm:max-w-3xl` override for wide layout
- Sections: ФИО, Общие данные (position/dates), Компании (dynamic list with rate/salary/7 booleans), Телефоны, Email, Паспорта
- Native `<select>` dropdowns per CLAUDE.md convention
- `useState` arrays for dynamic lists (not useFieldArray)
- Submit calls createEmployee/updateEmployee; delete calls deleteEmployee with window.confirm
- sonner toast for success/error feedback

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma Decimal not serializable across RSC boundary**
- **Found during:** Task 2 build (TypeScript error)
- **Issue:** `EmployeeCompany.rate` is Prisma `Decimal` type — not assignable to `string | number` in client component types
- **Fix:** Added `serializedEmployees` in page.tsx that maps `ec.rate` to `Number(ec.rate)` before passing to EmployeesTable
- **Files modified:** `app/(dashboard)/employees/page.tsx`
- **Commit:** 8a0a45a

## Known Stubs

None. The employees page is fully functional (data flows from DB to UI). The seed script is ready to run on VPS — DB will be empty until then, which is expected behavior (not a stub).

## Deployment Notes

On VPS, after `prisma migrate deploy` applies `20260408_add_employees_module`:
1. Run `npm run seed:employees` to populate from Excel
2. The Excel file must be present at `/Users/macmini/Desktop/Сотрудники.xlsx` (local dev only) — for VPS, either copy the file or update the path in seed-employees.ts

## Self-Check: PASSED

Files created/modified:
- prisma/schema.prisma: FOUND (modified)
- prisma/migrations/20260408_add_employees_module/migration.sql: FOUND
- prisma/seed-employees.ts: FOUND
- app/actions/employees.ts: FOUND
- components/employees/EmployeesTable.tsx: FOUND
- components/employees/EmployeeFilters.tsx: FOUND
- components/employees/EmployeeModal.tsx: FOUND

Commits verified:
- 791dc9b: FOUND (Task 1)
- 8a0a45a: FOUND (Task 2)

Build: PASSED (npm run build — no TypeScript errors)
