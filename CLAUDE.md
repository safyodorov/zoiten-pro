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

## Дизайн

- **Landing**: Glassmorphism стиль — стеклянные карточки, анимированные градиентные блобы (6 орбов, CSS keyframes), адаптивный (mobile/desktop)
- **Тема**: светлая по умолчанию, переключатель light/dark в header (next-themes)
- **Палитра**: оранжево-красный accent (oklch hue 28-30), вдохновлён Claude Code
- **Favicon**: логотип Zoiten (SVG interlocking circles), ICO/PNG/SVG
- **Dashboard**: Lucide иконки, карточки с hover-эффектами
- **Sidebar**: иконки + текст, фиолетовый → оранжевый primary, CSS variables
- **Auth-aware header**: залогинен → имя + ссылка в dashboard; нет → кнопка «Войти»

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
  ├── discountWb: Int?             (скидка WB / СПП, %)
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
  └── passes: EmployeePass[]  (паспорта)

EmployeeCompany (связь сотрудник↔компания)
  ├── position, hireDate, fireDate (должность и даты по каждой компании)
  ├── rate: Decimal, salary: Int
  └── документы: trudovoyDogovor, prikazPriema, soglasiePersDannyh, nda, lichnayaKartochka, zayavlenieUvolneniya, prikazUvolneniya
```

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

## VPS заметки

- Zoiten ERP: /opt/zoiten-pro/ → порт 3001, systemd zoiten-erp.service
- bozon.pro: /opt/bozon-pro/ → порт 3000, systemd bozon-pro.service
- CantonFairBot: /opt/CantonFairBot/, systemd cantonfairbot.service
- PostgreSQL 16, БД zoiten_erp, пользователь zoiten
- Nginx: zoiten.pro (SSL) → 3001, bozon.pro (SSL) → 3000
- SSL: Let's Encrypt через certbot, автопродление
- Фото товаров: /var/www/zoiten-uploads/ → nginx /uploads/
- Swap 2GB (RAM 2GB не хватает для npm ci + next build)
- Деплой: `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"`

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

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work
