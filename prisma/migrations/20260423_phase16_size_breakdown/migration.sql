-- Phase 16 (STOCK-31): per-size breakdown в WbCardWarehouseStock + User.stockWbShowSizes
--
-- WARNING (UAT): шаг DELETE стирает все legacy rows. После применения миграции
-- /stock/wb пустой до re-sync. Plan 16-06: bash deploy.sh + node scripts/wb-sync-stocks.js
-- ИЛИ нажать «Обновить из WB» в UI. Окно отсутствия данных ~30s.

-- ─── 1. WbCardWarehouseStock + techSize ──────────────────────────

ALTER TABLE "WbCardWarehouseStock"
  ADD COLUMN "techSize" TEXT NOT NULL DEFAULT '';

ALTER TABLE "WbCardWarehouseStock"
  DROP CONSTRAINT IF EXISTS "WbCardWarehouseStock_wbCardId_warehouseId_key";

DROP INDEX IF EXISTS "WbCardWarehouseStock_wbCardId_warehouseId_key";

CREATE UNIQUE INDEX "WbCardWarehouseStock_wbCardId_warehouseId_techSize_key"
  ON "WbCardWarehouseStock" ("wbCardId", "warehouseId", "techSize");

-- Truncate legacy aggregates чтобы избежать конфликта с per-size rows при первом sync.
-- После применения этой миграции UI /stock/wb пустой ~30 секунд до re-sync (Plan 16-06).
DELETE FROM "WbCardWarehouseStock" WHERE "techSize" = '';

-- ─── 2. User.stockWbShowSizes ────────────────────────────────────

ALTER TABLE "User"
  ADD COLUMN "stockWbShowSizes" BOOLEAN NOT NULL DEFAULT false;
