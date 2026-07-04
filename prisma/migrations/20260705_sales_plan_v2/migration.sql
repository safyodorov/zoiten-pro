-- Phase 25: План продаж v2 (2026-07) — аддитивная миграция
-- Применяется через `prisma migrate deploy` на VPS (deploy.sh).
-- НЕ трогает существующие таблицы деструктивно — старый /sales-plan
-- (lib/sales-forecast.ts, AppSetting salesPlan.baselineOverrides) продолжает работать.

-- 1. Enum статуса виртуальных закупок
CREATE TYPE "VirtualPurchaseStatus" AS ENUM ('SUGGESTED', 'ACCEPTED', 'DISMISSED', 'CONVERTED');

-- 2. SalesPlanMonthLevel — помесячный плановый уровень per товар (единица: заказы шт/день)
CREATE TABLE "SalesPlanMonthLevel" (
  "id"                 TEXT NOT NULL,
  "productId"          TEXT NOT NULL,
  "month"              DATE NOT NULL,
  "targetOrdersPerDay" DOUBLE PRECISION,
  "priceRub"           DOUBLE PRECISION,
  "buyoutPct"          DOUBLE PRECISION,
  "comment"            TEXT,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "updatedBy"          TEXT,
  CONSTRAINT "SalesPlanMonthLevel_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SalesPlanMonthLevel"
  ADD CONSTRAINT "SalesPlanMonthLevel_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "SalesPlanMonthLevel_productId_month_key" ON "SalesPlanMonthLevel"("productId", "month");
CREATE INDEX "SalesPlanMonthLevel_month_idx" ON "SalesPlanMonthLevel"("month");

-- 3. SalesPlanDayOverride — точечная правка дня (sparse, только поправленные дни)
CREATE TABLE "SalesPlanDayOverride" (
  "id"           TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "date"         DATE NOT NULL,
  "ordersPerDay" DOUBLE PRECISION NOT NULL,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  "updatedBy"    TEXT,
  CONSTRAINT "SalesPlanDayOverride_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SalesPlanDayOverride"
  ADD CONSTRAINT "SalesPlanDayOverride_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "SalesPlanDayOverride_productId_date_key" ON "SalesPlanDayOverride"("productId", "date");
CREATE INDEX "SalesPlanDayOverride_date_idx" ON "SalesPlanDayOverride"("date");

-- 4. VirtualPurchase — виртуальные закупки (только план; изолированы от production-sync)
CREATE TABLE "VirtualPurchase" (
  "id"                  TEXT NOT NULL,
  "productId"           TEXT NOT NULL,
  "supplierId"          TEXT,
  "qty"                 INTEGER NOT NULL,
  "orderDate"           DATE NOT NULL,
  "expectedArrivalDate" DATE NOT NULL,
  "leadTimeDaysUsed"    INTEGER,
  "unitPrice"           DECIMAL(14, 4),
  "currency"            TEXT NOT NULL DEFAULT 'CNY',
  "source"              TEXT NOT NULL DEFAULT 'auto',
  "status"              "VirtualPurchaseStatus" NOT NULL DEFAULT 'SUGGESTED',
  "convertedPurchaseId" TEXT,
  "comment"             TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VirtualPurchase_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "VirtualPurchase"
  ADD CONSTRAINT "VirtualPurchase_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VirtualPurchase"
  ADD CONSTRAINT "VirtualPurchase_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "VirtualPurchase_productId_expectedArrivalDate_idx" ON "VirtualPurchase"("productId", "expectedArrivalDate");
CREATE INDEX "VirtualPurchase_status_idx" ON "VirtualPurchase"("status");

-- 5. SalesPlanVersion — зафиксированная (immutable) версия плана
CREATE TABLE "SalesPlanVersion" (
  "id"          TEXT NOT NULL,
  "label"       TEXT NOT NULL,
  "kind"        TEXT NOT NULL DEFAULT 'user',
  "horizonFrom" DATE NOT NULL,
  "horizonTo"   DATE NOT NULL,
  "paramsJson"  JSONB NOT NULL,
  "note"        TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesPlanVersion_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SalesPlanVersion"
  ADD CONSTRAINT "SalesPlanVersion_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SalesPlanVersion_createdAt_idx" ON "SalesPlanVersion"("createdAt");

-- 6. SalesPlanVersionDay — дневные строки версии (паттерн FinanceStockSnapshot — БЕЗ FK на Product)
CREATE TABLE "SalesPlanVersionDay" (
  "id"               BIGSERIAL NOT NULL,
  "versionId"        TEXT NOT NULL,
  "productId"        TEXT NOT NULL,
  "sku"              TEXT NOT NULL,
  "name"             TEXT NOT NULL,
  "date"             DATE NOT NULL,
  "planOrdersUnits"  DOUBLE PRECISION NOT NULL,
  "planOrdersRub"    DOUBLE PRECISION NOT NULL,
  "planBuyoutsUnits" DOUBLE PRECISION NOT NULL,
  "planBuyoutsRub"   DOUBLE PRECISION NOT NULL,
  "priceUsed"        DOUBLE PRECISION NOT NULL,
  "buyoutPctUsed"    DOUBLE PRECISION NOT NULL,
  "stockEndUnits"    DOUBLE PRECISION NOT NULL,
  CONSTRAINT "SalesPlanVersionDay_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SalesPlanVersionDay"
  ADD CONSTRAINT "SalesPlanVersionDay_versionId_fkey"
  FOREIGN KEY ("versionId") REFERENCES "SalesPlanVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE UNIQUE INDEX "SalesPlanVersionDay_versionId_productId_date_key" ON "SalesPlanVersionDay"("versionId", "productId", "date");
CREATE INDEX "SalesPlanVersionDay_versionId_date_idx" ON "SalesPlanVersionDay"("versionId", "date");

-- 7. ALTER TABLE Purchase: плановая дата прихода в Иваново (приоритет над leadtime-eta)
ALTER TABLE "Purchase" ADD COLUMN "plannedArrivalDate" DATE;

-- 8. Сид AppSetting-ключей плана продаж v2 (идемпотентно — ON CONFLICT DO NOTHING)
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES
  ('salesPlan.iuTargets',          '[{"from":"2026-07-01","to":"2026-12-31","dailyRub":2380805}]', CURRENT_TIMESTAMP),
  ('salesPlan.horizon',            '{"from":"2026-07-01","to":"2026-12-31"}',                      CURRENT_TIMESTAMP),
  ('salesPlan.iuMetric',           '"buyouts"',                                                     CURRENT_TIMESTAMP),
  ('salesPlan.leadTimes2',         '{"deliveryDays":3,"returnDays":3}',                             CURRENT_TIMESTAMP),
  ('salesPlan.wbInboundLagDays',   '0',                                                             CURRENT_TIMESTAMP),
  ('salesPlan.transitDays',        '20',                                                            CURRENT_TIMESTAMP),
  ('salesPlan.defaultLeadTimeDays','45',                                                            CURRENT_TIMESTAMP),
  ('salesPlan.safetyStockDays',    '14',                                                            CURRENT_TIMESTAMP),
  ('salesPlan.vpCoverDays',        '60',                                                            CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
