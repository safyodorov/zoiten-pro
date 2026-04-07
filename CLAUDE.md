# Zoiten ERP

Корпоративная мини-ERP система для компании Zoiten (торговля на маркетплейсах).

## Домен & Хостинг

- **Домен**: zoiten.pro ✅ привязан, SSL через Let's Encrypt
- **URL**: https://zoiten.pro
- **VPS**: root@85.198.97.89 (key-based SSH auth)
- **Порт**: 3001 (bozon.pro занимает 3000)
- **Слоган**: "Время для жизни, свобода от рутины"

## Stack

- **Framework**: Next.js 15.5.14 (App Router, TypeScript, React 19)
- **Database**: PostgreSQL 16 + Prisma 6
- **UI**: shadcn/ui v4 (base-nova) + Tailwind v4 + motion 12.x
- **Auth**: Auth.js v5 (credentials provider, JWT)
- **Deploy**: systemd + nginx reverse proxy → localhost:3001
- **WB API**: Wildberries Content API + Prices API (lib/wb-api.ts)

## Аутентификация

- Суперадмин: sergey.fyodorov@gmail.com / stafurovonet
- Суперадмин создаёт пользователей, назначает логин/пароль, даёт доступ к разделам
- RBAC — ролевой доступ к разделам

## Разделы ERP

1. **Товары** ✅ полный CRUD, фото, артикулы, штрих-коды, размеры, мягкое удаление
2. **Карточки товаров** ✅ WB синхронизация через API, таблица с фильтрами, привязка к товарам + заглушка Ozon
3. Управление ценами (заглушка)
4. Недельные карточки (заглушка)
5. Управление остатками (заглушка)
5. **Себестоимость партий** ✅ отдельная БД, inline-редактирование, фильтры
6. План закупок (заглушка)
7. План продаж (заглушка)
8. Служба поддержки (из https://github.com/safyodorov/ai-cs-zoiten)

## Модель данных — Товары

- **УКТ (sku)** — уникальный код товара, формат УКТ-000001. Автоинкремент через PostgreSQL SEQUENCE (не сбивается при удалении). Присваивается автоматически при создании. Read-only.
- Наименование (строка до 100 символов)
- Фото (одно, вертикальное 3:4, JPEG/PNG, до 2К)
- Артикулы маркетплейсов (WB, Ozon, ДМ, ЯМ + кастомные, до 10 на маркетплейс)
- Штрих-коды (1-20 на товар)
- Характеристики: вес кг, габариты (Д×Ш×В см), объём (авто из габаритов)
- Бренд (по умолчанию Zoiten)
- Категория/подкатегория (настраиваются per бренд, CRUD)
  - Zoiten: Дом, Кухня, Красота и здоровье
- ABC-статус (A, B, C)
- Наличие (есть / out of stock / выведен из ассортимента)
- Мягкое удаление (статус "удалено", физ. удаление через 30 дней)

## Связи между таблицами БД

```
User (пользователи)
  ├── role: SUPERADMIN | MANAGER | VIEWER
  └── allowedSections: ERP_SECTION[]

Brand (бренды)
  └── categories: Category[] (1:N)

Category (категории, per brand)
  ├── brand: Brand (N:1)
  └── subcategories: Subcategory[] (1:N)

Subcategory (подкатегории, per category)
  └── category: Category (N:1)

Marketplace (маркетплейсы: WB, Ozon, ДМ, ЯМ)
  └── articles: MarketplaceArticle[] (1:N)

Product (товары) — ЦЕНТРАЛЬНАЯ ТАБЛИЦА
  ├── sku: String @unique         ← УКТ-000001 (PostgreSQL SEQUENCE)
  ├── brand: Brand (N:1)
  ├── category: Category? (N:1)
  ├── subcategory: Subcategory? (N:1)
  ├── articles: MarketplaceArticle[] (1:N, onDelete: Cascade)
  ├── barcodes: Barcode[] (1:N, onDelete: Cascade)
  ├── cost: ProductCost? (1:1, onDelete: Cascade)
  └── deletedAt: DateTime? (soft delete)

MarketplaceArticle (артикулы по маркетплейсам)
  ├── product: Product (N:1, Cascade)
  └── marketplace: Marketplace (N:1)
  — Partial unique index на (marketplaceId, article) WHERE product not deleted

Barcode (штрих-коды)
  └── product: Product (N:1, Cascade)
  — Partial unique index на value WHERE product not deleted

ProductCost (себестоимость) — ОТДЕЛЬНАЯ ТАБЛИЦА
  ├── product: Product (1:1, Cascade)
  ├── costPrice: Float (руб, с точностью до копеек)
  └── updatedAt: DateTime @updatedAt

WbCard (карточки WB — парсинг из Wildberries API)
  — Связь с Product через артикул nmId (не FK, а через MarketplaceArticle.article)
  ├── nmId: Int @unique
  ├── price: Float? (цена продавца со скидкой)
  ├── discountWb: Int? (скидка WB / СПП, %)
  └── rawJson: Json? (полный ответ API)
```

### Cascade-удаление
При **hard delete** товара (Product) каскадно удаляются:
- Все MarketplaceArticle (артикулы)
- Все Barcode (штрих-коды)
- ProductCost (себестоимость)

## Скидка WB (СПП) — как считается

СПП (Скидка Постоянного Покупателя) — скидка которую WB даёт из своей комиссии. Нет официального API для получения текущей СПП.

**Наш подход** (из проекта [ai-zoiten](https://github.com/safyodorov/ai-zoiten)):

1. **Цена продавца** — из официального Prices API (`discounts-prices-api.wildberries.ru`)
   - Endpoint: `GET /api/v2/list/goods/filter`
   - Поле: `sizes[].discountedPrice` — цена после скидки продавца, в рублях

2. **Цена покупателя** — из публичного card.wb.ru **v4** API
   - Endpoint: `GET /cards/v4/detail?nm={nmId}`
   - Поле: `sizes[].price.product` — финальная цена покупателя, в **сотых копейки** (делить на 100 → рубли)
   - ⚠️ v2 API заблокирован (x-pow proof-of-work), v4 работает

3. **Формула СПП:**
   ```
   СПП % = (1 - цена_покупателя / цена_продавца) × 100
   ```
   Пример: продавец = 700₽, покупатель = 476₽ → СПП = 32%

**Файлы:** `lib/wb-api.ts` → `fetchWbDiscounts()`, `app/api/wb-sync/route.ts`

## Маркетплейсы

- Wildberries (основной)
- Ozon
- ДМ (Детский Мир)
- ЯМ (Яндекс Маркет)
- Возможность добавлять новые

## Бренды компании

- Zoiten (основной)

## VPS заметки

- Zoiten ERP: /opt/zoiten-pro/ → порт 3001, systemd zoiten-erp.service
- bozon.pro: /opt/bozon-pro/ → порт 3000, systemd bozon-pro.service
- CantonFairBot: /opt/CantonFairBot/, systemd cantonfairbot.service
- PostgreSQL 16 установлен, БД zoiten_erp, пользователь zoiten
- Nginx: zoiten.pro (SSL) → 3001, bozon.pro (SSL) → 3000
- SSL: Let's Encrypt через certbot, автопродление
- Фото товаров: /var/www/zoiten-uploads/ → nginx /uploads/
- Cron purge: systemd zoiten-purge.timer (ежедневно 02:00)
- Деплой: ssh + git pull + deploy.sh

## Новые модули (добавлены после MVP)

### Карточки WB
- **Файлы**: lib/wb-api.ts, app/actions/wb-cards.ts, app/api/wb-sync/route.ts
- **Компоненты**: components/cards/ (WbCardsTable, WbFilters, WbSyncButton, CardsTabs)
- **Роут**: /cards/wb (+ /cards/ozon заглушка)
- **API**: WB Content API + Discounts/Prices API + card.wb.ru v4 (публичный, для СПП)
- **Модель**: WbCard в Prisma (с привязкой к Product через артикул)
- **Env**: WB_API_KEY в .env

### Себестоимость партий
- **Файлы**: app/actions/cost.ts, app/(dashboard)/batches/page.tsx
- **Компоненты**: components/cost/ (CostTable, CostFilters, CostSearchInput)
- **Роут**: /batches
- **Модель**: ProductCost в Prisma (1:1 с Product, onDelete: Cascade)
- **Фишка**: inline-редактирование себестоимости (клик → input → Enter → сохранить)
- **Время**: все даты в московском времени (Europe/Moscow)

### УКТ — Уникальный Код Товара
- **Формат**: УКТ-000001 (6 цифр с ведущими нулями)
- **Генерация**: PostgreSQL SEQUENCE `product_sku_seq` (не сбивается при удалении)
- **Поле**: `Product.sku` (String, @unique)
- **Отображение**: только в форме редактирования товара (read-only), НЕ в таблицах
- **Файлы**: prisma/migrations/20260406_add_sku_and_cost/, app/actions/products.ts

### Улучшения формы товаров
- Кроп фото (PhotoCropDialog)
- Поле "Ярлык" (label) на товаре
- Drag-and-drop сортировка справочников (@dnd-kit)
- Порядок габаритов как на WB (Длина × Ширина × Высота)
- Физическое удаление из корзины

## Conventions

- **Язык интерфейса**: русский
- **Server Actions**: "use server" + requireSection()/requireSuperadmin() + try/catch + revalidatePath
- **Формы**: react-hook-form + zod + shadcn Form компоненты
- **Select**: используем native HTML select (НЕ base-ui Select — он ломается с пустыми value)
- **Combobox**: кастомный CreatableCombobox (НЕ base-ui Combobox — x-pow errors)
- **auth.config.ts**: ОБЯЗАТЕЛЬНО содержит jwt/session callbacks (не только auth.ts)
- **middleware.ts**: "/" (landing) исключён из auth проверки
- **Фильтры**: MultiSelectDropdown с чекбоксами (паттерн из WbFilters/ProductFilters)
- **Время**: Moscow timezone через `Intl.DateTimeFormat({ timeZone: "Europe/Moscow" })`
- **SKU генерация**: `$queryRaw SELECT nextval('product_sku_seq')` внутри транзакции

## Architecture

```
app/
├── (auth)/login/         ← страница логина (публичная)
├── (dashboard)/          ← защищённые страницы (RBAC)
│   ├── dashboard/        ← главная после логина
│   ├── products/         ← товары CRUD
│   ├── cards/wb/         ← карточки WB
│   ├── batches/          ← себестоимость
│   ├── admin/users/      ← управление пользователями
│   ├── admin/settings/   ← бренды, категории, маркетплейсы
│   └── [stubs]/          ← заглушки будущих модулей
├── api/
│   ├── auth/[...nextauth]/ ← Auth.js route handler
│   ├── upload/           ← загрузка фото (multipart)
│   ├── uploads/[...path]/ ← dev-only отдача фото
│   ├── wb-sync/          ← синхронизация карточек WB
│   └── cron/purge-deleted/ ← авто-удаление через 30 дней
├── actions/
│   ├── products.ts       ← CRUD товаров (с генерацией SKU)
│   ├── cost.ts           ← upsert себестоимости
│   ├── reference.ts      ← CRUD брендов/категорий/маркетплейсов
│   ├── users.ts          ← CRUD пользователей
│   └── wb-cards.ts       ← привязка WB карточек к товарам
└── page.tsx              ← landing page (публичная, motion анимации)

lib/
├── auth.ts               ← Auth.js полная конфигурация (Node.js)
├── auth.config.ts        ← Auth.js Edge-safe конфиг (для middleware)
├── prisma.ts             ← PrismaClient singleton
├── rbac.ts               ← requireSection(), requireSuperadmin()
├── sections.ts           ← URL → ERP_SECTION mapping (Edge-safe)
├── section-labels.ts     ← русские названия секций
├── wb-api.ts             ← WB Content + Prices + v4 public API
└── utils.ts              ← cn() для Tailwind

middleware.ts             ← RBAC route guard (Edge runtime)
```

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.

## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
