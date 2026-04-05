# Phase 02: User Management — Validation

**Phase:** 02-user-management
**Plans covered:** 02-01, 02-02
**Requirements:** USER-01, USER-02, USER-03, USER-04, USER-05

---

## Test Framework

| Property | Value |
|----------|-------|
| Framework | None installed — no test runner found in package.json |
| Config file | None |
| Automated gate | `npx tsc --noEmit` + `npm run build` |
| Manual gate | Smoke tests listed below |

No vitest, jest, or playwright is installed. The `package.json` `test` script is `echo "Error: no test specified" && exit 1`. For this phase, validation is TypeScript type checking + build success + manual smoke tests. This is the accepted tradeoff for a CRUD admin panel at this scale.

---

## Automated Gate

Run these two commands after every plan execution. Both must pass with zero errors.

```bash
# Gate 1: Type safety across all new and modified files
PATH=/usr/local/bin:$PATH npx tsc --noEmit --project /Users/macmini/zoiten.pro/tsconfig.json

# Gate 2: Full Next.js build (catches import errors, missing exports, RSC/client boundary violations)
PATH=/usr/local/bin:$PATH npm run build
```

**Pass criteria:**
- `tsc --noEmit` exits 0 with no output
- `npm run build` exits 0 and prints "Compiled successfully" or equivalent

---

## Requirements → Test Map

### USER-01: Create user accounts (email, password, name)

| # | Behavior | Type | Command / Steps |
|---|----------|------|-----------------|
| 1.1 | createUser() hashes password with bcryptjs — stored value starts with `$2b$` | Manual | Create user via form; inspect `password` field in Prisma Studio: `npx prisma studio` |
| 1.2 | createUser() returns `{ ok: true }` on success | Manual | Submit valid form; verify success toast appears |
| 1.3 | Duplicate email rejected with "Email уже используется" | Manual | Create user with email that already exists; verify error toast text |
| 1.4 | Server Action returns `{ ok: false; error: string }` on known failure | Automated | `PATH=/usr/local/bin:$PATH npx tsc --noEmit` — ActionResult discriminated union enforced at compile time |

### USER-02: Assign role to user

| # | Behavior | Type | Command / Steps |
|---|----------|------|-----------------|
| 2.1 | Role select offers SUPERADMIN / MANAGER / VIEWER | Manual | Open create dialog; verify 3 options in role select |
| 2.2 | Role badge shows Russian label in table (Суперадмин / Менеджер / Просмотр) | Manual | Create user with role MANAGER; verify badge reads "Менеджер" in table row |
| 2.3 | Role saved to DB correctly | Manual | Create user with VIEWER; check `role` field in Prisma Studio |

### USER-03: Grant/revoke section access per user

| # | Behavior | Type | Command / Steps |
|---|----------|------|-----------------|
| 3.1 | Section checkboxes show 9 items with Russian labels | Manual | Open create dialog with role MANAGER; count checkboxes; verify labels match SECTION_OPTIONS |
| 3.2 | Section checkboxes hidden when role = SUPERADMIN | Manual | Switch role to SUPERADMIN in form; verify checkbox group disappears and note "Суперадмин имеет доступ ко всем разделам" appears |
| 3.3 | Selected sections saved to DB as ERP_SECTION[] | Manual | Create user with 2 sections checked; inspect `allowedSections` in Prisma Studio |
| 3.4 | SECTION_OPTIONS exports 9 entries (one per ERP_SECTION) | Automated | `grep -c "value:" /Users/macmini/zoiten.pro/lib/section-labels.ts` — must return 9 |

### USER-04: View list of all users

| # | Behavior | Type | Command / Steps |
|---|----------|------|-----------------|
| 4.1 | /admin/users loads without error | Manual | Navigate to http://localhost:3000/admin/users as superadmin |
| 4.2 | Table renders columns: имя, email, роль, статус, разделы, действия | Manual | Verify 6 column headers visible |
| 4.3 | Deactivated users appear as grayed-out rows (opacity-50) | Manual | Deactivate a user; verify row has reduced opacity but is still visible |
| 4.4 | Non-SUPERADMIN role is redirected away from /admin/users | Manual | Log in as MANAGER role user; attempt to navigate to /admin/users; expect redirect to /unauthorized |
| 4.5 | RSC page calls prisma.user.findMany() | Automated | `grep -n "prisma.user.findMany" /Users/macmini/zoiten.pro/app/\(dashboard\)/admin/users/page.tsx` — must match |

### USER-05: Edit and deactivate existing users

| # | Behavior | Type | Command / Steps |
|---|----------|------|-----------------|
| 5.1 | Edit button opens dialog prefilled with user data | Manual | Click pencil icon; verify name/email/role fields are pre-populated |
| 5.2 | Leaving password blank in edit preserves existing hash | Manual | Edit user; leave password field empty; save; verify hash in Prisma Studio is unchanged |
| 5.3 | Deactivated user cannot log in | Manual | Deactivate user; attempt login as that user; expect "Аккаунт деактивирован" error |
| 5.4 | Superadmin cannot deactivate own account | Manual | Edit own account (sergey.fyodorov@gmail.com); toggle isActive to OFF; submit; expect error toast "Нельзя деактивировать собственный аккаунт" |
| 5.5 | updateUser() skips password update when password field is blank | Automated | `PATH=/usr/local/bin:$PATH npx tsc --noEmit` — optional password logic enforced by UpdateUserSchema |
| 5.6 | deleteUser() guard prevents self-deletion | Manual | Attempt to delete own account via trash icon; expect error toast |

---

## Build Artifacts Verification

After both plans execute, confirm these files exist:

```bash
# Plan 01 artifacts
ls /Users/macmini/zoiten.pro/lib/section-labels.ts
ls /Users/macmini/zoiten.pro/app/actions/users.ts
ls /Users/macmini/zoiten.pro/components/ui/dialog.tsx
ls /Users/macmini/zoiten.pro/components/ui/table.tsx
ls /Users/macmini/zoiten.pro/components/ui/switch.tsx
ls /Users/macmini/zoiten.pro/components/ui/checkbox.tsx
ls /Users/macmini/zoiten.pro/components/ui/select.tsx
ls /Users/macmini/zoiten.pro/components/ui/sonner.tsx

# Plan 02 artifacts
ls /Users/macmini/zoiten.pro/components/users/UserForm.tsx
ls /Users/macmini/zoiten.pro/components/users/UserDialog.tsx
ls /Users/macmini/zoiten.pro/components/users/UserTable.tsx
ls "/Users/macmini/zoiten.pro/app/(dashboard)/admin/users/page.tsx"

# Toaster in root layout
grep -n "Toaster" /Users/macmini/zoiten.pro/app/layout.tsx

# Server Actions export 3 functions
grep "^export async function" /Users/macmini/zoiten.pro/app/actions/users.ts

# requireSuperadmin in every action and page
grep -c "requireSuperadmin" /Users/macmini/zoiten.pro/app/actions/users.ts
grep -n "requireSuperadmin" "/Users/macmini/zoiten.pro/app/(dashboard)/admin/users/page.tsx"
```

---

## Wave 0 Gaps

- No test runner installed. For this phase, `npx tsc --noEmit` + `npm run build` + manual smoke tests are the accepted gate.
- If future phases require automated tests, install vitest: `npm install -D vitest @vitejs/plugin-react`
- PostgreSQL is not available locally (Phase 1 constraint carried forward). Prisma-touching Server Actions require DATABASE_URL. Functional testing against a live DB happens on VPS or with a local Postgres instance.

---

## Phase Sign-Off Checklist

- [ ] `npx tsc --noEmit` exits 0 (no TypeScript errors)
- [ ] `npm run build` exits 0 (no build errors)
- [ ] All 8 artifact files exist (7 shadcn components + section-labels.ts from Plan 01)
- [ ] All 5 component/page files exist from Plan 02
- [ ] `<Toaster />` present in app/layout.tsx
- [ ] USER-01: createUser() confirmed to hash password (manual)
- [ ] USER-02: Role badge shows correct Russian label (manual)
- [ ] USER-03: Section checkboxes hidden for SUPERADMIN (manual)
- [ ] USER-04: /admin/users page loads and table renders (manual)
- [ ] USER-05: Blank password edit preserves hash (manual)
- [ ] USER-05: Self-deactivation guard returns error toast (manual)
- [ ] Checkpoint task in 02-02 signed off with "approved"
