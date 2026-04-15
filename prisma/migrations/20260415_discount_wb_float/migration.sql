-- Повышаем точность WbCard.discountWb (СПП) с Int до Float/Double Precision.
-- Раньше Math.round округлял % до целого при sync — теряло ~0.5% точности
-- в расчётах юнит-экономики (priceAfterWbDiscount = sellerPrice × (1 − spp/100)).
-- Теперь храним с одним десятичным знаком (27.3% вместо 27%).
ALTER TABLE "WbCard"
  ALTER COLUMN "discountWb" TYPE DOUBLE PRECISION USING "discountWb"::DOUBLE PRECISION;
