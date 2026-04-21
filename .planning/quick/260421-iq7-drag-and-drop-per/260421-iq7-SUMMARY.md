---
quick_task: 260421-iq7-drag-and-drop-per
type: summary
date: 2026-04-21
duration: 8min
status: complete
one-liner: "Drag-and-drop порядок артикулов маркетплейса + миграция Barcode FK Product→MarketplaceArticle с partial unique per marketplace"
dependency_graph:
  requires:
    - "prisma/migrations/20260405_partial_indexes/migration.sql (существующий old partial unique index — удаляется в новой миграции)"
    - "@dnd-kit/core + @dnd-kit/sortable + @dnd-kit/utilities (уже в deps)"
    - "components/settings/SortableList.tsx (паттерн DnD — изучен, не использован напрямую)"
  provides:
    - "MarketplaceArticle.sortOrder + Barcode.marketplaceArticleId/marketplaceId/productDeletedAt"
    - "Partial unique (marketplaceId, value) WHERE productDeletedAt IS NULL — один GTIN на маркетплейс"
    - "DnD-список артикулов внутри маркетплейса + штрих-коды справа от каждого артикула"
    - "restoreProduct() server action (новая функция)"
  affects:
    - "Любые будущие операции над Barcode: обязателен marketplaceArticleId"
    - "softDelete/restore Product: транзакционно обновляет Barcode.productDeletedAt"
tech-stack:
  added: []
  patterns:
    - "Денормализация Product.deletedAt → Barcode.productDeletedAt (PG не поддерживает subquery в UNIQUE partial index predicate)"
    - "useFieldArray + @dnd-kit (DndContext/SortableContext/useSortable) + useFieldArray.move()"
    - "Nested Prisma create для article + barcodes одним вызовом (createMany не поддерживает nested writes)"
key-files:
  created:
    - "prisma/migrations/20260421_article_sortorder_barcode_fk/migration.sql"
  modified:
    - "prisma/schema.prisma"
    - "app/actions/products.ts"
    - "app/actions/wb-cards.ts"
    - "app/(dashboard)/products/[id]/edit/page.tsx"
    - "components/products/ProductForm.tsx"
    - "deploy.sh"
decisions:
  - "Денормализация Barcode.productDeletedAt вместо subquery в partial unique — PG ограничивает UNIQUE partial index predicate IMMUTABLE-выражениями колонок той же таблицы"
  - "useFieldArray.move() для DnD (не локальный reorder) — RHF сам обновит порядок и индексы, submit возьмёт values.marketplaces в новом порядке"
  - "sortOrder пишется сервером по индексу массива (0..N-1) — избегаем рассинхронизации клиент/сервер"
  - "restoreProduct создан как отдельная функция (ранее не существовала) — симметрия с softDeleteProduct"
  - "duplicateProduct сохраняет sortOrder оригинала через orderBy: sortOrder asc при чтении + i при create, barcodes НЕ копирует (partial unique per marketplace → P2002)"
  - "addCardsToProduct полностью переписан: findUnique include articles.barcodes (без Product.barcodes), per-card sequential create с articleId, дедуп per-marketplace productDeletedAt:null"
metrics:
  duration: "8min"
  completed_at: "2026-04-21T10:54:45Z"
  tasks_completed: 4
  files_touched: 7
  commits: 4
---

# Quick Task 260421-iq7: Drag-and-drop порядок артикулов маркетплейса + Barcode FK → MarketplaceArticle

## Что изменено

### 1. Schema + Migration

**`prisma/schema.prisma`:**
- `MarketplaceArticle`: добавлено `sortOrder Int @default(0)` + back-relation `barcodes Barcode[]`.
- `Barcode`: удалено `productId` и связь с `Product`. Добавлены:
  - `marketplaceArticleId String` + `marketplaceArticle` relation (`onDelete: Cascade`).
  - `marketplaceId String` + `marketplace` relation (денормализация для partial unique).
  - `productDeletedAt DateTime?` — денормализация `Product.deletedAt` для partial unique predicate.
  - `createdAt DateTime`.
- `Product`: удалён back-relation `barcodes Barcode[]` (штрих-коды теперь идут через articles).
- `Marketplace`: добавлен back-relation `barcodes Barcode[]`.

**`prisma/migrations/20260421_article_sortorder_barcode_fk/migration.sql`** (новая миграция, 14 логических шагов):

1. `ALTER TABLE "MarketplaceArticle" ADD COLUMN "sortOrder"`.
2. Backfill `sortOrder` по `ROW_NUMBER() OVER (PARTITION BY productId, marketplaceId ORDER BY createdAt ASC, id ASC)`.
3-6. `Barcode`: `ADD COLUMN marketplaceArticleId/marketplaceId/productDeletedAt/createdAt` (все nullable).
7. Backfill — каждый Barcode привязывается к ПЕРВОМУ (по createdAt ASC) MarketplaceArticle своего Product, `productDeletedAt = Product.deletedAt`.
8. `DELETE FROM "Barcode" WHERE "marketplaceArticleId" IS NULL` (orphan Barcode без MarketplaceArticle). На проде = 0, защита pre-check в `deploy.sh`.
9-10. `SET NOT NULL` на `marketplaceArticleId` и `marketplaceId`.
11. FK constraints: `marketplaceArticleId` (Cascade) + `marketplaceId` (Restrict).
12. `DROP INDEX barcode_value_not_deleted_idx` + `DROP CONSTRAINT Barcode_productId_fkey` + `DROP COLUMN productId`.
13. `CREATE UNIQUE INDEX "Barcode_marketplace_value_active_key" ON "Barcode" ("marketplaceId", "value") WHERE "productDeletedAt" IS NULL` — partial unique БЕЗ subquery.
14. Вспомогательные индексы: `Barcode_marketplaceArticleId_idx`, `Barcode_marketplaceId_value_idx`.

### 2. Server Actions

**`app/actions/products.ts`:**
- Zod schema: `barcodes` теперь внутри `articles`, верхнеуровневый массив удалён. `sortOrder` сервер генерирует из индекса.
- `createProduct`: nested create `articles: { create: [{ ...article, sortOrder: i, barcodes: { create: [{ marketplaceId, value, productDeletedAt: null }] } }] }`.
- `updateProduct`: replace-all. `marketplaceArticle.deleteMany` каскадно удаляет все Barcode через FK `onDelete: Cascade`. Создаёт новые articles+barcodes последовательно (createMany не поддерживает nested).
- `softDeleteProduct`: транзакция — Product.deletedAt=now + `barcode.updateMany({ where: { marketplaceArticle: { productId } }, data: { productDeletedAt: now } })`.
- **Новая функция `restoreProduct`**: симметрия с softDelete, обнуляет `productDeletedAt`.
- `duplicateProduct`: `orderBy: sortOrder asc` при чтении, `sortOrder: i` при создании копии. Barcodes НЕ копируются (partial unique → P2002).
- `handleP2002`: обрабатывает новый target `"marketplaceId,value"` / `Barcode_marketplace_value_active_key` → текст «Штрих-код уже используется в этом маркетплейсе».

**`app/actions/wb-cards.ts`:**
- `createProductFromCards`: упорядочивание `cardsOrdered` по исходному `cardIds`, nested create articles+barcodes, `sortOrder` через инкремент. Дедуп barcode per-marketplace (`marketplaceId: wb, productDeletedAt: null`), не глобально.
- `addCardsToProduct`: полная переработка. `findUnique include: articles (where WB, include barcodes, orderBy sortOrder)`. `existingBarcodeValues` собирается из `product.articles.flatMap(a => a.barcodes)`. Новые articles создаются последовательно `tx.marketplaceArticle.create` с `sortOrder: maxSortOrder + 1 + offset` и nested barcodes. `productDeletedAt` копируется из `product.deletedAt`.

**`app/(dashboard)/products/[id]/edit/page.tsx`:**
- `include` заменён: `articles: { orderBy: { sortOrder: "asc" }, include: { marketplace, barcodes: { orderBy: createdAt asc } } }`. Корневой `barcodes: true` удалён.

### 3. UI

**`components/products/ProductForm.tsx`:**
- Typescript: `ProductArticleDB` получил `sortOrder: number` и `barcodes: BarcodeDB[]`; верхнеуровневый `ProductData.barcodes` удалён.
- Zod formSchema: `barcodes` вложены в `articles`, секция верхнего уровня удалена.
- `groupArticlesWithBarcodes` заменил `groupArticles`: сортировка по `sortOrder`, передача nested barcodes.
- Отдельная секция «Штрих-коды» полностью удалена (вместе с `useFieldArray barcodes` на уровне формы).
- `MarketplaceGroupInline`: оборачивает список артикулов в `DndContext` + `SortableContext` + `verticalListSortingStrategy`, `handleDragEnd` вызывает `useFieldArray.move(oldIndex, newIndex)`.
- Новый компонент `SortableArticleRow` — двухколоночный `grid md:grid-cols-2`: слева drag-handle (`GripVertical` + `{...attributes} {...listeners}`) + поле артикула + кнопка удалить, справа вложенный `useFieldArray` для `barcodes` с Input + X + «+ Добавить штрих-код» (disabled ≥20).
- `onSubmit`: без верхнеуровневого `barcodes`, `toast.warning("Товар без штрих-кодов")` для IN_STOCK с нулём штрих-кодов (не блокирует submit).

### 4. Deploy script

**`deploy.sh`:**
- Загрузка `/etc/zoiten.pro.env` (`set -a; source ...; set +a`) — чтобы `$DATABASE_URL` был доступен для `psql` checks.
- **Pre-check перед `npx prisma migrate deploy`**: `psql -tAc` на orphan Barcode, exit 1 если > 0. Обход через `touch /var/deploy/skip_migrate_precheck`.
- **Post-check после `npx prisma migrate deploy`**: `SELECT COUNT(*) FROM "Barcode" WHERE "marketplaceArticleId" IS NULL` → fail если > 0.

## Коммиты

| Task | Commit  | Описание                                                                    |
| ---- | ------- | --------------------------------------------------------------------------- |
| 1    | bd4997d | Миграция Prisma + schema.prisma                                             |
| 2    | 546443d | Server actions products.ts + wb-cards.ts + edit/page.tsx                    |
| 3    | 456ac16 | ProductForm.tsx — DnD артикулов + штрих-коды справа                         |
| 4    | 9d6fefc | deploy.sh — pre/post migration checks                                       |

## Проверка после деплоя на VPS

1. `bash /opt/zoiten-pro/deploy.sh` — должен вывести:
   - `[260421-iq7] Pre-check orphan barcodes...` → `Orphan barcodes: 0 — миграция безопасна`
   - `Running database migrations...` → `Applied: 20260421_article_sortorder_barcode_fk`
   - `[260421-iq7] Post-migration sanity check...` → `Все штрих-коды привязаны к артикулам`
2. Открыть https://zoiten.pro/products/[id]/edit существующего товара — проверить:
   - Артикулы отображаются с drag-ручкой `GripVertical` слева и штрих-кодами справа (двухколоночный layout).
   - Перетаскивание артикула за drag-ручку меняет порядок; submit сохраняет новый порядок (проверить: после refresh страницы порядок совпадает с последним сохранённым).
   - Добавление/удаление артикула работает.
   - Добавление/удаление штрих-кода внутри артикула работает.
   - Попытка ввести дубль штрих-кода в пределах WB (на этот же или другой товар) → toast «Штрих-код уже используется в этом маркетплейсе».
3. SQL sanity (опционально):
   ```sql
   -- Все Barcode привязаны к MarketplaceArticle?
   SELECT COUNT(*) FROM "Barcode" WHERE "marketplaceArticleId" IS NULL;
   -- → 0

   -- sortOrder уникален внутри (productId, marketplaceId)?
   SELECT "productId", "marketplaceId", COUNT(*), COUNT(DISTINCT "sortOrder")
   FROM "MarketplaceArticle"
   GROUP BY "productId", "marketplaceId"
   HAVING COUNT(*) != COUNT(DISTINCT "sortOrder");
   -- → 0 rows

   -- Partial unique работает per-marketplace, не глобально?
   SELECT "marketplaceId", "value", COUNT(*)
   FROM "Barcode"
   WHERE "productDeletedAt" IS NULL
   GROUP BY "marketplaceId", "value"
   HAVING COUNT(*) > 1;
   -- → 0 rows
   ```
4. WB sync test: `POST /api/wb-sync` — никаких TS/runtime ошибок. Создать/обновить товар через WB карточку — штрих-коды привязаны к конкретному WB артикулу.

## Рекомендации на будущее

- **MarketplaceArticle.isPrimary boolean (v2):** если появится — можно дополнительно защитить инвариант «ровно один primary per marketplace» PG trigger'ом `BEFORE INSERT/UPDATE`. Текущая реализация через `sortOrder=0` проще и достаточна для v1.
- **Автосинхронизация productDeletedAt DB-trigger (v2):** если появится желание убрать дублирование в server action — можно перейти на `AFTER UPDATE ON Product` trigger, обновляющий `Barcode.productDeletedAt` через цепочку. Сейчас денормализация через server action проще, понятнее и не требует migrate.
- **Bulk-reorder API (v2):** если окажется полезно менять `sortOrder` без полного replace-all `updateProduct` — выделить отдельный server action `reorderArticles({ productId, marketplaceId, articleIds: [...] })`, который делает `updateMany` с индексом. Текущая логика достаточна: DnD меняет порядок в форме, submit делает replace-all.

## Deferred Issues

Нет.

## Self-Check: PASSED

- `prisma/migrations/20260421_article_sortorder_barcode_fk/migration.sql` — FOUND
- `prisma/schema.prisma` — MODIFIED, `marketplaceArticleId/sortOrder/productDeletedAt` присутствуют (grep подтвердил)
- `app/actions/products.ts` — MODIFIED, `restoreProduct` экспортируется, softDelete/restore содержат `barcode.updateMany` через `marketplaceArticle: { productId }`
- `app/actions/wb-cards.ts` — MODIFIED, `product.barcodes` отсутствует, nested create через articles
- `app/(dashboard)/products/[id]/edit/page.tsx` — MODIFIED, include articles.barcodes orderBy sortOrder
- `components/products/ProductForm.tsx` — MODIFIED, DnD imports + GripVertical + SortableArticleRow, старая секция «Штрих-коды» удалена
- `deploy.sh` — MODIFIED, pre-check + post-check с ссылкой на задачу 260421-iq7
- Commits: bd4997d, 546443d, 456ac16, 9d6fefc — все присутствуют в `git log`
- `DATABASE_URL=... npx prisma validate` → `valid 🚀`
- `DATABASE_URL=... npx tsc --noEmit` → 0 ошибок
- `bash -n deploy.sh` → SYNTAX OK
