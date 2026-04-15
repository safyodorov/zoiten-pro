-- Добавляем скидку продавца в расчётную цену.
-- Раньше CalculatedPrice хранил только финальную sellerPrice, а на отображении
-- sellerDiscountPct подставлялся 0 — из-за чего в таблице /prices/wb
-- колонки «Цена для установки» и «Цена продавца» равнялись, а «Скидка продавца» показывала 0%.
ALTER TABLE "CalculatedPrice" ADD COLUMN "sellerDiscountPct" DOUBLE PRECISION;
