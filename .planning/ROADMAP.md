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
| 16. Размерная разбивка остатков WB | 7/7 | Complete   | 2026-04-28 |
| 21. Кредиты (Lender rename из Bank, источник Кредиты/) | 8/8 | Complete    | 2026-06-09 |



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
- [x] 16-04-PLAN.md — Wave 3: Server action `saveStockWbShowSizes` + RSC page чтение `stockWbShowSizes` + prop drilling — STOCK-35
- [x] 16-05-PLAN.md — Wave 3: UI кнопка «По размерам» + рендер размерных строк (parallel with 16-04) — STOCK-36
- [x] 16-06-PLAN.md — Wave 4: Deploy + Re-sync + 9-point Manual UAT + diagnostic verification (diff=0) — STOCK-37

**Параллелизация:** 16-W0 → 16-01 → (16-02 || 16-03) → (16-04 || 16-05) → 16-06.

**Wave 0:** `scripts/wb-stocks-diagnose.js` — golden baseline ДО фикса (diff!=0 ожидается), повторный прогон в Plan 16-06 верифицирует diff=0 после re-sync.

**UI hint**: yes (изменение визуализации /stock/wb — кнопка «По размерам» + размерные строки под каждым nmId)


## Backlog

### Phase 999.1: WB Cooldown Bus — глобальный координатор cron + sync кнопок при 429 IP-блокировке ✅ DONE

**Status:** ✅ DONE 2026-05-12 (реализован inline через /gsd:fast в день добавления — сразу после серии rate-limit инцидентов).

**Реализация:** `lib/wb-cooldown.ts` — `getWbCooldownUntil()` / `setWbCooldownUntil(retryAfterSec)` / `getWbCooldownSecondsRemaining()` с хранением в `AppSetting('wbCooldownUntil')`. Интегрирован в:
- `lib/wb-api.ts::wbFetch` — pre-check throws `WbRateLimitError` если cooldown активен; on-429 пишет `cooldown = max(существующий, now+retryAfterSec)`
- `lib/wb-support-api.ts::callApi` — тот же паттерн для FEEDBACKS_API (WB_API_TOKEN scope); WB_RETURNS_TOKEN / WB_CHAT_TOKEN scope-ы не затронуты (отдельный budget)

**Эффект:** Когда любой endpoint WB_API_TOKEN scope ловит 429 с retry>60s — все остальные пути того же scope (cron + UI кнопки) короткозамыкаются БЕЗ обращения к WB. Убирает класс эскалаций «Statistics в lock → Tariffs/Prices долбят и продлевают штраф для IP».

**Тесты:** `tests/wb-cooldown.test.ts` — 13 тестов get/set/cleanup + max-логика. Расширены `wb-fetch-rate-limit.test.ts` и `wb-support-api.test.ts`.

**Plans:** 5 plans (выполнено inline без формального плана).

### Phase 19: Управление рекламой WB

**Goal:** Собственная БД рекламных расходов WB с разбивкой по типу кампании / nmId / связке (imt) + view-only аналитический раздел `/ads/wb`, который заменяет ручную аналитику в Google Sheets ([выгрузка зойтен](https://docs.google.com/spreadsheets/d/1LDbAZCls2wwE_xNnNmadR2LMuP24BCikxHeLa9m2dUM/) + [автомат зойтен](https://docs.google.com/spreadsheets/d/1H2AKRYDS6FUr7DKCVpraoG-VZPd4HGAKYoHr8fY0md8/)).

**Requirements:**
- Новые Prisma-модели: `WbAdvertCampaign` (advertId PK, type, status, cpm, dailyBudget, changeTime, raw JSON), `WbAdvertTarget` (M:N campaign↔nmId), `WbAdvertStatDaily` (per advertId/date/nmId/appType — views, clicks, ctr, cpc, sum, atbs, orders, cr, shks, sumPrice), `WbAdvertBalanceSnapshot` (баланс счёта).
- Отдельный `WB_ADS_TOKEN` в существующей таблице `WbApiToken` (scope ≥ Реклама). Bootstrap из `/etc/zoiten.pro.env`, редактируется через `/admin/settings` (как WB_RETURNS_TOKEN / WB_CHAT_TOKEN из quick 260512-jxh).
- Daily cron `/api/cron/wb-adv-sync` в ~3:00 МСК (через существующий dispatcher): GET `/adv/v1/promotion/count` → upsert campaigns → GET targets для новых advertId → POST `/adv/v2/fullstats` rolling 7 дней (батчами по 100, sleep 1с между батчами) → upsert WbAdvertStatDaily; в конце GET `/adv/v1/balance` → upsert snapshot.
- Manual backfill `/api/wb-adv-backfill?days=N` (1..30, `x-cron-secret` auth, idempotent UPSERT).
- UI `/ads/wb`: таблица per Product (rowSpan по строкам кампаний) с колонками — тип РК, advertId/name, потрачено 7д, заказов РК 7д, оборот РК 7д, ДРР 7д, CPC, CTR, CR. Каскадные фильтры направление/бренд/категория/подкатегория + multi-select по типу кампании + статус (active/paused/all) + период (7/14/28д). Expandable Сводка с per-nmId chart (28 дней): bar = расходы ₽/день, line = orders + ДРР %/день. Реиспользуем паттерн из /prices/wb (PriceCalculatorTable + WbCardOrdersChart).
- Rate-limit защиты: `retryFetch` (429 backoff) + AppSetting cooldown lock (паттерн quick 260513-khv per-endpoint lock).
- Strict-typed WB Advert API клиент `lib/wb-adv-api.ts` (по образцу `lib/wb-support-api.ts`).
- НЕ интегрировать с `/prices/wb` калькулятором юнит-экономики — отдельный модуль. Глобальный ДРР в калькуляторе остаётся fallback'ом.
- НЕ импортировать исторические CSV из листа АПИ_РК — отложено в отдельный quick task (по запросу пользователя).

**Depends on:** Phase 7 (общая инфраструктура /prices), Phase 13 (паттерн analytics-tab), quick 260512-jxh (WbApiToken)
**Plans:** 9 plans (W0 smoke + 8 implementation waves)

Plans:
- [ ] 19-W0-PLAN.md — Curl smoke check WB Advert API + JWT scope decode (Wave 1, checkpoint)
- [ ] 19-01-PLAN.md — Prisma schema: 4 модели (Campaign, Target, StatDaily, BalanceSnapshot) + ENUM ADS + manual migration (Wave 2)
- [ ] 19-02-PLAN.md — WB_ADS_TOKEN: расширить WB_TOKEN_NAMES + REQUIRED_SCOPE_BITS + UI карточка «WB Реклама» (Wave 2)
- [ ] 19-03-PLAN.md — lib/wb-adv-api.ts: type-safe client (4 функции) + cooldown bus bucket 'advert' + tests (Wave 3, TDD)
- [ ] 19-04-PLAN.md — Daily cron /api/cron/wb-adv-sync + manual backfill /api/wb-adv-backfill + dispatcher integration (Wave 4)
- [ ] 19-05-PLAN.md — RBAC ADS + /ads/wb RSC page + AdsTabs/AdsFilters/AdvertCampaignsTable + lib/wb-advert-aggregations (Wave 5)
- [ ] 19-06-PLAN.md — Expandable row + WbAdvertOrdersChart (ComposedChart bars+orders+drr per nmId) + fillAdvertTimeSeries helper (Wave 6)
- [ ] 19-07-PLAN.md — Глубокие unit-тесты: rate-limit/batch boundaries/date math MSK/aggregation edge cases (Wave 7, TDD)
- [ ] 19-08-PLAN.md — Landing/dashboard карточки + DEPLOY.md + UAT checklist (Wave 7, checkpoint deploy)

### Phase 20: Управление закупками — Поставщики, Закупки, План закупок

**Goal:** Закрыть цикл управления закупками: учёт поставщиков с контактами и переговорами, размещение и tracking закупок (планируемые/текущие/завершённые) с автоматическим расчётом депозитов/балансовых платежей по курсам ЦБ РФ и параметрам из БД Поставщики.

**Подразделы:**
1. **Поставщики** — новая БД `Supplier` со связкой к Product, контактами (менеджеры/боссы с основными), переговорами, и per-product параметрами (срок готовности, цена, эксклюзивность, платёжные условия, адрес инспекции/отгрузки)
2. **Закупки** — список закупок со статусами (планируемые / текущие / завершённые), мультивалютные суммы с курсами ЦБ РФ, автоматически рассчитанные депозиты/балансы по параметрам из БД Поставщики, multi-payment схемы (Депозит 1/2/..., Баланс 1/2/...)
3. **План закупок** — текущая заглушка превращается в работающий раздел (детали TBD в discuss-phase)

**Requirements:** D-01..D-21 (трассировка по decision IDs из `.planning/phases/20-procurement/20-CONTEXT.md`; формальных REQ-ID нет — решения D-01..D-21 + resolved/defaults blocks)

**Depends on:** Phase 4 (Products), Phase 2 (User Management — Employee и связка с Закупщиком)

**Plans:** 7/8 plans executed

Plans:
- [x] 20-00-PLAN.md — Wave 0: RED test stubs (procurement-math / cbr-rates / supplier-actions isPrimary)
- [x] 20-01-PLAN.md — Wave 1: Schema + manual migration (10 models + 6 enums + partial unique SupplierProductLink + CurrencyRate)
- [x] 20-02-PLAN.md — Wave 2: Section wiring (sections.ts /procurement + nav group + titles + section-labels + dashboard; rename temp plan)
- [x] 20-03-PLAN.md — Wave 2: lib/procurement-math.ts (deposit/balance dates + percent↔amount) — GREEN golden test
- [x] 20-04-PLAN.md — Wave 2: lib/cbr-rates.ts + /api/cbr-rate-sync + dispatcher branch (12:00 МСК, forward-only) — GREEN cbr test
- [x] 20-05-PLAN.md — Wave 3: Suppliers — actions/suppliers.ts + isPrimary helper + list + detail tabs (Контакты/Товары/Переговоры)
- [x] 20-06-PLAN.md — Wave 3: Purchases — actions/purchases.ts (auto deposit+balance) + list + detail multi-payment editor
- [ ] 20-07-PLAN.md — Wave 4: /procurement/plan MVP (read-only forecast) + DEPLOY.md + deploy + human UAT

**Контекст из original prompt пользователя 2026-05-20** (хранится в `.planning/phases/20-procurement/20-CONTEXT.md`)

### Phase 21: Кредиты — визуализация и учёт кредитов компании

**Goal:** Раздел `/credits` для учёта и визуализации кредитов компании: список кредитов → детальная карточка (сводные числа + график + line-chart остатка) → сводный горизонтальный график выплат с разбивкой день/неделя/месяц, группировкой по организации с подытогами и Итого. Новая БД Loan + LoanPayment + справочник **Lender («Кредитор»)** (⚠ переименован из «Bank» → «Lender» — кредиторы могут быть не только банками, напр. JetLend — краудлендинговая площадка), новый ERP_SECTION.CREDITS + RBAC. Разовый seed из **детальных файлов папки `Кредиты/`** (11 JetLend PDF через `pdftotext -layout` + 2 Сбербанк XLSX) — обнаружен в ходе планирования как основной источник строк графика; `Кредиты.xlsx` Лист2 используется для метаданных, истории Сбербанка и **контрольных сумм** (per-org Σ тело/проценты апр2024–дек2026 для сверки seed).

**Подразделы / возможности:**
1. **Новая БД Кредиты** (`Loan` + `LoanPayment` + `Lender`, отдельный модуль) — по каждому кредиту: организация (Пеликан / Зойтен / Сикрет Вэй / Дрим Лайн), **кредитор** (Сбербанк / JetLend / …), номер кредитного договора (№ КД), сумма, годовая ставка %, срок (мес), дата выдачи; график погашения — тело долга + проценты по датам/периодам.
2. **Список кредитов** — общий обзор всех кредитов с ключевыми числами и датами; клик по кредиту → детальная карточка.
3. **Детальная карточка кредита** — summary cards (сумма/погашено/проценты/остаток/переплата) + таблица графика + line-chart остатка.
4. **Сводный график выплат** (`/credits/schedule`) — горизонтальная sticky-таблица с настраиваемой разбивкой (день / неделя / месяц): крайний левый столбец (sticky) = кредиты + кредитор + инфо, далее вправо — выплаты в ячейках по периодам; 2 строки на кредит (тело + проценты); per-org подытоги + Итого.

**Источник данных (обновлено 2026-06-09):**
- `C:\Users\User\zoiten-pro\Кредиты\` (папка, **untracked**) — **основной источник строк** (U-01): 11 JetLend PDF (`schedule*.pdf`) + 2 Сбербанк XLSX (`График_платежей*.xlsx`).
- `C:\Users\User\zoiten-pro\Кредиты.xlsx` (untracked) — метаданные (сумма/ставка/срок/кредитор), история Сбербанка, кредиты JetLend без PDF, **контрольные суммы** Лист2.

**Requirements:** CRED-01..CRED-16 + Traceability D-01..D-19 + U-01..U-05 в `REQUIREMENTS.md # Phase 21 Requirements — Кредиты`

**Depends on:** Phase 2 (User Management — RBAC новый раздел CREDITS), справочник Company (организации Пеликан/Зойтен/Сикрет Вэй/Дрим Лайн уже существует)

**Plans:** 8/8 plans complete

Plans:
- [x] 21-01-PLAN.md — Schema + миграция (Loan/LoanPayment/Lender + ERP_SECTION.CREDITS)
- [x] 21-02-PLAN.md — Проводка: sections.ts + section-titles + nav-items + RBAC
- [x] 21-03-PLAN.md — lib/loan-math + vitest + server actions (credits + lender)
- [x] 21-04-PLAN.md — Seed из папки Кредиты/ (Сбер XLSX + JetLend PDF) + сверка с Лист2
- [x] 21-05-PLAN.md — Список кредитов + фильтры (орг/кредитор/статус) + LoanModal CRUD
- [x] 21-06-PLAN.md — Детальная карточка (summary cards + график + line-chart)
- [x] 21-07-PLAN.md — Сводный горизонтальный график (день/неделя/месяц, по орг)
- [x] 21-08-PLAN.md — Lender settings + deploy (poppler) + seed + UAT

### Phase 22: Банковские счета — БД банковских операций

**Goal:** Раздел `/bank` для учёта всех банковских операций группы компаний. Новая БД: `BankAccount`, `BankTransaction`, справочники `Bank` (по БИК) и `Counterparty` (дедуп по ИНН), расширение существующей `Company` реквизитами (ИНН/КПП/ОГРН). Импорт выписок из Excel с тремя адаптерами форматов (ВТБ multi-sheet/мультивалюта, ПСБ, СберБизнес) и защитой от дублирования операций при пересечении периодов выписок (idempotent re-import). Read-only таблица просмотра с фильтрами + базовая ручная разметка/категоризация операций под будущий ДДС. Новый `ERP_SECTION.BANK` + RBAC.

**Ключевые решения (discuss 2026-06-10):**
1. **Company** — расширяем существующую (не новая модель): добавляем ИНН/реквизиты, `BankAccount → Company`. Пересекается с компаниями Кредитов автоматически.
2. **Bank** — новый справочник по БИК (держатели счетов + банки контрагентов). `Lender` не трогаем, но добавляем nullable FK `Lender → Bank` для будущей связки.
3. **Counterparty** — отдельный справочник, дедуп по ИНН, операции ссылаются FK.
4. **Дедуп операций** — composite fingerprint (счёт + дата + сумма + дебет/кредит + № документа + назначение/контрагент hash); re-import пересекающихся выписок не плодит дубли.
5. **Scope** — БД + импорт + дедуп + read-only просмотр + базовая категоризация. БЕЗ связей с закупками/кредитами/ДДС (следующие этапы).
6. **Мультивалютность** — `BankTransaction` хранит currency + amount (ВТБ имеет CNY-счета).
7. **Provenance** — хранить источник (имя файла/банк/строка) для аудита и идемпотентности.

**Источник данных:** `C:\Users\User\zoiten-pro\Выписки\` (untracked) — 9 XLSX за 01.01.2026–10.06.2026: 2× ВТБ (multi-sheet), 2× ПСБ, 5× СберБизнес.

**Requirements**: BANK-01, BANK-02, BANK-03, BANK-04, BANK-05, BANK-06, BANK-07, BANK-08, BANK-09, BANK-10
**Depends on:** Phase 2 (RBAC новый раздел BANK), справочник Company (расширяется), Phase 21 (Lender — для связи Lender→Bank)
**Plans:** 6/5 plans complete

Plans:
- [x] 22-01-PLAN.md — Schema + миграция (Company реквизиты; Bank/BankAccount/Counterparty/BankTransaction/ImportBatch; enums TxDirection/TxCategory; Lender.bankId; ERP_SECTION.BANK)
- [x] 22-02-PLAN.md — Проводка раздела (6-точечный чеклист) + RBAC + заглушка /bank
- [x] 22-03-PLAN.md — lib/bank-import/ pure-парсеры (detectFormat + 3 адаптера + normalize + fingerprint) + vitest golden
- [x] 22-04-PLAN.md — Импорт: /api/bank-import (parse→upsert→createMany skipDuplicates→ImportBatch) + categorizeTx + BankImportButton
- [x] 22-05-PLAN.md — Read-only /bank (sticky-таблица + фильтры + поиск) + inline категоризация + scripts/import-bank-statements + импорт 9 файлов + UAT

### Phase 23: Наличные расчёты — касса группы компаний

**Goal:** Раздел `/cash` для учёта всех наличных расчётов группы компаний (касса с балансом). Перенос данных из `Офис Бюджет.xlsx` (листы «Юля» — операционная касса, «Павел» — закупки/образцы/фонды) за 2024-2026. Новая БД `CashEntry` (дата, направление приход/расход, сумма, подразделение, категория, назначение, ответственный→Employee, комментарий) + справочник категорий `CashCategory` (≈24, редактируемый). Авто-категоризация при импорте по ключевым словам. Read-only таблица с фильтрами + остаток кассы + **удобная форма ручного добавления** операций. Новый `ERP_SECTION.CASH` + RBAC (доступ Ивановой Юлии — MANAGE). Раздел ведёт сотрудник Иванова Юлия; ответственный по умолчанию — Иванова.

**Ключевые решения (discuss 2026-06-10):**
1. **Импорт 2024-2026** (но категории сформированы по всему массиву 2022-2026 для точности).
2. **Приход + расход** — касса с балансом (направление DEBIT/CREDIT).
3. **Ответственный → FK на Employee** + сохранение исходной фамилии (responsibleNameRaw); пусто → Иванова; нераспознанные фамилии (фрилансеры/разнорабочие) → FK null, имя сохраняется.
4. **Категории** — справочник (редактируемый), авто-разнесение по ключевым словам, fallback «Прочее».
5. **Подразделение** — нормализованное (офис / склад / маркетинг / …).
6. **Форма ручного ввода** — удобное добавление новых операций (дата, направление, сумма, подразделение, категория, назначение, ответственный, комментарий).

**Источник:** `C:\Users\User\zoiten-pro\Офис Бюджет.xlsx` (untracked, scp на VPS). Лист «Юля» ~4742 строк (даты Excel-серийники, Приход/Расход/Подразделение/Назначение/Ответственный), «Павел» 395 строк (Дата/Назначение/Сумма).

**Requirements**: CASH-01, CASH-02, CASH-03, CASH-04, CASH-05, CASH-06, CASH-07, CASH-08, CASH-09, CASH-10, CASH-11
**Depends on:** Phase 2 (RBAC раздел CASH), справочник Employee (ответственный), Phase 22 (паттерны импорта/таблицы/категоризации)
**Plans:** 5/5 plans complete

Plans:
- [x] 23-01-PLAN.md — Schema + raw SQL миграция (CashEntry/CashCategory/CashDirection + Employee relation + ERP_SECTION.CASH) + сид 24 категорий
- [x] 23-02-PLAN.md — Проводка раздела /cash (6 точек чеклиста + RBAC-тумблер) + стаб-страница
- [x] 23-03-PLAN.md — lib/cash-import/ (parse Юля+Павел + normalize + categorize keyword-map + responsible-match + fingerprint) + vitest golden + scripts/import-cash-budget.ts
- [x] 23-04-PLAN.md — Server actions cash.ts + удобная форма ручного ввода + read-only sticky-таблица с фильтрами и итогами/балансом
- [ ] 23-05-PLAN.md — Deploy миграции + импорт данных на VPS + provision RBAC Ивановой Юлии (CASH MANAGE) + UAT

### Phase 24: Финансовая отчётность: Баланс (управленческий учёт)

**Goal:** Первый из трёх управленческих отчётов (Баланс → ОДДС → ОПиУ). Баланс — аналог бухгалтерского баланса, формируется на 01.07.2026 и далее на каждую дату. Активы: денежные средства (банк + касса), дебиторка WB (выяснить доступность через API), товарные остатки (склады WB + товар в пути + Иваново), предоплаты поставщикам. Пассивы: кредиты, отложенные налоговые обязательства (расчётно: 7% НДС + 1% налог на доходы при УСН 15% Д-Р, с корректировкой по фактическим цифрам бухгалтерии). ОДДС и ОПиУ — последующие фазы.

**Requirements**: TBD
**Depends on:** Phase 20 (закупки/предоплаты поставщикам), Phase 21 (кредиты), Phase 22 (банковские счета), Phase 23 (касса), Phase 14 (остатки WB + Иваново + в пути)
**Plans:** 1/9 plans executed

Plans:
- [x] 24-01: Prisma-модели снапшотов + ERP_SECTION.FINANCE + маршруты /finance/{balance,cashflow,pnl}
- [ ] 24-02..24-09 (см. .planning/phases/24-finance-balance/)

### Phase 25: План продаж v2 — рабочий план H2-2026 (план/факт/ИУ, помесячные уровни, виртуальные закупки, версионирование, контракт ПДДС)

**Goal:** Превратить одноразовый симулятор `/sales-plan` («до 30.06») в рабочий план продаж с горизонтом **01.07–31.12.2026**: три ряда данных (наш план / наш факт / план по ИУ = 2 380 805 ₽/день, итог 438 068 120 ₽), помесячные плановые уровни с детализацией в день, приходы товара из Китая по партиям (из раздела Закупки), **виртуальные закупки** (система предлагает «что пора заказывать», учитываются только в плане), версионирование/фиксация плана, план/факт с отклонением за неделю/месяц/квартал/полугодие/весь горизонт. Закладывает контракт `lib/sales-plan/pdds-feed.ts` для следующей фазы — план движения денежных средств (ПДДС).

**Дизайн-документ (ресёч):** `.planning/phases/25-v2-h2-2026/25-RESEARCH.md` (11 разделов: модель данных, расчётный движок, виртуальные закупки, факт, фиксация, UI, стыковка ПДДС, план внедрения, риски, вопросы + Validation Architecture) + `CRITIC-VERDICT.md` (адверсариальная проверка против кода/прод-БД).

**Зафиксированные решения пользователя (2026-07-04):**
1. Метрика ИУ = **выкупы в ₽** (цены продавца до СПП), `iuMetric="buyouts"`. Эмпирика прод-БД: выкупы июня ≈ 104% константы.
2. Кабинет ИУ = кабинет с токеном `WB_API_TOKEN` (единственный источник funnel-факта); мульти-кабинет не нужен.
3. Колонка «Итог» = горизонт H2 (01.07–31.12.2026); календарно-годовой тотал за 2026 **не** показывать (январь–апрель нет в funnel). Механизм year-бакета оставить в движке для будущих лет (2027+).
4. Даты приходов: по умолчанию `createdAt + 45` (leadtime-eta); при заполненном `Purchase.plannedArrivalDate` — работать по нему. Массовое ручное заполнение дат перед запуском **не** требуется — заполняется постепенно, +45 приемлем как временный дефолт.
Остальные 14 вопросов §11 доки — по рекомендованным дефолтам (opt-out виртуальных закупок, единица «заказы шт/день», страховой запас 14 дн / покрытие 60 дн / lead time 45 дн / транзит 20 дн, реализуемый ряд «План», сравнение против активной версии, без авто-фиксации cron, без ramp-up в v1, деприкейт /purchase-plan в этапе 6, поднять write до SALES MANAGE).

**Requirements**: SP-01, SP-02, SP-03, SP-04, SP-05, SP-06, SP-07, SP-08, SP-09, SP-10, SP-11, SP-12, SP-13, SP-14 (см. `.planning/REQUIREMENTS.md # Phase 25 Requirements`). Секция остаётся `SALES`, новая ERP_SECTION не нужна.
**Depends on:** Phase 4 (Products/MarketplaceArticle→nmId), Phase 7 (AppSetting KV, pricing-math, sticky-таблицы), Phase 14 (остатки WB + Иваново), Phase 20 (Закупки — этапы с датами, SupplierProductLink, procurement-math), Phase 24 (снапшот-паттерн Finance, WbCardFunnelDaily как источник факта). Существующий `/sales-plan` (lib/sales-forecast.ts) — переделывается.

**План внедрения — 6 самостоятельно деплоябельных под-этапов (§9 доки), кандидаты в Plans:**
1. **Фундамент** — миграция (SalesPlanMonthLevel, SalesPlanDayOverride, VirtualPurchase, SalesPlanVersion/Day, `Purchase.plannedArrivalDate`) + pure-движок `lib/sales-plan/` + тесты (engine golden, arrivals, iu=438 068 120 ₽) + bootstrap-скрипт. Невидимый деплой.
2. **Таб «Товары»** — помесячные уровни (редактирование), модалка правки по дням с realtime-пересчётом стока, приходы, SALES MANAGE.
3. **Таб «Сводный»** — матрица план/факт/ИУ + KPI «отставание от ИУ» + график; бакеты день/неделя/месяц/квартал/полугодие + «Итог».
4. **Виртуальные закупки** — генератор предложений (точка перезаказа) + таб «Пора заказывать» + конвертация в реальную закупку (анти-двойной счёт).
5. **Версионирование** — фиксация плана, активная версия, read-only просмотр версий, «дрейф» черновика.
6. **ПДДС-feed + зачистка** — `lib/sales-plan/pdds-feed.ts` + удаление старого кода (SalesForecast*, IU_REMAINING_RUB, DEFAULT_END_DATE).

⚠ Этапы 3–5 деплоить **плотной серией**, первую версию зафиксировать в день деплоя этапа 5 (минимизация unconstrained-зоны прошлого — §6.1 доки).

**Plans:** 10/10 plans complete. ✅ **Развёрнуто + UAT approved 2026-07-05** (prod HEAD dc387ea). Follow-up фиксы факта: quick 260705-f1p (факт по ДАТЕ РЕАЛИЗАЦИИ, WbSalesDaily из WB Sales API — фикс «1,8М вместо 3,3М/день») + fast-260705 (факт = НЕТТО выкупы−возвраты = кабинетный «Фактический оборот»).

Plans:
- [x] 25-00-PLAN.md — Wave 0: 7 RED тест-стабов движка (engine/arrivals/iu/date-buckets/plan-fact/virtual/pdds-feed) + golden ИУ 438 068 120 ₽
- [x] 25-01-PLAN.md — Wave 1 (Этап 1): [BLOCKING] рукописная миграция 20260705_sales_plan_v2 (5 таблиц + enum + Purchase.plannedArrivalDate + back-relations + сид 9 AppSetting) + schema.prisma
- [x] 25-02-PLAN.md — Wave 1 (Этап 1): pure-ядро движка (date-buckets 6 бакетов + types/dates/iu/arrivals/engine) → 4 стаба GREEN
- [x] 25-03-PLAN.md — Wave 2 (Этап 1): data-loader (loadSalesPlanInputs/loadFactDaily, DI) + bootstrap-скрипт миграции старых overrides
- [x] 25-05-PLAN.md — Wave 3 (Этап 2): Товары actions (saveMonthLevels/scale/saveDayOverrides/params/model/getProductPlanDays, все SALES MANAGE) + плановая дата прихода в карточке закупки
- [x] 25-04-PLAN.md — Wave 4 (Этап 2): Товары UI (Tabs/Filters/ModelParamsBar/IncomingBadges/ProductPlanTable/Cell/Dialog + RSC page + section-titles) — realtime «Сток(расч)»
- [x] 25-06-PLAN.md — Wave 5 (Этап 3): Сводный (plan-fact движок → GREEN + PlanFactControls/SummaryCards/Chart/Matrix + переработка page; IU_REMAINING_RUB/DEFAULT_END_DATE удалены)
- [x] 25-07-PLAN.md — Wave 6 (Этап 4): Виртуальные закупки (suggestVirtualPurchases → GREEN + VP-actions + regenerate в обеих цепочках + таб «Пора заказывать» + бейджи ◇/⚠ + конвертация)
- [x] 25-08-PLAN.md — Wave 7 (Этап 5): Версионирование (fixSalesPlanVersion чанки 5000 + set/rename/delete + compareVersions + PlanVersionBar/FixDialog + read-only + UAT первой версии)
- [x] 25-09-PLAN.md — Wave 8 (Этап 6): ПДДС-feed (→ GREEN, live-сверка статусов + forward-fill курса) + зачистка (SalesForecast*/хардкоды/старые actions) + деприкейт /purchase-plan + deploy + end-to-end UAT

⚠ Этапы 3-5 (waves 5-7) деплоить плотной серией; первую версию фиксировать в день деплоя wave 7 (§6.1 доки — минимизация unconstrained-зоны прошлого).

### Phase 26: План продаж — рабочая правка уровней (автопротяжка вперёд, предупреждения о срезе, динамический roll-forward отгрузок)

**Goal:** Довести раздел `/sales-plan` до соответствия ручной рабочей модели пользователя (по итогам UAT Phase 25). Пользователь ставит месячный уровень (заказов/шт в день) и он «протягивается» вперёд; система сразу отражает реальность стока и приходов, а виртуальные отгрузки живут во времени. Три под-этапа:

**Зафиксированные решения пользователя (2026-07-05):**
1. **Автопротяжка вперёд.** Ввод уровня в месяц предлагает распространить его на все **последующие** месяцы — через галку «распространить дальше» (по умолчанию **вкл**). Отжал → пишется только выбранный месяц.
2. **Не трогать ручные.** Протяжка записывает уровень только в месяцы **без собственного явного** `SalesPlanMonthLevel` (авто-месяцы). Месяцы, где уровень задан руками, протяжка **не перезаписывает**.
3. **Механизм избавления от ручных.** Поштучный сброс ручного уровня → авто уже есть (крестик ✕ в ячейке [ProductPlanCell](../../components/sales-plan/ProductPlanCell.tsx)) — сделать заметнее; **добавить массовый** «Сбросить ручные → авто» (по товару / по месяцу / выбранным ячейкам).
4. **Предупреждение о срезе.** Когда целевой уровень невыполним из-за стока/поздних приходов, план уже срезается движком (`orders = min(ставка, сток)`), но причина видна только в модалке «Дни». Добавить **явную плашку в матрице**: «срезано −X% · ближайший приход dd.mm»; если месяц полностью нулевой из-за отсутствия товара — «нет товара, ближайший приход dd.mm / товар придёт в <месяц>». Данные уже в движке (`firstStockoutDate`, `lostRubToStockout`, флаг `isLate` у закупки).
5. **Динамика отгрузок.** «Отгрузку не сделали реальной» = виртуальную закупку не сконвертировали в реальную `Purchase`. Если день заказа прошёл — виртуальная отгрузка **сдвигается вперёд** (заказ→today, приход→today+lead), и план проседает соответственно. Инвариант «не прошлым числом» уже есть для авто-**SUGGESTED**; **распространить на ACCEPTED** (сейчас ACCEPTED стоит на исходной дате прихода и не двигается) + **ежедневный крон-пересчёт** регенерации (без него SUGGESTED «застывают» до ручной правки).

**Кандидаты в Plans (3 деплоябельных под-этапа):**
1. **Автопротяжка + сброс ручных.** `saveMonthLevels(distributeForward)`: запись уровня во все месяцы ≥ выбранного без собственного явного уровня. UI: галка «распространить на последующие месяцы» + заметный ✕-сброс + действие «Сбросить ручные → авто» (товар/месяц/выбранные). Тесты на «не перезаписывать ручные».
2. **Предупреждение о срезе плана.** Проброс `firstStockoutDate`/`lostRubToStockout`/`isLate` в матрицу «Товары» + бейдж/плашка с причиной и датой ближайшего прихода; нулевой месяц → явное объяснение. UI-only (данные из движка).
3. **Динамический roll-forward + крон.** (a) сдвиг просроченных ACCEPTED (orderDate<today → today, arrival→today+lead) в suggester/regenerate; (b) новый крон (dispatcher, ~04:40 МСК) регенерации авто-SUGGESTED + сдвиг ACCEPTED, чтобы план сам отражал реальность без ручного клика. Тест инварианта «не прошлым числом» для ACCEPTED.

**Requirements**: SP-15, SP-16, SP-17 (см. `.planning/REQUIREMENTS.md # Phase 26 Requirements`).
**Depends on:** Phase 25 (модель SalesPlan*, движок lib/sales-plan/, /sales-plan UI, cron dispatcher).
**Секция:** остаётся `SALES` (write — `SALES MANAGE`). Новая ERP_SECTION не нужна.

**Plans:** 3/3 complete. ✅ **Исполнено + верифицировано 2026-07-05** — 11/11 must-haves в коде (gsd-verifier), tsc=0, build OK, 69/69 sales-plan тестов зелёные, регрессий нет (движок не тронут, golden iu=438 068 120 цел). Коммиты `e44c2c2..348bee9`. Без Prisma-миграции. ✅ Развёрнуто + UAT пройден в живой работе 2026-07-05 (закрыто пользователем).

Plans:
- [x] 26-01-PLAN.md — SP-15: автопротяжка уровня вперёд (saveMonthLevels(distributeForward) + distributeMonthLevelForward, пишет только в авто-месяцы) + сброс ручных→авто (resetMonthLevelsToAuto по товару/месяцу/выбранным, заметный ✕ в ячейке) + галка тулбара. Тест «протяжка не перезаписывает ручные».
- [x] 26-02-PLAN.md — SP-16: предупреждение о срезе плана (проброс firstStockoutDate/lostRubToStockout/lostUnitsToStockout + «ближайший приход» из arrivals → бейдж «срезано · приход dd.mm» / плашка «нет товара» в ячейке месяца). UI-only, движок не менять.
- [x] 26-03-PLAN.md — SP-17: динамический roll-forward (rollForwardAcceptedArrivals — сдвиг просроченных авто-ACCEPTED в regenerateVirtualPurchasesInternal; manual не трогать) + ежедневный крон sales-plan-rollforward + wiring dispatcher (vpRollforwardCronTime ~04:40 / vpRollforwardLastRun, x-cron-secret). Тест инварианта «не прошлым числом» для ACCEPTED.

### Phase 27: План продаж — ABC-статус + флаг «заказываем» (гейт виртуальных закупок и планирования продаж)

**Goal:** В `/sales-plan «Товары»` выводить ABC-статус товара (A/B/C) с инлайн-сменой (меняется **глобально** — `Product.abcStatus`) и флаг **«заказываем / не заказываем»**. Статус C = вывод из ассортимента (принудительно «не заказываем»); A/B — тумблер по выбору. Флаг гейтит движок плана: для «не заказываем»/C товаров **виртуальные закупки не считаются**, а **план продаж будущих периодов** сводится к распродаже текущего остатка (потом 0) — без пополнений.

**Зафиксированные решения пользователя (2026-07-05):**
1. **Область — только `/sales-plan «Товары»`** (ABC-бейдж с инлайн-сменой A/B/C + тумблер «заказываем/не заказываем» в строке товара). В остальные товарные таблицы не выносим.
2. **ABC меняется глобально** — инлайн-смена пишет `Product.abcStatus` (enum A/B/C уже существует), видно везде, где показывается статус.
3. **Флаг «заказываем» — новое глобальное поле** `Product.orderEnabled Boolean @default(true)`. Эффективное значение = `abcStatus !== 'C' && orderEnabled`. При C тумблер выключен и заблокирован.
4. **Остаток при C / «не заказываем» — «распродаём остаток, потом 0»**: движок продаж НЕ переписываем (он уже делает `orders=min(ставка,сток)`); достаточно исключить товар из генерации виртуальных закупок (suggester skip) -> сток истощается без пополнений -> продажи сходят к 0. Полного обнуления будущих продаж НЕ делаем.

**Requirements**: SP-18, SP-19 (см. `.planning/REQUIREMENTS.md # Phase 27 Requirements`). SP-18 = ABC инлайн-смена (глобально); SP-19 = флаг «заказываем» + гейт виртуальных закупок/плана.
**Depends on:** Phase 25 (движок lib/sales-plan/, suggester, /sales-plan Товары), Phase 26 (regenerateVirtualPurchasesInternal). Модель: `Product.abcStatus` (есть), `Product.orderEnabled` (новое поле — рукописная миграция + `prisma migrate deploy`).
**Секция:** `SALES` (write — `SALES MANAGE`; инлайн-правки ABC/флага из sales-plan мутируют глобальные поля Product — принято, т.к. пользователь хочет менять «прямо в таблицах, глобально»).

**Plans:** 2/2 complete. ✅ **Исполнено + верифицировано 2026-07-05** — 11/11 must-haves в коде (gsd-verifier), tsc=0, 48/48 целевых тестов зелёные (order-gate 11 + golden iu=438 068 120 + engine + virtual), регрессий нет, движок продаж не тронут (D-4). Коммиты `6a12056..87bdd28`. **Есть миграция** `Product.orderEnabled` (prisma migrate deploy). ✅ Развёрнуто + UAT пройден в живой работе 2026-07-05 (гейт подтверждён на УКТ-000001 abc=C → 0 виртуальных закупок; закрыто пользователем).

Plans:
- [x] 27-01-PLAN.md — SP-19 фундамент: [BLOCKING] рукописная миграция `Product.orderEnabled` + `prisma generate`; загрузка `abcStatus`/`orderEnabled` в `loadSalesPlanInputs` -> `ProductPlanInput`; гейт `effectiveOrderEnabled=(abcStatus!=='C')&&orderEnabled` в `suggestVirtualPurchases` (skip) + проброс в `regenerateVirtualPurchasesInternal`; server actions `updateProductAbcStatus`/`updateProductOrderEnabled` (SALES MANAGE + регенерация VP + revalidate); vitest-тесты гейта (C/не-заказываем -> 0; A/B заказываем -> без изменений; C форсит off).
- [x] 27-02-PLAN.md — SP-18 UI: сериализация `abcStatus`/`orderEnabled`/`effectiveOrderEnabled` в `tableProducts` (page.tsx); ABC-бейдж с инлайн-сменой A/B/C/«—» (native select, глобально) + тумблер «заказываем/не заказываем» (для C — off+disabled+tooltip) в `ProductPlanTable`; optimistic useTransition + router.refresh.

### Phase 28: ПДДС — план движения денежных средств (/finance/cashflow)

**Goal:** Прогноз денежных потоков компании на горизонте плана продаж (H2-2026): когда и сколько денег придёт и уйдёт, где кассовые разрывы. Второй из трёх финансовых отчётов (Баланс ✅ → **ОДДС/ПДДС** → ОПиУ). Потребляет готовый контракт `lib/sales-plan/pdds-feed.ts` (Phase 25): `getPlannedRevenueSeries(versionId)` — плановые выкупы по дням; `getPlannedVirtualPayments(versionId)` — DEPOSIT/BALANCE платежи виртуальных закупок с live-сверкой статусов и forward-fill курса CNY/USD→₽.

**Кандидаты-источники потоков (уточняется ресёчем + решениями пользователя):**
- Притоки: выплаты WB по плановой выручке (недельный цикл выплат WB, за вычетом комиссии/логистики/ДРР — методику определить), прочие поступления.
- Оттоки: платежи по реальным закупкам (PurchasePayment DEPOSIT/BALANCE, курсы ЦБ), платежи по виртуальным закупкам (pdds-feed), график кредитов (Loan/LoanPayment — тело+проценты), операционные расходы (касса/зарплаты — по среднему?), налоги (7% НДС + 1%).
- Начальная позиция: остатки банк (BankAccount) + касса (CashEntry) на дату старта.
- Выход: дневной/недельный/месячный ряд остатка денег, подсветка кассовых разрывов, сценарии.

**Depends on:** Phase 25 (pdds-feed, SalesPlanVersion), Phase 20 (Закупки/платежи), Phase 21 (Кредиты), Phase 22 (Банк), Phase 23 (Касса), Phase 24 (Баланс — паттерны finance).
**Секция:** `FINANCE` (существующая, /finance/*).

**Plans:** 3 plans (3 волны, деплоябельные под-этапы). Следующий шаг: `/gsd-execute-phase 28`.
- [ ] 28-01-PLAN.md — Движок + DI-загрузчик + golden-тесты + AppSetting-сид (невидимый деплой)
- [ ] 28-02-PLAN.md — RSC-страница + матрица + KPI + график (замена ComingSoon-заглушки)
- [ ] 28-03-PLAN.md — AssumptionsBar (MANAGE) + server actions (zod) + методология
