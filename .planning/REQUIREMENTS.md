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

- [x] **LAND-01**: Landing page displays Zoiten logo, slogan "Время для жизни, свобода от рутины", and navigation to all ERP sections
- [x] **LAND-02**: Framer Motion animations on landing page (entrance effects, smooth transitions)
- [x] **LAND-03**: Login button in top-right corner, redirects to login page
- [x] **LAND-04**: Responsive layout (desktop primary, mobile acceptable)

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

- [x] **DEPLOY-01**: Application deployed on VPS (85.198.97.89) via systemd service
- [x] **DEPLOY-02**: Nginx reverse proxy configured: zoiten.pro → localhost:3000
- [x] **DEPLOY-03**: Nginx serves uploaded photos from /var/www/zoiten-uploads/ as static files
- [x] **DEPLOY-04**: PostgreSQL installed and configured on VPS
- [x] **DEPLOY-05**: SSL/HTTPS via Let's Encrypt (when domain is pointed)
- [x] **DEPLOY-06**: Nginx coexists with CantonFairBot without breaking it
- [x] **DEPLOY-07**: Deploy script runs `prisma migrate deploy` (not `prisma migrate dev`)
- [x] **DEPLOY-08**: Environment variables (.env) properly configured on VPS

### Управление ценами WB (Phase 7)

- [x] **PRICES-01**: Страница `/prices/wb` отображает таблицу только тех WB-карточек, которые привязаны к товарам через `MarketplaceArticle` (зелёная галочка в `/cards/wb`). Soft-deleted товары игнорируются.
- [ ] **PRICES-02**: Таблица группирует ценовые строки по Product через rowSpan — колонки Фото + Сводка объединены на все строки всех карточек товара, колонки Ярлык + Артикул объединены на все ценовые строки одной WbCard. Жирный разделитель между Product, тонкий между WbCard внутри Product.
- [ ] **PRICES-03**: 4 sticky колонки слева при горизонтальном скролле (Фото 80px + Сводка 240px + Ярлык 80px + Артикул 120px) остаются видимыми, используя `position: sticky; left: {accumulated}` с z-index слоями.
- [ ] **PRICES-04**: Ценовые строки внутри каждой WbCard отображаются в строгом порядке: «Текущая цена» (первая, с Badge «Текущая») → Regular акции DESC by planPrice → Auto акции DESC by planPrice (только с данными из Excel) → Расчётные цены 1/2/3 по слотам. Индикаторные полосы: regular=blue, auto=purple, calculated=amber.
- [x] **PRICES-05**: 30 колонок расчёта юнит-экономики считаются серверно через pure function `calculatePricing(inputs): outputs` в `lib/pricing-math.ts`. Golden test case: nmId 800750522 → profit ≈ 567.68 ₽, returnOnSales ≈ 7%, roi ≈ 26%.
- [x] **PRICES-06**: 6 глобальных ставок (wbWalletPct, wbAcquiringPct, wbJemPct, wbCreditPct, wbOverheadPct, wbTaxPct) редактируются inline в `GlobalRatesBar` в шапке раздела. Сохраняются в таблицу `AppSetting` через debounced (500ms) server action с Zod валидацией (0-100, десятые). Seed дефолтов: 2.0/2.7/1.0/7.0/6.0/8.0.
- [ ] **PRICES-07**: Клик по любой ценовой строке открывает `PricingCalculatorDialog` с 2-колоночным layout (inputs слева, realtime outputs справа). Realtime пересчёт через `useWatch` + `useMemo`, latency < 100ms.
- [x] **PRICES-08**: Сохранение расчёта в таблицу `CalculatedPrice` через upsert по `@@unique([wbCardId, slot])`. Пользователь выбирает слот 1/2/3 и опциональное имя. `snapshot: Json` фиксирует полный набор параметров на момент сохранения.
- [x] **PRICES-09**: Чекбокс «только этот товар» в модалке у полей ДРР/Брак управляет scope сохранения: true → Product override, false → Subcategory/Category default (с предупреждающим toast). Fallback chain: `Product.override → Subcategory/Category.default → hardcoded (10%/2%/30₽)`.
- [x] **PRICES-10**: Синхронизация акций через кнопку «Синхронизировать акции» → `POST /api/wb-promotions-sync` → WB Promotions Calendar API с окном [today, today+60 days]. Rate limit compliant: 600ms между запросами, 429 retry через sleep(6000). Cleanup акций с `endDateTime < today - 7 days`.
- [x] **PRICES-11**: Загрузка Excel отчёта из кабинета WB для auto-акций через `POST /api/wb-promotions-upload-excel` (multipart file + promotionId). Парсинг 6 колонок по индексам A=0/F=5/L=11/M=12/T=19/U=20, upsert в `WbPromotionNomenclature` по `@@unique([promotionId, nmId])`.
- [x] **PRICES-12**: Новое поле `WbCard.avgSalesSpeed7d: Float?` заполняется при `/api/wb-sync` из WB Statistics Sales API (sales за 7 дней / 7). Отображается в колонке Сводка как «Скорость 7д: {N} шт/день», суммируется по всем WbCard одного Product.
- [ ] **PRICES-13**: Подраздел `/prices/ozon` — заглушка `<ComingSoon sectionName="Управление ценами Ozon" />` по аналогии с `/cards/ozon`.
- [ ] **PRICES-14**: RBAC: все страницы раздела требуют `requireSection("PRICES")`, все write actions (updateAppSetting, saveCalculatedPrice, updateProductOverride, синхронизация акций, загрузка Excel) требуют `requireSection("PRICES", "MANAGE")`.
- [ ] **PRICES-15**: Tooltip на названии акции через shadcn `tooltip` (добавляется в Phase 7 через `npx shadcn add tooltip`), контент — `WbPromotion.description` + маркированный список `advantages[]`, max-width 384px.
- [ ] **PRICES-16**: Подсветка значений Прибыль/Re продаж/ROI: `text-green-600 font-medium` при значении ≥0, `text-red-600 font-medium` при <0. Дополнительно префикс «+/−» для Re и ROI (дальтонизм safety).

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
| Отправка расчётных цен в WB (Prices API upload) | Phase 7 — только калькулятор, отправка цен — отдельная фаза |
| История изменений расчётных цен (audit log) | Снимок в `CalculatedPrice.snapshot` достаточен для отладки, полная история — отдельная фаза |
| Подстановка расчётной цены в акцию через `/calendar/promotions/upload` | Write WB API, отдельная фаза |
| Ozon Pricing (полноценный) | Phase 7 — только заглушка ComingSoon |
| Экспорт таблицы `/prices/wb` в Excel | Deferred |
| Фильтры по бренду/категории в `/prices/wb` | Deferred (паттерн есть в `/cards/wb`) |
| Массовые расчёты («применить ставку X ко всем товарам категории Y») | Deferred |
| Удаление `CalculatedPrice` из UI | Deferred |

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
| LAND-01 | Phase 5 | Complete |
| LAND-02 | Phase 5 | Complete |
| LAND-03 | Phase 5 | Complete |
| LAND-04 | Phase 5 | Complete |
| STUB-01 | Phase 5 | Complete |
| STUB-02 | Phase 5 | Complete |
| STUB-03 | Phase 5 | Complete |
| STUB-04 | Phase 5 | Complete |
| STUB-05 | Phase 5 | Complete |
| STUB-06 | Phase 5 | Complete |
| SUPP-01 | Phase 5 | Complete |
| SUPP-02 | Phase 5 | Complete |
| DEPLOY-01 | Phase 6 | Complete |
| DEPLOY-02 | Phase 6 | Complete |
| DEPLOY-03 | Phase 6 | Complete |
| DEPLOY-04 | Phase 6 | Complete |
| DEPLOY-05 | Phase 6 | Complete |
| DEPLOY-06 | Phase 6 | Complete |
| DEPLOY-07 | Phase 6 | Complete |
| DEPLOY-08 | Phase 6 | Complete |
| PRICES-01 | Phase 7 | Complete |
| PRICES-02 | Phase 7 | Pending |
| PRICES-03 | Phase 7 | Pending |
| PRICES-04 | Phase 7 | Pending |
| PRICES-05 | Phase 7 | Complete |
| PRICES-06 | Phase 7 | Complete |
| PRICES-07 | Phase 7 | Pending |
| PRICES-08 | Phase 7 | Complete |
| PRICES-09 | Phase 7 | Complete |
| PRICES-10 | Phase 7 | Complete |
| PRICES-11 | Phase 7 | Complete |
| PRICES-12 | Phase 7 | Complete |
| PRICES-13 | Phase 7 | Pending |
| PRICES-14 | Phase 7 | Pending |
| PRICES-15 | Phase 7 | Pending |
| PRICES-16 | Phase 7 | Pending |

---
*Defined: 2026-04-05 | 72 requirements | 7 phases*
