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

- [x] **STOCK-21**: Табы `/stock` / `/stock/wb` / `/stock/ozon` — компонент `StockTabs` (паттерн `PricesTabs`); `/stock/ozon` = `<ComingSoon sectionName="Управление остатками Ozon" />`.
- [x] **STOCK-22**: RSC `/stock/wb` — таблица с rowSpan per Product → per WbCard (nmId); sticky колонки те же 4 + первые 4 data-колонки (РФ/Иваново/Производство/МП-сумма) как сводка; далее 7 кластерных колонок (ЦФО/ЮГ/Урал/ПФО/СЗО/СФО/Прочие) каждая с О/З/Об/Д.
- [x] **STOCK-23**: Маппинг кластеров денормализован в `WbWarehouse.shortCluster` (при seed и auto-insert) — значения из набора `{ЦФО, ЮГ, Урал, ПФО, СЗО, СФО, Прочие}`. Full names в статическом `lib/wb-clusters.ts` (`CLUSTER_FULL_NAMES` map).
- [x] **STOCK-24**: Tooltip при hover на сокращённом названии кластера — shadcn `<Tooltip>` (уже в проекте) показывает full name из `CLUSTER_FULL_NAMES` + список склада-источников, если нужно.
- [x] **STOCK-25**: Expand кластера → replace кластерных О/З/Об/Д на набор per-warehouse columns внутри этого кластера; state в URL (`?expandedClusters=ЦФО,ПФО` comma-separated, human-readable); toggle-кнопки «Развернуть все / Свернуть все» в toolbar; shareable ссылки.

### Testing & Deploy

- [x] **STOCK-26**: Vitest `tests/stock-math.test.ts` — 5+ test cases: happy path, О=null, З=0, normDays=0, normDays=100, О=0 (дефицит максимальный).
- [x] **STOCK-27**: Vitest `tests/normalize-sku.test.ts` — canonical cases: `УКТ-000001` / `УКТ-1` / `1` / ` укт-000001 ` / `УКТ—000001` (em-dash) → все в `УКТ-000001`; invalid cases: `abc`, `УКТ-`, пустая строка → throw.
- [x] **STOCK-28**: Vitest `tests/parse-ivanovo-excel.test.ts` — реальная fixture от пользователя (предоставить в Zero Wave Plan 14-04); 3+ test cases: happy, формулы vs значения, дубликаты SKU.
- [x] **STOCK-29**: Deploy через `deploy.sh` с миграциями + human UAT чеклист: (a) `/stock` открывается без ошибок, (b) Excel Иваново загружается с preview, (c) Производство редактируется inline, (d) Норма редактируется в шапке, (e) кнопка «Обновить из WB» работает, (f) `/stock/wb` показывает кластеры, (g) expand кластера показывает склады, (h) tooltip работает, (i) nginx rewrite `/inventory` → `/stock` работает 1 релиз.

### Orders Per-Warehouse (Phase 15)

- [x] **ORDERS-01**: Prisma миграция — модель `WbCardWarehouseOrders(id, wbCardId, warehouseId, ordersCount Int @default(0), periodDays Int @default(7), updatedAt)` с `@@unique([wbCardId, warehouseId])`, indexes на `wbCardId` и `warehouseId`, FK `wbCardId → WbCard.id ON DELETE CASCADE`, FK `warehouseId → WbWarehouse.id`. Обратные relations в `WbCard.warehouseOrders` и `WbWarehouse.orders`.
- [x] **ORDERS-02**: При `POST /api/wb-sync` параллельно stocks загружаются orders за 7 дней через `GET statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom=<7d ago>&flag=0`. `isCancel: true` ИСКЛЮЧАЮТСЯ. Clean-replace per `wbCardId` в транзакции: `deleteMany NOT IN incoming` + `upsert` per warehouse. Auto-insert неизвестных складов через `stableWarehouseIdFromName` + `needsClusterReview: true` (паттерн STOCK-10).
- [x] **ORDERS-03**: На `/stock/wb` колонка З каждого кластера (collapsed) = `SUM(ordersCount per warehouses of cluster) / periodDays`. При expand кластера — per-warehouse З = `ordersCount / periodDays`. Метрики Об/Д per-кластер пересчитываются от кластерной З (не от `card.avgSalesSpeed7d`) через существующую `calculateStockMetrics` из `lib/stock-math.ts`. `WbCard.avgSalesSpeed7d` остаётся fallback для nmId без per-warehouse данных и для Сводной колонки МП/З. `scripts/wb-sync-stocks.js` расширен секцией orders (идентичный паттерн stocks section).

### Per-Size Stock Breakdown (Phase 16)

- [ ] **STOCK-30**: Diagnostic скрипт `scripts/wb-stocks-diagnose.js` — standalone Node.js скрипт, делает curl на `https://statistics-api.wildberries.ru/api/v1/supplier/stocks?dateFrom=2019-06-20T00:00:00`, читает `WbCardWarehouseStock` через Prisma, агрегирует по `(nmId, warehouseName)` (sum across techSize), считает diff `apiTotal − dbTotal`, выгружает CSV с колонками `nmId, warehouseName, apiTotal, dbTotal, diff, ratio` для всех несовпадений. Контрольные nmId — 859398279, 901585883. Wave 0 baseline + verification после фикса.
- [ ] **STOCK-31**: Prisma миграция `20260423_phase16_size_breakdown` (manual SQL) — `ALTER TABLE "WbCardWarehouseStock" ADD COLUMN "techSize" TEXT NOT NULL DEFAULT ''`, `DROP CONSTRAINT "WbCardWarehouseStock_wbCardId_warehouseId_key"`, `CREATE UNIQUE INDEX "WbCardWarehouseStock_wbCardId_warehouseId_techSize_key" ON ("wbCardId", "warehouseId", "techSize")`, `DELETE FROM "WbCardWarehouseStock" WHERE "techSize" = ''` (truncate legacy aggregates), `ALTER TABLE "User" ADD COLUMN "stockWbShowSizes" BOOLEAN NOT NULL DEFAULT false`. `prisma/schema.prisma`: `WbCardWarehouseStock { techSize String @default("") }`, новый `@@unique([wbCardId, warehouseId, techSize])`, `User.stockWbShowSizes Boolean @default(false)`.
- [ ] **STOCK-32**: Расширить `WarehouseStockItem` в `lib/wb-api.ts` полями `techSize: string` и `barcode: string`. `fetchStocksPerWarehouse` пропускает `row.techSize ?? ""` и `row.barcode ?? ""` в результат. `OrdersWarehouseStats` в `fetchOrdersPerWarehouse` дополнен полем `perWarehouseSize: Map<string, Map<string, number>>` (warehouseName → techSize → count). Тесты `tests/wb-stocks-per-warehouse.test.ts` и `tests/wb-orders-per-warehouse.test.ts` расширены.
- [ ] **STOCK-33**: Sync-bug fix — оба файла (`scripts/wb-sync-stocks.js:106-122` и `app/api/wb-sync/route.ts:238-264`) переходят на per-size upsert по compound ключу `(wbCardId, warehouseId, techSize)` с `update: { quantity: incoming }` (REPLACE, НЕ accumulate). Clean-replace переписан на 2-step pattern: `findMany {wbCardId}` → JS-фильтр `!incomingSet.has({warehouseId}::{techSize})` → `deleteMany {id IN [...]}`. После re-sync `sum(quantity) per (wbCardId, warehouseId)` = WB API snapshot (verified diagnostic диff=0).
- [ ] **STOCK-34**: Расширить `lib/stock-wb-data.ts` — добавить тип `WbStockSizeRow { techSize, totalStock, clusters }` со структурой идентичной `WbStockRow.clusters`; новые поля `WbStockRow.sizeBreakdown: WbStockSizeRow[]` и `WbStockRow.hasMultipleSizes: boolean`. Агрегация per-size: `Map<techSize, Map<warehouseId, qty>>` от `card.warehouses` и `Map<techSize, Map<warehouseName, count>>` от `OrdersWarehouseStats.perWarehouseSize`. Хелпер `sortSizes(sizes: string[])` экспортирован из `lib/wb-clusters.ts` — числовые ASC, буквенные через `SIZE_ORDER` map (`XS<S<M<L<XL<2XL<3XL<4XL`), пустые/`"0"` в конец.
- [ ] **STOCK-35**: Server action `saveStockWbShowSizes(value: boolean)` в `app/actions/stock-wb.ts` — паттерн `saveStockWbHiddenWarehouses` (quick 260422-oy5), `requireSection("STOCK")` без MANAGE, Zod `z.object({ value: z.boolean() })`, обновление `User.stockWbShowSizes`, `revalidatePath("/stock/wb")`.
- [x] **STOCK-36**: UI кнопка «По размерам» в верхней панели `StockWbTable.tsx` (рядом с «Без СЦ»/«Склады») — `<Button variant={showSizes ? "default" : "outline"}>` с optimistic update (`useState` + `useTransition` → `saveStockWbShowSizes`). RSC `app/(dashboard)/stock/wb/page.tsx` читает `User.stockWbShowSizes` через session, передаёт `initialShowSizes` prop. Под per-nmId строкой при `showSizes && card.hasMultipleSizes` рендерятся `card.sizeBreakdown.map(...)` строки с приглушённым фоном (`bg-muted/30`), префиксом `↳ Размер X` в Артикул-колонке, placeholder `—` в Иваново/in-way, полная per-cluster структура О/З/Об/Д. `rowSpan` Фото/Сводки пересчитан с учётом размерных строк.
- [x] **STOCK-37**: Re-sync на VPS после deploy + UAT — после `bash deploy.sh` запустить `node scripts/wb-sync-stocks.js`, нажать «Обновить из WB» в UI, прогнать `node scripts/wb-stocks-diagnose.js` (diff=0 для всех контрольных rows). UAT-чеклист `16-HUMAN-UAT.md` с 9 пунктами: (a) /stock/wb открывается, (b) кнопка «По размерам» persist, (c) nmId 859398279 sum размеров = stockQty, (d) Котовск показывает 6 строк {46:11,48:10,50:10,54:10,58:10,60:10}, (e) per-cluster агрегаты при «Без СЦ»/hidden warehouses не меняются, (f) one-size товары без размерных строк, (g) sticky cells не пересекаются при showSizes+expand-all, (h) `/stock/wb` `/inventory` redirect 1 релиз, (i) diagnostic CSV diff=0.

## Phase 21 Requirements — Кредиты

Requirements для Phase 21, добавленные 2026-06-08/09. Трассировка по decision IDs из `.planning/phases/21-credits/21-CONTEXT.md` (формальных REQ-ID нет — решения D-01..D-19 + вводные U-01..U-05).

### Модель данных

- [x] **CRED-01** (D-01, U-01, U-04, U-05): Новые модели `Lender`, `Loan`, `LoanPayment` + `ERP_SECTION.CREDITS` enum. Источник строк — детальные файлы из папки `Кредиты/` (11 JetLend PDF через `pdftotext -layout` + 2 Сбербанк XLSX). Метаданные и контрольные суммы — `Кредиты.xlsx` Лист2. Разовый seed-скрипт `scripts/seed-credits.ts`.
- [x] **CRED-02** (D-02, D-03): График погашения хранится явными строками `LoanPayment { loanId, date, principal, interest }`. Остаток вычисляется накопительно из `Loan.amount`. Бакетирование день/неделя/месяц — на лету при рендере.
- [x] **CRED-03** (D-05, D-19): `Loan { id, contractNumber, companyId FK Company, lenderId FK Lender, amount Decimal(14,2), annualRatePct Decimal(6,3), termMonths Int?, issueDate DateTime? @default(null), notes, deletedAt }`. Деньги `Decimal(14,2)`, ставка `Decimal(6,3)`.
- [x] **CRED-04** (D-08, U-03): Переименование `Bank` → `Lender` («Кредитор»). Справочник `Lender { id, name @unique, sortOrder Int, createdAt, updatedAt }`. Значения при seed: Сбербанк, JetLend. UI управления: таб «Кредиторы» в `/admin/settings` (НЕ «Банки»).
- [x] **CRED-05** (D-09): Статус кредита — computed из LoanPayment records, не хранится в БД: `активен` (остаток > 0), `погашён` (остаток ≤ 0).

### RBAC и навигация

- [x] **CRED-06** (D-10, D-11): Новый `ERP_SECTION.CREDITS` в enum Prisma (ручная миграция `ALTER TYPE`). Routes: `/credits`, `/credits/[id]`, `/credits/schedule`. Read — `requireSection("CREDITS")`, write server actions — `requireSection("CREDITS", "MANAGE")`.
- [x] **CRED-07**: Sidebar — пункт «Кредиты» с иконкой `Landmark`, позиция после SALES. `lib/sections.ts`, `lib/section-titles.ts`, `components/layout/nav-items.ts` обновлены. Middleware защищает `/credits/*` через RBAC.

### UI — Список кредитов (/credits)

- [x] **CRED-08** (D-12): Sticky-таблица кредитов (raw HTML, не shadcn `<Table>`) с колонками: организация / кредитор / № КД / сумма / ставка % / срок / дата выдачи / текущий остаток / статус. Фильтры: организация / кредитор / статус. Клик → `/credits/[id]`.
- [x] **CRED-09**: LoanModal CRUD — создание/редактирование кредита через модалку с вложенной таблицей строк графика (inline add/edit/delete строк `LoanPayment`). Server actions `createLoan`, `updateLoan`, `deleteLoan`, `upsertLoanPayments` — все с `requireSection("CREDITS", "MANAGE")`.

### UI — Детальная карточка (/credits/[id])

- [x] **CRED-10** (D-18): Summary cards: сумма кредита / погашено тела / уплачено процентов / текущий остаток / переплата / ставка/срок/даты. Паттерн `components/ads/SpendSummary.tsx`.
- [x] **CRED-11** (D-18): Таблица графика: дата / тело / проценты / вычисленный остаток (накопительно). Line-chart остатка (recharts, паттерн `WbAdvertOrdersChart`). Опциональная начальная точка — amount кредита для полной кривой.

### UI — Сводный горизонтальный график (/credits/schedule)

- [x] **CRED-12** (D-13, D-13a): Горизонтальная sticky-таблица. Левый блок (sticky): организация / кредитор / № КД / сумма / ставка / остаток. Колонки-периоды: настраиваемый диапазон дат + разбивка день/неделя/месяц. Горизонтальный скролл.
- [x] **CRED-13** (D-14, D-15): Переключатель день/неделя/месяц. Каждый кредит = 2 строки (тело + проценты). Бакетирование на лету из `LoanPayment.date`.
- [x] **CRED-14** (D-16): Группировка по организации: per-org подытоги (тело + проценты) + строка «Итого» внизу. Иерархия границ (CLAUDE.md): inter-org = полный `border-r`, intra-org = `border-r/40`.

### Seed и данные

- [x] **CRED-15** (U-01, U-02, U-03, U-04, U-05): Seed загружает 23 кредита (4 Сбербанк + 19 JetLend). JetLend с PDF (11 кредитов) — строки из PDF; JetLend без PDF (8 кредитов) — строки из Лист2 помесячно; Сбербанк — история из Лист2 + хвост из XLSX. Сверка per-org + Итого vs контрольным суммам Лист2 (допуск 100₽/200₽).
- [x] **CRED-16** (D-07): `issueDate = null` для всех seed-кредитов. Fallback UI — дата первого платежа из графика.

### Traceability: Decision IDs → Implementation

| Decision | Реализовано в | Статус |
|----------|--------------|--------|
| D-01 (загрузка данных: seed-скрипт) | scripts/seed-credits.ts | Complete |
| D-02 (явные строки LoanPayment) | prisma/schema.prisma, Plan 21-01 | Complete |
| D-03 (гранулярность — по датам платежей) | LoanPayment.date, seed-credits.ts | Complete |
| D-04 (остаток вычисляется из amount + платежи) | lib/loan-math.ts | Complete |
| D-05 (модель Loan) | prisma/schema.prisma | Complete |
| D-06 (модель LoanPayment) | prisma/schema.prisma | Complete |
| D-07 (issueDate nullable, null при seed) | prisma/schema.prisma, seed | Complete |
| D-08 (Lender справочник, U-03: Bank→Lender) | prisma/schema.prisma, app/actions/lender.ts, components/settings/LendersTab.tsx | Complete |
| D-09 (статус computed) | lib/loan-math.ts, /credits page | Complete |
| D-10 (CREDITS ERP_SECTION, routes) | prisma/schema.prisma миграция, app/(dashboard)/credits/* | Complete |
| D-11 (RBAC requireSection CREDITS) | app/actions/credits.ts, app/actions/lender.ts | Complete |
| D-12 (список кредитов, фильтры) | app/(dashboard)/credits/page.tsx, components/credits/ | Complete |
| D-13 (горизонтальная sticky-таблица) | app/(dashboard)/credits/schedule/page.tsx | Complete |
| D-13a (настраиваемый диапазон) | components/credits/ScheduleFilters.tsx | Complete |
| D-14 (день/неделя/месяц бакетирование) | lib/loan-math.ts (generateBucketSequence) | Complete |
| D-15 (2 строки per кредит) | components/credits/ScheduleTable.tsx | Complete |
| D-16 (группировка по орг, подытоги) | components/credits/ScheduleTable.tsx | Complete |
| D-17 (левый sticky блок: кредитор + инфо) | components/credits/ScheduleTable.tsx | Complete |
| D-18 (детальная карточка: summary + график + chart) | app/(dashboard)/credits/[id]/page.tsx | Complete |
| D-19 (Decimal(14,2) деньги, Decimal(6,3) ставка) | prisma/schema.prisma | Complete |
| U-01 (источник строк — детальные файлы Кредиты/) | scripts/seed-credits.ts, 21-04-SEED-NOTES.md | Complete |
| U-02 (минимум 2 кредитора: Сбербанк + JetLend) | scripts/seed-credits.ts Lender upsert | Complete |
| U-03 (Bank→Lender, «Кредитор» в UI) | повсюду в Phase 21 | Complete |
| U-04 (JetLend PDF авто-парсинг через pdftotext) | scripts/seed-credits.ts parseJetLendPdf | Complete |
| U-05 (Сбер: история из Лист2 + хвост из XLSX) | scripts/seed-credits.ts Sber merge logic | Complete |

## Phase 25 Requirements — План продаж v2 (рабочий план H2-2026)

Requirements для Phase 25, добавленные 2026-07-04. Источник — дизайн-документ `.planning/phases/25-v2-h2-2026/RESEARCH-DESIGN.md` (11 разделов, ресёч-воркфлоу + адверсариальная критика) и 4 зафиксированных решения пользователя (блок «Зафиксированные решения (2026-07-04)» в доке). Секция остаётся `SALES` (новая ERP_SECTION не нужна).

### Модель данных и движок

- [x] **SP-01**: Новые модели `SalesPlanMonthLevel` (помесячный уровень «заказы шт/день» per товар + опц. priceRub/buyoutPct), `SalesPlanDayOverride` (точечная правка дня), `VirtualPurchase` (+ enum `VirtualPurchaseStatus`), `SalesPlanVersion` + `SalesPlanVersionDay` (immutable снапшот дневного ряда), новое поле `Purchase.plannedArrivalDate DateTime? @db.Date`. Одна рукописная миграция `prisma/migrations/20260705_sales_plan_v2/` (аддитивно, старый sales-plan не ломается). Back-relations Product/Supplier/User.
- [x] **SP-02**: Pure-движок `lib/sales-plan/` (engine, arrivals, iu, virtual-purchases, plan-fact, pdds-feed, data-loader) по образцу `lib/pricing-math.ts` — детерминированный, без Prisma в ядре. Дневной ряд драфта не хранится, вычисляется на request. `lib/date-buckets.ts` (вынос из loan-math + quarter/halfyear/year).
- [x] **SP-03**: Vitest-тесты: engine golden (уровень+day override+партии, сток-лимит, T+3/T+6), arrivals (5 уровней fallback + TRANSIT split/null), iu (`iuTotalForRange("2026-07-01","2026-12-31") === 438_068_120`), plan-fact (бакеты+pro-rata+deviation), virtual (триггер/qty/clamp), pdds-feed (DEPOSIT/BALANCE, исключение CONVERTED/DISMISSED).
- [x] **SP-14**: Bootstrap-скрипт `scripts/bootstrap-sales-plan-monthly.ts` (DI PrismaClient): миграция старых `salesPlan.baselineOverrides/priceOverrides` → `SalesPlanMonthLevel` (с учётом семантики `plannedSalesPerDay`), `salesPlan.leadTimes` → `salesPlan.leadTimes2`. Сид AppSetting-ключей (`salesPlan.iuTargets`, `salesPlan.horizon`, `salesPlan.iuMetric="buyouts"`, страховой запас/покрытие/lead time/транзит).

### План — ввод и горизонт

- [x] **SP-04**: Помесячные плановые уровни (заказы шт/день) per товар с детализацией/правкой в день. Резолв `dayOverride > monthLevel > baseline`. Таб «Товары» (`/sales-plan/products`): редактирование уровней (bulk-drafts + «Пересчитать план»), модалка `ProductPlanDialog` с правкой по дням и realtime-пересчётом стока на клиенте. Горизонт 01.07–31.12.2026 (`salesPlan.horizon`), guard `end ≥ today` снят.
- [x] **SP-05**: Приходы товара из Китая по партиям. `resolveArrivalBatches()` — мульти-партийный resolver с fallback-цепочкой: `Purchase.plannedArrivalDate` → этап TRANSIT (+`transitDays`) → `createdAt + leadTimeDays` (fallback 45) → legacy `ProductIncoming.expectedDate`. По умолчанию `createdAt+45` (leadtime-eta); при заполненном `plannedArrivalDate` — по нему. Поле «Плановая дата прихода» в карточке закупки (`PROCUREMENT MANAGE`). `dateSource`-тег на каждой партии (видимая деградация точности).

### Три ряда, план/факт, ИУ

- [x] **SP-06**: Три ряда данных — наш план / наш факт / план по ИУ. ИУ = `salesPlan.iuTargets` (массив периодов), константа 2 380 805 ₽/день с 01.07 по 31.12.2026 (итог 438 068 120 ₽). Метрика ИУ и факта — **выкупы в ₽** (цены продавца до СПП), `iuMetric="buyouts"`. Хардкод `IU_REMAINING_RUB` выпиливается.
- [ ] **SP-07**: План/факт с отклонением (₽ и %) за день/неделю/месяц/квартал/полугодие/весь горизонт («Итог» = горизонт H2, календарно-годовой тотал за 2026 не показывать; year-бакет в движке — для будущих лет). Таб «Сводный» (`/sales-plan`): `PlanFactMatrix` + KPI-карточки (в т.ч. «отставание от ИУ нарастающим») + график (recharts, факт-bars/план-line/ИУ-dashed). `buildPlanFactReport()` — pure: pro-rata текущего бакета, FAC-прогноз, накопительный итог.
- [ ] **SP-10**: Факт продаж из `WbCardFunnelDaily` на лету (без новых таблиц факта). Кабинет = токен `WB_API_TOKEN`. Два разреза: company-level (все nmId, сравнение с ИУ) и product-level (через MarketplaceArticle). Разница — строка «Вне плана» (непривязанные nmId). Settle-лаг 7 дней (`factSettled=false` для свежих дней).

### Виртуальные закупки

- [ ] **SP-08**: Генератор `suggestVirtualPurchases()` — итеративный roll-forward, pure: триггер «пора заказывать» = пробой страхового запаса (`projectedStock(d) < safetyStockDays × rate(d)`, default 14 дн), qty на покрытие 60 дн, orderDate = breach − leadTime (clamp к today). Учитываются в плане сразу (opt-out): `SUGGESTED` + `ACCEPTED` в arrivals; `DISMISSED` исключается (план проседает, виден `lostRub`). Таб «Пора заказывать» (`/sales-plan/purchases`) — предложения с действиями подтвердить/изменить/отклонить. `regenerateVirtualPurchases()` в обеих цепочках пересчёта. Изоляция структурная (отдельная таблица, не участвует в production-sync/stock/балансе).
- [ ] **SP-09**: Конвертация виртуальной закупки в реальную `Purchase` — `convertVirtualPurchase(id)` (`SALES MANAGE` + `PROCUREMENT MANAGE`), префилл `PurchaseModal` (`plannedArrivalDate = VP.expectedArrivalDate`), `status=CONVERTED`. Анти-двойной счёт: CONVERTED исключён из arrivals; для зафиксированных версий — live-сверка статусов в pdds-feed.

### Версионирование

- [ ] **SP-11**: Фиксация плана `fixSalesPlanVersion(label?, note?)` (`SALES MANAGE`) — материализация дневного ряда в immutable `SalesPlanVersion` + `SalesPlanVersionDay` (обе метрики: заказы и выкупы). Активная версия (`salesPlan.activeVersionId`) — baseline для план/факт. `PlanVersionBar` — селектор версий + «Зафиксировать план»; read-only просмотр версии (`?version=`); «дрейф» черновика vs версии (`compareVersions`). Прошлое версии не переписывается (дни `< today` копируются из активной). `renamePlanVersion`, `setActiveSalesPlanVersion`, `deleteSalesPlanVersion`.

### ПДДС-контракт, RBAC, зачистка

- [ ] **SP-12**: Контракт для будущего ПДДС `lib/sales-plan/pdds-feed.ts` (pure-ядро + loader): `getPlannedRevenueSeries(versionId)` (дневной ряд плановых выкупов), `getPlannedVirtualPayments(versionId)` (DEPOSIT/BALANCE платежи VP из paramsJson со сверкой live-статусов, forward-fill курса). Потребляется следующей фазой ПДДС (`/finance/cashflow`).
- [x] **SP-13**: RBAC — read `requireSection("SALES")`, все write server actions — `requireSection("SALES","MANAGE")` (фикс текущей дыры: `saveBaselineOverrides` и др. сейчас требуют лишь VIEW). Зачистка: удаление `SalesForecast*`-компонентов, `ProductForecastDialog`, `IU_REMAINING_RUB`, `DEFAULT_END_DATE`, старых AppSetting-ключей; деприкейт `/purchase-plan` и `/procurement/plan` (снятие из sidebar — отдельно). Проводка: `section-titles.ts` для подроутов `/sales-plan/products` и `/sales-plan/purchases`.

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
| STOCK-21 | Phase 14 | Complete |
| STOCK-22 | Phase 14 | Complete |
| STOCK-23 | Phase 14 | Complete |
| STOCK-24 | Phase 14 | Complete |
| STOCK-25 | Phase 14 | Complete |
| STOCK-26 | Phase 14 | Complete |
| STOCK-27 | Phase 14 | Complete |
| STOCK-28 | Phase 14 | Complete |
| STOCK-29 | Phase 14 | Complete |
| ORDERS-01 | Phase 15 | Complete |
| ORDERS-02 | Phase 15 | Complete |
| ORDERS-03 | Phase 15 | Complete |
| STOCK-30 | Phase 16 | Pending |
| STOCK-31 | Phase 16 | Pending |
| STOCK-32 | Phase 16 | Pending |
| STOCK-33 | Phase 16 | Pending |
| STOCK-34 | Phase 16 | Pending |
| STOCK-35 | Phase 16 | Pending |
| STOCK-36 | Phase 16 | Complete (Plan 16-05) |
| STOCK-37 | Phase 16 | Complete |

---
*Defined: 2026-04-05 | 72 requirements | 7 phases*
*Milestone v1.1 added: 2026-04-17 | +40 requirements (SUP-01..SUP-40) | 6 new phases planned (Phase 8..13)*
*Milestone v1.2 added: 2026-04-21 | +29 requirements (STOCK-01..STOCK-29) | 1 new phase planned (Phase 14)*
*Phase 15 added: 2026-04-22 | +3 requirements (ORDERS-01..ORDERS-03) | extends Phase 14 with per-warehouse orders*
*Phase 16 added: 2026-04-22 | +8 requirements (STOCK-30..STOCK-37) | per-size breakdown в /stock/wb + sync bug fix*
*Phase 25 added: 2026-07-04 | +14 requirements (SP-01..SP-14) | План продаж v2 — рабочий план H2-2026 (план/факт/ИУ, помесячные уровни, виртуальные закупки, версионирование, ПДДС-контракт)*
