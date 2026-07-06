-- Индекс сезонности плана продаж (Товары) — помесячный множитель ставки.

-- CreateEnum
CREATE TYPE "SeasonalityScope" AS ENUM ('GLOBAL', 'DIRECTION', 'CATEGORY', 'SUBCATEGORY');

-- CreateTable
CREATE TABLE "SalesPlanSeasonality" (
    "id" TEXT NOT NULL,
    "versionId" TEXT,
    "scope" "SeasonalityScope" NOT NULL,
    "scopeId" TEXT,
    "month" DATE NOT NULL,
    "indexPct" DOUBLE PRECISION NOT NULL,
    CONSTRAINT "SalesPlanSeasonality_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (NULLS NOT DISTINCT — черновик versionId=null / GLOBAL scopeId=null дедупятся)
CREATE UNIQUE INDEX "SalesPlanSeasonality_versionId_scope_scopeId_month_key"
    ON "SalesPlanSeasonality" ("versionId", "scope", "scopeId", "month") NULLS NOT DISTINCT;

-- CreateIndex
CREATE INDEX "SalesPlanSeasonality_versionId_idx" ON "SalesPlanSeasonality" ("versionId");

-- AddForeignKey
ALTER TABLE "SalesPlanSeasonality"
    ADD CONSTRAINT "SalesPlanSeasonality_versionId_fkey"
    FOREIGN KEY ("versionId") REFERENCES "SalesPlanVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
