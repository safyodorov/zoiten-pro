-- prisma/migrations/20260409_prices_wb/migration.sql
-- Phase 7: Управление ценами WB
-- Добавляет 4 новые таблицы (AppSetting, CalculatedPrice, WbPromotion, WbPromotionNomenclature)
-- и 6 новых полей в существующие (Category/Subcategory/Product/WbCard).
-- Seed-ит 6 глобальных ставок в AppSetting.

-- 1. AppSetting (глобальные ставки KeyValue)
CREATE TABLE "AppSetting" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "AppSetting_pkey" PRIMARY KEY ("key")
);

-- 2. CalculatedPrice (расчётные цены пользователя, 1-3 слота на WbCard)
CREATE TABLE "CalculatedPrice" (
    "id" TEXT NOT NULL,
    "wbCardId" TEXT NOT NULL,
    "slot" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "sellerPrice" DOUBLE PRECISION NOT NULL,
    "drrPct" DOUBLE PRECISION,
    "defectRatePct" DOUBLE PRECISION,
    "deliveryCostRub" DOUBLE PRECISION,
    "snapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CalculatedPrice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalculatedPrice_wbCardId_slot_key" ON "CalculatedPrice"("wbCardId", "slot");
ALTER TABLE "CalculatedPrice" ADD CONSTRAINT "CalculatedPrice_wbCardId_fkey"
    FOREIGN KEY ("wbCardId") REFERENCES "WbCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3. WbPromotion (акции WB — sync через API, id = promotionID из WB)
CREATE TABLE "WbPromotion" (
    "id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "advantages" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "rangingJson" JSONB,
    "source" TEXT NOT NULL DEFAULT 'API',
    "lastSyncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WbPromotion_pkey" PRIMARY KEY ("id")
);

-- 4. WbPromotionNomenclature (связи nmId с акциями)
CREATE TABLE "WbPromotionNomenclature" (
    "id" TEXT NOT NULL,
    "promotionId" INTEGER NOT NULL,
    "nmId" INTEGER NOT NULL,
    "inAction" BOOLEAN NOT NULL DEFAULT false,
    "planPrice" DOUBLE PRECISION,
    "planDiscount" DOUBLE PRECISION,
    "currentPrice" DOUBLE PRECISION,
    "status" TEXT,
    CONSTRAINT "WbPromotionNomenclature_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WbPromotionNomenclature_promotionId_nmId_key"
    ON "WbPromotionNomenclature"("promotionId", "nmId");
ALTER TABLE "WbPromotionNomenclature" ADD CONSTRAINT "WbPromotionNomenclature_promotionId_fkey"
    FOREIGN KEY ("promotionId") REFERENCES "WbPromotion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Поля в существующих таблицах (D-01, D-09)
ALTER TABLE "Category"    ADD COLUMN "defaultDefectRatePct"  DOUBLE PRECISION;
ALTER TABLE "Subcategory" ADD COLUMN "defaultDrrPct"         DOUBLE PRECISION;
ALTER TABLE "Product"     ADD COLUMN "drrOverridePct"        DOUBLE PRECISION;
ALTER TABLE "Product"     ADD COLUMN "defectRateOverridePct" DOUBLE PRECISION;
ALTER TABLE "Product"     ADD COLUMN "deliveryCostRub"       DOUBLE PRECISION;
ALTER TABLE "WbCard"      ADD COLUMN "avgSalesSpeed7d"       DOUBLE PRECISION;

-- 6. Seed 6 глобальных ставок в AppSetting (D-02)
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES
    ('wbWalletPct',    '2.0', NOW()),
    ('wbAcquiringPct', '2.7', NOW()),
    ('wbJemPct',       '1.0', NOW()),
    ('wbCreditPct',    '7.0', NOW()),
    ('wbOverheadPct',  '6.0', NOW()),
    ('wbTaxPct',       '8.0', NOW())
ON CONFLICT ("key") DO NOTHING;
