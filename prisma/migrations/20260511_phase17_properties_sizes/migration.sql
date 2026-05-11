-- Phase 17: Свойства товаров (EAV per Category) + Размерная сетка + WB Content API парсинг
-- D-01 свойства привязаны к Category, D-02 hasSizes на Direction, D-04 ProductSize отдельная сущность

-- 1) ProductDirection.hasSizes — флаг видимости секции «Размерная сетка»
ALTER TABLE "ProductDirection" ADD COLUMN "hasSizes" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: Одежда = true (Бытовая техника остаётся false по дефолту)
UPDATE "ProductDirection" SET "hasSizes" = true WHERE "name" = 'Одежда';

-- 2) WbCard — новые поля для парсинга WB Content API
ALTER TABLE "WbCard" ADD COLUMN "characteristics" JSONB;
ALTER TABLE "WbCard" ADD COLUMN "techSizes" TEXT[] NOT NULL DEFAULT '{}';

-- 3) Enum PropertyKind для CategoryProperty.kind
CREATE TYPE "PropertyKind" AS ENUM ('STRING', 'ENUM', 'NUMBER');

-- 4) CategoryProperty — определение свойства per Category (EAV)
CREATE TABLE "CategoryProperty" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PropertyKind" NOT NULL DEFAULT 'STRING',
    "options" TEXT[] NOT NULL DEFAULT '{}',
    "wbAttrName" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CategoryProperty_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CategoryProperty_categoryId_name_key"
    ON "CategoryProperty"("categoryId", "name");

ALTER TABLE "CategoryProperty" ADD CONSTRAINT "CategoryProperty_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "Category"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 5) ProductPropertyValue — значение свойства per товар (один Product → N значений)
CREATE TABLE "ProductPropertyValue" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductPropertyValue_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductPropertyValue_productId_propertyId_key"
    ON "ProductPropertyValue"("productId", "propertyId");

CREATE INDEX "ProductPropertyValue_propertyId_idx"
    ON "ProductPropertyValue"("propertyId");

ALTER TABLE "ProductPropertyValue" ADD CONSTRAINT "ProductPropertyValue_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ProductPropertyValue" ADD CONSTRAINT "ProductPropertyValue_propertyId_fkey"
    FOREIGN KEY ("propertyId") REFERENCES "CategoryProperty"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- 6) ProductSize — размер как отдельная сущность (для будущих per-size остатков/продаж)
CREATE TABLE "ProductSize" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductSize_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductSize_productId_value_key"
    ON "ProductSize"("productId", "value");

CREATE INDEX "ProductSize_productId_idx"
    ON "ProductSize"("productId");

ALTER TABLE "ProductSize" ADD CONSTRAINT "ProductSize_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
