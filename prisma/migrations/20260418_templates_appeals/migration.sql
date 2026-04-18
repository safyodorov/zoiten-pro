-- Phase 11: Локальные шаблоны ответов + трекер обжалований (hybrid manual).
-- WB Templates API отключён 2025-11-19, WB Complaint API отключён 2025-12-08 —
-- все данные локальные. Нет новых enum'ов (переиспользуем TicketChannel, AppealStatus).
-- Обратно-совместимо с Phase 8/9/10: все новые поля в SupportTicket nullable.

-- ── SupportTicket: добавляем 2 nullable поля Phase 11 ────────────
ALTER TABLE "SupportTicket"
    ADD COLUMN "appealedAt"       TIMESTAMP(3),
    ADD COLUMN "appealResolvedAt" TIMESTAMP(3);

-- ── ResponseTemplate ─────────────────────────────────────────────
CREATE TABLE "ResponseTemplate" (
    "id"           TEXT NOT NULL,
    "name"         TEXT NOT NULL,
    "text"         TEXT NOT NULL,
    "channel"      "TicketChannel" NOT NULL,
    "situationTag" TEXT,
    "nmId"         INTEGER,
    "isActive"     BOOLEAN NOT NULL DEFAULT true,
    "createdById"  TEXT,
    "updatedById"  TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ResponseTemplate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ResponseTemplate_name_channel_key" ON "ResponseTemplate"("name", "channel");
CREATE INDEX "ResponseTemplate_channel_isActive_idx" ON "ResponseTemplate"("channel", "isActive");
CREATE INDEX "ResponseTemplate_nmId_idx"             ON "ResponseTemplate"("nmId");
CREATE INDEX "ResponseTemplate_situationTag_idx"     ON "ResponseTemplate"("situationTag");

ALTER TABLE "ResponseTemplate"
    ADD CONSTRAINT "ResponseTemplate_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ResponseTemplate"
    ADD CONSTRAINT "ResponseTemplate_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── AppealRecord ─────────────────────────────────────────────────
CREATE TABLE "AppealRecord" (
    "id"               TEXT NOT NULL,
    "ticketId"         TEXT NOT NULL,
    "reason"           TEXT NOT NULL,
    "text"             TEXT NOT NULL,
    "status"           "AppealStatus" NOT NULL DEFAULT 'PENDING',
    "createdById"      TEXT NOT NULL,
    "resolvedById"     TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    "appealResolvedAt" TIMESTAMP(3),
    CONSTRAINT "AppealRecord_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AppealRecord_ticketId_key" ON "AppealRecord"("ticketId");
CREATE INDEX "AppealRecord_status_idx"          ON "AppealRecord"("status");
CREATE INDEX "AppealRecord_createdAt_idx"       ON "AppealRecord"("createdAt");

ALTER TABLE "AppealRecord"
    ADD CONSTRAINT "AppealRecord_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AppealRecord"
    ADD CONSTRAINT "AppealRecord_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AppealRecord"
    ADD CONSTRAINT "AppealRecord_resolvedById_fkey"
    FOREIGN KEY ("resolvedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
