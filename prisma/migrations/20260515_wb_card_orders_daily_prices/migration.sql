-- 2026-05-15 (quick 260515-o4o): snapshot sellerPrice + buyerPrice в WbCardOrdersDaily.
-- sellerPrice = WbCard.price (₽, после seller-скидки на дату).
-- buyerPrice = round(v4 sizes[].price.product / 100) — финальная витринная цена WB.
-- NULL допустимы — backfill ретроактивный через UI кнопку «Backfill цен».
ALTER TABLE "WbCardOrdersDaily" ADD COLUMN "sellerPrice" INTEGER;
ALTER TABLE "WbCardOrdersDaily" ADD COLUMN "buyerPrice" INTEGER;
