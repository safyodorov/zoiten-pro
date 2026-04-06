# Roadmap: Zoiten ERP

## Overview

Six sequential phases that build the Zoiten ERP MVP from database foundation to live deployment. Each phase unlocks the next: auth and DB must exist before users can be managed, reference data must exist before products can be created, and products must be complete before the system is worth deploying. UI polish and support integration follow core functionality and are independent of each other.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Foundation & Auth** - Next.js project, PostgreSQL, Prisma schema, and working login with RBAC (completed 2026-04-05)
- [ ] **Phase 2: User Management** - Superadmin creates and manages user accounts with section-level permissions
- [ ] **Phase 3: Reference Data** - Brand, category/subcategory, and marketplace CRUD with seed data
- [x] **Phase 4: Products Module** - Full product CRUD, photo upload, soft delete, search, and 30-day cleanup (completed 2026-04-06)
- [ ] **Phase 5: UI & Module Stubs** - Animated landing page, stub tabs for future modules, support integration
- [ ] **Phase 6: Deployment** - VPS setup, nginx, systemd, SSL, and production go-live

## Phase Details

### Phase 1: Foundation & Auth
**Goal**: Users can log in and be routed based on their role; the database schema and project scaffold are stable and ready for features
**Depends on**: Nothing (first phase)
**Requirements**: FOUND-01, FOUND-02, FOUND-03, FOUND-04, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-05, AUTH-06, AUTH-07, AUTH-08
**Success Criteria** (what must be TRUE):
  1. User can navigate to `/login`, enter email and password, and reach an authenticated dashboard
  2. User session persists after browser refresh (JWT with role and sections in cookie)
  3. User can log out from any page and is redirected to `/login`
  4. Unauthenticated requests to protected routes redirect to `/login`; wrong-role requests redirect to `/unauthorized`
  5. Superadmin (sergey.fyodorov@gmail.com) exists in the database after `prisma db seed` runs
**Plans**: 4 plans
Plans:
- [x] 01-01-PLAN.md — Scaffold Next.js 15 project with dependencies, shadcn/ui v4, Tailwind v4
- [x] 01-02-PLAN.md — Prisma schema (all entities + enums), singleton, DB migration, superadmin seed
- [x] 01-03-PLAN.md — Auth.js v5 config split, JWT callbacks, TypeScript augmentation, RBAC utility
- [x] 01-04-PLAN.md — RBAC middleware, login UI, dashboard, logout, unauthorized page
**UI hint**: yes

### Phase 2: User Management
**Goal**: Superadmin can provision team accounts with controlled access to ERP sections before the system is opened to the team
**Depends on**: Phase 1
**Requirements**: USER-01, USER-02, USER-03, USER-04, USER-05
**Success Criteria** (what must be TRUE):
  1. Superadmin can create a new user account with email, password, name, and role
  2. Superadmin can view a list of all users with their roles and active/inactive status
  3. Superadmin can edit an existing user (name, password, role) and deactivate them
  4. Superadmin can grant or revoke access to specific ERP sections per user
  5. A deactivated user's login attempt is rejected
**Plans**: 2 plans
Plans:
- [x] 02-01-PLAN.md — Install shadcn components, section labels utility, and user Server Actions
- [x] 02-02-PLAN.md — UserTable, UserDialog, UserForm components + /admin/users page + Toaster
**UI hint**: yes

### Phase 3: Reference Data
**Goal**: Brands, categories/subcategories, and marketplaces are managed so the product form has all lookup data it needs
**Depends on**: Phase 2
**Requirements**: REF-01, REF-02, REF-03, REF-04, REF-05
**Success Criteria** (what must be TRUE):
  1. Admin can create, rename, and delete brands; Zoiten brand exists after seed
  2. Admin can create categories and subcategories scoped to a specific brand; Zoiten's three categories (Дом, Кухня, Красота и здоровье) exist after seed
  3. Admin can add a new marketplace beyond the seeded four (WB, Ozon, ДМ, ЯМ)
  4. Inside the product form, user can create a new category or subcategory inline without leaving the form
**Plans**: 3 plans
Plans:
- [x] 03-01-PLAN.md — Server Actions for reference CRUD (brands, categories, subcategories, marketplaces) + seed extension
- [x] 03-02-PLAN.md — shadcn Tabs/Accordion wrappers + Settings page UI (/admin/settings) + Sidebar link
- [x] 03-03-PLAN.md — CreatableCombobox reusable component (REF-05, for Phase 4 product form)
**UI hint**: yes

### Phase 4: Products Module
**Goal**: Team members can manage the full product catalog — creating, editing, copying, and retiring products — with all structured data intact
**Depends on**: Phase 3
**Requirements**: PROD-01, PROD-02, PROD-03, PROD-04, PROD-05, PROD-06, PROD-07, PROD-08, PROD-09, PROD-10, PROD-11, PROD-12, PROD-13, PROD-14
**Success Criteria** (what must be TRUE):
  1. User can view a paginated product list filtered to "есть" by default and toggle to see other statuses
  2. User can search products by name and see matching results update the list
  3. User can create a product with all fields (name, photo, brand, category, ABC status, availability, marketplace articles, barcodes, dimensions) and save it
  4. User can open an existing product, edit any field, and save changes
  5. User can duplicate a product (all fields except photo copied) and soft-delete a product; soft-deleted products vanish from the list and purge from the DB after 30 days
**Plans**: 4 plans
Plans:
- [x] 04-01-PLAN.md — Server Actions (CRUD + duplicate + soft delete), photo upload Route Handler, dev file serving, cron purge, partial index migration
- [x] 04-02-PLAN.md — Product list page (/products) with status tabs, debounced search, paginated table, per-row actions
- [x] 04-03-PLAN.md — Product create/edit pages (/products/new, /products/[id]/edit) with all 5 form sections
- [x] 04-04-PLAN.md — Sidebar active link highlighting + end-to-end human verification checkpoint
**UI hint**: yes

### Phase 5: UI & Module Stubs
**Goal**: The application has a branded public face and navigable placeholders for all planned ERP sections, making the product feel complete and production-ready
**Depends on**: Phase 4
**Requirements**: LAND-01, LAND-02, LAND-03, LAND-04, STUB-01, STUB-02, STUB-03, STUB-04, STUB-05, STUB-06, SUPP-01, SUPP-02
**Success Criteria** (what must be TRUE):
  1. Landing page displays Zoiten logo, slogan "Время для жизни, свобода от рутины", navigation links, and entrance animations
  2. Login button in the top-right of the landing page navigates to `/login`
  3. Each future module (Управление ценами, Недельные карточки, Управление остатками, Себестоимость партий, План закупок, План продаж) has a navigable page with a "coming soon" placeholder
  4. Служба поддержки section is accessible via navigation and respects RBAC permissions
**Plans**: 2 plans
Plans:
- [ ] 05-01-PLAN.md — Install motion package + animated landing page (/, public, dark theme, hero + section cards)
- [x] 05-02-PLAN.md — ComingSoon component + 6 module stub pages + /support placeholder
**UI hint**: yes

### Phase 6: Deployment
**Goal**: The application runs in production at zoiten.pro on the VPS, with HTTPS, without disrupting CantonFairBot
**Depends on**: Phase 5
**Requirements**: DEPLOY-01, DEPLOY-02, DEPLOY-03, DEPLOY-04, DEPLOY-05, DEPLOY-06, DEPLOY-07, DEPLOY-08
**Success Criteria** (what must be TRUE):
  1. `https://zoiten.pro` resolves to the running application with a valid SSL certificate
  2. Application restarts automatically after VPS reboot (systemd service active)
  3. Product photos are served by nginx from `/var/www/zoiten-uploads/` without hitting Node.js
  4. CantonFairBot continues to function after nginx reconfiguration
  5. `prisma migrate deploy` runs without errors on the VPS database on deploy
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 4/4 | Complete   | 2026-04-05 |
| 2. User Management | 1/2 | In Progress|  |
| 3. Reference Data | 2/3 | In Progress|  |
| 4. Products Module | 4/4 | Complete   | 2026-04-06 |
| 5. UI & Module Stubs | 1/2 | In Progress|  |
| 6. Deployment | 0/? | Not started | - |
