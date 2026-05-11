-- Phase 17 ext: backfill Barcode.productSizeId по WbCard.rawJson.sizes[i].skus[j]
-- Один раз для бэкфилла существующих штрих-кодов после деплоя связи Barcode↔ProductSize.

WITH wb_size_sku AS (
  SELECT
    w."nmId"::text AS nmid,
    (s.size_obj->>'techSize')::text AS tech_size,
    sku_text AS sku_value
  FROM "WbCard" w,
       jsonb_array_elements(w."rawJson"->'sizes') AS s(size_obj),
       jsonb_array_elements_text(s.size_obj->'skus') AS sku_text
  WHERE w."rawJson" IS NOT NULL
    AND (s.size_obj->>'techSize') IS NOT NULL
    AND (s.size_obj->>'techSize') != '0'
)
UPDATE "Barcode" b
SET "productSizeId" = ps.id
FROM "MarketplaceArticle" ma,
     "Marketplace" m,
     wb_size_sku wss,
     "ProductSize" ps
WHERE b."marketplaceArticleId" = ma.id
  AND ma."marketplaceId" = m.id
  AND m.slug = 'wb'
  AND ma.article = wss.nmid
  AND b.value = wss.sku_value
  AND ps."productId" = ma."productId"
  AND ps.value = wss.tech_size
  AND b."productSizeId" IS DISTINCT FROM ps.id;

\echo === Результат для УКТ-000030 ===
SELECT b.value AS barcode, ps.value AS size
FROM "Barcode" b
JOIN "MarketplaceArticle" ma ON b."marketplaceArticleId" = ma.id
JOIN "Product" p ON ma."productId" = p.id
LEFT JOIN "ProductSize" ps ON b."productSizeId" = ps.id
WHERE p.sku = 'УКТ-000030'
ORDER BY ps.value NULLS LAST;

\echo === Общий бэкфилл WB штрих-кодов ===
SELECT
  COUNT(*) FILTER (WHERE "productSizeId" IS NOT NULL) AS linked,
  COUNT(*) FILTER (WHERE "productSizeId" IS NULL) AS unlinked,
  COUNT(*) AS total
FROM "Barcode" b
WHERE EXISTS (
  SELECT 1 FROM "MarketplaceArticle" ma
  JOIN "Marketplace" m ON ma."marketplaceId" = m.id
  WHERE ma.id = b."marketplaceArticleId" AND m.slug = 'wb'
);
