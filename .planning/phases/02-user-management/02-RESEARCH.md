# Phase 2: User Management - Research

**Researched:** 2026-04-05
**Domain:** Next.js 15 Server Actions, shadcn/ui Dialog/Table/Switch, CRUD patterns, bcryptjs password update
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01:** Table layout with columns: имя, email, роль (badge), статус (active/inactive badge), секции (badge list), действия (edit button).
- **D-02:** Deactivated users shown as grayed-out rows in the table.
- **D-03:** No pagination needed (team of ~10 users). Simple list.
- **D-04:** Modal dialog (shadcn Dialog) for both create and edit — don't navigate away from user list.
- **D-05:** Same form component for create and edit (prefilled in edit mode).
- **D-06:** Password field: required on create, optional on edit (blank = keep current).
- **D-07:** Checkboxes with section display names in Russian in the user form.
- **D-08:** Section names mapped from ERP_SECTION enum to Russian labels.
- **D-09:** Switch/toggle in the edit form to activate/deactivate user.
- **D-10:** Deactivated user's login rejected with "Аккаунт деактивирован" (already handled in auth.ts).
- **D-11:** No confirmation dialog for deactivation (simple toggle, reversible).
- **D-12:** User Management page accessible ONLY to SUPERADMIN role (enforced via requireSuperadmin()).
- **D-13:** All Server Actions for user CRUD call requireSuperadmin() before executing.

### Claude's Discretion

- Form validation rules (zod schema)
- Exact Russian labels for each ERP section
- Table sorting/ordering
- Toast notifications for success/error on CRUD operations

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| USER-01 | Superadmin can create new user accounts (email, password, name) | Server Action createUser() with bcryptjs hash; Dialog form with zod required-password schema |
| USER-02 | Superadmin can assign role to user | UserRole enum (SUPERADMIN/MANAGER/VIEWER) in create/edit form; select or radio group |
| USER-03 | Superadmin can grant/revoke access to specific ERP sections per user | ERP_SECTION checkbox group in form; allowedSections array stored in User model |
| USER-04 | Superadmin can view list of all users | RSC page queries prisma.user.findMany(); shadcn Table renders rows |
| USER-05 | Superadmin can edit/deactivate existing users | updateUser() Server Action; optional password hash; Switch for isActive toggle |
</phase_requirements>

---

## Summary

Phase 2 builds a superadmin-only CRUD interface for user provisioning. All infrastructure from Phase 1 is in place: the User model with role/allowedSections/isActive fields, requireSuperadmin() enforcement, bcryptjs for hashing, and the react-hook-form + zod validation pattern. The page lives at `/admin/users` (the Sidebar already points there), inside the `(dashboard)` layout.

The main work is three things: (1) install missing shadcn/ui components (Dialog, Table, Switch, Checkbox, Select, Separator, Sonner/toast), (2) write one shared UserForm component that handles both create and edit modes with conditional password requirement, and (3) write three Server Actions (createUser, updateUser, deleteUser/deactivate) that all call requireSuperadmin() first.

**Primary recommendation:** Reuse the LoginForm pattern (react-hook-form + zod + shadcn/ui Form) for UserForm inside a shadcn Dialog. Use Prisma's `findMany` in the RSC page component for the user list — no client state needed for reading.

---

## Critical Finding: UserRole Enum Has 3 Values, Not 2

The CONTEXT.md says "Roles: SUPERADMIN and USER" but the actual `prisma/schema.prisma` defines:

```prisma
enum UserRole {
  SUPERADMIN
  MANAGER
  VIEWER
}
```

The Header.tsx already maps all three: `SUPERADMIN → Суперадмин`, `MANAGER → Менеджер`, `VIEWER → Просмотр`.

**Decision for planner:** The form's role selector must offer all three values from the actual enum. The "USER" label in CONTEXT.md refers colloquially to non-superadmin users. Use MANAGER and VIEWER as the assignable roles (SUPERADMIN can be assigned but is rare).

---

## Standard Stack

### Core (already installed in package.json)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| next | ^15.5.14 | Framework + Server Actions | Phase 1 foundation |
| react-hook-form | ^7.72.1 | Form state | Phase 1 pattern (LoginForm) |
| zod | ^4.3.6 | Schema validation | Phase 1 pattern; note: zod v4 not v3 |
| @hookform/resolvers | ^5.2.2 | RHF + Zod bridge | Phase 1 pattern |
| bcryptjs | ^3.0.3 | Password hashing | Phase 1 established (pure JS) |
| @prisma/client | ^6.19.3 | DB queries | Phase 1 foundation |
| lucide-react | ^1.7.0 | Icons | Phase 1 established |

### shadcn/ui Components — Already Installed

| Component | File | Status |
|-----------|------|--------|
| button | components/ui/button.tsx | Installed |
| input | components/ui/input.tsx | Installed |
| label | components/ui/label.tsx | Installed |
| form | components/ui/form.tsx | Installed |
| badge | components/ui/badge.tsx | Installed |
| alert | components/ui/alert.tsx | Installed |
| card | components/ui/card.tsx | Installed |
| avatar | components/ui/avatar.tsx | Installed |

### shadcn/ui Components — Need to Install

| Component | Purpose | Install Command |
|-----------|---------|-----------------|
| dialog | Modal for create/edit form (D-04) | `npx shadcn@latest add dialog` |
| table | User list (D-01) | `npx shadcn@latest add table` |
| switch | Active/inactive toggle (D-09) | `npx shadcn@latest add switch` |
| checkbox | Section access checkboxes (D-07) | `npx shadcn@latest add checkbox` |
| select | Role selector in form | `npx shadcn@latest add select` |
| separator | Visual dividers in form | `npx shadcn@latest add separator` |
| sonner | Toast notifications (success/error) | `npx shadcn@latest add sonner` |

**Note on toast:** The project has no toast library yet. Sonner is the shadcn/ui v4 default (`npx shadcn@latest add sonner` installs it). The `sonner` package wraps Sonner and provides a `<Toaster>` component for `app/layout.tsx` and a `toast()` function. This aligns with Claude's Discretion items (toast for CRUD operations).

**Installation batch:**
```bash
npx shadcn@latest add dialog table switch checkbox select separator sonner
```

---

## Architecture Patterns

### Recommended Project Structure (additions for Phase 2)

```
app/
├── (dashboard)/
│   └── admin/
│       └── users/
│           └── page.tsx          # RSC — fetches users, renders UserTable + "Add user" button
app/
├── actions/
│   └── users.ts                  # Server Actions: createUser, updateUser, toggleUserActive
components/
└── users/
    ├── UserTable.tsx             # Client component — table + open-dialog logic
    ├── UserDialog.tsx            # Dialog wrapper — controls open/close state
    └── UserForm.tsx              # react-hook-form + zod — create and edit modes
```

### Pattern 1: RSC Page + Client Island

The page at `app/(dashboard)/admin/users/page.tsx` is a React Server Component. It:
1. Calls `requireSuperadmin()` at the top (D-12)
2. Queries `prisma.user.findMany()` to get all users
3. Renders `<UserTable users={users} />` — a Client Component that owns dialog open/close state

This follows the established dashboard pattern (DashboardLayout is also RSC).

```typescript
// app/(dashboard)/admin/users/page.tsx
import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import { UserTable } from "@/components/users/UserTable"

export default async function UsersPage() {
  await requireSuperadmin()

  const users = await prisma.user.findMany({
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      allowedSections: true,
      isActive: true,
      createdAt: true,
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Пользователи</h1>
        {/* Add button lives inside UserTable (needs client state for dialog) */}
      </div>
      <UserTable users={users} />
    </div>
  )
}
```

### Pattern 2: Server Actions for CRUD

All mutations go in `app/actions/users.ts`. Each action follows the Phase 1 pattern from `rbac-test.ts`.

```typescript
// app/actions/users.ts
"use server"

import { requireSuperadmin } from "@/lib/rbac"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { z } from "zod"
import { revalidatePath } from "next/cache"

const CreateUserSchema = z.object({
  name: z.string().min(1, "Введите имя"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов"),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  allowedSections: z.array(z.string()),
})

const UpdateUserSchema = z.object({
  id: z.string(),
  name: z.string().min(1, "Введите имя"),
  email: z.string().email("Некорректный email"),
  password: z.string().optional(), // blank = keep current (D-06)
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  allowedSections: z.array(z.string()),
  isActive: z.boolean(),
})

export async function createUser(data: z.infer<typeof CreateUserSchema>) {
  await requireSuperadmin() // D-13
  const parsed = CreateUserSchema.parse(data)
  const hashedPassword = await bcrypt.hash(parsed.password, 10)
  await prisma.user.create({
    data: {
      ...parsed,
      password: hashedPassword,
      allowedSections: parsed.allowedSections as any,
    },
  })
  revalidatePath("/admin/users")
}

export async function updateUser(data: z.infer<typeof UpdateUserSchema>) {
  await requireSuperadmin() // D-13
  const parsed = UpdateUserSchema.parse(data)
  const updateData: any = {
    name: parsed.name,
    email: parsed.email,
    role: parsed.role,
    allowedSections: parsed.allowedSections as any,
    isActive: parsed.isActive,
  }
  // D-06: Only hash and update password if provided
  if (parsed.password && parsed.password.trim() !== "") {
    updateData.password = await bcrypt.hash(parsed.password, 10)
  }
  await prisma.user.update({ where: { id: parsed.id }, data: updateData })
  revalidatePath("/admin/users")
}
```

### Pattern 3: Dialog with Shared Form (Create + Edit)

UserDialog wraps UserForm. In create mode `user` prop is `undefined`. In edit mode it receives the existing user record. The form uses `defaultValues` conditional on whether a user is provided.

```typescript
// components/users/UserForm.tsx (conceptual structure)
"use client"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

interface UserFormProps {
  user?: UserRow        // undefined = create mode
  onSuccess: () => void // closes the dialog
}

// Zod schema with superRefine for conditional password requirement
const formSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().optional(),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  allowedSections: z.array(z.string()),
  isActive: z.boolean().optional(), // only shown in edit mode
}).superRefine((data, ctx) => {
  // Password required on create (no user.id), optional on edit
  // The isCreate flag is passed via closure
})
```

**Note on zod v4:** The project uses zod `^4.3.6`. In zod v4, `z.enum()` still works the same way for string literals. `superRefine` is available. No breaking changes for this pattern.

### Pattern 4: Section Checkbox Group

ERP_SECTION enum values and their Russian labels:

| Enum Value | Russian Label | URL Path |
|------------|--------------|----------|
| PRODUCTS | Товары | /products |
| PRICES | Управление ценами | /prices |
| WEEKLY_CARDS | Недельные карточки | /weekly |
| STOCK | Управление остатками | /inventory |
| COST | Себестоимость партий | /batches |
| PROCUREMENT | План закупок | /purchase-plan |
| SALES | План продаж | /sales-plan |
| SUPPORT | Служба поддержки | /support |
| USER_MANAGEMENT | Управление пользователями | /admin/users |

This mapping should live in `lib/section-labels.ts` (separate from the Edge-safe `lib/sections.ts` which is URL→enum). It can import freely since it's used only in server components and client components (not middleware).

### Anti-Patterns to Avoid

- **Fetching users in a Client Component with useEffect + fetch:** Use RSC + Prisma directly — no API route needed for this internal page.
- **Uncontrolled dialog reset:** When Dialog closes, reset the form to prevent stale values on reopen. Call `form.reset()` in the `onOpenChange` handler.
- **Optimistic updates without revalidatePath:** Always call `revalidatePath("/admin/users")` in Server Actions so the RSC refetches fresh data after mutations.
- **Raw password in Server Action payload:** Server Actions communicate over HTTP internally — always validate with zod before hashing. The password never leaves the server unencrypted.
- **SUPERADMIN self-deactivation:** Add a guard in updateUser to prevent deactivating the currently logged-in superadmin. Check session user.id !== parsed.id before allowing isActive: false.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Password hashing | Custom crypto | bcryptjs (already installed) | Timing attacks, salt rounds, pure JS VPS-safe |
| Form validation + error display | Manual error state | react-hook-form + zod + shadcn Form | FormMessage handles per-field errors automatically |
| Modal/dialog | Custom overlay | shadcn Dialog | Focus trapping, ARIA, keyboard dismiss — all handled |
| Toast notifications | Custom alert timeout | Sonner via shadcn | Accessible, stacks, auto-dismiss |
| Table HTML | Custom `<table>` | shadcn Table | Consistent styling; shadcn Table is thin wrapper, no behavior lock-in |
| RBAC enforcement | Custom session check | requireSuperadmin() from lib/rbac.ts | Already correct, tested by Phase 1 |

**Key insight:** Every piece of infrastructure this phase needs already exists or is one `npx shadcn@latest add` away. There is zero custom infrastructure to build.

---

## Common Pitfalls

### Pitfall 1: Dialog Form Not Resetting Between Open/Close

**What goes wrong:** User opens "Create" dialog, types partial data, closes without submitting, reopens — old values are still in the form.

**Why it happens:** react-hook-form maintains internal state; closing the Dialog DOM element does not reset it.

**How to avoid:** Pass `key={dialogOpen ? "open" : "closed"}` to the form component, or call `form.reset()` in the Dialog `onOpenChange` callback when `open` transitions to `false`.

**Warning signs:** Stale email/name visible when creating a second user.

### Pitfall 2: Password Field Shown as Required in Edit Mode

**What goes wrong:** User opens edit dialog for existing user, leaves password blank, zod throws "password required" before submit.

**Why it happens:** Same schema used for create (required) and edit (optional) without conditional logic.

**How to avoid:** Use two separate schemas (CreateUserSchema with required password, UpdateUserSchema with optional), or use `z.superRefine` with a mode flag. The cleanest is separate schemas matched to the two Server Actions.

### Pitfall 3: allowedSections Type Mismatch with Prisma

**What goes wrong:** Passing `string[]` to `allowedSections` in a Prisma create/update throws a TypeScript error because Prisma expects `ERP_SECTION[]`.

**Why it happens:** The zod schema uses `z.array(z.string())` (form values are strings from checkbox group), but Prisma wants the enum type.

**How to avoid:** Cast with `allowedSections: parsed.allowedSections as ERP_SECTION[]` in the Server Action. This is safe because the form checkboxes are populated from the same enum values.

### Pitfall 4: revalidatePath Not Refreshing the Client Table

**What goes wrong:** After createUser or updateUser completes, the table still shows old data.

**Why it happens:** Server Action ran, DB updated, but `revalidatePath` was not called (or called with wrong path).

**How to avoid:** Always call `revalidatePath("/admin/users")` at the end of every mutating Server Action. The RSC page will re-fetch on next navigation or router.refresh().

**Warning signs:** Newly created user is absent from the list until manual page reload.

### Pitfall 5: SUPERADMIN Self-Deactivation

**What goes wrong:** Superadmin accidentally toggles their own account to inactive, locking themselves out.

**Why it happens:** No guard on the updateUser action.

**How to avoid:** In updateUser Server Action, after `requireSuperadmin()`, compare parsed.id against session.user.id. If they match and `isActive === false`, throw an error "Нельзя деактивировать собственный аккаунт".

### Pitfall 6: Sonner Toaster Not Mounted

**What goes wrong:** `toast()` is called from a Client Component but nothing appears.

**Why it happens:** `<Toaster />` from `sonner` must be rendered once in the root layout (`app/layout.tsx`), not inside a page component.

**How to avoid:** Add `<Toaster />` to `app/layout.tsx` as part of Wave 0 setup.

---

## Code Examples

### Conditional Password Requirement Pattern (zod v4)

```typescript
// Two schemas approach — cleanest for this case
const createSchema = z.object({
  name: z.string().min(2, "Минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов"),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  allowedSections: z.array(z.string()),
})

const editSchema = z.object({
  id: z.string(),
  name: z.string().min(2, "Минимум 2 символа"),
  email: z.string().email("Некорректный email"),
  password: z.string().min(8, "Минимум 8 символов").optional().or(z.literal("")),
  role: z.enum(["SUPERADMIN", "MANAGER", "VIEWER"]),
  allowedSections: z.array(z.string()),
  isActive: z.boolean(),
})
```

### shadcn Dialog Usage Pattern

```typescript
// Parent controls open state — Dialog is uncontrolled-from-outside
"use client"
const [open, setOpen] = useState(false)
const [editUser, setEditUser] = useState<UserRow | null>(null)

function openCreate() { setEditUser(null); setOpen(true) }
function openEdit(user: UserRow) { setEditUser(user); setOpen(true) }

<Dialog open={open} onOpenChange={setOpen}>
  <DialogContent className="max-w-lg">
    <DialogHeader>
      <DialogTitle>{editUser ? "Редактировать пользователя" : "Новый пользователь"}</DialogTitle>
    </DialogHeader>
    <UserForm
      key={editUser?.id ?? "create"}  // forces re-mount on user change
      user={editUser ?? undefined}
      onSuccess={() => setOpen(false)}
    />
  </DialogContent>
</Dialog>
```

### shadcn Switch Usage in Form

```typescript
// Switch integrated with react-hook-form Controller
<FormField
  control={form.control}
  name="isActive"
  render={({ field }) => (
    <FormItem className="flex items-center justify-between">
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
```

### Checkbox Group for Sections

```typescript
// Checkbox group as a controlled array field
const SECTION_OPTIONS = [
  { value: "PRODUCTS", label: "Товары" },
  { value: "PRICES", label: "Управление ценами" },
  { value: "WEEKLY_CARDS", label: "Недельные карточки" },
  { value: "STOCK", label: "Управление остатками" },
  { value: "COST", label: "Себестоимость партий" },
  { value: "PROCUREMENT", label: "План закупок" },
  { value: "SALES", label: "План продаж" },
  { value: "SUPPORT", label: "Служба поддержки" },
  { value: "USER_MANAGEMENT", label: "Управление пользователями" },
]

// In the form:
<FormField
  control={form.control}
  name="allowedSections"
  render={() => (
    <FormItem>
      <FormLabel>Доступ к разделам</FormLabel>
      <div className="grid grid-cols-2 gap-2">
        {SECTION_OPTIONS.map((option) => (
          <FormField
            key={option.value}
            control={form.control}
            name="allowedSections"
            render={({ field }) => (
              <FormItem className="flex items-center space-x-2">
                <FormControl>
                  <Checkbox
                    checked={field.value?.includes(option.value)}
                    onCheckedChange={(checked) => {
                      const current = field.value ?? []
                      field.onChange(
                        checked
                          ? [...current, option.value]
                          : current.filter((v) => v !== option.value)
                      )
                    }}
                  />
                </FormControl>
                <FormLabel className="font-normal">{option.label}</FormLabel>
              </FormItem>
            )}
          />
        ))}
      </div>
    </FormItem>
  )}
/>
```

### Server Action with Error Propagation to Client

```typescript
// Return discriminated union — caller uses this to show toast
export async function createUser(data: CreateUserInput): Promise<
  | { ok: true }
  | { ok: false; error: string }
> {
  try {
    await requireSuperadmin()
    // ... validation and DB write
    revalidatePath("/admin/users")
    return { ok: true }
  } catch (e) {
    if (e instanceof Error && e.message === "FORBIDDEN") {
      return { ok: false, error: "Нет доступа" }
    }
    // Unique constraint violation (duplicate email)
    if ((e as any)?.code === "P2002") {
      return { ok: false, error: "Email уже используется" }
    }
    return { ok: false, error: "Ошибка сервера" }
  }
}
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| NextAuth v4 | Auth.js v5 (beta) | 2024 | Different import paths, JWT callback shape — already handled in Phase 1 |
| framer-motion | motion (same package, renamed) | 2024 | Not relevant to this phase (no animations) |
| tailwindcss-animate | tw-animate-css | 2025 | Already installed in Phase 1 |
| zod v3 | zod v4.3.6 | 2025 | Minor API diffs — no breaking changes for schemas used here |

**shadcn/ui v4 note (HIGH confidence — verified from project state):** The project uses shadcn/ui v4 with `@base-ui/react` instead of Radix UI. The shadcn CLI installs components that reference `@base-ui/react` primitives. The form.tsx was created manually in Phase 1 because base-ui differs from radix. Dialog, Switch, Checkbox, Select from shadcn should be installed via CLI — they will use the correct base-ui primitives automatically.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed — no test runner found in package.json |
| Config file | None (Wave 0 gap) |
| Quick run command | N/A — see Wave 0 gaps |
| Full suite command | N/A — see Wave 0 gaps |

**Note:** The package.json `test` script is `echo "Error: no test specified" && exit 1`. No vitest, jest, or playwright is installed. For this phase, validation will be manual smoke tests + TypeScript type checking rather than automated unit tests. This is acceptable for a CRUD admin panel at this scale.

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | Notes |
|--------|----------|-----------|-------------------|-------|
| USER-01 | Create user stores bcrypt hash, not plaintext | Manual | — | Verify via Prisma Studio: password field starts with `$2b$` |
| USER-01 | Duplicate email rejected with friendly error | Manual | — | Try creating user with existing email; expect "Email уже используется" |
| USER-02 | Role badge shows correct Russian label in table | Manual | — | Create MANAGER user; verify badge in table row |
| USER-03 | Section checkboxes save to DB correctly | Manual | — | Check allowedSections array via Prisma Studio after save |
| USER-04 | User list shows all users including deactivated (grayed) | Manual | — | Deactivate a user; verify row is grayed but present |
| USER-05 | Password left blank in edit does not change hash | Manual | — | Edit user with blank password; verify hash unchanged in Prisma Studio |
| USER-05 | Deactivated user cannot log in | Manual | — | Deactivate user; attempt login; expect "Аккаунт деактивирован" |
| USER-05 | Superadmin cannot deactivate own account | Manual | — | Toggle own isActive off; expect error toast |

### TypeScript as Validation

Since no test runner is installed, TypeScript strict mode + `next build` serve as the automated validation gate:

```bash
# Per task check — catches type errors in Server Actions and form schemas
npx tsc --noEmit

# Full gate — catches build-time errors
npm run build
```

### Wave 0 Gaps

- [ ] No test runner installed — for this phase, `npx tsc --noEmit` and manual smoke tests are the gate.
- If future phases require automated tests, install vitest: `npm install -D vitest @vitejs/plugin-react`

---

## Environment Availability

Step 2.6: External dependencies for this phase are entirely within the existing project stack.

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Next.js dev server | ✓ | (system) | — |
| PostgreSQL | Prisma queries | Phase 6 VPS only | — | Local dev uses DATABASE_URL from .env |
| bcryptjs | Password hashing | ✓ (npm package) | ^3.0.3 | — |
| shadcn CLI | Installing Dialog/Table/Switch | ✓ (npx) | ^4.1.2 | — |

**Note:** PostgreSQL is not installed locally (Phase 1 migration was marked pending for VPS). Server Actions that touch Prisma will fail in local dev without a DATABASE_URL. This is an existing constraint carried from Phase 1 — development can be done with type-checking and build verification, with functional testing on VPS.

---

## Open Questions

1. **`/admin/users` vs `/users` path**
   - What we know: Sidebar.tsx in Phase 1 hardcodes `href: "/admin/users"` for USER_MANAGEMENT
   - What's unclear: The middleware matcher excludes `/api` but does not have a special case for `/admin` — SUPERADMIN bypass in middleware handles this
   - Recommendation: Use `/admin/users` as established by Sidebar.tsx. No middleware changes needed.

2. **SUPERADMIN creation via user form**
   - What we know: The UserRole enum includes SUPERADMIN as a valid role
   - What's unclear: Should superadmin be able to create another SUPERADMIN via the UI form?
   - Recommendation: Allow it (the role enum includes it, no business reason to block). If the business wants to restrict this, add a zod refinement or hide SUPERADMIN from the role select. Claude's discretion — include SUPERADMIN in the role options.

3. **allowedSections for SUPERADMIN role users**
   - What we know: D-11 (Phase 1) says SUPERADMIN bypasses section checks; lib/rbac.ts confirms this
   - What's unclear: Should the section checkboxes be disabled/hidden when role = SUPERADMIN?
   - Recommendation: Hide or disable the sections checkbox group when role is set to SUPERADMIN (since those sections are ignored). Show a note "Суперадмин имеет доступ ко всем разделам". This is Claude's discretion territory.

---

## Sources

### Primary (HIGH confidence)

- Codebase — `prisma/schema.prisma` — User model structure, UserRole enum (SUPERADMIN/MANAGER/VIEWER)
- Codebase — `lib/rbac.ts` — requireSuperadmin() implementation, pattern to reuse
- Codebase — `lib/auth.ts` — bcryptjs usage, authorize handler, AccountDisabledError
- Codebase — `components/auth/LoginForm.tsx` — react-hook-form + zod + shadcn Form pattern
- Codebase — `app/actions/rbac-test.ts` — Server Action structure with "use server" + requireSection()
- Codebase — `components/layout/Sidebar.tsx` — `/admin/users` href established, USER_MANAGEMENT section
- Codebase — `package.json` — installed versions: react-hook-form@^7.72.1, zod@^4.3.6, bcryptjs@^3.0.3
- Codebase — `components/ui/` — 8 shadcn components already installed; Dialog/Table/Switch/Checkbox/Select absent

### Secondary (MEDIUM confidence)

- shadcn/ui v4 convention: Dialog/Table/Switch install via `npx shadcn@latest add` — consistent with how Phase 1 components were installed
- Prisma P2002 error code for unique constraint violations — standard Prisma error codes documentation

### Tertiary (LOW confidence)

- zod v4 `z.enum()` and `superRefine` compatibility — based on training data and zod v3→v4 migration; no breaking changes found for these patterns

---

## Project Constraints (from CLAUDE.md)

Directives from CLAUDE.md that the planner must enforce:

| Directive | Impact on This Phase |
|-----------|----------------------|
| Framework: Next.js 14 (App Router, TypeScript) | Use App Router; project is actually Next.js 15 (per STATE.md corrections) |
| Database: PostgreSQL + Prisma ORM | All user CRUD via prisma singleton (lib/prisma.ts) |
| UI: shadcn/ui + Tailwind CSS + Framer Motion | shadcn Dialog/Table/Switch for user management UI |
| Auth: NextAuth.js credentials provider | Actually Auth.js v5 (corrected in STATE.md); use requireSuperadmin() for all actions |
| Superadmin: sergey.fyodorov@gmail.com | This account is the seed user; guard against self-deactivation |
| RBAC: role-based access to sections | USER_MANAGEMENT section already in ERP_SECTION enum; page enforces via requireSuperadmin() |
| bcrypt for passwords | Use bcryptjs (pure JS, already installed at ^3.0.3) |

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — verified from package.json and existing codebase
- Architecture: HIGH — follows established Phase 1 patterns directly
- Pitfalls: HIGH — derived from actual code analysis (type mismatch, form reset, revalidatePath)
- shadcn components needed: HIGH — direct inspection of components/ui/ directory

**Research date:** 2026-04-05
**Valid until:** 2026-05-05 (stable stack, no fast-moving dependencies)
