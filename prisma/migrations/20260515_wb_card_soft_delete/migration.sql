-- 2026-05-15 (quick 260515-kes): soft-delete для WbCard.
-- При sync /api/wb-sync nmId не пришёл от Content API → deletedAt = now().
-- При повторном появлении в API — deletedAt очищается.
-- Через 30 дней после deletedAt — hard-delete (cascade на CalculatedPrice,
-- WbCardWarehouseStock, WbCardWarehouseOrders через onDelete: Cascade FK).

ALTER TABLE "WbCard" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "WbCard_deletedAt_idx" ON "WbCard"("deletedAt");
