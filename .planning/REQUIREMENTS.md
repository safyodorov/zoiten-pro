# Requirements: Zoiten ERP

**Defined:** 2026-04-05
**Core Value:** Единая база товаров компании, от которой зависят все остальные процессы ERP

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### Foundation

- [x] **FOUND-01**: Next.js 15 project initialized with TypeScript, Tailwind v4, shadcn/ui v4
- [x] **FOUND-02**: PostgreSQL database connected via Prisma 6 with migration system
- [x] **FOUND-03**: Prisma schema covers all core entities (User, Product, Brand, Category, Marketplace, MarketplaceArticle, Barcode)
- [x] **FOUND-04**: Prisma singleton pattern implemented (lib/prisma.ts)

### Authentication & RBAC

- [x] **AUTH-01**: User can log in with email/password using Auth.js v5 credentials provider
- [x] **AUTH-02**: User session persists across browser refresh (JWT strategy)
- [x] **AUTH-03**: User can log out from any page
- [x] **AUTH-04**: Passwords hashed with bcryptjs before storage
- [x] **AUTH-05**: Superadmin (sergey.fyodorov@gmail.com) seeded on first deploy
- [x] **AUTH-06**: RBAC enforced at middleware level (route redirect) AND in API routes/Server Actions
- [x] **AUTH-07**: JWT carries user role and allowed sections array
- [x] **AUTH-08**: next-auth.d.ts type augmentation for role/sections in session

### User Management

- [x] **USER-01**: Superadmin can create new user accounts (email, password, name)
- [x] **USER-02**: Superadmin can assign role to user
- [x] **USER-03**: Superadmin can grant/revoke access to specific ERP sections per user
- [x] **USER-04**: Superadmin can view list of all users
- [x] **USER-05**: Superadmin can edit/deactivate existing users

### Reference Data

- [x] **REF-01**: Brand CRUD — create, read, update, delete brands. Zoiten seeded by default
- [x] **REF-02**: Category CRUD — per-brand categories. Zoiten seeded with: Дом, Кухня, Красота и здоровье
- [x] **REF-03**: Subcategory CRUD — nested under categories, per-brand
- [x] **REF-04**: Marketplace CRUD — WB, Ozon, ДМ, ЯМ seeded. Can add custom marketplaces
- [x] **REF-05**: Inline category/subcategory creation from product form (combobox with "Add new" option)

### Products

- [x] **PROD-01**: User can view product list with pagination, filtered by availability status ("есть" by default)
- [x] **PROD-02**: User can toggle button to show products with other statuses (out of stock, выведен из ассортимента, удалено)
- [x] **PROD-03**: User can create a new product with all fields: наименование (до 100 символов), фото (3:4, JPEG/PNG, до 2K), бренд, категория/подкатегория, ABC-статус (A/B/C), наличие
- [x] **PROD-04**: User can add marketplace article numbers to product (up to 10 per marketplace, integer values)
- [x] **PROD-05**: User can add barcodes to product (1-20 barcodes per product)
- [x] **PROD-06**: User can set product dimensions (weight kg, height/width/depth cm) and see auto-calculated volume (liters)
- [x] **PROD-07**: Clicking a product in the list opens edit form with all current values
- [x] **PROD-08**: User can duplicate a product (deep copy of all fields except photo)
- [x] **PROD-09**: User can mark product for soft deletion (status changes to "удалено")
- [x] **PROD-10**: Soft-deleted products auto-purge from database after 30 days (cron/scheduled task)
- [x] **PROD-11**: Product photo uploaded to VPS filesystem (/var/www/zoiten-uploads/), served by nginx directly
- [x] **PROD-12**: Text search across product names in the product list
- [x] **PROD-13**: Marketplace articles stored in separate normalized table with DB-level uniqueness per marketplace
- [x] **PROD-14**: Barcode uniqueness constraint with partial index (WHERE deletedAt IS NULL)

### Landing Page

- [ ] **LAND-01**: Landing page displays Zoiten logo, slogan "Время для жизни, свобода от рутины", and navigation to all ERP sections
- [ ] **LAND-02**: Framer Motion animations on landing page (entrance effects, smooth transitions)
- [ ] **LAND-03**: Login button in top-right corner, redirects to login page
- [ ] **LAND-04**: Responsive layout (desktop primary, mobile acceptable)

### Module Stubs

- [x] **STUB-01**: "Управление ценами" tab/page exists with placeholder content
- [x] **STUB-02**: "Недельные карточки" tab/page exists with placeholder content
- [x] **STUB-03**: "Управление остатками" tab/page exists with placeholder content
- [x] **STUB-04**: "Себестоимость партий" tab/page exists with placeholder content
- [x] **STUB-05**: "План закупок" tab/page exists with placeholder content
- [x] **STUB-06**: "План продаж" tab/page exists with placeholder content

### Support Integration

- [x] **SUPP-01**: "Служба поддержки" section integrated from github.com/safyodorov/ai-cs-zoiten
- [x] **SUPP-02**: Support section accessible via navigation, respects RBAC permissions

### Deployment

- [ ] **DEPLOY-01**: Application deployed on VPS (85.198.97.89) via systemd service
- [ ] **DEPLOY-02**: Nginx reverse proxy configured: zoiten.pro → localhost:3000
- [ ] **DEPLOY-03**: Nginx serves uploaded photos from /var/www/zoiten-uploads/ as static files
- [ ] **DEPLOY-04**: PostgreSQL installed and configured on VPS
- [ ] **DEPLOY-05**: SSL/HTTPS via Let's Encrypt (when domain is pointed)
- [ ] **DEPLOY-06**: Nginx coexists with CantonFairBot without breaking it
- [ ] **DEPLOY-07**: Deploy script runs `prisma migrate deploy` (not `prisma migrate dev`)
- [ ] **DEPLOY-08**: Environment variables (.env) properly configured on VPS

## v2 Requirements

Deferred to future milestone. Tracked but not in current roadmap.

### API Integration

- **API-01**: Sync product data with Wildberries API
- **API-02**: Sync product data with Ozon API
- **API-03**: Auto-import article numbers from marketplace APIs

### Advanced Features

- **ADV-01**: Bulk CSV import/export of products
- **ADV-02**: Audit log / change history for products
- **ADV-03**: Automated ABC classification from sales data
- **ADV-04**: Multiple product photos / gallery

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| WB/Ozon API integration | High complexity, separate milestone after MVP |
| Multiple product photos | Single photo sufficient for 50-200 SKUs |
| S3/cloud storage | VPS filesystem sufficient at current scale |
| Barcode scanner/camera | Team works on desktop |
| Product variants/SKU matrix | RU marketplaces use separate nmIDs per variant |
| Real-time collaboration | Overkill for 10-person team, last-write-wins acceptable |
| Multi-brand permissions | Section-level RBAC sufficient for current team |
| AI catalog health scoring | Useful at 5000+ SKUs, not at 50-200 |

## Traceability

| REQ ID | Phase | Status |
|--------|-------|--------|
| FOUND-01 | Phase 1 | Complete |
| FOUND-02 | Phase 1 | Complete |
| FOUND-03 | Phase 1 | Complete |
| FOUND-04 | Phase 1 | Complete |
| AUTH-01 | Phase 1 | Complete |
| AUTH-02 | Phase 1 | Complete |
| AUTH-03 | Phase 1 | Complete |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| AUTH-06 | Phase 1 | Complete |
| AUTH-07 | Phase 1 | Complete |
| AUTH-08 | Phase 1 | Complete |
| USER-01 | Phase 2 | Complete |
| USER-02 | Phase 2 | Complete |
| USER-03 | Phase 2 | Complete |
| USER-04 | Phase 2 | Complete |
| USER-05 | Phase 2 | Complete |
| REF-01 | Phase 3 | Complete |
| REF-02 | Phase 3 | Complete |
| REF-03 | Phase 3 | Complete |
| REF-04 | Phase 3 | Complete |
| REF-05 | Phase 3 | Complete |
| PROD-01 | Phase 4 | Complete |
| PROD-02 | Phase 4 | Complete |
| PROD-03 | Phase 4 | Complete |
| PROD-04 | Phase 4 | Complete |
| PROD-05 | Phase 4 | Complete |
| PROD-06 | Phase 4 | Complete |
| PROD-07 | Phase 4 | Complete |
| PROD-08 | Phase 4 | Complete |
| PROD-09 | Phase 4 | Complete |
| PROD-10 | Phase 4 | Complete |
| PROD-11 | Phase 4 | Complete |
| PROD-12 | Phase 4 | Complete |
| PROD-13 | Phase 4 | Complete |
| PROD-14 | Phase 4 | Complete |
| LAND-01 | Phase 5 | Pending |
| LAND-02 | Phase 5 | Pending |
| LAND-03 | Phase 5 | Pending |
| LAND-04 | Phase 5 | Pending |
| STUB-01 | Phase 5 | Complete |
| STUB-02 | Phase 5 | Complete |
| STUB-03 | Phase 5 | Complete |
| STUB-04 | Phase 5 | Complete |
| STUB-05 | Phase 5 | Complete |
| STUB-06 | Phase 5 | Complete |
| SUPP-01 | Phase 5 | Complete |
| SUPP-02 | Phase 5 | Complete |
| DEPLOY-01 | Phase 6 | Pending |
| DEPLOY-02 | Phase 6 | Pending |
| DEPLOY-03 | Phase 6 | Pending |
| DEPLOY-04 | Phase 6 | Pending |
| DEPLOY-05 | Phase 6 | Pending |
| DEPLOY-06 | Phase 6 | Pending |
| DEPLOY-07 | Phase 6 | Pending |
| DEPLOY-08 | Phase 6 | Pending |

---
*Defined: 2026-04-05 | 56 requirements | 6 phases*
