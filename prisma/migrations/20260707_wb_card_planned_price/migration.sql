-- Фаза A: плановые цены на WbCard (база для плана продаж).
ALTER TABLE "WbCard" ADD COLUMN "plannedSellerPrice" DOUBLE PRECISION;
ALTER TABLE "WbCard" ADD COLUMN "plannedSellerDiscountPct" INTEGER;
