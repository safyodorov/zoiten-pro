# Zoiten ERP

Корпоративная мини-ERP система для компании Zoiten (торговля на маркетплейсах).

## Домен & Хостинг

- **Домен**: zoiten.pro, SSL через Let's Encrypt
- **URL**: https://zoiten.pro
- **VPS**: root@85.198.97.89 (key-based SSH auth)
- **Порт**: 3001 (bozon.pro занимает 3000)

## Stack

- **Framework**: Next.js 15.5.14 (App Router, TypeScript, React 19)
- **Database**: PostgreSQL 16 + Prisma 6
- **UI**: shadcn/ui v4 (base-nova) + Tailwind v4 + motion 12.x + Three.js (3D)
- **Theme**: next-themes (light/dark), оранжево-красный accent (oklch hue 28-30)
- **Auth**: Auth.js v5 (credentials provider, JWT)
- **Deploy**: systemd + nginx reverse proxy → localhost:3001
- **WB API**: Wildberries Content + Prices + Statistics + Analytics + Tariffs API

## Аутентификация

- Суперадмин: sergey.fyodorov@gmail.com / stafurovonet
- RBAC — ролевой доступ к разделам

## Разделы ERP

1. **Товары** ✅ полный CRUD, фото, артикулы, штрих-коды, размеры, мягкое удаление
2. **Карточки товаров** ✅ WB синхронизация через API, таблица с фильтрами, привязка к товарам + заглушка Ozon
3. Управление ценами (заглушка)
4. Недельные карточки (заглушка)
5. Управление остатками (заглушка)
6. **Себестоимость партий** ✅ отдельная БД, inline-редактирование, фильтры
7. План закупок (заглушка)
8. План продаж (заглушка)
9. Служба поддержки (из https://github.com/safyodorov/ai-cs-zoiten)
10. **Сотрудники** ✅ полный CRUD, таблица с фильтрами/сортировкой, модалка, экспорт XLSX
11. **Пользователи** ✅ привязка к справочнику Сотрудники, роли per раздел (VIEW/MANAGE), генератор паролей

## Дизайн

- **Landing**: Glassmorphism стиль — стеклянные карточки, анимированные градиентные блобы (6 орбов, CSS keyframes), адаптивный (mobile/desktop)
- **Тема**: светлая по умолчанию, переключатель light/dark в header (next-themes)
- **Палитра**: оранжево-красный accent (oklch hue 28-30), вдохновлён Claude Code
- **Favicon**: логотип Zoiten (SVG interlocking circles), ICO/PNG/SVG
- **Dashboard**: Lucide иконки, карточки с hover-эффектами
- **Sidebar**: свёртываемый (w-56 ↔ w-16), persist в `localStorage` (`zoiten.sidebar.collapsed`), в свёрнутом виде только иконки + tooltip через `title` attr. Кнопка toggle (`PanelLeftClose/Open`) в левой части header
- **Header**: название текущего раздела по `pathname` (через `getSectionTitle` из `section-titles.ts`) — h1 убраны из отдельных страниц
- **Auth-aware header**: залогинен → имя + ссылка в dashboard; нет → кнопка «Войти»

### Architecture-важное про layout

`app/(dashboard)/layout.tsx` — RSC, передаёт `<LogoutForm />` (server component с inline server action) в `<DashboardShell>` (client) через ReactNode prop — это рабочий паттерн пропуска server actions через RSC → client boundary. `DashboardShell` содержит `SidebarContext` (collapsed/toggle), Sidebar (client) + Header (client) + main. NAV_ITEMS вынесены в `components/layout/nav-items.ts` (shared между RSC layout и client Sidebar, без циклов импортов).

## Модель данных — Товары

- **УКТ (sku)** — уникальный код товара, формат УКТ-000001. Автоинкремент через PostgreSQL SEQUENCE.
- Наименование (строка до 100 символов)
- Фото (одно, вертикальное 3:4, JPEG/PNG, до 2К)
- Артикулы маркетплейсов (WB, Ozon, ДМ, ЯМ + кастомные, до 10 на маркетплейс)
- Штрих-коды (1-20 на товар)
- Характеристики: вес кг, габариты (Д×Ш×В см), объём (авто из габаритов)
- Бренд, Категория/подкатегория, ABC-статус, Ярлык
- Мягкое удаление (физ. удаление из корзины)

## Связи между таблицами БД

```
User (пользователи ERP)
  ├── firstName / lastName (отдельные поля)
  ├── name (legacy, заполняется автоматически из firstName + lastName)
  ├── employeeId: String? @unique → Employee (1:1, onDelete: SetNull)
  ├── email, password (bcrypt), plainPassword (видимый суперадмином)
  ├── role: SUPERADMIN | MANAGER | VIEWER (общая роль)
  ├── allowedSections: ERP_SECTION[] (DEPRECATED, legacy fallback)
  ├── sectionRoles: UserSectionRole[] (актуальные права per раздел)
  └── isActive: Boolean

UserSectionRole (гранулярные права per раздел)
  ├── userId → User (N:1, onDelete: Cascade)
  ├── section: ERP_SECTION
  ├── role: SectionRole (VIEW | MANAGE)
  └── @@unique([userId, section])

Product (товары) — ЦЕНТРАЛЬНАЯ ТАБЛИЦА
  ├── sku: String @unique         ← УКТ-000001 (PostgreSQL SEQUENCE)
  ├── brand: Brand (N:1)
  ├── category: Category? (N:1)
  ├── subcategory: Subcategory? (N:1)
  ├── articles: MarketplaceArticle[] (1:N, onDelete: Cascade)
  ├── barcodes: Barcode[] (1:N, onDelete: Cascade)
  ├── cost: ProductCost? (1:1, onDelete: Cascade)
  └── deletedAt: DateTime? (soft delete)

WbCard (карточки WB — парсинг из Wildberries API)
  — Связь с Product через nmId → MarketplaceArticle.article (не FK)
  ├── nmId: Int @unique
  ├── priceBeforeDiscount: Float?  (цена до скидки продавца, руб)
  ├── sellerDiscount: Int?         (скидка продавца, %)
  ├── price: Float?                (цена продавца со скидкой, руб)
  ├── discountWb: Float?           (скидка WB / СПП, % с точностью до 0.1)
  ├── clubDiscount: Int?           (скидка WB клуба, %)
  ├── stockQty: Int?               (остаток товара, шт)
  ├── buyoutPercent: Float?        (процент выкупа за месяц, %)
  ├── commFbwStd/commFbsStd: Float? (стандартные комиссии FBW/FBS, %)
  ├── commFbwIu/commFbsIu: Float?  (ИУ комиссии FBW/FBS, %)
  └── rawJson: Json?               (полный ответ API)

WbCommissionIu (индивидуальные условия комиссий — из Excel)
  ├── subjectName: String @unique  (ключ связки с WbCard.category)
  └── fbw, fbs, dbs, express, pickup, booking: Float (%)

Company (справочник компаний)
  └── name: String @unique  (ГЕЙМ БЛОКС, ДРИМ ЛАЙН, ЗОЙТЕН, ПЕЛИКАН ХЭППИ ТОЙС, СИКРЕТ ВЭЙ, ХОУМ ЭНД БЬЮТИ)

Employee (сотрудники)
  ├── lastName, firstName, middleName
  ├── department: Department? (OFFICE/WAREHOUSE)
  ├── gender: Gender? (MALE/FEMALE)
  ├── passNumbers: Int[]      (номера пропусков, 1-10000)
  ├── birthDate, hireDate, fireDate (вычисляются из компаний)
  ├── companies: EmployeeCompany[] (M:N с Company)
  ├── phones: EmployeePhone[] (PERSONAL/WORK, макс 5)
  ├── emails: EmployeeEmail[] (PERSONAL/WORK, макс 5)
  ├── passes: EmployeePass[]  (паспорта)
  └── user: User?             (опциональная учётная запись, 1:1)

EmployeeCompany (связь сотрудник↔компания)
  ├── position, hireDate, fireDate (должность и даты по каждой компании)
  ├── rate: Decimal, salary: Int
  └── документы: trudovoyDogovor, prikazPriema, soglasiePersDannyh, nda, lichnayaKartochka, zayavlenieUvolneniya, prikazUvolneniya
```

## Пользователи и RBAC

### Модель прав
Две роли действуют одновременно:
- **User.role** (`SUPERADMIN | MANAGER | VIEWER`) — общая роль, используется как **пресет** при назначении прав
- **UserSectionRole** — гранулярные права per раздел (`VIEW | MANAGE`), источник истины для проверок

**SUPERADMIN** bypasses всё: `requireSection()` возвращает сразу без проверки `UserSectionRole`.

**Для MANAGER/VIEWER:**
- При смене общей роли в форме автоматически проставляются права ко всем разделам (MANAGER → MANAGE везде, VIEWER → VIEW везде).
- После этого можно точечно переопределить per раздел в таблице: **Нет / Просмотр / Управление**.

### `requireSection(section, minRole)`
```typescript
await requireSection("PRODUCTS")           // достаточно VIEW
await requireSection("PRODUCTS", "MANAGE") // только MANAGE (для write-операций)
```
Иерархия: `MANAGE > VIEW`. Все существующие вызовы без второго аргумента требуют `VIEW` — обратная совместимость сохраняется. Legacy `allowedSections[]` используется как fallback.

### Привязка к сотрудникам
- `User.employeeId` — UNIQUE FK на `Employee` (1:1)
- При создании нового пользователя показывается селектор сотрудников **без учётки** (`where: { user: null }`)
- Имя/Фамилия/email автоподставляются из `Employee` (email dropdown если несколько)
- При удалении сотрудника → `onDelete: SET NULL` (учётка остаётся, но связь обнуляется)
- Два исторических пользователя (до рефакторинга) имеют `employeeId = null` — редактируются вручную

### Пароли
- `User.password` — bcrypt hash (используется для авторизации)
- `User.plainPassword` — plain text, доступен **только суперадмину** через UI (для внутренней ERP)
- Генератор: `lib/password.ts` → `generatePassword(12)` через `crypto.getRandomValues`
- В форме кнопка `Shuffle` → генерация, `Eye` → показать/скрыть

### ⚠ Чеклист при добавлении нового раздела ERP (`ERP_SECTION`)

Добавление раздела затрагивает НЕСКОЛЬКО мест. Пропуск любого = баг. Обязательны:
1. `prisma/schema.prisma` — значение в enum `ERP_SECTION` + миграция (`ALTER TYPE "ERP_SECTION" ADD VALUE`).
2. `lib/sections.ts` — `SECTION_PATHS["/route"]` (middleware RBAC route guard).
3. `components/layout/section-titles.ts` — заголовки раздела в Header.
4. `components/layout/nav-items.ts` — пункт Sidebar.
5. **`lib/section-labels.ts` → `SECTION_OPTIONS`** — ЧАЩЕ ВСЕГО ЗАБЫВАЮТ. Без этой строки раздел НЕ появляется тумблером VIEW/MANAGE в `/admin/users`, и админ не может вручную выдать/снять доступ (раздел виден только SUPERADMIN через bypass). Обязательно добавлять, чтобы доступом можно было управлять руками.
6. (опц.) `app/(dashboard)/dashboard/page.tsx` — карточка раздела на дашборде.

`app/actions/users.ts` правок НЕ требует (`sectionRoles` = `z.record(z.string(), …)` → любой новый section сохраняется после п.1). После выдачи прав получатель ОБЯЗАН перелогиниться (JWT не самообновляется).

## Синхронизация с Wildberries — ВАЖНАЯ СЕКЦИЯ

### Общая архитектура

Три кнопки на странице Карточки товаров → WB:
1. **«Синхронизировать с WB»** — полная синхронизация всех данных
2. **«Скидка WB»** — быстрое обновление только СПП (~45 сек)
3. **«Загрузить ИУ»** — загрузка Excel с индивидуальными условиями комиссий

### Полная синхронизация (`POST /api/wb-sync`)

Порядок вызовов API (важен!):

1. **Content API** (`content-api.wildberries.ru/content/v2/get/cards/list`) — карточки товаров (название, фото, видео, штрихкоды, габариты, ярлыки)
2. **Prices API** (`discounts-prices-api.wildberries.ru/api/v2/list/goods/filter`) — цена до скидки, скидка продавца, цена со скидкой, скидка клуба
3. **Tariffs API** (`common-api.wildberries.ru/api/v1/tariffs/commission`) — стандартные комиссии FBW/FBS по subjectID
4. **Statistics API** (`statistics-api.wildberries.ru/api/v1/supplier/stocks`) — остатки по складам (суммируются по nmId)
5. **Analytics API** (`seller-analytics-api.wildberries.ru/api/v2/nm-report/downloads`) — процент выкупа за месяц (двухэтапный: создать задание → скачать CSV из ZIP)
6. **Скидка WB (СПП)** через curl → card.wb.ru v4 + fallback на Sales API

### Скидка WB (СПП) — КРИТИЧЕСКИ ВАЖНАЯ ЛОГИКА

**Проблема:** WB не даёт СПП через официальный seller API. Нет поля `spp` в Content/Prices API.

**Решение — гибридный подход:**

#### Основной метод: curl → card.wb.ru v4 API (реальное время)
- Endpoint: `GET https://card.wb.ru/cards/v4/detail?nm={nmIds через ;}`
- Возвращает цену покупателя: `sizes[].price.product` (в сотых копейки, делим на 100)
- **Формула:** `СПП % = (1 - цена_покупателя / цена_продавца) × 100`
- Цена продавца берётся из Prices API (`discountedPrice`)

**КРИТИЧЕСКИ ВАЖНО — почему curl:**
- WB блокирует Node.js `fetch()` по TLS fingerprint → 403 Forbidden
- `curl` с VPS проходит нормально (другой TLS fingerprint)
- Поэтому используем `execSync('curl ...')` из Node.js
- Это решение далось тяжело — НЕ МЕНЯТЬ на fetch!

**Точность СПП:** хранится в `WbCard.discountWb` как `Float` с шагом 0.1% (`Math.round(x × 1000) / 10`). Раньше был `Int` — `Math.round` терял до 0.5% в каждой синхронизации, что каскадом искажало `priceAfterWbDiscount` и всю юнит-экономику.

**Ограничения v4 API:**
- Батч максимум **20 артикулов** (30+ блокируется PoW challenge)
- Пауза **3 сек** между батчами
- Первый `size` может не иметь цены — берём через `find(s => s.price?.product)`
- 267 карточек = 14 батчей × 3 сек = ~42 сек

#### Fallback: Statistics Sales API (ретроспектива)
- Endpoint: `GET /api/v1/supplier/sales?dateFrom={месяц_назад}`
- Поле `spp` в каждой продаже — СПП на момент продажи
- Для артикулов без продаж за месяц СПП не будет
- Покрывает ~96 из 267 артикулов (у которых были продажи)

#### Отдельная кнопка «Скидка WB» (`POST /api/wb-sync-spp`)
- Вызывает ТОЛЬКО curl → v4 API (без seller API запросов)
- Цены продавца берёт из БД (уже синхронизированные)
- Быстрее полной синхронизации (~45 сек vs ~2 мин)

### Комиссии

**Стандартные** — из Tariffs API (`paidStorageKgvp` = FBW, `kgvpSupplier` = FBS)
**ИУ** — из загруженного Excel (файл «Индивидуальные условия.xlsx»), хранятся в таблице `WbCommissionIu`, связка по `subjectName` (категория WB)

### WB API токен

- Хранится в `/etc/zoiten.pro.env` как `WB_API_TOKEN`
- Scope: Контент (bit 1), Аналитика (bit 2), Цены (bit 3), Отзывы (bit 5), Статистика (bit 6), Тарифы (bit 7)
- Без scope Продвижения (акции недоступны)

## Управление ценами WB — Phase 7

### Домен

Раздел `/prices/wb` — онлайн-калькулятор юнит-экономики WB карточек. Показывает для каждого Product связанные WbCards с ценовыми строками: Текущая + Regular акции + Auto акции + Расчётные (1-3 слота). Клик по строке → модалка с realtime пересчётом 30 колонок расчёта.

### Модель данных (новые таблицы в Phase 7)

- **AppSetting** (KeyValue) — 7 глобальных ставок: wbWalletPct (2.0), wbAcquiringPct (2.7), wbJemPct (1.0), wbCreditPct (7.0), wbOverheadPct (6.0), wbDefectRatePct (2.0), wbTaxPct (8.0)
- **CalculatedPrice** — расчётные цены пользователя, uniqueness per (wbCardId, slot 1/2/3)
- **WbPromotion** — акции WB с id = promotionID из WB API
- **WbPromotionNomenclature** — связи nmId с акциями (regular через API, auto через Excel)

### Новые поля в существующих таблицах

- `Category.defaultDefectRatePct` — default процент брака per категория (fallback 2%)
- `Subcategory.defaultDrrPct` — default ДРР per подкатегория (fallback 10%)
- `Product.drrOverridePct`, `Product.defectRateOverridePct`, `Product.deliveryCostRub` — per-product overrides
- `Product.buyoutOverridePct`, `clubDiscountOverridePct`, `walletOverridePct`, `acquiringOverridePct`, `commissionOverridePct`, `jemOverridePct`, `creditOverridePct`, `overheadOverridePct`, `taxOverridePct` — 9 per-product override полей (2026-04-16)
- `CalculatedPrice.buyoutPct`, `clubDiscountPct`, `walletPct`, `acquiringPct`, `commissionPct`, `jemPct`, `creditPct`, `overheadPct`, `taxPct`, `costPrice`, `deliveryCostRub` — per-slot override полей (2026-04-16). `drrPct`, `defectRatePct`, `sellerDiscountPct` были ранее.
- `WbCard.avgSalesSpeed7d` — средняя скорость продаж за 7 дней (из Sales API)
- `WbCard.discountWb` — Float с точностью до 0.1% (раньше Int)

### Fallback chain для per-product параметров

**Non-calc строки** (Текущая / Regular / Auto):
- **ДРР:** `Product.drrOverridePct → Subcategory.defaultDrrPct → 10% hardcoded`
- **Брак:** `Product.defectRateOverridePct → Category.defaultDefectRatePct → AppSetting.wbDefectRatePct → 2% hardcoded`
- **Доставка:** `Product.deliveryCostRub → 30₽ hardcoded`
- **Прочие:** `Product.XOverridePct → card.X / rates.wbX → default`

**Расчётные строки** (изолированы от Product overrides!):
- Все параметры: `CalculatedPrice.X → globalValue (source/default)` — БЕЗ Product.XOverride
- Это обеспечивает изоляцию слотов: изменение параметра через Текущую/Акционную строку не утекает в расчётные. Чтобы применить к слоту — редактируй слот напрямую.

Реализовано в `lib/pricing-math.ts` (`resolveDrrPct`, `resolveDefectRatePct`, `resolveDeliveryCostRub` — legacy) и в `app/(dashboard)/prices/wb/page.tsx` (inline resolvers для новых параметров).

### WB Promotions Calendar API

- Base URL: `https://dp-calendar-api.wildberries.ru` (верифицирован Wave 0)
- Rate limit: 10 req / 6 sec → 600ms паузы между запросами, sleep(6000) + retry на 429
- Endpoints: `/api/v1/calendar/promotions`, `/api/v1/calendar/promotions/details`, `/api/v1/calendar/promotions/nomenclatures`
- **Auto-акции:** API возвращает 422 на `/nomenclatures` — данные загружаются через Excel из кабинета WB (D-06)
- **КРИТИЧЕСКИ ВАЖНО — формат query params** (обнаружено при первом запуске на проде):
  - `/details` требует repeated `promotionIDs=1&promotionIDs=2&...` (comma-separated `promotionIDs=1,2` → 400 Invalid query params)
  - `/nomenclatures` требует `inAction=true` (значение `false` → 400 Invalid query params)
- **nginx proxy timeout:** увеличен до `proxy_read_timeout 600s` в `/etc/nginx/sites-enabled/zoiten-pro` — синхронизация акций может занимать 1-3 минуты из-за rate limit WB

### Pure function calculatePricing

`lib/pricing-math.ts` — единственная source of truth для расчёта юнит-экономики. Используется и на сервере (RSC page), и на клиенте (модалка с realtime). Pure, детерминированная, без зависимостей.

**Golden test:** `tests/pricing-math.test.ts` — nmId 800750522 → profit ≈ 567.68 ₽, ROI ≈ 26%, Re продаж ≈ 7%.

### Routes

- `/prices` → redirect на `/prices/wb`
- `/prices/wb` — основной раздел (RSC + клиентские компоненты)
- `/prices/ozon` — заглушка ComingSoon
- `POST /api/wb-promotions-sync` — синхронизация акций (MANAGE)
- `POST /api/wb-promotions-upload-excel` — загрузка Excel auto-акции (MANAGE)

### RBAC

- Read (`/prices/wb` rendering): `requireSection("PRICES")`
- Write (все server actions, sync, upload): `requireSection("PRICES", "MANAGE")`
- Все server actions в `app/actions/pricing.ts` защищены

### Редактируемое название акции

`WbPromotion.displayName` (nullable) — override для UI. WB API sync пишет только `name` и не трогает `displayName`, Excel-загрузка auto-акций тоже не трогает. Render использует `displayName ?? name`. Инлайн-редактирование через `EditablePromoName` в ячейке «Статус цены» (карандаш при hover → input → Enter/Esc). Пустая строка → `null` → восстановление оригинала. Server action `updateWbPromotionDisplayName` с `revalidatePath("/prices/wb")`.

### Семантика planPrice / sellerPrice

`planPrice` из WB Promotions API и из Excel auto-акции = **финальная цена продавца** (после скидки продавца, то что видит покупатель до СПП), НЕ priceBeforeDiscount. `planDiscount` = требуемая скидка продавца (fallback на `card.sellerDiscount` для regular-акций, где planDiscount часто отсутствует). При рендере `priceBeforeDiscount` восстанавливается как `sellerPrice / (1 − sellerDiscountPct/100)`.

`CalculatedPrice.sellerPrice` тоже хранится как финальная цена; есть отдельное поле `sellerDiscountPct` (nullable) — override скидки продавца на уровне слота. В модалке пользователь вводит **Цену продавца** (финальную), priceBeforeDiscount считается автоматически.

### Редактирование параметров в модалке (2026-04-16)

Модалка юнит-экономики позволяет редактировать 13 параметров (Процент выкупа, WB Клуб, Кошелёк, Эквайринг, Комиссия, Тариф Джем, ДРР, Брак, Кредит, Общие расходы, Налог, Доставка, Закупка) + sellerPrice + sellerDiscountPct.

**Кнопки сохранения:**
- **«Сохранить как расчётную цену»** (`saveCalculatedPrice`) — создаёт/перезаписывает выбранный слот 1/2/3. Все параметры записываются как per-slot override. sellerPrice/sellerDiscountPct/costPrice сохраняются ТОЛЬКО через эту кнопку.
- **«Сохранить»** (`saveRowEdits`) — scope определяется типом строки, откуда вошли:
  - Текущая / Regular / Auto → пишется в `Product.XOverride` (через fallback обновляет все non-calc строки товара)
  - Расчётная → пишется только в `CalculatedPrice.X` (только этот слот, другие слоты не трогаются)
  - Disabled если изменились sellerPrice или sellerDiscountPct (они только в новый слот)
  - costPrice silently игнорируется (только через новый слот)

**«↻ Применить глобальные»** — кнопка-иконка справа от каждого поля:
- Только ЛОКАЛЬНО подставляет `row.globalValues[key]` в форму + флаг isReset=true
- Модалка не закрывается
- При ручном вводе в поле флаг снимается
- При нажатии «Сохранить» — если isReset, отправляется `value: null` → сервер обнуляет override на соответствующем уровне (Product.XOverride для non-calc, CalculatedPrice.X для calc)

`row.globalValues` вычисляются на сервере в page.tsx — это fallback chain БЕЗ Product/calc overrides: `card.X / rates.wbX / subcategory-default / hardcoded`.

### Удаление расчётных цен

Чекбокс слева от названия в каждой calc-строке → добавляет calculatedPriceId в Set → в toolbar таблицы появляется «Удалить выбранные (N)». Server action `deleteCalculatedPrices(ids[])` + `revalidatePath`. Клик по чекбоксу через `stopPropagation`, чтобы не открывалась модалка.

### Компоненты

- `GlobalRatesBar` — редактор 7 ставок (включая «Брак») с debounced save (500ms) + `router.refresh()` для мгновенного пересчёта таблицы
- `PricesFilters` — MultiSelect бренд/категория/подкатегория + 2 toggle (Товар с остатком/Весь + Карточки с остатком/без)
- `PriceCalculatorTable` — главная таблица с rowSpan + sticky колонки + indicator strips; заголовки выровнены `text-center` + `align-middle`
- `PricingCalculatorDialog` — модалка юнит-экономики с realtime пересчётом
- `WbPromotionsSyncButton`, `WbAutoPromoUploadButton` — кнопки шапки (сдвинуты `ml-auto` вправо)
- `PromoTooltip` — wrapper shadcn Tooltip с description + advantages

### Testing

Phase 7 добавил vitest в проект. Запуск: `npm run test`. Покрытие:
- `pricing-math.test.ts` — golden test + zero guards
- `pricing-fallback.test.ts` — fallback chain
- `pricing-settings.test.ts` — Zod валидация
- `wb-promotions-api.test.ts` — mocked rate limit
- `excel-auto-promo.test.ts` — реальный fixture парсинг

## VPS заметки

- Zoiten ERP: /opt/zoiten-pro/ → порт 3001, systemd zoiten-erp.service
- bozon.pro: /opt/bozon-pro/ → порт 3000, systemd bozon-pro.service
- CantonFairBot: /opt/CantonFairBot/, systemd cantonfairbot.service
- PostgreSQL 16, БД zoiten_erp, пользователь zoiten
- Nginx: zoiten.pro (SSL) → 3001, bozon.pro (SSL) → 3000
- SSL: Let's Encrypt через certbot, автопродление
- Фото товаров: /var/www/zoiten-uploads/ → nginx /uploads/
- Swap 2GB (RAM 2GB не хватает для npm ci + next build)

## Правила деплоя — ОБЯЗАТЕЛЬНО

Полный цикл каждого изменения: **коммит → push на GitHub → деплой на сервер → синхронизация локальных копий**. GitHub (origin/main) — единственный источник истины; прод деплоится с него (`git pull` внутри deploy.sh). Незапушенные локальные коммиты и устаревшие локальные копии недопустимы (инцидент 2026-07-02: локальная копия отстала на 435 коммитов → дублирующая работа по устаревшему плану + ненужный деплой уронил прод).

1. **Начало сессии:** `git fetch origin && git status -sb`. Если behind — сначала `git pull --ff-only`, потом работа. Незакоммиченные .planning-планы перепроверять против origin/main (могут быть уже реализованы).
2. **Конец работы:** коммит и сразу `git push origin main` — не оставлять незапушенных коммитов.
3. **Деплой — только после push и только через nohup** (обрыв SSH мид-билда стирает прод-сборку):
   `ssh root@85.198.97.89 "cd /opt/zoiten-pro && nohup bash deploy.sh > /var/log/zoiten-deploy.log 2>&1 &"`
   Затем следить за логом до `==> Done` и проверить `curl https://zoiten.pro` → 200.
4. **Перед деплоем:** `df -h /` — минимум 5GB свободно (`/var/backups` склонен разрастаться); не деплоить, если origin/main уже на проде.

## Architecture

```
app/
├── (auth)/login/            ← страница логина
├── (dashboard)/             ← защищённые страницы (RBAC)
│   ├── dashboard/           ← главная после логина
│   ├── products/            ← товары CRUD + фильтры
│   ├── cards/wb/            ← карточки WB (таблица, синхронизация)
│   ├── cards/ozon/          ← карточки Ozon (заглушка)
│   ├── batches/             ← себестоимость партий
│   ├── admin/users/         ← управление пользователями
│   ├── admin/settings/      ← бренды, категории, маркетплейсы (DnD)
│   ├── employees/           ← сотрудники CRUD + фильтры + экспорт XLSX
│   └── [stubs]/             ← заглушки будущих модулей
├── api/
│   ├── auth/[...nextauth]/  ← Auth.js route handler
│   ├── upload/              ← загрузка фото (multipart)
│   ├── uploads/[...path]/   ← dev-only отдача фото
│   ├── wb-sync/             ← полная синхронизация карточек WB
│   ├── wb-sync-spp/         ← быстрая синхронизация только СПП
│   ├── wb-commission-iu/    ← загрузка Excel с ИУ комиссиями
│   ├── employees-export/    ← экспорт сотрудников в XLSX
│   └── cron/purge-deleted/  ← авто-удаление через 30 дней
├── actions/
│   ├── products.ts          ← CRUD товаров (с генерацией SKU)
│   ├── cost.ts              ← upsert себестоимости
│   ├── reference.ts         ← CRUD + reorder брендов/категорий/маркетплейсов
│   ├── users.ts             ← CRUD пользователей
│   ├── wb-cards.ts          ← создание товаров из WB карточек
│   └── employees.ts         ← CRUD сотрудников (с nested relations)
└── page.tsx                 ← landing page

lib/
├── auth.ts                  ← Auth.js полная конфигурация
├── auth.config.ts           ← Auth.js Edge-safe конфиг
├── prisma.ts                ← PrismaClient singleton
├── rbac.ts                  ← requireSection(), requireSuperadmin()
├── sections.ts              ← URL → ERP_SECTION mapping (Edge-safe)
├── wb-api.ts                ← ВСЯ ЛОГИКА WB API (Content, Prices, Statistics, Analytics, Tariffs, v4 curl)
└── utils.ts                 ← cn() для Tailwind

components/
├── cards/                   ← WbCardsTable, WbFilters, WbSyncButton, WbSyncSppButton, WbUploadIuButton, CardsTabs
├── products/                ← ProductsTable, ProductForm, PhotoUploadField, PhotoCropDialog, ProductFilters
├── cost/                    ← CostTable, CostFilters, CostSearchInput
├── employees/               ← EmployeesTable, EmployeeFilters, EmployeeModal
├── settings/                ← BrandsTab, CategoriesTab, MarketplacesTab, SortableList, SettingsTabs
├── landing/variants/        ← GlassmorphismLanding (главная страница)
├── layout/                  ← Sidebar, NavLinks, Header
├── theme-provider.tsx       ← next-themes ThemeProvider
├── theme-toggle.tsx         ← Sun/Moon переключатель темы
└── ui/                      ← shadcn компоненты

middleware.ts                ← RBAC route guard (Edge runtime)
```

## Conventions

- **Язык**: русский (интерфейс, комментарии, планы)
- **Server Actions**: "use server" + requireSection() + try/catch + revalidatePath
- **Select**: native HTML select (НЕ base-ui Select)
- **Combobox**: кастомный CreatableCombobox
- **Фильтры**: MultiSelectDropdown с чекбоксами
- **Время**: Moscow timezone
- **SKU**: `$queryRaw SELECT nextval('product_sku_seq')` внутри транзакции
- **WB v4 API**: ТОЛЬКО через `execSync('curl ...')`, НЕ через Node.js fetch (TLS fingerprint блокировка)

## Sticky data-таблицы (pattern)

**Применяется к:** `/stock`, `/stock/wb`, `/prices/wb`, `/cards/wb` и всем таблицам со sticky header + scroll.

- **НЕ использовать shadcn `<Table>` / `<TableHeader>` / `<TableRow>` в шапке** — `<Table>` оборачивает `<table>` во внутренний overflow-контейнер (ломает sticky), `<TableHeader>` даёт `[&_tr]:border-b` (мельтешение при scroll), `<TableRow>` имеет hover/transition (мерцание).
- **Использовать:**
  - `<div className="overflow-auto h-full">` — единственный scroll-контейнер
  - `<table className="w-full border-separate border-spacing-0">` (или с `table-fixed` если нужен resize)
  - `<thead className="bg-background">` — сплошной фон блокирует просвечивание
  - `<tr>` (прямой HTML) в шапке, не `<TableRow>`
  - `<TableHead>` cells с `sticky top-0 z-20 bg-background border-b`
  - Body: `<TableBody>` + `<TableRow>` (от shadcn — там hover OK)
- **Flex layout для sticky:** `h-full flex flex-col` → `flex-1 min-h-0` → таблица сама вычисляет высоту. НЕ использовать `h-[calc(100vh-Npx)]`.
- **СПЛОШНОЙ фон на КАЖДОЙ sticky-ячейке (header И frozen-колонки И подытоги/итоги):** только `bg-background`/`bg-muted`/`bg-card` БЕЗ модификатора прозрачности. `bg-muted/40`, `bg-muted/60`, `bg-muted/30` на sticky-ячейке → прокручиваемый контент просвечивает сквозь зафиксированную часть (тема: `--background`/`--muted`/`--card` непрозрачны, но `/NN` добавляет alpha). Это повторяющийся баг — для подсветки подытогов/итогов использовать сплошной `bg-muted` (не `/40`). Hover (`hover:bg-muted/30` на `<tr>`) безопасен только потому, что sticky-`<td>` перекрывает его своим сплошным фоном. ⚠ `components/finance-models/{ScenarioMatrix,ProductsTable,MetricsTable}.tsx` ещё используют `bg-muted/60`/`/40` на sticky — текут, ждут фикса. Подробно: [memory/project_zoiten_sticky_opaque_bg.md](../../Users/User/.claude/projects/c--Users-User-zoiten-pro/memory/project_zoiten_sticky_opaque_bg.md)

### Форматирование чисел (Д, Об, остатки)

- **Д (дефицит):** всегда `Math.trunc(n)` (integer, отбрасывание дробной части, правильно для negative).
- **Об (оборачиваемость):** всегда `Math.trunc(n)`.
- **Остатки (stockQty):** всегда integer (`Math.trunc(n)`).
- **О/З (остатки / заказы)** в stock: `n < 10 ? toFixed(1) : Math.floor(n)`.

### Формула дефицита

`Д = (норма × З) − О` (БЕЗ коэффициента 0.3, убран 2026-04-22). Порог жёлтого = `норма × З`.

### Иерархия границ между группами

Когда в таблице несколько уровней группировки (кластер → склады; product → nmId):
- **Inter-group** (между группами) — `border-r` (полный цвет)
- **Intra-group** (внутри группы) — `border-r border-r-border/40` (40% прозрачности)

Пример: между кластерами ЦФО | ПФО — жирная; между складами внутри ЦФО — тонкая.

### Product-level cell в таблице с mixed rowSpan

**НЕ использовать** `rowSpan=rowSpan + align-top` для Product-level значения (Иваново, SKU и т.п.) в таблице, где соседние колонки имеют отдельные h-8 cells — число прижмётся к верху большой ячейки и выпадет из линии с соседями.

**Правильно:** cell в Сводной строке (h-8 default middle-align) + placeholder `—` в per-item строках.

Подробно: [memory/project_zoiten_table_pattern.md](../../Users/User/.claude/projects/C--Claude/memory/project_zoiten_table_pattern.md)

## Каскадные фильтры в product-таблицах (pattern)

**Применяется к:** `/products`, `/cards/wb`, `/prices/wb`, `/stock`, `/stock/wb` — везде где список товаров.

Порядок фильтров: **Направление → Бренд → Категория → Подкатегория**. Каждый dropdown справа сужает опции под выбор родителя (client-side фильтрация). При смене родительского фильтра — невалидные дочерние выборы тихо вычищаются из URL.

**В page.tsx запрашивай FK-поля у dependent сущностей:**
```typescript
prisma.brand.findMany({ select: { id, name, directionId } })
prisma.category.findMany({ select: { id, name, brandId } })
prisma.subcategory.findMany({ select: { id, name, categoryId } })
```

**В where Prisma:**
```typescript
if (filters.directionIds?.length) {
  where.brand = { directionId: { in: filters.directionIds } }
}
```

**В UI компоненте** — паттерн `setDirections/setBrands/setCategories`: при изменении проверяй сохранённые выборы детей и оставляй только валидные. Канонический образец — [components/products/ProductFilters.tsx](components/products/ProductFilters.tsx).

**Исключение** `/cards/wb`: Brand и Category — это значения текстовых полей `WbCard.brand`/`WbCard.category` (WB-классификация, не наши FK). Каскад делается через distinct `(brand, category)` пар вместо JOIN'ов.

## Глобальная иерархическая сортировка товаров (pattern)

Все product-таблицы используют единый orderBy: **Направление.sortOrder → Бренд.sortOrder → Категория.sortOrder → Подкатегория.sortOrder → name (RU алфавит внутри уровня)**.

`sortOrder` каждого уровня настраивается через DnD в `/admin/settings` (Направления / Бренды / Категории / Подкатегории). Pages только применяют — порядок настраивается **глобально**, не per-page.

**В RSC page:**
```typescript
import { PRODUCT_HIERARCHY_ORDER_BY } from "@/lib/product-order"
prisma.product.findMany({ orderBy: PRODUCT_HIERARCHY_ORDER_BY })
```

**Для in-memory sort уже собранных групп** (например `/prices/wb` где product загружается через MarketplaceArticle):
```typescript
import { compareProductsByHierarchy } from "@/lib/product-order"
groups.sort((a, b) => compareProductsByHierarchy(a.product, b.product))
```

Применено в: `/products`, `/prices/wb`, `/stock` (через `lib/stock-data.ts`), `/stock/wb` (через `lib/stock-wb-data.ts`), `/batches`. Nullable relations (brand.direction, category, subcategory) сортируются с null в конец.

## Phase 17: Свойства товаров + Размерная сетка + Barcode↔ProductSize

**Модель:**
- `ProductDirection { id, name, sortOrder, hasSizes Boolean }` — справочник направлений (один Direction → N брендов через `Brand.directionId String?` nullable FK)
- `CategoryProperty { categoryId, name, kind: STRING|ENUM|NUMBER, options String[], wbAttrName String? }` — EAV-определение свойства per Категория. wbAttrName используется для авто-импорта из WB `characteristics[].name`.
- `ProductPropertyValue` — значение свойства per товар, `@@unique([productId, propertyId])`. value всегда String (multi-value хранится через ", ").
- `ProductSize { productId, value, sortOrder }` — размер как отдельная сущность, под будущие per-size остатки/продажи. `@@unique([productId, value])`.
- `Barcode.productSizeId String?` — nullable FK на ProductSize. WB-импорт привязывает barcode к размеру через `WbCard.rawJson.sizes[].skus[]`.

**WB Content API парсинг (`lib/wb-api.ts:parseCard`):**
- `characteristics: WbCharacteristicRaw[] | null` → сохраняется в `WbCard.characteristics Json?`
- `sizes[].techSize` → `WbCard.techSizes String[]` (фильтр `"0"` для one-size товаров)
- `value` в characteristics может быть `string | number | string[] | number[]` — нормализуется через `normalizeWbCharacteristicValue()` в строку

**Critical decision:** WB-импорт в Product (свойства + размеры) делается **только** по explicit user action через кнопку «Импортировать из WB» в форме товара ([WbImportDialog](components/products/WbImportDialog.tsx)). `/api/wb-sync` пишет только в `WbCard`. Защита от затирания ручных правок.

**Save order в форме товара** (важно для Barcode↔Size связи):
```
saveProductSizes  → ProductSize records создаются
updateProduct     → Barcode создаётся, productSizeId резолвится из value
saveProductProperties → ProductPropertyValue upsert
```

**Auto-refresh формы после save/import** — через `key={product.id}-{updatedAt}` на `<ProductForm>` в edit page.tsx + явный `tx.product.update({ data: { updatedAt: new Date() } })` в `importFromWb`. Без этого `useForm` не переинициализирует defaultValues после `router.refresh()`.

## Phase 18: Автогенерируемое Product.name + Article rename

**Модель (2026-05-11):**
- `Product.name` → `Product.article` (rename, VARCHAR 100) — короткий артикул производителя
- `Product.name` — новая VARCHAR(255), автогенерируемая по формуле
- `Product.nameOverridden Boolean @default(false)` — флаг ручного редактирования
- `CategoryProperty.includeInName Boolean @default(false)` — флаг включения value в название

**Формула** (`lib/product-name.ts:generateProductName`):
- `Brand.direction.hasSizes=true` (одежда): `[Category] [Subcategory] [...properties с includeInName=true (по sortOrder)] [Article]`
- иначе (бытовая техника / без direction): `[Subcategory ?? Category] [Article]`
- Пустые/null части пропускаются.

**Server-side regenerate** через `regenerateProductName(tx, productId)` ([app/actions/products.ts](app/actions/products.ts)). Вызывается из `createProduct`, `updateProduct`, `duplicateProduct`, `saveProductProperties`, `importFromWb`. Skip если `nameOverridden=true`.

**UI**: `<ProductNameField>` в ProductForm — readonly при `nameOverridden=false` с кнопкой «Редактировать вручную»; editable при `nameOverridden=true` с кнопкой «Сгенерировать автоматически».

**Search updates**: `/products`, `/batches`, `app/actions/wb-cards.ts:searchProducts` — OR-поиск по `name` (составное) + `article` + `sku`.

**WB-импорт в Product создаёт `article = firstCard.name`** (vendorCode из WB), `name` пересчитывается через `regenerateProductName`.

## WB API rate-limit защиты

WB лимиты per-endpoint: **Tariffs 100/час**, **Statistics 5/мин**, **Analytics 3/день**, Prices 10/sec. Без защит — несколько кликов «Sync» подряд → 429 на все endpoints + WB-CDN блокирует IP.

Три защиты в коде:
1. **`retryFetch` helper** в `lib/wb-api.ts` — backoff 1s→5s→15s на 429. Применён к Prices, Tariffs, Statistics, Analytics create, StocksPerWarehouse, OrdersPerWarehouse.
2. **Analytics daily cap** через `AppSetting('wbAnalyticsDailyCounter')` — JSON `{date, count}`, max 3/UTC-сутки. При исчерпании `fetchBuyoutPercent` возвращает пустой Map с warning. Остальная sync продолжает.
3. **UI cooldown 5 минут** в `WbSyncButton.tsx` — localStorage `zoiten.wbSync.lastRun` + live-обратный отсчёт на кнопке.

## Production performance gotchas

- **`<Link prefetch={false}>` обязателен в Sidebar** ([NavLinks.tsx](components/layout/NavLinks.tsx)) — иначе после `revalidatePath` Next.js prefetches все 16 ссылок одновременно → блокирует HTTP/2 navigation queue в браузере → клик встаёт в очередь на 20-30 сек.
- **Списки с size=100+ тоже без prefetch** ([ProductsTable.tsx](components/products/ProductsTable.tsx)) — иначе тот же эффект (100 RSC prefetch на каждый видимый Link).
- **Next.js должен слушать только localhost** — `Environment=HOSTNAME=127.0.0.1` в systemd unit, не `0.0.0.0` (default). Иначе боты долбят порт 3001 напрямую минуя nginx + SSL + rate-limit и засирают логи `Failed to find Server Action "x"`. Подтверждено diagnostic: [.planning/debug/failed-to-find-server-action.md](.planning/debug/failed-to-find-server-action.md). UFW активен с allow 22/80/443/8502.
- **`commit -am` НЕ берёт untracked файлы** — используй `git add -A && git commit -m ...` если в коммите новые файлы.

## Per-user UI настройки

Фильтры, скрытые колонки, сортировки и т.п., персистящиеся за пользователем:
- **Поле прямо на `User`** (`Int[]`, `String` и т.п.) с `@default([])` — НЕ отдельная `UserPreference` таблица для v1
- **НЕ localStorage** — теряется при смене браузера/устройства
- **RBAC без MANAGE** — `requireSection("X")` (user меняет только свою настройку)
- **Optimistic** — `useState` + `useTransition` + `revalidatePath` на сервере
- **Визуальный фильтр только** — data helpers и агрегаты считают по полному набору

Первое применение: `User.stockWbHiddenWarehouses Int[]` (quick 260422-oy5, /stock/wb).

Подробно: [memory/project_zoiten_per_user_prefs.md](../../Users/User/.claude/projects/C--Claude/memory/project_zoiten_per_user_prefs.md)

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work
