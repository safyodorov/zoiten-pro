---
phase: 17
slug: product-properties-sizes
name: Свойства товаров + Размерная сетка
status: planned
created: 2026-05-11
depends_on: [4, 16, 17-pre]
unblocks: [future-per-size-stock, future-per-size-sales]
---

# Phase 17 — Свойства товаров + Размерная сетка

## Goal

Менеджер открывает форму редактирования товара одежды → видит динамические поля «Пол», «Цвет» (характеристики, определяемые на уровне Категории) → жмёт «Импортировать из WB» — они автозаполняются из карточки Wildberries. Отдельная секция «Размерная сетка» — список размеров (S/M/L/46/48...) тоже подтягивается из WB. В будущих фазах остатки и продажи строятся per-размер; сейчас просто фиксируем размер как первоклассную сущность с уникальным ID.

## Scope

**In scope (v1):**
- Модель `CategoryProperty` (EAV): свойства определяются per Категория, типы STRING/ENUM/NUMBER + опциональный `wbAttrName` для маппинга на WB characteristics.
- Модель `ProductPropertyValue`: значение свойства per товар (unique по productId+propertyId).
- Модель `ProductSize`: размер как отдельная запись 1:N к Product (под будущие per-size остатки/продажи).
- Флаг `ProductDirection.hasSizes`: контролирует видимость секции «Размерная сетка» в форме.
- Расширение `WbCard`: `characteristics Json?` (массив `{id,name,value}` из WB Content API) + `techSizes String[]` (размеры из WB `sizes[]`).
- WB sync (`/api/wb-sync`) парсит и сохраняет `characteristics`/`techSizes` в WbCard.
- Кнопка «Импортировать из WB» в форме товара — копирует свойства/размеры из основной (sortOrder=0 WB MarketplaceArticle) карточки в товар. **Не** перезатирает руками введённые значения автоматически — это explicit user action.
- UI Settings → раздел «Категории» получает inline-CRUD для CategoryProperty.
- UI Settings → раздел «Направления» получает чекбокс `hasSizes`.
- UI ProductForm → новая секция «Свойства» (динамическая по CategoryProperty[categoryId]) после Подкатегории.
- UI ProductForm → новая секция «Размерная сетка» после Свойств, видимая только если `brand.direction?.hasSizes === true`.

**Out of scope (deferred):**
- Per-размер остатки и продажи (отдельная фаза в milestone v1.3+).
- Per-размер barcode / weight / dimensions (расширение `ProductSize` в будущих фазах — оставлены только value+sortOrder).
- Bulk-импорт свойств для всех товаров категории сразу (только на уровне отдельного товара).
- Auto-sync свойств при каждом /api/wb-sync (manual только — по решению D-03).

## Key Decisions

**D-01 (Привязка свойств):** к **Категории** (не Направлению). Причина: пользователь может захотеть разные свойства внутри одного направления (Одежда → Обувь.размер_стопы vs Одежда → Брюки.рост). Текущая реализация — одно свойство на одну категорию, в будущем при необходимости можно сделать «наследование» от родительской категории.

**D-02 (Флаг размеров):** `hasSizes` на **Направлении** (ProductDirection.hasSizes). Причина: размеры — глобальная характеристика «у этого направления вообще есть размеры или нет» (одежда — да, бытовая техника — нет). Per-категория детализация (например «Аксессуары без размеров внутри Одежды») пока не нужна.

**D-03 (WB sync стратегия):** автоматический парсинг в WbCard (NEW поля), но **запись в Product только по explicit user action** (кнопка «Импортировать из WB» в форме). Причина: защита от затирания ручных правок. Cost: пользователь должен явно нажать после каждой смены WB-карточки.

**D-04 (Размер = отдельная сущность):** `ProductSize` 1:N к Product (НЕ массив строк в Product). Причина: размер должен иметь стабильный ID для будущих агрегаций (остатки, продажи). Сейчас минимальный набор полей (value, sortOrder), расширение в будущих фазах.

**D-05 (Маппинг WB characteristics → CategoryProperty):** через `CategoryProperty.wbAttrName String?`. Например `name="Пол"`, `wbAttrName="Пол"` — при импорте ищем в `WbCard.characteristics[]` запись с `name="Пол"`, берём `value`. Без `wbAttrName` свойство только ручное.

**D-06 (Тип PropertyKind):** enum `STRING | ENUM | NUMBER`. STRING — свободный ввод. ENUM — выбор из `options[]`. NUMBER — число (для будущих свойств типа «мощность»). Все хранятся как string в `ProductPropertyValue.value` — приведение типа при чтении.

**D-07 (UI: где CRUD CategoryProperty):** внутри существующего таба «Категории» в `/admin/settings` — раскрытие категории показывает её подкатегории + свойства. Минимизирует количество табов.

## Success Criteria

1. Открывая `/products/{id}/edit` для товара бренда Men's Factor (направление Одежда, у направления `hasSizes=true`), пользователь видит после Подкатегории секцию «Свойства» с полями «Пол» (ENUM) и «Цвет» (STRING) и секцию «Размерная сетка» со списком размеров.
2. У товара бренда Zoiten (направление «Бытовая техника», `hasSizes=false`) секции «Размерная сетка» нет.
3. В `/admin/settings → Категории` суперадмин может для категории «Брюки» добавить свойство «Пол» kind=ENUM options=["мужской","женский","унисекс"] wbAttrName="Пол", и оно сразу появится в форме товара этой категории.
4. После /api/wb-sync (manual click) `WbCard.characteristics` и `WbCard.techSizes` заполнены для всех карточек. Тестовый nmId (любой из 273 в БД) → curl prod → `characteristics IS NOT NULL`.
5. В форме товара кнопка «Импортировать из WB» открывает диалог-предпросмотр: показывает какие свойства/размеры подтянутся из WbCard основного nmId → юзер подтверждает → значения записываются.
6. Размер сохраняется как отдельная запись ProductSize (можно увидеть в `psql`: `SELECT * FROM "ProductSize" WHERE "productId"='...'`).
7. Категория с привязанными CategoryProperty не удаляется (или удаляется с каскадным удалением свойств — TBD в плане).
8. ProductPropertyValue имеет `@@unique([productId, propertyId])` — upsert при сохранении (не дубли).

## Plans

- [ ] 17-01-PLAN — Foundation: Prisma schema + миграция + парсинг WB characteristics/sizes + Wave 0 fixture
- [ ] 17-02-PLAN — Settings UI: CRUD CategoryProperty (в CategoriesTab) + hasSizes toggle в DirectionsTab + server actions
- [ ] 17-03-PLAN — Product UI: динамическая секция «Свойства» + секция «Размерная сетка» + кнопка «Импортировать из WB» + server actions для импорта

**Параллелизация:** 17-01 блокирует всё. После 17-01 → (17-02 || 17-03) параллельно.

## Risks / Open Questions

- **R-01 (формат WB characteristics):** структура `value` в WB Content API может быть строкой ИЛИ массивом строк (для multi-select свойств вроде «Состав ткани»). Wave 0: проверить на реальной prod БД у одного nmId Men's Factor.
- **R-02 (размеры одного товара = разные карточки):** товар имеет 2 WB-карточки (sortOrder=0,1) с разными `techSizes` (например M,L и L,XL). По D-03 берём только sortOrder=0. Если у юзера будет противоречие — UI должен показать «На карточке 2 другие размеры, конфликт» (deferred к v2).
- **R-03 (cascade при удалении категории):** при `DELETE Category` → CategoryProperty каскадно удаляются (`onDelete: Cascade`), значит ProductPropertyValue тоже (нет orphan). Подтверждено в schema.
- **R-04 (нет local prisma):** локально нельзя проверить prisma generate → деплой на VPS = source of truth. Mitigation: миграция отдельно тестируется через `prisma migrate diff` на VPS.
