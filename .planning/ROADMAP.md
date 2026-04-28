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
- [x] **Phase 14: Управление остатками** - per-warehouse остатки WB + склад Иваново + производство + /stock Product-level + /stock/wb с кластерами (milestone v1.2) (completed 2026-04-22)

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
- [x] 07-03-PLAN.md — Wave 2 lib/wb-api.ts расширения (4 новые функции: promotions + avgSalesSpeed7d) + integration в /api/wb-sync
- [x] 07-04-PLAN.md — Wave 3 API routes: /api/wb-promotions-sync + /api/wb-promotions-upload-excel (с parseAutoPromoExcel)
- [x] 07-05-PLAN.md — Wave 3 app/actions/pricing.ts (7 server actions + Zod схемы) + pricing-settings тест GREEN
- [x] 07-06-PLAN.md — Wave 4 UI foundation: shadcn tooltip install + /prices layout/redirect/ozon stub + PricesTabs
- [x] 07-07-PLAN.md — Wave 5 клиентские компоненты: GlobalRatesBar + PromoTooltip + PriceCalculatorTable (sticky + rowSpan + indicator strips)
- [x] 07-08-PLAN.md — Wave 6 RSC page /prices/wb — data assembly + server-side расчёт + render компонентов
- [x] 07-09-PLAN.md — Wave 7 PricingCalculatorDialog (realtime модалка) + PriceCalculatorTableWrapper (state) + human verification клик+save
- [x] 07-10-PLAN.md — Wave 8 WbPromotionsSyncButton + WbAutoPromoUploadButton + Alert empty state + human verification реального sync/upload
- [x] 07-11-PLAN.md — Wave 9 Docs (CLAUDE.md, README.md) + финальная валидация + deploy на VPS + end-to-end prod verification

## Milestone v1.1: Служба поддержки WB

**Goal:** Единое рабочее место в ERP для всех каналов коммуникации с покупателями Wildberries — отзывы, вопросы, чат, возвраты, мессенджеры — без переключения в личный кабинет WB.

**PRD:** `C:\Users\User\Downloads\PRD Служба поддержки WB — Zoiten ERP.md`

**Стратегия:** 6 фаз, каждая добавляет новый канал/возможность поверх MVP-основы (отзывы + вопросы). Phase 8 — foundation для всего милстоуна (модели БД, sync, лента, диалог); Phase 9-12 — расширяют каналы (возвраты, чат, шаблоны/обжалование, мессенджеры); Phase 13 — статистика поверх всех каналов.

### Phases (v1.1)

- [ ] **Phase 8: MVP — Отзывы + Вопросы** — модели БД, WB Feedbacks/Questions API, лента тикетов `/support`, диалог `/support/[ticketId]`, cron-синхронизация 15 мин, sidebar badge
- [ ] **Phase 9: Возвраты** — WB Returns API, страница `/support/returns`, действия Одобрить/Отклонить/Пересмотреть, логика состояний PENDING → APPROVED | REJECTED → APPROVED
- [x] **Phase 10: Чат + Автоответы** — WB Chat API (curl fallback на 403), cron 5 мин, отправка сообщений с медиа, AutoReplyConfig + страница `/support/auto-reply` (completed 2026-04-18)
- [ ] **Phase 11: Шаблоны + Обжалование отзывов** (reformulated — local-only library + hybrid manual appeals) — CRUD шаблонов `/support/templates`, Export/Import JSON (вместо WB sync), модалка выбора при ответе, обжалование через ЛК WB с локальным трекером статуса
- [ ] **Phase 12: Профиль покупателя + Мессенджеры** — линковка тикетов к Customer, страница `/support/customers/[id]`, ручное создание тикета MESSENGER, merge дубликатов
- [ ] **Phase 13: Статистика** — страница `/support/stats` с вкладками «По товарам» / «По менеджерам», ManagerSupportStats + cron агрегации (03:00 МСК)

### Phase Details (v1.1)

### Phase 8: MVP — Отзывы + Вопросы
**Goal**: Менеджер службы поддержки видит все новые отзывы и вопросы WB в единой ленте `/support`, открывает диалог, отвечает через WB API, назначает исполнителя и меняет статус — без перехода в личный кабинет WB.
**Depends on**: Nothing (foundation милстоуна — новые модели БД и первый канал интеграции с WB)
**Requirements**: SUP-01, SUP-02, SUP-03, SUP-04, SUP-05, SUP-06, SUP-07 (частично — cron отзывов/вопросов), SUP-08, SUP-09, SUP-10, SUP-11, SUP-12, SUP-13, SUP-14 (частично — ответ на отзыв/вопрос), SUP-15, SUP-16, SUP-40
**Success Criteria** (what must be TRUE):
  1. Менеджер открывает `/support` и видит объединённую ленту отзывов и вопросов WB с цветными индикаторами статуса, превью текста, рейтингом (для отзывов), товаром (nmId + фото) и назначенным менеджером
  2. Менеджер фильтрует ленту по каналу (отзывы/вопросы), статусу, товару, менеджеру, диапазону дат и toggle «только неотвеченные»
  3. Менеджер открывает тикет → видит 3-колоночный диалог (покупатель/товар слева, хронология сообщений по центру, управление справа) → отвечает через textarea → ответ уходит в WB API и сохраняется как OUTBOUND сообщение
  4. Менеджер назначает ответственного из списка сотрудников с доступом SUPPORT и переводит статус тикета NEW → IN_PROGRESS → ANSWERED → CLOSED
  5. Cron раз в 15 минут подтягивает новые отзывы и вопросы из WB, скачивает медиа локально, обновляет sidebar-бейдж «количество новых». Кнопка «Синхронизировать» в шапке запускает `/api/support-sync` вручную с toast состояниями
**Plans**: 4 plans
Plans:
- [x] 08-01-PLAN.md — БД (4 модели + 5 enum) + WB Feedbacks/Questions клиент + RBAC foundation + Wave 0 test stubs
- [x] 08-02-PLAN.md — Sync /api/support-sync + cron (15 мин отзывы/вопросы, раз в сутки cleanup) + медиа-загрузка
- [x] 08-03-PLAN.md — Лента /support (RSC, карточки с индикатор-полосами, фильтры, pagination) + sidebar badge, ЗАМЕНА заглушки ai-cs-zoiten
- [x] 08-04-PLAN.md — Диалог /support/[ticketId] (3-колоночный) + server actions (reply/assign/updateStatus) + SupportSyncButton
**UI hint**: yes

### Phase 9: Возвраты
**Goal**: Менеджер обрабатывает заявки на возврат/брак из WB в отдельной таблице — одобряет, отклоняет с причиной и пересматривает отклонённые заявки.
**Depends on**: Phase 8 (модели SupportTicket/SupportMessage уже есть, расширяется новой моделью ReturnDecision и каналом RETURN)
**Requirements**: SUP-14 (дополнение — кнопки возврата в диалоге), SUP-17, SUP-18, SUP-19, SUP-20
**Success Criteria** (what must be TRUE):
  1. Менеджер открывает `/support/returns` → видит таблицу заявок с колонками Товар, Покупатель, Причина, Фото брака, Дата, Решение, Кто принял, Пересмотрено
  2. Менеджер кликает «Одобрить» или «Отклонить» (с причиной) → решение уходит в WB Returns API и фиксируется в `ReturnDecision` с `decidedById` и `decidedAt`
  3. Менеджер пересматривает ранее отклонённую заявку через кнопку «Пересмотреть» → статус переходит REJECTED → APPROVED, `reconsidered=true`
  4. В диалоге тикета с каналом RETURN на sticky-панели появляются кнопки «Одобрить/Отклонить/Пересмотреть» вместо/рядом с textarea ответа
  5. Состояния возврата соблюдают логику: PENDING → APPROVED | REJECTED, REJECTED → APPROVED через «Пересмотреть», APPROVED финальное (действия disabled)
**Plans**: 4 plans
Plans:
- [x] 09-01-PLAN.md — Foundation: Prisma миграция (ReturnDecision + 8 полей SupportTicket + 2 enum) + WB Claims API клиент + Wave 0 test stubs
- [x] 09-02-PLAN.md — Sync: syncReturns() + интеграция в POST /api/support-sync и cron /api/cron/support-sync-reviews (15 мин, Option A)
- [x] 09-03-PLAN.md — UI List: страница /support/returns с таблицей 9 колонок + 6 фильтров + пагинация + sidebar пункт «Возвраты»
- [x] 09-04-PLAN.md — UI Actions: ReturnActionsPanel (Одобрить/Отклонить/Пересмотреть) в диалоге /support/[ticketId] + 3 server actions + human UAT
**UI hint**: yes

### Phase 10: Чат + Автоответы
**Goal**: Менеджер переписывается с покупателями через встроенный чат WB прямо в ERP-диалоге, отправляет текст и медиа. Вне рабочих часов покупатель получает автоответ.
**Depends on**: Phase 8 (модели Ticket/Message расширяются каналом CHAT, добавляются AutoReplyConfig и curl-fallback для chat API)
**Requirements**: SUP-07 (дополнение — cron чата 5 мин), SUP-21, SUP-22, SUP-23, SUP-24, SUP-25
**Success Criteria** (what must be TRUE):
  1. Чаты с покупателями WB появляются в общей ленте `/support` и открываются как тикеты канала CHAT; cron каждые 5 минут подтягивает новые сообщения
  2. Менеджер отправляет сообщение в чат из диалога (текст + опциональное фото/видео multipart) → `SupportMessage` c direction=OUTBOUND и `SupportMedia` создаются, сообщение уходит в WB Chat API (curl-fallback при 403 от Node.js fetch)
  3. Менеджер открывает `/support/auto-reply` → настраивает переключатель, рабочие дни Пн-Вс, часы работы, текст с переменными `{имя_покупателя}` и `{название_товара}` → жмёт «Синхронизировать с WB» → настройки уходят в WB API
  4. Автоответы, отправленные WB вне рабочих часов, помечаются в ленте и диалоге иконкой «🤖» и флагом `isAutoReply=true`
  5. AutoReplyConfig — singleton-запись в БД, видны `updatedById` и `updatedAt`, изменение сохраняется локально (WB API не имеет endpoint для auto-reply config — SUP-24 реализован как локальная ERP-feature)
**Plans**: 4 plans
Plans:
- [x] 10-01-PLAN.md — Foundation: Prisma миграция AutoReplyConfig + WB Buyer Chat API клиент (5 методов) + Wave 0 stubs (5 тестов + 2 fixtures)
- [x] 10-02-PLAN.md — Sync + AutoReply Cron: lib/support-sync.ts syncChats + lib/auto-reply.ts runAutoReplies + GET /api/cron/support-sync-chat (5 мин) + расширение POST /api/support-sync
- [x] 10-03-PLAN.md — UI Chat Messages: ChatReplyPanel (multipart upload JPEG/PNG/PDF) + sendChatMessageAction + Bot badge для isAutoReply в SupportDialog
- [x] 10-04-PLAN.md — AutoReply Settings + Deploy + UAT: /support/auto-reply (singleton config) + saveAutoReplyConfig + sidebar 'Автоответ' + deploy.sh (WB_CHAT_TOKEN + crontab 5-min)
**UI hint**: yes

### Phase 11: Шаблоны + Обжалование отзывов (reformulated — WB API отключён)
**Goal**: Менеджер отвечает быстрее — выбирает готовый шаблон из локальной библиотеки с подстановкой переменных `{имя_покупателя}`/`{название_товара}`. Спорные отзывы обжалует через ЛК Wildberries с локальным трекером статуса в ERP.
**Depends on**: Phase 8 (диалог FEEDBACK/QUESTION уже есть); Phase 10 (опционально — если Phase 10 execute ПОЗЖЕ, Plan 10-03 интегрирует TemplatePickerModal в ChatReplyPanel)
**Requirements**: SUP-14 (дополнение — кнопка «Обжаловать» в диалоге FEEDBACK), SUP-26, SUP-27 (переформулирован — Export/Import JSON вместо WB sync), SUP-28, SUP-29 (переформулирован — hybrid manual через ЛК WB), SUP-31

> **Scope change (2026-04-17):** SUP-07 дополнение (cron обжалований 1 час) и SUP-30 (cron поллинг статуса обжалования) УДАЛЕНЫ — WB Complaint API отключён 2025-12-08, GET поллинга статуса жалобы никогда не существовал (research/11-RESEARCH.md §WB Report/Complaint API — СТАТУС ОТКЛЮЧЕНО). SUP-27 переформулирован — WB Templates API отключён 2025-11-19, вместо sync реализуем Export/Import JSON. SUP-29 — hybrid manual workflow с jump-link на seller.wildberries.ru.

**Success Criteria** (what must be TRUE):
  1. Менеджер открывает `/support/templates` → CRUD шаблонов с полями Название, Канал (FEEDBACK/QUESTION/CHAT), Тег ситуации, Товар/Общий, Активен; кнопка «Новый шаблон» открывает форму с native `<select>` для канала и хинтом о доступных переменных
  2. Менеджер жмёт «Экспорт» → скачивается JSON всех активных шаблонов; «Импорт» → загружает JSON → upsert по `@@unique([name, channel])` с отчётом `{added, updated, errors}`. WB sync не реализуется — WB Templates API отключён 2025-11-19
  3. При ответе в диалоге кнопка «Выбрать шаблон» открывает модалку поиска по тексту/тегу с группировкой (сначала шаблоны для текущего nmId, потом общие) → выбор подставляет текст в textarea с заменой `{имя_покупателя}` на имя покупателя (fallback «покупатель») и `{название_товара}` на название товара
  4. Менеджер жмёт «Обжаловать» в диалоге FEEDBACK → модалка с native `<select>` причины (8 значений из статичного APPEAL_REASONS) + textarea [10..1000 символов] → создаётся локальный `AppealRecord(PENDING)`, ticket.status=APPEALED, открывается новая вкладка `seller.wildberries.ru/feedbacks-and-questions/` для ручной подачи жалобы. WB API отключён 2025-12-08 — автоматизация невозможна
  5. Менеджер вручную переключает статус обжалования (PENDING ↔ APPROVED ↔ REJECTED) в TicketSidePanel когда WB ответит в ЛК; индикатор в ленте показывает 🕐 ожидание / ✅ одобрено / ❌ отклонено (SupportTicketCard inline badge)
**Plans**: 4 plans
Plans:
- [x] 11-01-PLAN.md — Foundation: Prisma миграция templates_appeals (2 модели + 2 поля SupportTicket + 4 relations User) + lib/appeal-reasons.ts + lib/template-vars.ts (TDD) + Wave 0 stubs
- [x] 11-02-PLAN.md — app/actions/templates.ts — 6 server actions (CRUD + Export/Import JSON заменяет WB sync) + 10+ GREEN unit-тестов
- [x] 11-03-PLAN.md — UI: страница /support/templates + TemplateForm + TemplatePickerModal (группировка по nmId + substitution) + интеграция в ReplyPanel + Sidebar «Шаблоны ответов»
- [ ] 11-04-PLAN.md — Appeals: app/actions/appeals.ts (createAppeal + updateAppealStatus) + AppealModal (jump-link WB) + AppealStatusPanel + индикатор в ленте + ROADMAP update + Deploy + UAT
**UI hint**: yes

### Phase 12: Профиль покупателя + Мессенджеры (reformulated — WB не даёт wbUserId)
**Goal**: Менеджер видит покупателя во всех каналах как единого Customer, ведёт внутреннюю заметку, создаёт тикеты вручную для Telegram/WhatsApp.
**Depends on**: Phase 8 (Customer создаётся в Phase 8 при sync, здесь — линковка и UI)
**Requirements**: SUP-32 (hybrid — auto Chat / manual остальные), SUP-33, SUP-34, SUP-35

> **Scope change (2026-04-18):** SUP-32 reformulated — WB API не возвращает wbUserId ни в одном канале (Feedbacks/Questions/Returns/Chat), подтверждено Phase 8/9/10 research + WebSearch 2026. Hybrid стратегия (Вариант C): для CHAT — auto-create Customer 1:1 с chatID через prefix `chat:` в Customer.wbUserId; для FEEDBACK/QUESTION/RETURN — customerId остаётся null, линковка ручная через кнопку «Связать с покупателем» в TicketSidePanel. ReplyPanel для MESSENGER скрыт (канал внешний — отвечать в Telegram/WhatsApp).

**Success Criteria** (what must be TRUE):
  1. Для CHAT канала при sync auto-create Customer 1:1 с chatID (Customer.wbUserId='chat:'+chatID); для FEEDBACK/QUESTION/RETURN customerId=null, линковка ручная через LinkCustomerButton в TicketSidePanel. Backfill существующих CHAT тикетов выполнен миграционным SQL.
  2. Менеджер открывает `/support/customers/[customerId]` → видит все тикеты покупателя по всем каналам в хронологии DESC, итого (N отзывов/вопросов/чатов/возвратов/мессенджер), средний рейтинг отзывов (FEEDBACK only), внутренняя заметка textarea с debounced save (500ms)
  3. Менеджер создаёт ручной MESSENGER-тикет через `/support/new` → форма (native select messengerType: Telegram/WhatsApp/другое, customerName, messengerContact, опциональный nmId, текст) → `SupportTicket` с `channel=MESSENGER`, `wbExternalId=null`, optional Customer создаётся атомарно в транзакции
  4. Менеджер выполняет merge дубликатов Customer через кнопку «Связать с другим» в профиле → 2-шаговая модалка (search target → confirmation warning) → все тикеты переносятся к target, source Customer hard-deleted в транзакции
  5. MESSENGER-тикеты появляются в общей ленте `/support` с иконкой Inbox + бейдж подтипа (Tg/Wa/Др) под каналом; открываются в /support/[ticketId] БЕЗ ReplyPanel (вместо — read-only hint с messengerContact)
**Plans**: 3 plans
Plans:
- [x] 12-01-PLAN.md — Foundation: Prisma миграция + enum MessengerType + SQL backfill + syncChats auto-upsert Customer + 5 server actions + 5 test файлов GREEN (Wave 0 stubs)
- [x] 12-02-PLAN.md — UI профиль /support/customers/[id] (5 компонент) + LinkCustomerButton в TicketSidePanel + кликабельное имя в SupportTicketCard (client)
- [ ] 12-03-PLAN.md — /support/new + NewMessengerTicketForm + MergeCustomerDialog + MESSENGER hint в диалоге + messengerType бейдж в ленте + deploy + UAT
**UI hint**: yes

### Phase 13: Статистика
**Goal**: Руководитель видит метрики качества поддержки — по товарам (проблемные SKU) и по менеджерам (производительность).
**Depends on**: Phase 8, Phase 9, Phase 10, Phase 11 (агрегация требует тикетов из всех каналов, ReturnDecision, обжалований и автоответов)
**Requirements**: SUP-36, SUP-37, SUP-38, SUP-39
**Success Criteria** (what must be TRUE):
  1. Пользователь открывает `/support/stats` → видит вкладки «По товарам» и «По менеджерам», фильтры периода (7д / 30д / квартал / кастом)
  2. Вкладка «По товарам»: кол-во отзывов, средний рейтинг, % ответов, возвраты (total/approved/rejected), топ причин, кол-во вопросов, среднее время ответа
  3. Вкладка «По менеджерам»: всего обработано, отзывы/вопросы/чаты/возвраты отвечено, % одобрения возвратов, среднее время ответа, кол-во автоответов
  4. Cron раз в сутки в 03:00 МСК обновляет денормализованную таблицу `ManagerSupportStats` (уникальность `(userId, period)`, period = начало месяца)
  5. Текущий день считается live поверх `ManagerSupportStats` — не ждёт ночной cron
**Plans**: 3 plans
Plans:
- [x] 13-01-PLAN.md — Foundation: Prisma миграция ManagerSupportStats + 2 индекса + lib/date-periods.ts + lib/support-stats.ts (6 helpers) + Wave 0 stubs (4 test файла, 25+ GREEN)
- [x] 13-02-PLAN.md — UI: RSC /support/stats (SUP-36/37/38) + 7 компонентов (StatsTabs, PeriodFilter, ProductStatsTab, ManagerStatsTab, TopReturnReasonsList, AutoRepliesSummary) + nav+title integration
- [ ] 13-03-PLAN.md — Cron + Deploy + UAT: /api/cron/support-stats-refresh (SUP-39) + systemd timer 03:00 МСК + human UAT + milestone v1.1 complete

## Milestone v1.2: Управление остатками

**Goal:** Менеджер видит актуальные остатки по всем каналам (склад Иваново + Производство + маркетплейсы в разрезе кластеров/складов WB), считает оборачиваемость и дефицит, принимает решения о закупках — без похода в кабинет WB / Excel / МойСклад.

**Research:** `.planning/research/SUMMARY.md` (+ STACK.md, FEATURES.md, ARCHITECTURE.md, PITFALLS.md)

**Стратегия:** Одна большая фаза (Phase 14) поверх зрелого стека Next.js 15 + Prisma 6 + уже работающего WB-sync + AppSetting KV + sticky-table pattern из Phase 7. Новых зависимостей нет. Milestone сосредоточен на одном разделе `/stock` с подразделом `/stock/wb` (кластеры+склады); `/stock/ozon` = ComingSoon (Ozon отдельный милстоун v1.3+). Планирование закупок и продаж — отдельный милстоун v1.3+ (STOCK-FUT-*).

**Два confirmed decisions** (уже в SUMMARY.md, не переобсуждаем):
1. **Route rename `/inventory` → `/stock`** — унификация с PROJECT.md, одна PR + nginx rewrite на 1 релиз.
2. **WB API migration в рамках Phase 14** — новый endpoint `POST /api/analytics/v1/stocks-report/wb-warehouses` (Аналитика scope, Personal/Service token), старый `fetchStocks()` помечен `@deprecated — sunset 2026-06-23`.

### Phases (v1.2)

- [x] **Phase 14: Управление остатками** — schema + WbWarehouse seed + wb-sync per-warehouse + Excel Иваново + Производство + Норма + /stock Product-level + /stock/wb с кластерами и expand до складов (completed 2026-04-22)
- [x] **Phase 15: Per-warehouse и per-cluster скорость заказов для /stock/wb** — Orders API per-warehouse + WbCardWarehouseOrders таблица + per-cluster aggregation + реальная З в UI (completed 2026-04-22)

### Phase Details (v1.2)

### Phase 14: Управление остатками
**Goal**: Менеджер открывает `/stock` и видит Product-level остатки (РФ = Иваново + Производство + МП), формулы О/З/Об/Д с цветовой кодировкой дефицита и глобальной нормой оборачиваемости; загружает Excel склада Иваново и вручную вводит Производство; жмёт «Обновить из WB» и получает per-warehouse остатки; открывает `/stock/wb` и видит 7 кластеров per nmId с expand до конкретных складов WB. Раздел `/stock/ozon` — заглушка ComingSoon.
**Depends on**: Phase 1 (БД + Auth), Phase 4 (Products + MarketplaceArticle → WbCard chain через nmId), Phase 7 (AppSetting KV + xlsx pattern + sticky-table pattern `PriceCalculatorTable` + `WbCard.avgSalesSpeed7d`). НЕ зависит от Phase 8-13 (Support).
**Requirements**: STOCK-01, STOCK-02, STOCK-03, STOCK-04, STOCK-05, STOCK-06, STOCK-07, STOCK-08, STOCK-09, STOCK-10, STOCK-11, STOCK-12, STOCK-13, STOCK-14, STOCK-15, STOCK-16, STOCK-17, STOCK-18, STOCK-19, STOCK-20, STOCK-21, STOCK-22, STOCK-23, STOCK-24, STOCK-25, STOCK-26, STOCK-27, STOCK-28, STOCK-29
**Success Criteria** (what must be TRUE):
  1. Менеджер открывает `/stock` и видит остатки Product-level в одной таблице: колонки РФ / Иваново / Производство / МП / WB / Ozon с формулами О/З/Об/Д; sticky первые 4 колонки (Фото + Сводка + Ярлык + Артикул) при горизонтальном скролле; разделение строк rowSpan — одна строка «Сводная» на Product + по строке на каждый MarketplaceArticle
  2. Менеджер загружает Excel склада Иваново через кнопку в шапке → видит preview diff (old→new quantity) + секции unmatched/duplicates/invalid → жмёт «Применить» → остатки обновлены в БД, `Product.ivanovoStockUpdatedAt` проставлен; `/stock` показывает новые значения
  3. Менеджер редактирует inline `Product.productionStock` в каждой строке Сводная (debounced save 500ms) и «Норму оборачиваемости» в шапке (AppSetting `stock.turnoverNormDays`, 1..100, default 37) — обе правки мгновенно пересчитывают Об/Д по всей таблице
  4. Менеджер жмёт «Обновить из WB» → через ~1-2 минуты видит актуальные per-warehouse остатки (новый endpoint Analytics API, clean-replace per wbCardId в транзакции, auto-insert неизвестных складов в `WbWarehouse` с `cluster="Прочие"` и флагом `needsClusterReview`)
  5. Менеджер открывает `/stock/wb` → видит таблицу nmId-level с 7 кластерными колонками (ЦФО/ЮГ/Урал/ПФО/СЗО/СФО/Прочие) каждая с О/З/Об/Д; разворачивает кластер → видит конкретные склады WB внутри; expand-state в URL `?expandedClusters=ЦФО,ПФО` (shareable links); tooltip full name кластера при hover
  6. Цветовая кодировка дефицита Д работает на всех уровнях агрегации: зелёный (Д≤0, остатка достаточно), жёлтый (0<Д<норма×0.3×З, пора думать о закупке), красный (Д≥норма×0.3×З, срочная закупка); null-значения отображаются как «—», не как «0»
  7. `/inventory` URL редиректит на `/stock` через nginx rewrite на 1 релиз (поддержка старых закладок); `/stock/ozon` — заглушка `<ComingSoon sectionName="Управление остатками Ozon" />`
**Plans**: 7 plans
Plans:
- [x] 14-01-PLAN.md — Schema + routing rename `/inventory` → `/stock` + Wave 0 smoke tests (WB endpoint curl + golden test stubs для stock-math / normalize-sku) — STOCK-01, STOCK-02, STOCK-03, STOCK-04, STOCK-05, STOCK-06, STOCK-26, STOCK-27
- [x] 14-02-PLAN.md — WbWarehouse seed script (Zero Wave: сбор списка через DevTools Network tab на seller.wildberries.ru + валидация cluster names с пользователем) — STOCK-09, STOCK-23
- [x] 14-03-PLAN.md — wb-sync extension: `fetchStocksPerWarehouse()` + WB API migration + transaction clean-replace в `/api/wb-sync` + auto-insert неизвестных складов — STOCK-07, STOCK-08, STOCK-10
- [x] 14-04-PLAN.md — Excel upload Иваново: `parseIvanovoExcel` (Zero Wave: real fixture от пользователя) + `POST /api/stock/ivanovo-upload` + preview Dialog + `upsertIvanovoStock` server action — STOCK-11, STOCK-12, STOCK-28
- [x] 14-05-PLAN.md — Production manual input + turnover norm + refresh button: inline input `productionStock` (debounced) + `TurnoverNormInput` в шапке (pattern GlobalRatesBar) + кнопка «Обновить из WB» — STOCK-13, STOCK-14, STOCK-15
- [x] 14-06-PLAN.md — RSC page `/stock` (Product-level flat): data assembly + JS-агрегация + sticky 4 columns + 6 колоночных групп (РФ/Иваново/Производство/МП/WB/Ozon) + цветовая кодировка Д + фильтры MultiSelect + toggle «только с дефицитом» — STOCK-16, STOCK-17, STOCK-18, STOCK-19, STOCK-20
- [x] 14-07-PLAN.md — RSC page `/stock/wb` (nmId-level с кластерами): `StockTabs` + 7 кластерных колонок + expand до per-warehouse columns (state в URL searchParams) + ClusterTooltip + `/stock/ozon` ComingSoon + deploy + UAT — STOCK-21, STOCK-22, STOCK-24, STOCK-25, STOCK-29

**Параллелизация:** 14-01 блокирует всё. После 14-01 пары (14-02, 14-03) и (14-04, 14-05) можно параллелить. 14-06 ждёт 14-01, 14-03, 14-04, 14-05. 14-07 финальный (UX polish + deploy).

**Zero Wave внутри фазы:** Plan 14-01 включает smoke test нового WB endpoint (curl с текущим `WB_API_TOKEN` → проверить scope Аналитика + Personal/Service token type); Plan 14-02 включает валидацию cluster names с пользователем до seed; Plan 14-04 требует real Excel sample от пользователя для golden fixture. Паттерн зеркалит Phase 7 Wave 0 (vitest + WB API smoke + canonical Excel).

**UI hint**: yes

### Phase 15: Per-warehouse и per-cluster скорость заказов для /stock/wb
**Goal**: Менеджер открывает `/stock/wb` и видит **реальную скорость заказов per-кластер и per-склад** (за 7 дней), а не единое среднее по nmId. Каждый кластер (ЦФО/ЮГ/Урал/ПФО/СЗО/СФО/Прочие) и каждый склад при expand показывает свою колонку **З** (заказы/день) — сумма за 7 дней / 7 от заказов, привязанных к конкретному warehouseName из WB Orders API. Это даёт корректные метрики Об (оборачиваемость) и Д (дефицит) per-кластер, а не глобальные.
**Depends on**: Phase 14 (WbCardWarehouseStock, lib/wb-api.ts, lib/wb-clusters.ts, StockWbTable, scripts/wb-sync-stocks.js — вся инфраструктура per-warehouse уже существует)
**Requirements**: ORDERS-01, ORDERS-02, ORDERS-03 (будут созданы в plan-phase)
**Success Criteria** (what must be TRUE):
  1. При нажатии «Обновить из WB» на `/stock` параллельно с stocks загружаются orders за последние 7 дней через `GET statistics-api/api/v1/supplier/orders?dateFrom=<7d ago>` и сохраняются per-warehouse в новой таблице `WbCardWarehouseOrders (wbCardId, warehouseId, ordersCount, periodDays=7, updatedAt)` с уникальным индексом `(wbCardId, warehouseId)` и `onDelete: Cascade`.
  2. На `/stock/wb` в колонке **З** каждого кластера (collapsed state) показывается сумма `ordersCount` по всем складам кластера, делённая на `periodDays` (заказы/день per-cluster). При expand → per-warehouse колонка показывает свою скорость: `ordersCount / periodDays`.
  3. Оборачиваемость (Об) и дефицит (Д) per-кластер пересчитываются от **кластерной скорости заказов**, а не от `card.avgSalesSpeed7d`. Формула остаётся через `calculateStockMetrics` из `lib/stock-math.ts` — меняется только входное значение ordersPerDay.
  4. `WbCard.avgSalesSpeed7d` остаётся для fallback (если per-warehouse данных нет — например для nmId без заказов за 7 дней) и для Сводной колонки МП/З на уровне nmId.
  5. Auto-insert неизвестных складов продолжает работать (как в Phase 14) — если в orders появился склад, которого нет в WbWarehouse, он создаётся с `needsClusterReview: true`.
  6. `scripts/wb-sync-stocks.js` дополняется секцией orders — чтобы оркестратор мог одним скриптом наполнять и остатки, и заказы без UI.
**Plans**: TBD (run /gsd:plan-phase 15)

**UI hint**: yes (изменение визуализации /stock/wb — пересчёт З/Об/Д per-кластер)

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 13 → 14 → 15 → 16

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Auth | 4/4 | Complete   | 2026-04-05 |
| 2. User Management | 1/2 | In Progress|  |
| 3. Reference Data | 2/3 | In Progress|  |
| 4. Products Module | 4/4 | Complete   | 2026-04-06 |
| 5. UI & Module Stubs | 2/2 | Complete   | 2026-04-06 |
| 6. Deployment | 2/2 | Complete   | 2026-04-06 |
| 7. Управление ценами WB | 0/12 | Planned | |
| 8. MVP — Отзывы + Вопросы | 0/TBD | Planned | |
| 9. Возвраты | 0/TBD | Planned | |
| 10. Чат + Автоответы | 4/4 | Complete   | 2026-04-18 |
| 11. Шаблоны + Обжалование (reformulated — local-only + hybrid manual) | 3/4 | In Progress|  |
| 12. Профиль покупателя + Мессенджеры (reformulated — hybrid Customer linking) | 2/3 | In Progress|  |
| 13. Статистика | 2/3 | In Progress|  |
| 14. Управление остатками | 7/7 | Complete    | 2026-04-22 |
| 15. Per-cluster скорость заказов /stock/wb | 3/3 | Complete    | 2026-04-22 |
| 16. Размерная разбивка остатков WB | 4/7 | In Progress|  |



### Phase 16: Размерная разбивка остатков WB в /stock/wb + фикс sync bug

**Goal:** Менеджер видит остатки WB не только per (nmId, склад/кластер), но и в разрезе **techSize** — кнопкой «По размерам» под каждой карточкой раскрываются строки per размер с той же структурой колонок (О/З/Об/Д per cluster + per warehouse при expanded). Параллельно устраняется sync-bug — два разных бага в `scripts/wb-sync-stocks.js` (accumulation) и `app/api/wb-sync/route.ts` (overwrite на разных techSize) приводят к тому что sum(WbCardWarehouseStock.quantity) != WbCard.stockQty.

**Requirements**: STOCK-30, STOCK-31, STOCK-32, STOCK-33, STOCK-34, STOCK-35, STOCK-36, STOCK-37

**Depends on:** Phase 14 (WbCardWarehouseStock, lib/wb-api.ts), Phase 15 (per-cluster orders), Phase 15.1 (in-way + Всего на WB), quick 260422-oy5 (per-user складские настройки) — всё расширяется.

**Success Criteria** (what must be TRUE):
  1. `WbCardWarehouseStock` имеет per-size rows с unique `(wbCardId, warehouseId, techSize)`; `User.stockWbShowSizes Boolean` хранит per-user toggle
  2. После re-sync `node scripts/wb-stocks-diagnose.js` показывает `diff=0` для контрольных nmId 859398279, 901585883 — sum quantity per (wbCardId, warehouseId) совпадает с WB API snapshot
  3. На `/stock/wb` кнопка «По размерам» в верхней панели toggle'ит размерные строки под каждой nmId-строкой с полной структурой колонок (О per cluster + per warehouse при expanded). Состояние persist per-user в БД
  4. Размерные строки показывают `↳ {techSize}` в Артикул-колонке, `bg-muted/30` фон; для one-size товаров (techSize="0") размерных строк НЕТ; sticky cells Фото/Сводка не пересекаются при expand-all+showSizes ON
  5. Per-cluster агрегаты НЕ зависят от hideSc/hidden warehouses (locked: visual filter only); колонка З размерных строк = «—» (per-size orders не хранятся в БД, deferred до v2)

**Plans**: 7 plans (включая Wave 0 diagnostic)

Plans:
- [x] 16-W0-PLAN.md — Wave 0: Diagnostic baseline `scripts/wb-stocks-diagnose.js` для контрольных nmId — STOCK-30
- [x] 16-01-PLAN.md — Wave 1: Schema migration `WbCardWarehouseStock.techSize` + compound unique + `User.stockWbShowSizes` + manual SQL — STOCK-31
- [x] 16-02-PLAN.md — Wave 2: Sync-bug fix — `WarehouseStockItem` расширение + per-size upsert REPLACE + 2-step clean-replace в обоих файлах (`scripts/wb-sync-stocks.js`, `app/api/wb-sync/route.ts`) — STOCK-32, STOCK-33
- [x] 16-03-PLAN.md — Wave 2: Data helper `WbStockSizeRow` + `buildSizeBreakdown` + `sortSizes` (parallel with 16-02) — STOCK-34
- [ ] 16-04-PLAN.md — Wave 3: Server action `saveStockWbShowSizes` + RSC page чтение `stockWbShowSizes` + prop drilling — STOCK-35
- [ ] 16-05-PLAN.md — Wave 3: UI кнопка «По размерам» + рендер размерных строк (parallel with 16-04) — STOCK-36
- [ ] 16-06-PLAN.md — Wave 4: Deploy + Re-sync + 9-point Manual UAT + diagnostic verification (diff=0) — STOCK-37

**Параллелизация:** 16-W0 → 16-01 → (16-02 || 16-03) → (16-04 || 16-05) → 16-06.

**Wave 0:** `scripts/wb-stocks-diagnose.js` — golden baseline ДО фикса (diff!=0 ожидается), повторный прогон в Plan 16-06 верифицирует diff=0 после re-sync.

**UI hint**: yes (изменение визуализации /stock/wb — кнопка «По размерам» + размерные строки под каждым nmId)
