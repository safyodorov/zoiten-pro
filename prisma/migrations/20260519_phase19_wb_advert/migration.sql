-- Phase 19: WB Advert (управление рекламой WB)
-- Created: 2026-05-19
-- Manual migration — local PG отсутствует, применится на VPS через prisma migrate deploy

-- 1. Расширить ERP_SECTION enum значением ADS
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'ADS';

-- 2. WbAdvertCampaign — список кампаний (snapshot WB)
CREATE TABLE IF NOT EXISTS "WbAdvertCampaign" (
  "advertId"     INTEGER PRIMARY KEY,
  "name"         TEXT,
  "type"         INTEGER NOT NULL,
  "status"       INTEGER NOT NULL,
  "cpm"          INTEGER,
  "dailyBudget"  INTEGER,
  "startDate"    TIMESTAMP(3),
  "endDate"      TIMESTAMP(3),
  "changeTime"   TIMESTAMP(3) NOT NULL,
  "raw"          JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "WbAdvertCampaign_status_idx" ON "WbAdvertCampaign"("status");
CREATE INDEX IF NOT EXISTS "WbAdvertCampaign_type_idx" ON "WbAdvertCampaign"("type");

-- 3. WbAdvertTarget — связь advertId ↔ nmId (M:N через unique compound)
CREATE TABLE IF NOT EXISTS "WbAdvertTarget" (
  "id"        SERIAL PRIMARY KEY,
  "advertId"  INTEGER NOT NULL,
  "nmId"      INTEGER NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WbAdvertTarget_advertId_fkey" FOREIGN KEY ("advertId") REFERENCES "WbAdvertCampaign"("advertId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WbAdvertTarget_advertId_nmId_key" ON "WbAdvertTarget"("advertId", "nmId");
CREATE INDEX IF NOT EXISTS "WbAdvertTarget_nmId_idx" ON "WbAdvertTarget"("nmId");

-- 4. WbAdvertStatDaily — дневная статистика per (advertId, date, nmId, appType)
CREATE TABLE IF NOT EXISTS "WbAdvertStatDaily" (
  "id"        SERIAL PRIMARY KEY,
  "advertId"  INTEGER NOT NULL,
  "date"      DATE NOT NULL,
  "nmId"      INTEGER NOT NULL,
  "appType"   INTEGER NOT NULL,
  "views"     INTEGER NOT NULL DEFAULT 0,
  "clicks"    INTEGER NOT NULL DEFAULT 0,
  "ctr"       DOUBLE PRECISION,
  "cpc"       DOUBLE PRECISION,
  "sum"       DOUBLE PRECISION NOT NULL DEFAULT 0,
  "atbs"      INTEGER NOT NULL DEFAULT 0,
  "orders"    INTEGER NOT NULL DEFAULT 0,
  "cr"        DOUBLE PRECISION,
  "shks"      INTEGER NOT NULL DEFAULT 0,
  "sumPrice"  DOUBLE PRECISION NOT NULL DEFAULT 0,
  "canceled"  INTEGER NOT NULL DEFAULT 0,                          -- Phase 19 W0
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WbAdvertStatDaily_advertId_fkey" FOREIGN KEY ("advertId") REFERENCES "WbAdvertCampaign"("advertId") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WbAdvertStatDaily_advertId_date_nmId_appType_key" ON "WbAdvertStatDaily"("advertId", "date", "nmId", "appType");
CREATE INDEX IF NOT EXISTS "WbAdvertStatDaily_date_idx" ON "WbAdvertStatDaily"("date");
CREATE INDEX IF NOT EXISTS "WbAdvertStatDaily_nmId_date_idx" ON "WbAdvertStatDaily"("nmId", "date");

-- 5. WbAdvertBalanceSnapshot — snapshot баланса (Phase 19 W0 shape)
CREATE TABLE IF NOT EXISTS "WbAdvertBalanceSnapshot" (
  "id"         SERIAL PRIMARY KEY,
  "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "balance"    INTEGER NOT NULL,
  "net"        INTEGER NOT NULL,
  "currency"   TEXT NOT NULL DEFAULT 'RUB'
);

CREATE INDEX IF NOT EXISTS "WbAdvertBalanceSnapshot_capturedAt_idx" ON "WbAdvertBalanceSnapshot"("capturedAt");
