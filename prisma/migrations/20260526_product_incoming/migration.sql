-- Procurement MVP (2026-05-26): per-product «заказано в Китае» + плановая дата прихода
-- Unique по productId → одна строка на товар (multi-row будет позже)

CREATE TABLE "ProductIncoming" (
  "id"           TEXT NOT NULL,
  "productId"    TEXT NOT NULL,
  "orderedQty"   INTEGER NOT NULL DEFAULT 0,
  "expectedDate" DATE,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ProductIncoming_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductIncoming_productId_key" ON "ProductIncoming"("productId");

ALTER TABLE "ProductIncoming"
  ADD CONSTRAINT "ProductIncoming_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
