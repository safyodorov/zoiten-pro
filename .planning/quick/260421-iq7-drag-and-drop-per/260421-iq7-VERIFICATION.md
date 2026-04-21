---
phase: 260421-iq7-drag-and-drop-per
verified: 2026-04-21T11:20:00Z
status: passed
score: 12/12 must-haves verified
---

# Quick Task 260421-iq7: Drag-and-drop порядок артикулов Verification Report

**Task Goal:** Товары — drag-and-drop порядок артикулов (первый = основной); штрих-коды привязаны к конкретному MarketplaceArticle (было: к Product); уникальность штрих-кода per marketplace через денормализацию productDeletedAt; UI — «артикул + его штрих-коды справа».

**Verified:** 2026-04-21T11:20:00Z
**Status:** PASSED
**Re-verification:** Нет — initial verification

## Goal Achievement

### Observable Truths

| #  | Truth | Status | Evidence |
|----|-------|--------|----------|
| 1 | В форме редактирования товара пользователь видит артикулы в сохранённом порядке и может менять перетаскиванием за hamburger | VERIFIED | `ProductForm.tsx:848-870` — DndContext + SortableContext + verticalListSortingStrategy; `SortableArticleRow:913` useSortable; `:948` GripVertical handle с `{...attributes} {...listeners}` |
| 2 | Первый (верхний) артикул после DnD сохраняется как «основной» через sortOrder | VERIFIED | `products.ts:129,209,378` — `sortOrder: i` пишется из индекса массива в create/update/duplicate; `edit/page.tsx:20` — читаем `orderBy: { sortOrder: "asc" }` |
| 3 | Штрих-коды отображаются справа от каждого артикула (двухколоночный блок), отдельная секция удалена | VERIFIED | `ProductForm.tsx:981-1009` — правая колонка «Штрих-коды» внутри SortableArticleRow; отдельного top-level useFieldArray с `name: "barcodes"` не существует (grep подтвердил) |
| 4 | Штрих-код принадлежит конкретному MarketplaceArticle — каскадное удаление | VERIFIED | `schema.prisma:307` — `marketplaceArticle MarketplaceArticle @relation(... onDelete: Cascade)`; migration `:103-106` — FK `ON DELETE CASCADE` |
| 5 | Внутри маркетплейса штрих-код уникален среди активных товаров (partial unique → P2002) | VERIFIED | `migration.sql:126-128` — `CREATE UNIQUE INDEX Barcode_marketplace_value_active_key ON Barcode(marketplaceId, value) WHERE productDeletedAt IS NULL`; `products.ts:65-67` handleP2002 обрабатывает target `marketplaceId,value` |
| 6 | Один GTIN может одновременно существовать как Barcode(WB, X) и Barcode(Ozon, X) | VERIFIED | Индекс включает `marketplaceId` как первую колонку — partial unique per marketplace, не глобально. Miграция `:121-124` явно комментирует семантику |
| 7 | Partial unique через денормализацию productDeletedAt, без subquery в predicate | VERIFIED | `migration.sql:126-128` — predicate `WHERE "productDeletedAt" IS NULL` использует только колонки таблицы Barcode; нет SELECT/EXISTS; `schema.prisma:319` — поле `productDeletedAt DateTime?` присутствует |
| 8 | При soft delete / restore сервер-экшен в транзакции обновляет Barcode.productDeletedAt через цепочку updateMany | VERIFIED | `products.ts:242-269` softDeleteProduct: `tx.barcode.updateMany({ where: { marketplaceArticle: { productId: id } }, data: { productDeletedAt: now } })` внутри `$transaction`; `:278-310` restoreProduct симметрично с `productDeletedAt: null` |
| 9 | В deploy.sh ПЕРЕД prisma migrate deploy pre-check orphan Barcode, fail если > 0; обход через /var/deploy/skip_migrate_precheck | VERIFIED | `deploy.sh:22-43` — pre-check существует ПЕРЕД `:46 npx prisma migrate deploy`, `exit 1` при orphan > 0, bypass через touch-флаг |
| 10 | После миграции на проде: 0 Barcode без marketplaceArticleId | VERIFIED | `deploy.sh:48-59` post-check: `SELECT COUNT(*) FROM "Barcode" WHERE "marketplaceArticleId" IS NULL`, fail если > 0. Миграция `:87` `DELETE orphan` + `:92` `SET NOT NULL` гарантируют это |
| 11 | WB sync (createProductFromCards / addCardsToProduct) сохраняет штрих-коды привязанными к WB артикулу | VERIFIED | `wb-cards.ts:96-160` createProductFromCards — nested create articles с barcodes; `:214-310` addCardsToProduct — `tx.marketplaceArticle.create` per-card с nested barcodes, `product.barcodes` больше не используется |
| 12 | Список /products (ProductsTable) не затронут | VERIFIED | ProductsTable не модифицирован в этой задаче (не в files_modified); products/page.tsx не затронут (grep подтвердил отсутствие в модификациях) |

**Score:** 12/12 truths verified

### Required Artifacts

| Artifact | Exists | Substantive | Wired | Data Flows | Status |
|----------|--------|-------------|-------|------------|--------|
| `prisma/migrations/20260421_article_sortorder_barcode_fk/migration.sql` | Yes | Yes (14 шагов, 135 строк) | N/A (DDL) | N/A | VERIFIED |
| `prisma/schema.prisma` | Yes | Yes — Barcode.marketplaceArticleId/marketplaceId/productDeletedAt + MarketplaceArticle.sortOrder + back-relations | Yes — Prisma Client сгенерирован | Yes — модель используется в actions | VERIFIED |
| `app/actions/products.ts` | Yes | Yes — create/update/softDelete/restore/duplicate переписаны | Yes — используется из page.tsx + ProductForm | Yes — productDeletedAt + sortOrder + updateMany через marketplaceArticle relation | VERIFIED |
| `components/products/ProductForm.tsx` | Yes | Yes — DndContext/SortableContext/SortableArticleRow/groupArticlesWithBarcodes | Yes — импортируется в new/page и edit/page | Yes — defaultValues из product.articles; onSubmit → updateProduct/createProduct | VERIFIED |
| `app/actions/wb-cards.ts` | Yes | Yes — addCardsToProduct/createProductFromCards переработаны | Yes — импорт в /api/wb-sync или UI | Yes — nested barcodes через articles, productDeletedAt из product.deletedAt | VERIFIED |
| `app/(dashboard)/products/[id]/edit/page.tsx` | Yes | Yes — include обновлён: articles.barcodes orderBy sortOrder | Yes — RSC route | Yes — данные передаются в ProductForm | VERIFIED |
| `deploy.sh` | Yes | Yes — pre/post check с bypass флагом | Yes — исполняется на VPS | Yes — psql $DATABASE_URL | VERIFIED |

### Key Link Verification

| From | To | Via | Status | Details |
|------|------|-----|--------|---------|
| `ProductForm.tsx` | `@dnd-kit/core + sortable` | DndContext + SortableContext + useSortable per артикул | WIRED | `:11-24` импорты; `:848-870` DndContext wraps SortableContext with verticalListSortingStrategy; `:913` useSortable в SortableArticleRow |
| `ProductForm.tsx` | `app/actions/products.ts updateProduct` | form.handleSubmit → marketplaces[].articles[].{value, barcodes} | WIRED | useFieldArray `:228,815,926` структурированы как marketplaces → articles → barcodes; onSubmit маппит в payload |
| `products.ts` | `Prisma MarketplaceArticle.barcodes` | tx.marketplaceArticle.create с nested barcodes.create + marketplaceId + productDeletedAt | WIRED | `:129-149, :209-220, :378-390` — nested creates присутствуют |
| `products.ts softDelete/restore` | `Barcode.productDeletedAt (денорм)` | tx.barcode.updateMany({ where: { marketplaceArticle: { productId } }, data: { productDeletedAt } }) | WIRED | `:256-259` softDelete; `:288-292` restore |
| `migration.sql` | `Barcode + MarketplaceArticle` | ALTER TABLE + UPDATE FROM + CREATE UNIQUE INDEX WHERE (без subquery) | WIRED | 14 шагов DDL/DML; partial unique `:126-128` использует только колонки Barcode |
| `deploy.sh` | PostgreSQL | psql $DATABASE_URL -tAc | WIRED | `:30` pre-check, `:51` post-check, `:16` source /etc/zoiten.pro.env |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|--------------------|--------|
| ProductForm.tsx | `marketplaces[].articles[].barcodes` | `groupArticlesWithBarcodes(product.articles)` из defaultValues | Yes — реальные данные из Prisma через edit/page.tsx | FLOWING |
| edit/page.tsx | `product.articles[].barcodes` | `prisma.product.findUnique({ include: { articles: { orderBy: sortOrder asc, include: { marketplace, barcodes } } } })` | Yes — real Prisma query | FLOWING |
| softDeleteProduct | `Barcode.productDeletedAt` | `barcode.updateMany` через цепочку `marketplaceArticle: { productId: id }` | Yes — запись в БД в транзакции | FLOWING |
| addCardsToProduct | `existingBarcodeValues` | `product.articles.flatMap(a => a.barcodes.map(b => b.value))` | Yes — real data aggregation | FLOWING |

### Behavioral Spot-Checks

Skipped — локальная среда без PostgreSQL (CLAUDE.md VPS-only pattern). Поведенческие проверки относятся к пост-деплойному тестированию на VPS (см. SUMMARY.md § «Проверка после деплоя»).

### Anti-Patterns Found

Нет блокирующих анти-паттернов. Скан показал:

| File | Note | Severity |
|------|------|----------|
| `ProductForm.tsx:991` | `control as any` — документированный eslint-disable для RHF generic inference | Info |

Никаких TODO/FIXME/placeholder/stub-паттернов не обнаружено.

### Human Verification Required

Следующие пункты требуют ручной проверки на проде после деплоя (задокументированы в SUMMARY.md):

1. **DnD UX** — перетаскивание артикула за GripVertical должно плавно менять порядок; после submit + refresh порядок сохраняется.
2. **Двухколоночный layout** — на десктопе артикул слева, штрих-коды справа; на мобильном стэк.
3. **P2002 toast** — попытка ввести дубль штрих-кода в пределах WB → toast «Штрих-код уже используется в этом маркетплейсе».
4. **Cross-marketplace GTIN** — создать товар с barcode `12345` на WB и другой с barcode `12345` на Ozon — оба сохраняются.
5. **Soft-delete/restore cycle** — после soft-delete товара его штрих-коды освобождаются (тот же GTIN можно использовать в новом товаре того же маркетплейса); после restore оригинала — старые ошибки P2002 восстанавливаются.
6. **WB sync** — `POST /api/wb-sync` → штрих-коды привязаны к нужному WB артикулу в БД.
7. **deploy.sh pre/post-check** — первый реальный запуск: «Orphan barcodes: 0» + «Все штрих-коды привязаны к артикулам».

### Gaps Summary

Нет пробелов. Все 12 observable truths verified, все 7 артефактов проходят Levels 1-4, все 6 ключевых связей WIRED. 4 коммита в SUMMARY (bd4997d, 546443d, 456ac16, 9d6fefc) соответствуют 4 задачам плана. Код синхронен со schema, migration.sql содержит ровно 14 шагов из migration_strategy, partial unique использует только колонки таблицы Barcode (PG-совместимо).

Задача готова к деплою на VPS. Пост-деплойная верификация (человеческая) описана в SUMMARY § «Проверка после деплоя».

---

_Verified: 2026-04-21T11:20:00Z_
_Verifier: Claude (gsd-verifier)_
