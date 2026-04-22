-- Phase 15 (ORDERS-01): WbCardWarehouseOrders — заказы per-warehouse за N дней
CREATE TABLE "WbCardWarehouseOrders" (
  "id"          TEXT         NOT NULL,
  "wbCardId"    TEXT         NOT NULL,
  "warehouseId" INTEGER      NOT NULL,
  "ordersCount" INTEGER      NOT NULL DEFAULT 0,
  "periodDays"  INTEGER      NOT NULL DEFAULT 7,
  "updatedAt"   TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WbCardWarehouseOrders_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbCardWarehouseOrders_wbCardId_warehouseId_key"
  ON "WbCardWarehouseOrders"("wbCardId", "warehouseId");

CREATE INDEX "WbCardWarehouseOrders_wbCardId_idx"
  ON "WbCardWarehouseOrders"("wbCardId");

CREATE INDEX "WbCardWarehouseOrders_warehouseId_idx"
  ON "WbCardWarehouseOrders"("warehouseId");

ALTER TABLE "WbCardWarehouseOrders"
  ADD CONSTRAINT "WbCardWarehouseOrders_wbCardId_fkey"
  FOREIGN KEY ("wbCardId") REFERENCES "WbCard"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WbCardWarehouseOrders"
  ADD CONSTRAINT "WbCardWarehouseOrders_warehouseId_fkey"
  FOREIGN KEY ("warehouseId") REFERENCES "WbWarehouse"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
