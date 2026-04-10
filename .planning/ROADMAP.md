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
- [x] **Phase 5: UI & Module Stubs** - Animated landing page, stub tabs for future modules, support integration (completed 2026-04-06)
- [x] **Phase 6: Deployment** - VPS setup, nginx, systemd, SSL, and production go-live (completed 2026-04-06)
- [ ] **Phase 7: Управление ценами WB** - калькулятор юнит-экономики, синхронизация акций WB, загрузка Excel auto-акций, realtime модалка расчёта

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
- [x] 05-01-PLAN.md — Install motion package + animated landing page (/, public, dark theme, hero + section cards)
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
**Plans**: 2 plans
Plans:
- [x] 06-01-PLAN.md — Deploy script, systemd service + timer, nginx server block, updated .env.example
- [x] 06-02-PLAN.md — DEPLOY.md runbook — complete step-by-step VPS deployment guide

### Phase 7: Управление ценами WB — калькулятор юнит-экономики с акциями и расчётными ценами

**Goal**: Пользователь открывает `/prices/wb`, видит таблицу с группировкой по Product (Фото + Сводка + WbCard → ценовые строки), синхронизирует акции WB одной кнопкой, загружает Excel для auto-акций, кликает на строку → в модалке realtime меняет параметры (цена, ДРР, брак, доставка) и сохраняет расчётную цену в один из 3 слотов. Раздел `/prices/ozon` — заглушка ComingSoon.
**Depends on**: Phase 6
**Requirements**: PRICES-01, PRICES-02, PRICES-03, PRICES-04, PRICES-05, PRICES-06, PRICES-07, PRICES-08, PRICES-09, PRICES-10, PRICES-11, PRICES-12, PRICES-13, PRICES-14, PRICES-15, PRICES-16
**Success Criteria** (what must be TRUE):
  1. `/prices/wb` показывает таблицу только тех WB-карточек, которые привязаны к товарам через MarketplaceArticle (зелёная галочка). Soft-deleted товары исключены.
  2. Таблица группирует строки по Product через rowSpan (Фото + Сводка объединены на все ценовые строки), sticky колонки (Фото, Сводка, Ярлык, Артикул) остаются при горизонтальном скролле 30+ колонок расчёта
  3. Для каждой WbCard отображается порядок: «Текущая цена» → Regular акции (DESC by planPrice) → Auto акции (DESC by planPrice, только с Excel-данными) → Расчётные цены 1/2/3. Indicator strips: regular=blue, auto=purple, calculated=amber
  4. Клик по любой ценовой строке открывает `PricingCalculatorDialog` с 2-колоночным layout (inputs/outputs), realtime пересчёт через pure function `calculatePricing` из `lib/pricing-math.ts`, сохранение расчётной цены в слот 1/2/3
  5. Кнопка «Синхронизировать акции» загружает акции WB через Promotions Calendar API (окно [today, today+60d]) с rate limit compliant (600ms / 6000ms retry на 429); кнопка «Загрузить отчёт auto-акции» принимает Excel из кабинета WB и парсит 6 колонок (A/F/L/M/T/U)
  6. Golden test nmId 800750522 → profit ≈ 567.68 ₽, ROI ≈ 26%, Re продаж ≈ 7% (tests/pricing-math.test.ts GREEN)
**Plans**: 12 plans
Plans:
- [x] 07-00-PLAN.md — Wave 0 Infrastructure: vitest install, Excel canonical read, WB API smoke test, 5 RED test stubs, fixture copy
- [x] 07-01-PLAN.md — Wave 1 Prisma migration + schema changes (4 новые модели + 6 новых полей) + seed AppSetting
- [x] 07-02-PLAN.md — Wave 1 lib/pricing-math.ts pure function + fallback resolvers + golden test GREEN (TDD)
- [ ] 07-03-PLAN.md — Wave 2 lib/wb-api.ts расширения (4 новые функции: promotions + avgSalesSpeed7d) + integration в /api/wb-sync
- [ ] 07-04-PLAN.md — Wave 3 API routes: /api/wb-promotions-sync + /api/wb-promotions-upload-excel (с parseAutoPromoExcel)
- [ ] 07-05-PLAN.md — Wave 3 app/actions/pricing.ts (7 server actions + Zod схемы) + pricing-settings тест GREEN
- [ ] 07-06-PLAN.md — Wave 4 UI foundation: shadcn tooltip install + /prices layout/redirect/ozon stub + PricesTabs
- [ ] 07-07-PLAN.md — Wave 5 клиентские компоненты: GlobalRatesBar + PromoTooltip + PriceCalculatorTable (sticky + rowSpan + indicator strips)
- [ ] 07-08-PLAN.md — Wave 6 RSC page /prices/wb — data assembly + server-side расчёт + render компонентов
- [ ] 07-09-PLAN.md — Wave 7 PricingCalculatorDialog (realtime модалка) + PriceCalculatorTableWrapper (state) + human verification клик+save
- [ ] 07-10-PLAN.md — Wave 8 WbPromotionsSyncButton + WbAutoPromoUploadButton + Alert empty state + human verification реального sync/upload
- [ ] 07-11-PLAN.md — Wave 9 Docs (CLAUDE.md, README.md) + финальная валидация + deploy на VPS + end-to-end prod verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 4/4 | Complete   | 2026-04-05 |
| 2. User Management | 1/2 | In Progress|  |
| 3. Reference Data | 2/3 | In Progress|  |
| 4. Products Module | 4/4 | Complete   | 2026-04-06 |
| 5. UI & Module Stubs | 2/2 | Complete   | 2026-04-06 |
| 6. Deployment | 2/2 | Complete   | 2026-04-06 |
| 7. Управление ценами WB | 0/12 | Planned | |
