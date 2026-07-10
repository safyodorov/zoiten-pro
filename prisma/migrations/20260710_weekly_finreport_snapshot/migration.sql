-- W3c (quick 260710-mih): immutable-снапшот недели понедельного фин-отчёта.
-- Одна строка на неделю; payloadJson = весь рендер-пейлоад (v1). Без backfill.
CREATE TABLE "WeeklyFinReportSnapshot" (
    "id" TEXT NOT NULL,
    "weekStart" DATE NOT NULL,
    "fixedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fixedById" TEXT,
    "payloadJson" JSONB NOT NULL,

    CONSTRAINT "WeeklyFinReportSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyFinReportSnapshot_weekStart_key" ON "WeeklyFinReportSnapshot"("weekStart");

-- AddForeignKey
ALTER TABLE "WeeklyFinReportSnapshot" ADD CONSTRAINT "WeeklyFinReportSnapshot_fixedById_fkey"
  FOREIGN KEY ("fixedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
