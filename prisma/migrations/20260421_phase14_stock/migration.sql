-- Phase 14: Stock Management
-- Создание таблиц WbWarehouse и WbCardWarehouseStock,
-- добавление полей остатков в Product,
-- seed AppSetting stock.turnoverNormDays

-- CreateTable WbWarehouse
CREATE TABLE "WbWarehouse" (
  "id" INTEGER NOT NULL,
  "name" TEXT NOT NULL,
  "cluster" TEXT NOT NULL,
  "shortCluster" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "needsClusterReview" BOOLEAN NOT NULL DEFAULT false,
  CONSTRAINT "WbWarehouse_pkey" PRIMARY KEY ("id")
);

-- CreateTable WbCardWarehouseStock
CREATE TABLE "WbCardWarehouseStock" (
  "id" TEXT NOT NULL,
  "wbCardId" TEXT NOT NULL,
  "warehouseId" INTEGER NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WbCardWarehouseStock_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbCardWarehouseStock_wbCardId_warehouseId_key" ON "WbCardWarehouseStock"("wbCardId", "warehouseId");
CREATE INDEX "WbCardWarehouseStock_wbCardId_idx" ON "WbCardWarehouseStock"("wbCardId");
CREATE INDEX "WbCardWarehouseStock_warehouseId_idx" ON "WbCardWarehouseStock"("warehouseId");

-- AddForeignKey
ALTER TABLE "WbCardWarehouseStock" ADD CONSTRAINT "WbCardWarehouseStock_wbCardId_fkey"
  FOREIGN KEY ("wbCardId") REFERENCES "WbCard"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WbCardWarehouseStock" ADD CONSTRAINT "WbCardWarehouseStock_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "WbWarehouse"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable Product — добавление полей остатков
ALTER TABLE "Product" ADD COLUMN "ivanovoStock" INTEGER;
ALTER TABLE "Product" ADD COLUMN "productionStock" INTEGER;
ALTER TABLE "Product" ADD COLUMN "ivanovoStockUpdatedAt" TIMESTAMP(3);
ALTER TABLE "Product" ADD COLUMN "productionStockUpdatedAt" TIMESTAMP(3);

-- Seed AppSetting stock.turnoverNormDays (норма оборачиваемости = 37 дней)
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES ('stock.turnoverNormDays', '37', NOW()) ON CONFLICT ("key") DO NOTHING;
