---
phase: 02-user-management
plan: 01
subsystem: user-management
tags: [shadcn, server-actions, rbac, bcrypt, user-crud]
dependency_graph:
  requires: [lib/rbac.ts, lib/auth.ts, lib/prisma.ts, prisma/schema.prisma]
  provides: [app/actions/users.ts, lib/section-labels.ts, components/ui/dialog.tsx, components/ui/table.tsx, components/ui/switch.tsx, components/ui/checkbox.tsx, components/ui/select.tsx, components/ui/separator.tsx, components/ui/sonner.tsx]
  affects: [app/admin/users/** (future Plan 02)]
tech_stack:
  added: [bcryptjs (user password hashing), zod (server-side validation), next/cache (revalidatePath)]
  patterns: [discriminated-union action result, requireSuperadmin guard, self-deactivation guard, optional-password-update]
key_files:
  created:
    - lib/section-labels.ts
    - app/actions/users.ts
    - components/ui/dialog.tsx
    - components/ui/table.tsx
    - components/ui/switch.tsx
    - components/ui/checkbox.tsx
    - components/ui/select.tsx
    - components/ui/separator.tsx
    - components/ui/sonner.tsx
  modified:
    - package.json
    - package-lock.json
decisions:
  - "Used UserRole type cast from @prisma/client instead of type gymnastics in role assignment"
  - "Typed updateData as explicit object shape (not Record<string,unknown>) for Prisma type safety"
metrics:
  duration: ~5min
  completed: "2026-04-05T20:18:34Z"
  tasks_completed: 3
  files_created: 9
  files_modified: 2
---

# Phase 2 Plan 1: Backend Mutations & shadcn Components Summary

**One-liner:** User CRUD Server Actions with bcrypt hashing, self-deactivation guard, and 7 new shadcn v4 base-ui components installed for Plan 02 UI.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Install shadcn/ui components | a4720ff | 7 new component files + package.json |
| 2 | Create section labels utility | ec1e41d | lib/section-labels.ts |
| 3 | Implement user Server Actions | afabbd4 | app/actions/users.ts |

## What Was Built

### 1. shadcn v4 Components (7 files)
All installed via `npx shadcn@latest add` — compatible with base-ui style used in Phase 1:
- `dialog.tsx` — modal dialogs for create/edit user forms
- `table.tsx` — user list table
- `switch.tsx` — isActive toggle
- `checkbox.tsx` — section permission checkboxes
- `select.tsx` — role selector
- `separator.tsx` — layout dividers
- `sonner.tsx` — toast notifications

### 2. ERP Section Labels (`lib/section-labels.ts`)
Pure data file exporting `SECTION_OPTIONS: SectionOption[]` with all 9 ERP_SECTION enum values mapped to Russian display labels. No imports — safe for client and server components.

### 3. User Server Actions (`app/actions/users.ts`)
Three server actions implementing full user CRUD:

**`createUser(data)`**
- Calls `requireSuperadmin()` first (D-13)
- Validates with Zod `CreateUserSchema`
- Hashes password with `bcrypt.hash(password, 10)` — always produces `$2b$` hash
- Creates user via Prisma, calls `revalidatePath("/admin/users")`
- Returns `{ ok: true }` or `{ ok: false; error: string }`

**`updateUser(data)`**
- Calls `requireSuperadmin()` first (D-13)
- Guards against self-deactivation: checks `session.user.id === data.id && data.isActive === false` (D-12)
- Only hashes/updates password if `parsed.password` is non-empty (D-06)
- Handles duplicate email (P2002) gracefully

**`deleteUser(id)`**
- Calls `requireSuperadmin()` first (D-13)
- Guards against self-deletion
- Handles not-found (P2025) gracefully

All actions call `revalidatePath("/admin/users")` before returning success.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed type safety in updateData object**
- **Found during:** Task 3
- **Issue:** Plan template used `Record<string, unknown>` for `updateData` which caused TypeScript to lose Prisma type checking on the object properties
- **Fix:** Used explicit typed object `{ name: string; email: string; role: UserRole; allowedSections: ERP_SECTION[]; isActive: boolean; password?: string }` for proper Prisma type safety
- **Files modified:** app/actions/users.ts
- **Commit:** afabbd4

**2. [Rule 1 - Bug] Fixed Prisma error code check typing**
- **Found during:** Task 3
- **Issue:** Plan template used `(e as any)?.code` which is unsafe
- **Fix:** Used `(e as { code?: string })?.code` for proper TypeScript typing
- **Files modified:** app/actions/users.ts
- **Commit:** afabbd4

## Known Stubs

None — all three server actions are fully implemented with real database operations.

## Self-Check: PASSED

Files verified:
- `lib/section-labels.ts` — exists, 9 SECTION_OPTIONS entries
- `app/actions/users.ts` — exists, exports createUser, updateUser, deleteUser
- All 7 shadcn component files exist in `components/ui/`
- TypeScript: `npx tsc --noEmit` passes with no errors

Commits verified:
- a4720ff — chore(02-01): install shadcn/ui components
- ec1e41d — feat(02-01): create ERP section labels utility
- afabbd4 — feat(02-01): implement user Server Actions
