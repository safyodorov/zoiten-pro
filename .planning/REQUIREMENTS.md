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
- [x] **PRICES-02**: Таблица группирует ценовые строки по Product через rowSpan — колонки Фото + Сводка объединены на все строки всех карточек товара, колонки Ярлык + Артикул объединены на все ценовые строки одной WbCard. Жирный разделитель между Product, тонкий между WbCard внутри Product.
- [x] **PRICES-03**: 4 sticky колонки слева при горизонтальном скролле (Фото 80px + Сводка 240px + Ярлык 80px + Артикул 120px) остаются видимыми, используя `position: sticky; left: {accumulated}` с z-index слоями.
- [x] **PRICES-04**: Ценовые строки внутри каждой WbCard отображаются в строгом порядке: «Текущая цена» (первая, с Badge «Текущая») → Regular акции DESC by planPrice → Auto акции DESC by planPrice (только с данными из Excel) → Расчётные цены 1/2/3 по слотам. Индикаторные полосы: regular=blue, auto=purple, calculated=amber.
- [x] **PRICES-05**: 30 колонок расчёта юнит-экономики считаются серверно через pure function `calculatePricing(inputs): outputs` в `lib/pricing-math.ts`. Golden test case: nmId 800750522 → profit ≈ 567.68 ₽, returnOnSales ≈ 7%, roi ≈ 26%.
- [x] **PRICES-06**: 6 глобальных ставок (wbWalletPct, wbAcquiringPct, wbJemPct, wbCreditPct, wbOverheadPct, wbTaxPct) редактируются inline в `GlobalRatesBar` в шапке раздела. Сохраняются в таблицу `AppSetting` через debounced (500ms) server action с Zod валидацией (0-100, десятые). Seed дефолтов: 2.0/2.7/1.0/7.0/6.0/8.0.
- [x] **PRICES-07**: Клик по любой ценовой строке открывает `PricingCalculatorDialog` с 2-колоночным layout (inputs слева, realtime outputs справа). Realtime пересчёт через `useWatch` + `useMemo`, latency < 100ms.
- [x] **PRICES-08**: Сохранение расчёта в таблицу `CalculatedPrice` через upsert по `@@unique([wbCardId, slot])`. Пользователь выбирает слот 1/2/3 и опциональное имя. `snapshot: Json` фиксирует полный набор параметров на момент сохранения.
- [x] **PRICES-09**: Чекбокс «только этот товар» в модалке у полей ДРР/Брак управляет scope сохранения: true → Product override, false → Subcategory/Category default (с предупреждающим toast). Fallback chain: `Product.override → Subcategory/Category.default → hardcoded (10%/2%/30₽)`.
- [x] **PRICES-10**: Синхронизация акций через кнопку «Синхронизировать акции» → `POST /api/wb-promotions-sync` → WB Promotions Calendar API с окном [today, today+60 days]. Rate limit compliant: 600ms между запросами, 429 retry через sleep(6000). Cleanup акций с `endDateTime < today - 7 days`.
- [x] **PRICES-11**: Загрузка Excel отчёта из кабинета WB для auto-акций через `POST /api/wb-promotions-upload-excel` (multipart file + promotionId). Парсинг 6 колонок по индексам A=0/F=5/L=11/M=12/T=19/U=20, upsert в `WbPromotionNomenclature` по `@@unique([promotionId, nmId])`.
- [x] **PRICES-12**: Новое поле `WbCard.avgSalesSpeed7d: Float?` заполняется при `/api/wb-sync` из WB Statistics Sales API (sales за 7 дней / 7). Отображается в колонке Сводка как «Скорость 7д: {N} шт/день», суммируется по всем WbCard одного Product.
- [x] **PRICES-13**: Подраздел `/prices/ozon` — заглушка `<ComingSoon sectionName="Управление ценами Ozon" />` по аналогии с `/cards/ozon`.
- [x] **PRICES-14**: RBAC: все страницы раздела требуют `requireSection("PRICES")`, все write actions (updateAppSetting, saveCalculatedPrice, updateProductOverride, синхронизация акций, загрузка Excel) требуют `requireSection("PRICES", "MANAGE")`.
- [x] **PRICES-15**: Tooltip на названии акции через shadcn `tooltip` (добавляется в Phase 7 через `npx shadcn add tooltip`), контент — `WbPromotion.description` + маркированный список `advantages[]`, max-width 384px.
- [x] **PRICES-16**: Подсветка значений Прибыль/Re продаж/ROI: `text-green-600 font-medium` при значении ≥0, `text-red-600 font-medium` при <0. Дополнительно префикс «+/−» для Re и ROI (дальтонизм safety).

## v1.1 Requirements — Служба поддержки WB

Requirements добавленные в milestone v1.1 (2026-04-17). PRD: `C:\Users\User\Downloads\PRD Служба поддержки WB — Zoiten ERP.md`.

### Инфраструктура и модели данных

- [ ] **SUP-01**: Prisma миграция — модели `SupportTicket`, `SupportMessage`, `SupportMedia`, `Customer`, `ReturnDecision`, `ResponseTemplate`, `AutoReplyConfig`, `ManagerSupportStats` + enums (`TicketChannel`, `TicketStatus`, `AppealStatus`, `Direction`, `MediaType`, `ReturnDecisionType`, `TemplateChannel`). Обратные relations на `User` и `WbCard` через nmId.
- [ ] **SUP-02**: Модуль `lib/wb-support-api.ts` покрывает Feedbacks (list/reply/report) и Questions (list/reply/report) с vitest-тестами (mock HTTP). Заготовлен интерфейс для Chat/Returns/Templates API. Чат-эндпоинты используют curl-fallback реактивно (только при 403).
- [ ] **SUP-03**: RBAC — все страницы `/support/*` требуют `requireSection("SUPPORT")`, все write server actions и API routes — `requireSection("SUPPORT", "MANAGE")`.
- [ ] **SUP-04**: Хранение медиа на VPS — путь `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/{filename}`, обслуживается nginx. Запись в `SupportMedia` с `expiresAt = createdAt + 1 год`.
- [ ] **SUP-05**: Cron очистки медиа `GET /api/cron/support-media-cleanup` с `CRON_SECRET` — раз в сутки удаляет файлы и записи `SupportMedia` где `expiresAt < now()`.

### Синхронизация WB → ERP

- [ ] **SUP-06**: `POST /api/support-sync` — полная синхронизация отзывов, вопросов, чатов (counts/unread → детали), заявок на возврат. Upsert по `wbExternalId`. Идемпотентно.
- [x] **SUP-07**: Cron-синхронизация отзывов и вопросов — `GET /api/cron/support-sync-reviews` (каждые 15 мин), чатов — `GET /api/cron/support-sync-chat` (каждые 5 мин), статусов обжалований — `GET /api/cron/support-sync-appeals` (раз в час). Все с `CRON_SECRET`.
- [ ] **SUP-08**: Скачивание медиа из отзывов и чатов локально — при синхронизации фото/видео из WB URL копируется в `/var/www/zoiten-uploads/support/...`, `SupportMedia.localPath` проставляется.
- [ ] **SUP-09**: Кнопка «Синхронизировать» в шапке `/support` запускает `POST /api/support-sync` с toast loading/success/error состояниями.

### Лента тикетов `/support`

- [ ] **SUP-10**: Главная страница `/support` — объединённая лента тикетов (отзывы + вопросы + чаты + возвраты + мессенджеры) как RSC, карточка с иконкой канала, статусом, покупателем, товаром (nmId + фото), датой, превью текста, рейтингом (для отзывов), назначенным менеджером. Цветные индикатор-полосы слева: NEW=красный, IN_PROGRESS=жёлтый, ANSWERED=зелёный, CLOSED=серый, APPEALED=фиолетовый.
- [ ] **SUP-11**: Фильтры ленты — канал (все/отзывы/вопросы/чат/возвраты/мессенджер), статус, товар/nmId, менеджер, диапазон дат, toggle «только неотвеченные». Фильтры через searchParams, MultiSelectDropdown с чекбоксами (паттерн проекта).
- [ ] **SUP-12**: Sidebar — бейдж с суммарным количеством новых необработанных тикетов рядом с пунктом «Служба поддержки», обновляется при клике/синхронизации.

### Диалог `/support/[ticketId]`

- [ ] **SUP-13**: Страница диалога — 3-колоночный layout: левая панель (карточка покупателя с ссылкой «Все обращения», карточка товара, причина возврата/фото брака для RETURN), центр (хронологический чат с входящими слева и исходящими справа, метки типа «Отзыв/Вопрос/Чат/Возврат/Автоответ», превью медиа с раскрытием), правая панель (статус dropdown, назначение менеджера dropdown, канал readonly, даты, статус обжалования для APPEALED).
- [x] **SUP-14**: Нижняя sticky-панель ответа — textarea + кнопки «Выбрать шаблон» (модалка поиска), «Отправить» (server action → WB API PATCH → запись `SupportMessage` с direction=OUTBOUND). Для канала RETURN вместо/рядом — кнопки «Одобрить/Отклонить/Пересмотреть». Для канала FEEDBACK — кнопка «Обжаловать отзыв».
- [ ] **SUP-15**: Ручное назначение менеджера — dropdown по `User` где `sectionRoles.section = SUPPORT`, запись в `SupportTicket.assignedToId` с revalidatePath.
- [ ] **SUP-16**: Ручная смена статуса тикета — dropdown `NEW → IN_PROGRESS → ANSWERED → CLOSED`, переход в `APPEALED` только через действие «Обжаловать».

### Возвраты `/support/returns`

- [x] **SUP-17**: WB Returns API интеграция в `lib/wb-support-api.ts` — методы `listReturns`, `approveReturn`, `rejectReturn`, `reconsiderReturn` с тестами.
- [x] **SUP-18**: Страница `/support/returns` — таблица заявок с колонками: Товар (фото+nmId+название), Покупатель, Причина, Фото брака (превью), Дата заявки, Решение (PENDING/APPROVED/REJECTED), Кто принял (менеджер+дата), Пересмотрено (да/нет), Действия.
- [x] **SUP-19**: Действия по возврату — кнопки «Одобрить» (PUT /api/v1/returns/{id}/approve), «Отклонить» (PUT reject с причиной), «Пересмотреть» (PUT reconsider, доступна только если статус REJECTED). Решение фиксируется в `ReturnDecision` с `decidedById`, `decidedAt`, `reason`, `reconsidered`.
- [x] **SUP-20**: Логика состояний возврата: `PENDING → APPROVED | REJECTED`, `REJECTED → APPROVED` (через Пересмотреть, выставляет `reconsidered=true`), `APPROVED` финальный (кнопки действий disabled).

### Чат + Автоответы

- [x] **SUP-21**: WB Chat API интеграция — `listChats`, `getMessages(chatId)`, `sendMessage(chatId, text, media)`, `getUnreadCount`. При получении 403 от Node.js `fetch()` автоматический fallback на `execSync('curl ...')` (паттерн `wb-api.ts` v4).
- [x] **SUP-22**: Отправка сообщений в чат через UI диалога — текст + опциональный upload фото/видео (multipart), запись `SupportMessage` с direction=OUTBOUND и `SupportMedia` для каждого файла.
- [x] **SUP-23**: `AutoReplyConfig` — singleton-запись с полями: isEnabled, workdayStart/End (HH:MM), workDays (Int[]), messageText, timezone (default Europe/Moscow), updatedById.
- [x] **SUP-24**: Страница `/support/auto-reply` — форма настроек автоответа (переключатель, время, дни Пн-Вс чекбоксы, textarea с переменными `{имя_покупателя}`, `{название_товара}`), кнопка «Синхронизировать с WB» (POST /api/v1/seller/chats/auto-reply).
- [x] **SUP-25**: Автоответы в ленте и диалоге помечаются `isAutoReply=true` и визуальной иконкой «🤖» рядом с сообщением. Применяется только к каналу CHAT.

### Шаблоны ответов + Обжалование

- [x] **SUP-26**: `ResponseTemplate` CRUD — страница `/support/templates` с таблицей (Название, Канал, Тег ситуации, Товар/Общий, Активен), форма создания/редактирования (name, text, channel=FEEDBACK|QUESTION|CHAT, situationTag, опциональная привязка к WbCard.id).
- [x] **SUP-27**: Синхронизация шаблонов с WB — кнопка «Синхронизировать шаблоны» (GET list → upsert по wbTemplateId), «Опубликовать в WB» на локальном шаблоне (POST → сохраняет wbTemplateId), обновление (PUT), удаление (DELETE + из БД).
- [x] **SUP-28**: Модалка «Выбрать шаблон» при ответе — поиск по тексту/тегу ситуации, группировка: сначала шаблоны с `nmId = currentTicket.nmId`, затем общие. Выбор → подставка текста в textarea ответа.
- [x] **SUP-29**: Обжалование отзыва — кнопка «Обжаловать» в диалоге FEEDBACK → модалка с выпадающим списком причин (из WB API или справочника) + свободный текст → POST /api/v1/feedbacks/report → `appealId` + `appealStatus=PENDING`, `ticket.status=APPEALED`.
- [ ] **SUP-30**: Cron поллинг статусов обжалований (раз в час) — для всех `SupportTicket` где `appealStatus=PENDING` → GET /api/v1/feedbacks/report/{appealId} → обновление `appealStatus` на APPROVED/REJECTED с датой.
- [x] **SUP-31**: Индикатор обжалования в ленте и карточке тикета — иконка + бейдж: нет / 🕐 ожидание / ✅ одобрено / ❌ отклонено.

### Профиль покупателя + Мессенджеры

- [x] **SUP-32**: Автоматическая линковка тикетов к `Customer` через `wbUserId` — при sync если `Customer.wbUserId` найден, тикет связывается, иначе создаётся новый `Customer`.
- [x] **SUP-33**: Страница профиля покупателя `/support/customers/[customerId]` — все тикеты этого покупателя по всем каналам в хронологии, итого по каналам (N отзывов/вопросов/чатов/возвратов), средний рейтинг отзывов, внутренняя заметка (textarea).
- [x] **SUP-34**: Ручное создание тикета MESSENGER — форма (канал из выпадающего: Telegram/WhatsApp/другое, телефон/имя покупателя, текст обращения, опциональная привязка к товару через WbCard), создаёт `SupportTicket` с `channel=MESSENGER`, `wbExternalId=null`.
- [x] **SUP-35**: Merge дубликатов `Customer` — действие в профиле «Связать с другим покупателем» → выбор целевого `Customer` → перенос всех тикетов + удаление исходного.

### Статистика

- [x] **SUP-36**: Страница `/support/stats` с двумя вкладками — «По товарам» и «По менеджерам». Фильтры: период (7д / 30д / квартал / кастом dateFrom-dateTo), товар/категория (для вкладки товаров), менеджер (для вкладки менеджеров).
- [x] **SUP-37**: Метрики по товарам (aggregation SQL по `SupportTicket` + `ReturnDecision` с фильтром по nmId): кол-во отзывов, средний рейтинг, процент ответов (answered/total), возвраты (total / approved / rejected), топ причин возвратов, кол-во вопросов, среднее время ответа (сек).
- [x] **SUP-38**: Метрики по менеджерам (из `ManagerSupportStats` + live-расчёт за текущий день): всего обработано, отзывы/вопросы/чаты/возвраты отвечено, % одобрения возвратов, среднее время ответа, кол-во автоответов.
- [x] **SUP-39**: Денормализованная таблица `ManagerSupportStats` — обновляется cron-ом раз в сутки `GET /api/cron/support-stats-refresh` (03:00 МСК), уникальность `(userId, period)` где period = начало месяца.

### Навигация и UX

- [ ] **SUP-40**: Пункт «Служба поддержки» в левом sidebar с иконкой `HeadphonesIcon` + бейдж количества новых тикетов. Подпункты: «Все обращения», «Возвраты», «Шаблоны», «Автоответы», «Статистика».

## v1.2 Requirements — Управление остатками

Requirements добавленные в milestone v1.2 (2026-04-21). Research: `.planning/research/SUMMARY.md`.

### Schema & Foundation

- [x] **STOCK-01**: Prisma миграция — модели `WbWarehouse(id Int PK, name, cluster, shortCluster, isActive, needsClusterReview)`, `WbCardWarehouseStock(wbCardId, warehouseId, quantity, updatedAt)` с `@@unique([wbCardId, warehouseId])` + каскад от WbCard; новые поля `Product.ivanovoStock Int?`, `Product.productionStock Int?`, `Product.ivanovoStockUpdatedAt DateTime?`, `Product.productionStockUpdatedAt DateTime?`; AppSetting seed `stock.turnoverNormDays = 37`. Одна большая миграция в Wave 0.
- [x] **STOCK-02**: Pure function `lib/stock-math.ts` — `calculateStockMetrics({stock, ordersPerDay, turnoverNormDays}) → {turnoverDays, deficit}` с guards: О=null → null, З=0 → turnoverDays=null, normDays≤0 → deficit=null, Infinity/NaN защита.
- [x] **STOCK-03**: Утилита `lib/normalize-sku.ts` — trim + upper + em-dash U+2014→hyphen + regex `^(?:УКТ-?)?(\d+)$` → `УКТ-${padStart(digits, 6, '0')}`. Используется Excel-парсером Иваново.
- [x] **STOCK-04**: Route rename `/inventory` → `/stock` — переименовать папку `app/(dashboard)/inventory/` → `/stock/`, обновить `lib/sections.ts:11`, `components/layout/nav-items.ts:34`, `lib/section-titles.ts`; nginx rewrite `/inventory(.*)` → `/stock$1` на 1 релиз.
- [x] **STOCK-05**: RBAC — все страницы `/stock/*` требуют `requireSection("STOCK")`, все write server actions (upsertIvanovoStock, updateProductionStock, updateTurnoverNorm, ручной refresh) — `requireSection("STOCK", "MANAGE")`.

### WB Integration (per-warehouse + API migration)

- [x] **STOCK-06**: Wave 0 smoke-test (ручной) — curl на `POST https://seller-analytics-api.wildberries.ru/api/analytics/v1/stocks-report/wb-warehouses` с текущим `WB_API_TOKEN`: проверить scope Аналитика + Personal/Service token type. Если 401/403 → блокер, регенерация токена до coding.
- [x] **STOCK-07**: `fetchStocksPerWarehouse(nmIds: number[])` в `lib/wb-api.ts` — POST на новый endpoint; body `{nmIds, limit, offset}`; rate limit 3 req/min + 20s burst (sleep 20000ms между батчами); batch до 1000 nmIds; retry 60s на 429; возвращает `Map<nmId, Array<{warehouseId, warehouseName, regionName, quantity, inWayToClient, inWayFromClient}>>`. Старая `fetchStocks()` помечена `@deprecated — sunset 2026-06-23`.
- [x] **STOCK-08**: Расширение `POST /api/wb-sync` — после `fetchStocksPerWarehouse` clean-replace per wbCardId в транзакции: `tx.wbCardWarehouseStock.deleteMany({wbCardId, NOT: {warehouseId: {in: incomingIds}}})` + `upsert` для входящих + `WbCard.stockQty = SUM(quantity)` той же транзакцией (denormalized для backward compat с `/prices/wb`).
- [x] **STOCK-09**: Seed справочника `WbWarehouse` — скрипт `prisma/seed-wb-warehouses.ts` с hardcoded array (собранный через DevTools Network tab на seller.wildberries.ru); validation кластеров с пользователем в Zero Wave Plan 14-02. Маппинг: ЦФО=Центральный, ЮГ=Южный+Северо-Кавказский, Урал=Уральский, ПФО=Приволжский, СЗО=Северо-Западный, СФО=Дальневосточный+Сибирский, Прочие=остальные. Запускается однократно через `npx prisma db seed -- --wb-warehouses`.
- [x] **STOCK-10**: Auto-insert неизвестных складов — если `warehouseId` в ответе API нет в `WbWarehouse`, создать запись с `name=warehouseName`, `cluster="Прочие"`, `shortCluster="Прочие"`, `needsClusterReview=true`. Console warn в логи, sync не падает. В UI /stock/wb такие склады попадают в кластер «Прочие» с значком ⚠️.

### Data Input — Иваново, Производство, Норма

- [x] **STOCK-11**: Excel-импорт Иваново — `POST /api/stock/ivanovo-upload` multipart; парсер `lib/parse-ivanovo-excel.ts` (паттерн из `parse-auto-promo-excel.ts`, колонки: A=SKU, B=quantity); preview Dialog с diff old→new qty + секции `unmatched/duplicates/invalid` (не блокируют confirm).
- [x] **STOCK-12**: Server action `upsertIvanovoStock(rows: Array<{sku, quantity}>)` — normalizeSku → lookup Product по sku → `tx.product.update({where: {sku}, data: {ivanovoStock: qty, ivanovoStockUpdatedAt: now}})`; возвращает `{imported, notFound, duplicates, invalid}` + downloadable CSV с ошибками; `revalidatePath("/stock")`.
- [x] **STOCK-13**: Inline-редактирование `Product.productionStock` в `/stock` — input на каждой строке Product (Сводная), debounced save 500ms через server action `updateProductionStock(productId, value)`; Zod `int().min(0).max(99999)` или null (пустое поле → null); `revalidatePath("/stock")`.
- [x] **STOCK-14**: Inline-редактирование «Нормы оборачиваемости» в шапке `/stock` — компонент `TurnoverNormInput` (паттерн `GlobalRatesBar` из Phase 7); debounced save 500ms через `updateTurnoverNorm(days)`; AppSetting key `stock.turnoverNormDays`; Zod `int().min(1).max(100)`; `revalidatePath("/stock")` + `/stock/wb`.
- [x] **STOCK-15**: Кнопка «Обновить из WB» в шапке `/stock` — вызывает `POST /api/wb-sync` (существующий, расширенный STOCK-08); toast states loading/success/error; `revalidatePath("/stock")` + `/stock/wb` на сервере.

### `/stock` — главная страница (Product-level)

- [x] **STOCK-16**: RSC страница `/stock` — таблица с rowSpan: первая строка «Сводная» (Product-level, агрегация всех артикулов) + одна строка per-артикул (MarketplaceArticle) ниже; разделитель между Product (жирный), между артикулами (тонкий).
- [x] **STOCK-17**: Sticky колонки при горизонтальном скролле — Фото (80px) + Сводка (240px: название + УКТ + бренд) + Ярлык (80px) + Артикул (120px); z-index слои по аналогии с `PriceCalculatorTable`; `position: sticky; left: {accumulated}`.
- [x] **STOCK-18**: Колонки данных после sticky — 6 групп: **РФ** (О) / **Иваново** (О) / **Производство** (О) / **МП** (О/З/Об/Д, сумма по всем маркетплейсам) / **WB** (О/З/Об/Д) / **Ozon** (О/З/Об/Д, все «—» placeholder). Colgroup headers 2 уровня (группа + под-колонка) с `position: sticky top-0 / top-[40px]` + `bg-background`.
- [x] **STOCK-19**: Формат чисел и цвета — `<10 → toFixed(1)`, `≥10 → Math.floor`; null → «—». Цветовая кодировка Д (3-уровневая): Д≤0 → зелёный (всё ок), 0<Д<норма×0.3×З → жёлтый (думать о закупке), Д≥норма×0.3×З → красный (срочно).
- [x] **STOCK-20**: Фильтры `/stock` — MultiSelect бренд/категория/подкатегория (паттерн `PricesFilters`) + toggle «только с дефицитом» (Д>0 хотя бы в одной группе); все через URL searchParams.

### `/stock/wb` — подраздел (per-nmId + кластеры)

- [ ] **STOCK-21**: Табы `/stock` / `/stock/wb` / `/stock/ozon` — компонент `StockTabs` (паттерн `PricesTabs`); `/stock/ozon` = `<ComingSoon sectionName="Управление остатками Ozon" />`.
- [ ] **STOCK-22**: RSC `/stock/wb` — таблица с rowSpan per Product → per WbCard (nmId); sticky колонки те же 4 + первые 4 data-колонки (РФ/Иваново/Производство/МП-сумма) как сводка; далее 7 кластерных колонок (ЦФО/ЮГ/Урал/ПФО/СЗО/СФО/Прочие) каждая с О/З/Об/Д.
- [x] **STOCK-23**: Маппинг кластеров денормализован в `WbWarehouse.shortCluster` (при seed и auto-insert) — значения из набора `{ЦФО, ЮГ, Урал, ПФО, СЗО, СФО, Прочие}`. Full names в статическом `lib/wb-clusters.ts` (`CLUSTER_FULL_NAMES` map).
- [ ] **STOCK-24**: Tooltip при hover на сокращённом названии кластера — shadcn `<Tooltip>` (уже в проекте) показывает full name из `CLUSTER_FULL_NAMES` + список склада-источников, если нужно.
- [ ] **STOCK-25**: Expand кластера → replace кластерных О/З/Об/Д на набор per-warehouse columns внутри этого кластера; state в URL (`?expandedClusters=ЦФО,ПФО` comma-separated, human-readable); toggle-кнопки «Развернуть все / Свернуть все» в toolbar; shareable ссылки.

### Testing & Deploy

- [x] **STOCK-26**: Vitest `tests/stock-math.test.ts` — 5+ test cases: happy path, О=null, З=0, normDays=0, normDays=100, О=0 (дефицит максимальный).
- [x] **STOCK-27**: Vitest `tests/normalize-sku.test.ts` — canonical cases: `УКТ-000001` / `УКТ-1` / `1` / ` укт-000001 ` / `УКТ—000001` (em-dash) → все в `УКТ-000001`; invalid cases: `abc`, `УКТ-`, пустая строка → throw.
- [x] **STOCK-28**: Vitest `tests/parse-ivanovo-excel.test.ts` — реальная fixture от пользователя (предоставить в Zero Wave Plan 14-04); 3+ test cases: happy, формулы vs значения, дубликаты SKU.
- [ ] **STOCK-29**: Deploy через `deploy.sh` с миграциями + human UAT чеклист: (a) `/stock` открывается без ошибок, (b) Excel Иваново загружается с preview, (c) Производство редактируется inline, (d) Норма редактируется в шапке, (e) кнопка «Обновить из WB» работает, (f) `/stock/wb` показывает кластеры, (g) expand кластера показывает склады, (h) tooltip работает, (i) nginx rewrite `/inventory` → `/stock` работает 1 релиз.

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

### Support — Future Enhancements

- **SUP-FUT-01**: Webhook endpoint `POST /api/support-webhook` — заменить polling когда WB выпустит webhooks
- **SUP-FUT-02**: Ozon-интеграция для службы поддержки (отзывы/вопросы/чат Ozon)
- **SUP-FUT-03**: AI-ассистент для автосаггесчена ответа на отзыв/вопрос
- **SUP-FUT-04**: Алёрт при превышении 80% диска в `/var/www/zoiten-uploads/support/`
- **SUP-FUT-05**: Rate-limiting dashboard для мониторинга WB API 429 ответов

### Stock — Future Enhancements (v1.3+)

- **STOCK-FUT-01**: Модуль «План закупок» — черновик заказов на производство на основе дефицита Phase 14
- **STOCK-FUT-02**: Модуль «План продаж» — прогноз продаж на 1-3 месяца на основе avgSalesSpeed + сезонности
- **STOCK-FUT-03**: StockMovement log — история in/out движений остатков (аудит)
- **STOCK-FUT-04**: Резервирование товара под заказы (soft-reserve)
- **STOCK-FUT-05**: Safety stock / Reorder Point / EOQ — supply chain формулы с σ-расчётом
- **STOCK-FUT-06**: Ozon Stocks API — заменить placeholder колонки Ozon реальными данными
- **STOCK-FUT-07**: Alerts при достижении reorder point (email / Telegram bot)
- **STOCK-FUT-08**: Refactor `WbCard.stockQty` — убрать денормализованное поле, вычислять через `SUM(WbCardWarehouseStock)` (после validation Phase 14 в проде 1-2 sync-цикла)
- **STOCK-FUT-09**: Удалить deprecated `fetchStocks()` из lib/wb-api.ts после 2026-06-23
- **STOCK-FUT-10**: Sparkline-график движения остатков за 30 дней в строке товара

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
| Webhooks для отзывов/вопросов | WB API не поддерживает (на 2026-04), используем polling |
| Ozon служба поддержки | Фокус milestone v1.1 только на WB; Ozon-интеграция отдельным milestone |
| AI-саггешн ответа на отзыв | Отложено до валидации базового потока операторами |
| S3/облачное хранение медиа | VPS достаточно при объёме 50-200 SKU и TTL 1 год |
| Push-уведомления о новых тикетах | Веб-приложение, достаточно sidebar бейджа и частой синхронизации |
| Отчёты статистики в Excel/PDF | Deferred — live-дашборд покрывает основные сценарии |
| Планирование закупок / продаж | Отдельный milestone v1.3+ после validation v1.2 |
| StockMovement log (аудит движения) | v1.3+ — при 50-200 SKU не нужен сейчас |
| Резервирование товара под заказы | v1.3+ — hard-reserve pattern избыточен для текущего flow |
| Safety stock / EOQ / Reorder Point | Deferred — работает при 1000+ SKU, у нас 50-200 |
| Ozon Stocks API в Phase 14 | Удвоит scope — placeholder колонки достаточны для v1.2 |
| Автосписание Иваново по WB заказам | Физически разные склады, логика невалидна |
| Остатки per-размер (techSize) | WB даёт агрегат по nmId, techSize-разрез = отдельная таблица позже |
| ML-прогноз продаж / сезонности | Линейной экстраполяции avgSalesSpeed достаточно для v1.2 |
| Real-time polling per-warehouse WB | Rate limit 3/min → невозможно; sync раз в день/час достаточно |
| Inline-редактирование остатков Иваново/WB в UI | Ломает audit trail; только через Excel upload / WB sync |

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
| PRICES-02 | Phase 7 | Complete |
| PRICES-03 | Phase 7 | Complete |
| PRICES-04 | Phase 7 | Complete |
| PRICES-05 | Phase 7 | Complete |
| PRICES-06 | Phase 7 | Complete |
| PRICES-07 | Phase 7 | Complete |
| PRICES-08 | Phase 7 | Complete |
| PRICES-09 | Phase 7 | Complete |
| PRICES-10 | Phase 7 | Complete |
| PRICES-11 | Phase 7 | Complete |
| PRICES-12 | Phase 7 | Complete |
| PRICES-13 | Phase 7 | Complete |
| PRICES-14 | Phase 7 | Complete |
| PRICES-15 | Phase 7 | Complete |
| PRICES-16 | Phase 7 | Complete |
| SUP-01 | Phase 8 | Pending |
| SUP-02 | Phase 8 | Pending |
| SUP-03 | Phase 8 | Pending |
| SUP-04 | Phase 8 | Pending |
| SUP-05 | Phase 8 | Pending |
| SUP-06 | Phase 8 | Pending |
| SUP-07 | Phase 8, Phase 10, Phase 11 | Complete |
| SUP-08 | Phase 8 | Pending |
| SUP-09 | Phase 8 | Pending |
| SUP-10 | Phase 8 | Pending |
| SUP-11 | Phase 8 | Pending |
| SUP-12 | Phase 8 | Pending |
| SUP-13 | Phase 8 | Pending |
| SUP-14 | Phase 8, Phase 9, Phase 11 | Complete |
| SUP-15 | Phase 8 | Pending |
| SUP-16 | Phase 8 | Pending |
| SUP-17 | Phase 9 | Complete |
| SUP-18 | Phase 9 | Complete |
| SUP-19 | Phase 9 | Complete |
| SUP-20 | Phase 9 | Complete |
| SUP-21 | Phase 10 | Complete |
| SUP-22 | Phase 10 | Complete |
| SUP-23 | Phase 10 | Complete |
| SUP-24 | Phase 10 | Complete |
| SUP-25 | Phase 10 | Complete |
| SUP-26 | Phase 11 | Complete |
| SUP-27 | Phase 11 | Complete |
| SUP-28 | Phase 11 | Complete |
| SUP-29 | Phase 11 | Complete |
| SUP-30 | Phase 11 | Pending |
| SUP-31 | Phase 11 | Complete |
| SUP-32 | Phase 12 | Complete |
| SUP-33 | Phase 12 | Complete |
| SUP-34 | Phase 12 | Complete |
| SUP-35 | Phase 12 | Complete |
| SUP-36 | Phase 13 | Complete |
| SUP-37 | Phase 13 | Complete |
| SUP-38 | Phase 13 | Complete |
| SUP-39 | Phase 13 | Complete |
| SUP-40 | Phase 8 | Pending |
| STOCK-01 | Phase 14 | Complete |
| STOCK-02 | Phase 14 | Complete |
| STOCK-03 | Phase 14 | Complete |
| STOCK-04 | Phase 14 | Complete |
| STOCK-05 | Phase 14 | Complete |
| STOCK-06 | Phase 14 | Complete |
| STOCK-07 | Phase 14 | Complete |
| STOCK-08 | Phase 14 | Complete |
| STOCK-09 | Phase 14 | Complete |
| STOCK-10 | Phase 14 | Complete |
| STOCK-11 | Phase 14 | Complete |
| STOCK-12 | Phase 14 | Complete |
| STOCK-13 | Phase 14 | Complete |
| STOCK-14 | Phase 14 | Complete |
| STOCK-15 | Phase 14 | Complete |
| STOCK-16 | Phase 14 | Complete |
| STOCK-17 | Phase 14 | Complete |
| STOCK-18 | Phase 14 | Complete |
| STOCK-19 | Phase 14 | Complete |
| STOCK-20 | Phase 14 | Complete |
| STOCK-21 | Phase 14 | Pending |
| STOCK-22 | Phase 14 | Pending |
| STOCK-23 | Phase 14 | Complete |
| STOCK-24 | Phase 14 | Pending |
| STOCK-25 | Phase 14 | Pending |
| STOCK-26 | Phase 14 | Complete |
| STOCK-27 | Phase 14 | Complete |
| STOCK-28 | Phase 14 | Complete |
| STOCK-29 | Phase 14 | Pending |

---
*Defined: 2026-04-05 | 72 requirements | 7 phases*
*Milestone v1.1 added: 2026-04-17 | +40 requirements (SUP-01..SUP-40) | 6 new phases planned (Phase 8..13)*
*Milestone v1.2 added: 2026-04-21 | +29 requirements (STOCK-01..STOCK-29) | 1 new phase planned (Phase 14)*
