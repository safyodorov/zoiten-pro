-- Quick 260616-vjo: дата на каждом этапе движения товара в закупке.
-- Применяется через `prisma migrate deploy` на VPS (deploy.sh).

ALTER TABLE "PurchaseItemStageProgress" ADD COLUMN "date" TIMESTAMP(3);
