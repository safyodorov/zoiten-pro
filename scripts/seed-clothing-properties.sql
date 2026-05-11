-- Phase 17 seed: свойства «Пол» и «Цвет» для всех категорий направления «Одежда».
-- Идемпотентно (ON CONFLICT DO NOTHING) — повторный запуск безопасен.
--
-- Логика: для каждой Category товаров, чей бренд привязан к направлению
-- с name='Одежда', создаём 2 свойства:
--   1) «Пол»  — kind=ENUM, options=Мужской/Женский/Унисекс/Детский, wbAttrName=«Пол»
--   2) «Цвет» — kind=STRING, wbAttrName=«Цвет»
--
-- wbAttrName совпадает с name свойства в WB Content API characteristics[]
-- (см. Wave 0 в .planning/phases/17-product-properties-sizes/17-RESEARCH.md).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

INSERT INTO "CategoryProperty" ("id", "categoryId", "name", "kind", "options", "wbAttrName", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c.id,
  'Пол',
  'ENUM'::"PropertyKind",
  ARRAY['Мужской','Женский','Унисекс','Детский'],
  'Пол',
  0,
  NOW(),
  NOW()
FROM "Category" c
JOIN "Brand" b ON c."brandId" = b.id
JOIN "ProductDirection" d ON b."directionId" = d.id
WHERE d.name = 'Одежда'
ON CONFLICT ("categoryId", "name") DO NOTHING;

INSERT INTO "CategoryProperty" ("id", "categoryId", "name", "kind", "options", "wbAttrName", "sortOrder", "createdAt", "updatedAt")
SELECT
  gen_random_uuid()::text,
  c.id,
  'Цвет',
  'STRING'::"PropertyKind",
  ARRAY[]::text[],
  'Цвет',
  1,
  NOW(),
  NOW()
FROM "Category" c
JOIN "Brand" b ON c."brandId" = b.id
JOIN "ProductDirection" d ON b."directionId" = d.id
WHERE d.name = 'Одежда'
ON CONFLICT ("categoryId", "name") DO NOTHING;

\echo === Результат: свойства Одежды по категориям ===
SELECT c.name AS category, b.name AS brand, cp.name AS prop, cp.kind, cp."wbAttrName", cp.options
FROM "CategoryProperty" cp
JOIN "Category" c ON cp."categoryId" = c.id
JOIN "Brand" b ON c."brandId" = b.id
JOIN "ProductDirection" d ON b."directionId" = d.id
WHERE d.name = 'Одежда'
ORDER BY b.name, c.name, cp."sortOrder";
