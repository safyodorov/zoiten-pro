-- Add sortOrder column to reference data tables for custom ordering

ALTER TABLE "Brand" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Category" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Subcategory" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Marketplace" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Set initial sortOrder based on alphabetical name order
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) - 1 AS rn FROM "Brand"
)
UPDATE "Brand" SET "sortOrder" = ranked.rn FROM ranked WHERE "Brand".id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "brandId" ORDER BY name ASC) - 1 AS rn FROM "Category"
)
UPDATE "Category" SET "sortOrder" = ranked.rn FROM ranked WHERE "Category".id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "categoryId" ORDER BY name ASC) - 1 AS rn FROM "Subcategory"
)
UPDATE "Subcategory" SET "sortOrder" = ranked.rn FROM ranked WHERE "Subcategory".id = ranked.id;

WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY name ASC) - 1 AS rn FROM "Marketplace"
)
UPDATE "Marketplace" SET "sortOrder" = ranked.rn FROM ranked WHERE "Marketplace".id = ranked.id;
