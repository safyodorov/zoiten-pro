-- Drop old global unique constraint on Barcode.value
DROP INDEX IF EXISTS "Barcode_value_key";

-- Partial unique index: barcode value unique only among products that are not soft-deleted
CREATE UNIQUE INDEX "barcode_value_not_deleted_idx"
  ON "Barcode"("value")
  WHERE EXISTS (
    SELECT 1 FROM "Product"
    WHERE "Product"."id" = "Barcode"."productId"
    AND "Product"."deletedAt" IS NULL
  );

-- Drop old composite unique constraint on MarketplaceArticle
DROP INDEX IF EXISTS "MarketplaceArticle_productId_marketplaceId_article_key";

-- Partial unique index: article unique per marketplace among non-deleted products
CREATE UNIQUE INDEX "marketplace_article_active_idx"
  ON "MarketplaceArticle"("marketplaceId", "article")
  WHERE EXISTS (
    SELECT 1 FROM "Product"
    WHERE "Product"."id" = "MarketplaceArticle"."productId"
    AND "Product"."deletedAt" IS NULL
  );
