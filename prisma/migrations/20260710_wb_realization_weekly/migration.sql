-- CreateTable (quick 260710-jgs W1): недельный агрегат отчёта реализации WB.
-- Источник — Finance API sales-reports (list → detailed → classify → aggregate).
-- nmId = 0 — account-level строки без nm_id. Без backfill (данные появятся
-- при первом синке после деплоя).
CREATE TABLE "WbRealizationWeekly" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "nmId" INTEGER NOT NULL,
    "forPayRub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deliveryRub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "storageRub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "acceptanceRub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penaltyRub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reviewPointsRub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "promotionRub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "deductionOtherRub" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reportIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WbRealizationWeekly_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WbRealizationWeekly_weekStart_nmId_key" ON "WbRealizationWeekly"("weekStart", "nmId");

-- CreateIndex
CREATE INDEX "WbRealizationWeekly_weekStart_idx" ON "WbRealizationWeekly"("weekStart");
