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
- [ ] **AUTH-03**: User can log out from any page
- [x] **AUTH-04**: Passwords hashed with bcryptjs before storage
- [x] **AUTH-05**: Superadmin (sergey.fyodorov@gmail.com) seeded on first deploy
- [ ] **AUTH-06**: RBAC enforced at middleware level (route redirect) AND in API routes/Server Actions
- [x] **AUTH-07**: JWT carries user role and allowed sections array
- [x] **AUTH-08**: next-auth.d.ts type augmentation for role/sections in session

### User Management

- [ ] **USER-01**: Superadmin can create new user accounts (email, password, name)
- [ ] **USER-02**: Superadmin can assign role to user
- [ ] **USER-03**: Superadmin can grant/revoke access to specific ERP sections per user
- [ ] **USER-04**: Superadmin can view list of all users
- [ ] **USER-05**: Superadmin can edit/deactivate existing users

### Reference Data

- [ ] **REF-01**: Brand CRUD — create, read, update, delete brands. Zoiten seeded by default
- [ ] **REF-02**: Category CRUD — per-brand categories. Zoiten seeded with: Дом, Кухня, Красота и здоровье
- [ ] **REF-03**: Subcategory CRUD — nested under categories, per-brand
- [ ] **REF-04**: Marketplace CRUD — WB, Ozon, ДМ, ЯМ seeded. Can add custom marketplaces
- [ ] **REF-05**: Inline category/subcategory creation from product form (combobox with "Add new" option)

### Products

- [ ] **PROD-01**: User can view product list with pagination, filtered by availability status ("есть" by default)
- [ ] **PROD-02**: User can toggle button to show products with other statuses (out of stock, выведен из ассортимента, удалено)
- [ ] **PROD-03**: User can create a new product with all fields: наименование (до 100 символов), фото (3:4, JPEG/PNG, до 2K), бренд, категория/подкатегория, ABC-статус (A/B/C), наличие
- [ ] **PROD-04**: User can add marketplace article numbers to product (up to 10 per marketplace, integer values)
- [ ] **PROD-05**: User can add barcodes to product (1-20 barcodes per product)
- [ ] **PROD-06**: User can set product dimensions (weight kg, height/width/depth cm) and see auto-calculated volume (liters)
- [ ] **PROD-07**: Clicking a product in the list opens edit form with all current values
- [ ] **PROD-08**: User can duplicate a product (deep copy of all fields except photo)
- [ ] **PROD-09**: User can mark product for soft deletion (status changes to "удалено")
- [ ] **PROD-10**: Soft-deleted products auto-purge from database after 30 days (cron/scheduled task)
- [ ] **PROD-11**: Product photo uploaded to VPS filesystem (/var/www/zoiten-uploads/), served by nginx directly
- [ ] **PROD-12**: Text search across product names in the product list
- [ ] **PROD-13**: Marketplace articles stored in separate normalized table with DB-level uniqueness per marketplace
- [ ] **PROD-14**: Barcode uniqueness constraint with partial index (WHERE deletedAt IS NULL)

### Landing Page

- [ ] **LAND-01**: Landing page displays Zoiten logo, slogan "Время для жизни, свобода от рутины", and navigation to all ERP sections
- [ ] **LAND-02**: Framer Motion animations on landing page (entrance effects, smooth transitions)
- [ ] **LAND-03**: Login button in top-right corner, redirects to login page
- [ ] **LAND-04**: Responsive layout (desktop primary, mobile acceptable)

### Module Stubs

- [ ] **STUB-01**: "Управление ценами" tab/page exists with placeholder content
- [ ] **STUB-02**: "Недельные карточки" tab/page exists with placeholder content
- [ ] **STUB-03**: "Управление остатками" tab/page exists with placeholder content
- [ ] **STUB-04**: "Себестоимость партий" tab/page exists with placeholder content
- [ ] **STUB-05**: "План закупок" tab/page exists with placeholder content
- [ ] **STUB-06**: "План продаж" tab/page exists with placeholder content

### Support Integration

- [ ] **SUPP-01**: "Служба поддержки" section integrated from github.com/safyodorov/ai-cs-zoiten
- [ ] **SUPP-02**: Support section accessible via navigation, respects RBAC permissions

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
| AUTH-03 | Phase 1 | Pending |
| AUTH-04 | Phase 1 | Complete |
| AUTH-05 | Phase 1 | Complete |
| AUTH-06 | Phase 1 | Pending |
| AUTH-07 | Phase 1 | Complete |
| AUTH-08 | Phase 1 | Complete |
| USER-01 | Phase 2 | Pending |
| USER-02 | Phase 2 | Pending |
| USER-03 | Phase 2 | Pending |
| USER-04 | Phase 2 | Pending |
| USER-05 | Phase 2 | Pending |
| REF-01 | Phase 3 | Pending |
| REF-02 | Phase 3 | Pending |
| REF-03 | Phase 3 | Pending |
| REF-04 | Phase 3 | Pending |
| REF-05 | Phase 3 | Pending |
| PROD-01 | Phase 4 | Pending |
| PROD-02 | Phase 4 | Pending |
| PROD-03 | Phase 4 | Pending |
| PROD-04 | Phase 4 | Pending |
| PROD-05 | Phase 4 | Pending |
| PROD-06 | Phase 4 | Pending |
| PROD-07 | Phase 4 | Pending |
| PROD-08 | Phase 4 | Pending |
| PROD-09 | Phase 4 | Pending |
| PROD-10 | Phase 4 | Pending |
| PROD-11 | Phase 4 | Pending |
| PROD-12 | Phase 4 | Pending |
| PROD-13 | Phase 4 | Pending |
| PROD-14 | Phase 4 | Pending |
| LAND-01 | Phase 5 | Pending |
| LAND-02 | Phase 5 | Pending |
| LAND-03 | Phase 5 | Pending |
| LAND-04 | Phase 5 | Pending |
| STUB-01 | Phase 5 | Pending |
| STUB-02 | Phase 5 | Pending |
| STUB-03 | Phase 5 | Pending |
| STUB-04 | Phase 5 | Pending |
| STUB-05 | Phase 5 | Pending |
| STUB-06 | Phase 5 | Pending |
| SUPP-01 | Phase 5 | Pending |
| SUPP-02 | Phase 5 | Pending |
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
