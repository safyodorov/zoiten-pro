-- Phase 23: Наличные расчёты — ERP_SECTION.CASH + CashDirection + CashCategory + CashEntry
-- Применяется через `prisma migrate deploy` на VPS (Plan 23-05).

-- 1. Новое значение enum ERP_SECTION
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'CASH';

-- 2. Новый enum направления
CREATE TYPE "CashDirection" AS ENUM ('INCOME', 'EXPENSE');

-- 3. CashCategory (справочник категорий, редактируемый)
CREATE TABLE "CashCategory" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashCategory_name_key" ON "CashCategory"("name");

-- 4. CashEntry (приход/расход, fingerprint @unique дедуп, amount Decimal(14,2))
CREATE TABLE "CashEntry" (
  "id"                    TEXT NOT NULL,
  "date"                  DATE NOT NULL,
  "direction"             "CashDirection" NOT NULL,
  "amount"                DECIMAL(14, 2) NOT NULL,
  "department"            TEXT,
  "categoryId"            TEXT,
  "purpose"               TEXT NOT NULL,
  "responsibleEmployeeId" TEXT,
  "responsibleNameRaw"    TEXT,
  "comment"               TEXT,
  "source"                TEXT NOT NULL DEFAULT 'manual',
  "fingerprint"           TEXT,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CashEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CashEntry_fingerprint_key" ON "CashEntry"("fingerprint");
CREATE INDEX "CashEntry_date_idx" ON "CashEntry"("date");
CREATE INDEX "CashEntry_categoryId_idx" ON "CashEntry"("categoryId");
CREATE INDEX "CashEntry_responsibleEmployeeId_idx" ON "CashEntry"("responsibleEmployeeId");
CREATE INDEX "CashEntry_direction_idx" ON "CashEntry"("direction");

ALTER TABLE "CashEntry"
  ADD CONSTRAINT "CashEntry_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "CashCategory"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "CashEntry"
  ADD CONSTRAINT "CashEntry_responsibleEmployeeId_fkey"
  FOREIGN KEY ("responsibleEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 5. Сид 24 категорий (sortOrder 1..24, Прочее = 24). Идемпотентно — ON CONFLICT DO NOTHING.
INSERT INTO "CashCategory" ("id", "name", "sortOrder", "updatedAt") VALUES
  (gen_random_uuid()::text, 'Грузчики/разнорабочие',         1,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Упаковка',                       2,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Выкупы товаров',                 3,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Образцы/Китай',                  4,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Курьеры/доставка',               5,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Фриланс/подрядчики',             6,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Зарплата/авансы',                7,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Вода',                           8,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Продукты/кухня',                 9,  CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Связь',                          10, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Такси/транспорт',                11, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Канцелярия/оргтехника',          12, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Клининг/уборка',                 13, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Реклама/маркетинг',              14, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Подбор персонала',               15, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Маркировка/ЧЗ',                  16, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Подарки/цветы',                  17, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Кэшбек',                         18, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Аренда',                         19, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Налоги/банк/сборы',              20, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Управленческий учёт/услуги',     21, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Возврат займов',                 22, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Пополнение кассы',               23, CURRENT_TIMESTAMP),
  (gen_random_uuid()::text, 'Прочее',                         24, CURRENT_TIMESTAMP)
ON CONFLICT ("name") DO NOTHING;
