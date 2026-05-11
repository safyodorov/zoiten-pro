-- Phase 18 — Product Name Refactor
--
-- Изменения:
--   1. Product.name → Product.article (rename column)
--   2. Product.name — новая колонка (VARCHAR 255), inicialmente = article, потом backfill через generateProductName
--   3. Product.nameOverridden — флаг ручного редактирования
--   4. CategoryProperty.includeInName — флаг включения value в автогенерируемое name

-- 1. Rename текущего name → article
ALTER TABLE "Product" RENAME COLUMN "name" TO "article";

-- 2. Add new columns
ALTER TABLE "Product" ADD COLUMN "name" VARCHAR(255) NOT NULL DEFAULT '';
ALTER TABLE "Product" ADD COLUMN "nameOverridden" BOOLEAN NOT NULL DEFAULT false;

-- Initial backfill: name = article (чтобы поле было непустое до запуска real backfill).
-- После миграции скрипт scripts/backfill-product-names.js пересчитает name по реальной формуле.
UPDATE "Product" SET "name" = "article";

-- Drop default (новые товары должны явно указывать name)
ALTER TABLE "Product" ALTER COLUMN "name" DROP DEFAULT;

-- 3. CategoryProperty.includeInName
ALTER TABLE "CategoryProperty" ADD COLUMN "includeInName" BOOLEAN NOT NULL DEFAULT false;
