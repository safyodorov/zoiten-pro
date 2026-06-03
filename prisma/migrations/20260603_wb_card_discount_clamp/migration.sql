-- quick 260603-spp: чистка бэкфилла — обнуляем СПП вне разумного диапазона [0, 100).
-- Источник мусора: исторические строки, где buyerPrice > sellerPrice (битый снапшот цен)
-- давали отрицательную/огромную скидку. Forward-fill и графики используют только валидные.

UPDATE "WbCardOrdersDaily"
SET "discountWb" = NULL
WHERE "discountWb" IS NOT NULL
  AND ("discountWb" < 0 OR "discountWb" >= 100);
