-- Add ProductDirection — направления товаров (группировка брендов).
-- Один ProductDirection → N брендов. Product → brand.direction (без отдельного Product.directionId).

-- pgcrypto для gen_random_uuid() в seed
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE "ProductDirection" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProductDirection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ProductDirection_name_key" ON "ProductDirection"("name");

-- Nullable FK на Brand — бренд без направления допустим (легаси-бренды или новый бренд до привязки)
ALTER TABLE "Brand" ADD COLUMN "directionId" TEXT;

ALTER TABLE "Brand" ADD CONSTRAINT "Brand_directionId_fkey"
    FOREIGN KEY ("directionId") REFERENCES "ProductDirection"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed initial directions (идемпотентно через ON CONFLICT — если миграция переходит на чистую БД)
INSERT INTO "ProductDirection" ("id", "name", "sortOrder", "createdAt", "updatedAt") VALUES
    (gen_random_uuid()::text, 'Бытовая техника', 0, NOW(), NOW()),
    (gen_random_uuid()::text, 'Одежда', 1, NOW(), NOW())
ON CONFLICT ("name") DO NOTHING;

-- Привязка существующих брендов к направлениям (идемпотентно — обновляет, только если directionId NULL)
UPDATE "Brand"
SET "directionId" = (SELECT id FROM "ProductDirection" WHERE name = 'Бытовая техника')
WHERE name = 'Zoiten' AND "directionId" IS NULL;

UPDATE "Brand"
SET "directionId" = (SELECT id FROM "ProductDirection" WHERE name = 'Одежда')
WHERE name IN ('Men''s Factor', 'Alverto') AND "directionId" IS NULL;
