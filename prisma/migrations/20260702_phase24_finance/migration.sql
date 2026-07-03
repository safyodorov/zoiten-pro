-- Phase 24: Финансовая отчётность — Баланс — ERP_SECTION.FINANCE + снапшоты/справочники
-- Применяется через `prisma migrate deploy` на VPS (Plan 24-09).

-- 1. Новое значение enum ERP_SECTION
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'FINANCE';

-- 2. Новые enum'ы
CREATE TYPE "FinanceStockLocation" AS ENUM ('WB_WAREHOUSE', 'WB_IN_WAY_TO_CLIENT', 'WB_IN_WAY_FROM_CLIENT', 'IVANOVO');
CREATE TYPE "FinanceAdjustmentType" AS ENUM ('ASSET', 'LIABILITY');

-- 3. FinanceStockSnapshot — ежедневный снапшот товарных остатков (D-01a, D-10, D-11)
CREATE TABLE "FinanceStockSnapshot" (
  "id"              TEXT NOT NULL,
  "date"            DATE NOT NULL,
  "productId"       TEXT NOT NULL,
  "sku"             TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "location"        "FinanceStockLocation" NOT NULL,
  "qty"             INTEGER NOT NULL,
  "costPriceAtDate" DECIMAL(14, 2),
  "valueRub"        DECIMAL(14, 2),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceStockSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinanceStockSnapshot_date_productId_location_key" ON "FinanceStockSnapshot"("date", "productId", "location");
CREATE INDEX "FinanceStockSnapshot_date_idx" ON "FinanceStockSnapshot"("date");
CREATE INDEX "FinanceStockSnapshot_productId_idx" ON "FinanceStockSnapshot"("productId");

-- 4. FinanceReceivablesSnapshot — ежедневный снапшот дебиторки WB, singleton per date (D-05, D-14)
CREATE TABLE "FinanceReceivablesSnapshot" (
  "id"                    TEXT NOT NULL,
  "date"                  DATE NOT NULL,
  "balanceCurrentRub"     DECIMAL(14, 2) NOT NULL,
  "balanceForWithdrawRub" DECIMAL(14, 2) NOT NULL,
  "weeklyTailRub"         DECIMAL(14, 2) NOT NULL,
  "totalRub"              DECIMAL(14, 2) NOT NULL,
  "rawJson"               JSONB,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FinanceReceivablesSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinanceReceivablesSnapshot_date_key" ON "FinanceReceivablesSnapshot"("date");

-- 5. FinanceManualAdjustment — ручные корректировочные статьи, "живая" таблица (D-08)
CREATE TABLE "FinanceManualAdjustment" (
  "id"            TEXT NOT NULL,
  "label"         TEXT NOT NULL,
  "type"          "FinanceAdjustmentType" NOT NULL,
  "amountRub"     DECIMAL(14, 2) NOT NULL,
  "effectiveFrom" DATE NOT NULL,
  "comment"       TEXT,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL,
  "deletedAt"     TIMESTAMP(3),
  CONSTRAINT "FinanceManualAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "FinanceManualAdjustment_effectiveFrom_idx" ON "FinanceManualAdjustment"("effectiveFrom");
CREATE INDEX "FinanceManualAdjustment_deletedAt_idx" ON "FinanceManualAdjustment"("deletedAt");

-- 6. FinanceTaxPeriodActual — факт-корректировка налога per квартал (D-17)
CREATE TABLE "FinanceTaxPeriodActual" (
  "id"                 TEXT NOT NULL,
  "year"               INTEGER NOT NULL,
  "quarter"            INTEGER NOT NULL,
  "vatActualRub"       DECIMAL(14, 2),
  "incomeTaxActualRub" DECIMAL(14, 2),
  "updatedById"        TEXT,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "FinanceTaxPeriodActual_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "FinanceTaxPeriodActual_year_quarter_key" ON "FinanceTaxPeriodActual"("year", "quarter");

-- 7. Сид ставок налогов и расписания cron (идемпотентно — ON CONFLICT DO NOTHING)
INSERT INTO "AppSetting" ("key", "value", "updatedAt") VALUES
  ('finance.vatPct', '7', CURRENT_TIMESTAMP),
  ('finance.incomeTaxPct', '1', CURRENT_TIMESTAMP),
  ('finance.taxCalcStartQuarter', '2026-Q2', CURRENT_TIMESTAMP),
  ('financeBalanceSnapshotCronTime', '06:00', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
