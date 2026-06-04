-- quick 260604: Производство в /stock теперь = ProductIncoming (единый источник
-- с Планом закупок/продаж: orderedQty + expectedDate). Legacy Product.productionStock
-- больше не используется — обнуляем («обнули то что есть сейчас в Производство»).
UPDATE "Product"
SET "productionStock" = NULL,
    "productionStockUpdatedAt" = NULL
WHERE "productionStock" IS NOT NULL
   OR "productionStockUpdatedAt" IS NOT NULL;
