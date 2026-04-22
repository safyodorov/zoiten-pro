-- Phase 15.1: добавить inWayToClient и inWayFromClient на WbCard
-- (агрегат per nmId для отображения 'Товар в пути' в /stock/wb).
-- Per-warehouse in-way не хранится — user решил показывать только общую статистику.

ALTER TABLE "WbCard"
  ADD COLUMN "inWayToClient" INTEGER,
  ADD COLUMN "inWayFromClient" INTEGER;
