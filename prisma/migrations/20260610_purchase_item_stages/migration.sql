-- Этапы движения товара по позициям закупки
CREATE TYPE "PurchaseItemStage" AS ENUM ('PRODUCTION', 'INSPECTION', 'SHIPMENT', 'TRANSIT', 'WAREHOUSE');

CREATE TABLE "PurchaseItemStageProgress" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "stage" "PurchaseItemStage" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "comment" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseItemStageProgress_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PurchaseItemStageProgress_itemId_stage_key" ON "PurchaseItemStageProgress"("itemId", "stage");
CREATE INDEX "PurchaseItemStageProgress_itemId_idx" ON "PurchaseItemStageProgress"("itemId");

ALTER TABLE "PurchaseItemStageProgress" ADD CONSTRAINT "PurchaseItemStageProgress_itemId_fkey"
    FOREIGN KEY ("itemId") REFERENCES "PurchaseItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
