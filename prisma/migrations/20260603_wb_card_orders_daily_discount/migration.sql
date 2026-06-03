-- quick 260603-spp: дневная скидка WB (СПП) в WbCardOrdersDaily.
-- = round((1 − buyerPrice/sellerPrice) × 100, 0.1).

ALTER TABLE "WbCardOrdersDaily"
  ADD COLUMN "discountWb" DOUBLE PRECISION;

-- Бэкфилл из уже накопленных snapshot'ов цен (формула детерминированная).
UPDATE "WbCardOrdersDaily"
SET "discountWb" = ROUND((1 - "buyerPrice"::numeric / "sellerPrice"::numeric) * 1000) / 10
WHERE "sellerPrice" IS NOT NULL
  AND "sellerPrice" > 0
  AND "buyerPrice" IS NOT NULL;
