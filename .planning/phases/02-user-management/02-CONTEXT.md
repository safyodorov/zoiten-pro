# Phase 2: User Management - Context

**Gathered:** 2026-04-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Superadmin-only CRUD for user accounts. Create users with email/password/name/role, view list, edit, deactivate, and manage section access (allowedSections). This is an admin panel accessible only to SUPERADMIN role.

</domain>

<decisions>
## Implementation Decisions

### User List UI
- **D-01:** Table layout with columns: имя, email, роль (badge), статус (active/inactive badge), секции (badge list), действия (edit button).
- **D-02:** Deactivated users shown as grayed-out rows in the table.
- **D-03:** No pagination needed (team of ~10 users). Simple list.

### User Form
- **D-04:** Modal dialog (shadcn Dialog) for both create and edit — don't navigate away from user list.
- **D-05:** Same form component for create and edit (prefilled in edit mode).
- **D-06:** Password field: required on create, optional on edit (blank = keep current).

### Section Access
- **D-07:** Checkboxes with section display names in Russian (Товары, Управление ценами, etc.) in the user form.
- **D-08:** Section names mapped from ERP_SECTION enum to Russian labels.

### Deactivation
- **D-09:** Switch/toggle in the edit form to activate/deactivate user.
- **D-10:** Deactivated user's login rejected with error "Аккаунт деактивирован" (handled in auth.ts authorize from Phase 1).
- **D-11:** No confirmation dialog for deactivation (simple toggle, reversible).

### Access Control
- **D-12:** User Management page accessible ONLY to SUPERADMIN role (enforced via requireSuperadmin() from Phase 1).
- **D-13:** All Server Actions for user CRUD call requireSuperadmin() before executing.

### Claude's Discretion
- Form validation rules (zod schema)
- Exact Russian labels for each section
- Table sorting/ordering
- Toast notifications for success/error on CRUD operations

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase 1 Foundation
- `lib/auth.ts` — Auth.js v5 authorize function, handles deactivated user rejection
- `lib/rbac.ts` — requireSuperadmin(), requireSection(), getCurrentUser()
- `lib/sections.ts` — ERP_SECTION to URL path mapping (Edge-safe)
- `prisma/schema.prisma` — User model with role, allowedSections, isActive fields
- `types/next-auth.d.ts` — Session type augmentation

### Project Specs
- `.planning/REQUIREMENTS.md` — USER-01..05 requirements
- `.planning/ROADMAP.md` — Phase 2 success criteria

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `components/ui/button.tsx`, `card.tsx`, `input.tsx`, `label.tsx`, `form.tsx`, `alert.tsx`, `badge.tsx` — shadcn/ui v4 components from Phase 1
- `lib/rbac.ts` — requireSuperadmin() for access control
- `lib/prisma.ts` — Prisma singleton for DB queries

### Established Patterns
- Server Actions with "use server" + requireSection()/requireSuperadmin() calls (pattern from Phase 1 rbac-test.ts)
- react-hook-form + zod for form validation (pattern from LoginForm.tsx)
- shadcn/ui Dialog for modals

### Integration Points
- `app/(dashboard)/` layout — new page at `app/(dashboard)/users/page.tsx`
- Sidebar navigation — add "Управление пользователями" link
- Dashboard section cards — USER_MANAGEMENT section already in enum

</code_context>

<specifics>
## Specific Ideas

- Roles: SUPERADMIN and USER (from Prisma enum ROLE)
- Section labels in Russian for UI display
- Reuse LoginForm pattern (react-hook-form + zod) for user create/edit form
- Dialog component needs to be added via shadcn CLI if not already installed

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 02-user-management*
*Context gathered: 2026-04-05*
