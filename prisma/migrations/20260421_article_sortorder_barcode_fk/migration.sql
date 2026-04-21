-- 260421-iq7: Drag-and-drop порядок артикулов маркетплейса + штрих-коды привязаны к MarketplaceArticle
--
-- Изменения:
--   1. MarketplaceArticle.sortOrder — новое поле для порядка артикулов внутри (productId, marketplaceId).
--      Backfill по createdAt ASC: первый (старейший) → sortOrder=0.
--
--   2. Barcode: миграция с Barcode.productId на Barcode.marketplaceArticleId (+ денормализация
--      marketplaceId и productDeletedAt). Каждый штрих-код привязывается к конкретному артикулу
--      маркетплейса; один и тот же GTIN легально существует как Barcode(WB, value) и Barcode(Ozon, value)
--      одновременно (разный marketplaceId — разные записи).
--
--   3. Partial unique (marketplaceId, value) WHERE productDeletedAt IS NULL — один GTIN уникален
--      per marketplace среди активных товаров. НЕ используем subquery в predicate (PostgreSQL
--      не поддерживает subquery в UNIQUE partial index WHERE — только IMMUTABLE-выражения колонок
--      той же таблицы). Поэтому денормализуем Product.deletedAt → Barcode.productDeletedAt,
--      синхронизация поддерживается на уровне server action softDeleteProduct/restoreProduct.
--
-- ВАЖНО про backfill: штрих-коды у Product без MarketplaceArticle на шаге DELETE удаляются.
-- Защита от потери данных — pre-check в deploy.sh (touch /var/deploy/skip_migrate_precheck для обхода).

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 1: Добавить sortOrder в MarketplaceArticle (с дефолтом 0)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "MarketplaceArticle" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 2: Backfill sortOrder по createdAt внутри (productId, marketplaceId)
-- ───────────────────────────────────────────────────────────────────────────
UPDATE "MarketplaceArticle" ma
SET "sortOrder" = sub.rn - 1
FROM (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY "productId", "marketplaceId"
           ORDER BY "createdAt" ASC, id ASC
         ) AS rn
  FROM "MarketplaceArticle"
) sub
WHERE ma.id = sub.id;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 3: Добавить marketplaceArticleId в Barcode (nullable — для backfill)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "Barcode" ADD COLUMN "marketplaceArticleId" TEXT;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 4: Добавить marketplaceId в Barcode (денормализация для partial unique)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "Barcode" ADD COLUMN "marketplaceId" TEXT;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 5: Добавить productDeletedAt в Barcode (денормализация Product.deletedAt)
-- PostgreSQL не разрешает subquery в UNIQUE partial index WHERE → нужна денормализация.
-- Синхронизируется server action softDeleteProduct/restoreProduct.
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "Barcode" ADD COLUMN "productDeletedAt" TIMESTAMP(3);

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 6: Добавить createdAt в Barcode
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "Barcode" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 7: Backfill marketplaceArticleId/marketplaceId/productDeletedAt из первого
-- (по createdAt ASC, id ASC) MarketplaceArticle товара
-- ───────────────────────────────────────────────────────────────────────────
UPDATE "Barcode" b
SET "marketplaceArticleId" = first_ma.id,
    "marketplaceId"        = first_ma."marketplaceId",
    "productDeletedAt"     = first_ma."deletedAt"
FROM (
  SELECT DISTINCT ON (ma."productId")
    ma.id,
    ma."productId",
    ma."marketplaceId",
    p."deletedAt"
  FROM "MarketplaceArticle" ma
  JOIN "Product" p ON p.id = ma."productId"
  ORDER BY ma."productId", ma."createdAt" ASC, ma.id ASC
) first_ma
WHERE first_ma."productId" = b."productId";

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 8: Удалить orphan Barcode (у Product нет ни одного MarketplaceArticle)
-- САМОЕ ОПАСНОЕ МЕСТО. Защита — pre-check в deploy.sh.
-- ───────────────────────────────────────────────────────────────────────────
DELETE FROM "Barcode" WHERE "marketplaceArticleId" IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 9: SET NOT NULL на marketplaceArticleId
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "Barcode" ALTER COLUMN "marketplaceArticleId" SET NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 10: SET NOT NULL на marketplaceId (productDeletedAt остаётся NULLable —
-- null = активный товар)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "Barcode" ALTER COLUMN "marketplaceId" SET NOT NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 11: Добавить FK constraints для marketplaceArticleId (Cascade) и marketplaceId (Restrict)
-- ───────────────────────────────────────────────────────────────────────────
ALTER TABLE "Barcode"
  ADD CONSTRAINT "Barcode_marketplaceArticleId_fkey"
  FOREIGN KEY ("marketplaceArticleId") REFERENCES "MarketplaceArticle"(id)
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Barcode"
  ADD CONSTRAINT "Barcode_marketplaceId_fkey"
  FOREIGN KEY ("marketplaceId") REFERENCES "Marketplace"(id)
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 12: Удалить старый partial unique и FK productId + колонку Barcode.productId
-- ───────────────────────────────────────────────────────────────────────────
DROP INDEX IF EXISTS "barcode_value_not_deleted_idx";
ALTER TABLE "Barcode" DROP CONSTRAINT IF EXISTS "Barcode_productId_fkey";
ALTER TABLE "Barcode" DROP COLUMN "productId";

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 13: Новый partial unique — (marketplaceId, value) WHERE productDeletedAt IS NULL
-- БЕЗ subquery в predicate (PG-совместимо). Один GTIN уникален per marketplace среди
-- активных (не soft-deleted) товаров. Тот же GTIN разрешён как Barcode(WB, 'X') и
-- Barcode(Ozon, 'X') одновременно — это разные записи с разным marketplaceId.
-- ───────────────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX "Barcode_marketplace_value_active_key"
  ON "Barcode" ("marketplaceId", "value")
  WHERE "productDeletedAt" IS NULL;

-- ───────────────────────────────────────────────────────────────────────────
-- Шаг 14: Вспомогательные индексы для FK lookups
-- ───────────────────────────────────────────────────────────────────────────
CREATE INDEX "Barcode_marketplaceArticleId_idx" ON "Barcode"("marketplaceArticleId");
CREATE INDEX "Barcode_marketplaceId_value_idx" ON "Barcode"("marketplaceId", "value");
