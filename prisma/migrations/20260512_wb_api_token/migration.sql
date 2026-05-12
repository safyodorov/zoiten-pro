-- Quick 260512-jxh: WB API токены — CRUD через UI.
-- Создаётся вручную (нет локальной PG), применяется через deploy.sh на VPS.
CREATE TABLE "WbApiToken" (
    "name"            TEXT NOT NULL,
    "value"           TEXT NOT NULL,
    "scopeBitmask"    INTEGER NOT NULL,
    "issuedAt"        TIMESTAMP(3) NOT NULL,
    "expiresAt"       TIMESTAMP(3) NOT NULL,
    "sellerId"        TEXT,
    "organizationId"  TEXT,
    "updatedById"     TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WbApiToken_pkey" PRIMARY KEY ("name")
);

ALTER TABLE "WbApiToken"
    ADD CONSTRAINT "WbApiToken_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
