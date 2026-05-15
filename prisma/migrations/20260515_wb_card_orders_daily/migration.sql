-- 2026-05-15 (quick 260515-m5o): WbCardOrdersDaily — snapshot заказов per nmId per day.
-- Daily cron 05:00 MSK пишет данные за вчера; одноразовый backfill с 2026-04-01.
-- Только дни с qty > 0 хранятся (fill пустых дней — на сервере при сборке chart timeSeries).
-- nmId без FK на WbCard — исторические orders должны выживать после soft/hard-delete WbCard.

CREATE TABLE "WbCardOrdersDaily" (
  "id"        SERIAL PRIMARY KEY,
  "nmId"      INTEGER NOT NULL,
  "date"      DATE NOT NULL,
  "qty"       INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX "WbCardOrdersDaily_nmId_date_key" ON "WbCardOrdersDaily"("nmId", "date");
CREATE INDEX "WbCardOrdersDaily_nmId_idx" ON "WbCardOrdersDaily"("nmId");
CREATE INDEX "WbCardOrdersDaily_date_idx" ON "WbCardOrdersDaily"("date");
