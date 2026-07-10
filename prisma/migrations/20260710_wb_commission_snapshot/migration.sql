-- CreateTable
CREATE TABLE "WbCommissionSnapshot" (
    "id" TEXT NOT NULL,
    "validFrom" DATE NOT NULL,
    "nmId" INTEGER NOT NULL,
    "commFbwIu" DOUBLE PRECISION,
    "commFbwStd" DOUBLE PRECISION,
    "commFbsIu" DOUBLE PRECISION,
    "commFbsStd" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WbCommissionSnapshot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbCommissionSnapshot_validFrom_nmId_key" ON "WbCommissionSnapshot"("validFrom", "nmId");
CREATE INDEX "WbCommissionSnapshot_nmId_validFrom_idx" ON "WbCommissionSnapshot"("nmId", "validFrom");

-- Backfill: текущие ставки WbCard как снапшот от 2026-06-01 (заведомо ДО роста комиссий 07.07.2026).
-- Ночной синк 2026-07-10 02:30 ещё держал СТАРЫЕ ставки — backfill успевает их сохранить.
-- gen_random_uuid() доступен в PG16 без расширений; id в схеме cuid, uuid-текст допустим для миграции.
INSERT INTO "WbCommissionSnapshot" ("id","validFrom","nmId","commFbwIu","commFbwStd","commFbsIu","commFbsStd")
SELECT gen_random_uuid()::text, DATE '2026-06-01', "nmId", "commFbwIu","commFbwStd","commFbsIu","commFbsStd"
FROM "WbCard";
