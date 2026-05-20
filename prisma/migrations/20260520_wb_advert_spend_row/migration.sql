-- Phase 19 (продолжение 2026-05-20): WbAdvertSpendRow — история списаний
-- из /adv/v1/upd. Не привязан к WbAdvertCampaign FK потому что campName
-- ловит и архивные кампании, которых уже нет в /promotion/count.

CREATE TABLE IF NOT EXISTS "WbAdvertSpendRow" (
  "id"            SERIAL PRIMARY KEY,
  "updTime"       TIMESTAMP(3),
  "effectiveDate" TIMESTAMP(3) NOT NULL,
  "updSum"        NUMERIC(12, 2) NOT NULL,
  "advertId"      INTEGER NOT NULL,
  "campName"      TEXT NOT NULL,
  "advertType"    INTEGER NOT NULL,
  "paymentType"  TEXT NOT NULL,
  "advertStatus" INTEGER NOT NULL,
  "syncedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WbAdvertSpendRow_advertId_idx" ON "WbAdvertSpendRow"("advertId");
CREATE INDEX IF NOT EXISTS "WbAdvertSpendRow_effectiveDate_idx" ON "WbAdvertSpendRow"("effectiveDate");
CREATE INDEX IF NOT EXISTS "WbAdvertSpendRow_syncedAt_idx" ON "WbAdvertSpendRow"("syncedAt");
