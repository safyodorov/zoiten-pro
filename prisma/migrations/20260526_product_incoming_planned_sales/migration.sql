-- Procurement MVP — план продаж после прихода (шт/день).
-- Nullable: пока пользователь не заполнил — null.

ALTER TABLE "ProductIncoming"
  ADD COLUMN "plannedSalesPerDay" DOUBLE PRECISION;
