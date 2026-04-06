-- 1. Create sequence for SKU auto-increment (survives deletes)
CREATE SEQUENCE IF NOT EXISTS product_sku_seq START 1;

-- 2. Add sku column as nullable first
ALTER TABLE "Product" ADD COLUMN "sku" TEXT;

-- 3. Backfill existing products with sequential SKUs
UPDATE "Product"
SET "sku" = 'УКТ-' || LPAD(nextval('product_sku_seq')::TEXT, 6, '0')
WHERE "sku" IS NULL;

-- 4. Make sku NOT NULL and add unique constraint
ALTER TABLE "Product" ALTER COLUMN "sku" SET NOT NULL;
CREATE UNIQUE INDEX "Product_sku_key" ON "Product"("sku");

-- 5. Create ProductCost table
CREATE TABLE "ProductCost" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "costPrice" DOUBLE PRECISION NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductCost_pkey" PRIMARY KEY ("id")
);

-- 6. Unique constraint on productId (one cost per product)
CREATE UNIQUE INDEX "ProductCost_productId_key" ON "ProductCost"("productId");

-- 7. Foreign key with cascade delete
ALTER TABLE "ProductCost" ADD CONSTRAINT "ProductCost_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
