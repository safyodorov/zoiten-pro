-- Quick 260519-funnel: WB Analytics Funnel daily per nmId per day
-- Created: 2026-05-19
-- Параллельная таблица к WbCardOrdersDaily (Statistics) — business-level метрики
-- из WB nm-report (то, что показывается в кабинете "Аналитика → По дням").

CREATE TABLE IF NOT EXISTS "WbCardFunnelDaily" (
  "id"                    SERIAL PRIMARY KEY,
  "nmId"                  INTEGER NOT NULL,
  "date"                  DATE NOT NULL,
  "openCardCount"         INTEGER NOT NULL DEFAULT 0,
  "addToCartCount"        INTEGER NOT NULL DEFAULT 0,
  "ordersCount"           INTEGER NOT NULL DEFAULT 0,
  "ordersSumRub"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "buyoutsCount"          INTEGER NOT NULL DEFAULT 0,
  "buyoutsSumRub"         DOUBLE PRECISION NOT NULL DEFAULT 0,
  "cancelCount"           INTEGER NOT NULL DEFAULT 0,
  "cancelSumRub"          DOUBLE PRECISION NOT NULL DEFAULT 0,
  "addToCartConversion"   DOUBLE PRECISION,
  "cartToOrderConversion" DOUBLE PRECISION,
  "buyoutPercent"         DOUBLE PRECISION,
  "createdAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "WbCardFunnelDaily_nmId_date_key" ON "WbCardFunnelDaily"("nmId", "date");
CREATE INDEX IF NOT EXISTS "WbCardFunnelDaily_nmId_idx" ON "WbCardFunnelDaily"("nmId");
CREATE INDEX IF NOT EXISTS "WbCardFunnelDaily_date_idx" ON "WbCardFunnelDaily"("date");
