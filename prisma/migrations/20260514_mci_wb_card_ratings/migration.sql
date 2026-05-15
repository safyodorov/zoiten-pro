-- Phase 260514-mci: WbCard.imtId + ratingImt + reviewsTotalImt
-- Поля заполняются через POST /api/wb-ratings-sync (lib/wb-ratings.ts)
-- и parseCard (lib/wb-api.ts) при следующем полном sync через /api/wb-sync.

ALTER TABLE "WbCard"
  ADD COLUMN "imtId"           INTEGER,
  ADD COLUMN "ratingImt"       DOUBLE PRECISION,
  ADD COLUMN "reviewsTotalImt" INTEGER;

CREATE INDEX "WbCard_imtId_idx" ON "WbCard"("imtId");
