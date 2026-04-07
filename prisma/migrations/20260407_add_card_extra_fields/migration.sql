-- Дополнительные данные карточек WB
ALTER TABLE "WbCard" ADD COLUMN "priceBeforeDiscount" DOUBLE PRECISION;
ALTER TABLE "WbCard" ADD COLUMN "sellerDiscount" INTEGER;
ALTER TABLE "WbCard" ADD COLUMN "clubDiscount" INTEGER;
ALTER TABLE "WbCard" ADD COLUMN "stockQty" INTEGER;
ALTER TABLE "WbCard" ADD COLUMN "buyoutPercent" DOUBLE PRECISION;
