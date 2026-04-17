-- Phase 8: Служба поддержки MVP — единая модель для всех каналов.
-- 5 enum + 4 модели (Customer, SupportTicket, SupportMessage, SupportMedia).
-- Связь с WbCard через nmId БЕЗ FK (паттерн проекта).

-- ── Enums ─────────────────────────────────────────────────────────
CREATE TYPE "TicketChannel" AS ENUM ('FEEDBACK', 'QUESTION', 'CHAT', 'RETURN', 'MESSENGER');
CREATE TYPE "TicketStatus"  AS ENUM ('NEW', 'IN_PROGRESS', 'ANSWERED', 'CLOSED', 'APPEALED');
CREATE TYPE "AppealStatus"  AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE "Direction"     AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "MediaType"     AS ENUM ('IMAGE', 'VIDEO');

-- ── Customer ─────────────────────────────────────────────────────
CREATE TABLE "Customer" (
    "id"        TEXT NOT NULL,
    "wbUserId"  TEXT,
    "phone"     TEXT,
    "name"      TEXT,
    "note"      TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Customer_wbUserId_key" ON "Customer"("wbUserId");

-- ── SupportTicket ────────────────────────────────────────────────
CREATE TABLE "SupportTicket" (
    "id"            TEXT NOT NULL,
    "channel"       "TicketChannel" NOT NULL,
    "wbExternalId"  TEXT,
    "customerId"    TEXT,
    "nmId"          INTEGER,
    "status"        "TicketStatus" NOT NULL DEFAULT 'NEW',
    "assignedToId"  TEXT,
    "rating"        INTEGER,
    "appealStatus"  "AppealStatus",
    "appealId"      TEXT,
    "lastMessageAt" TIMESTAMP(3),
    "previewText"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    "resolvedAt"    TIMESTAMP(3),
    CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "SupportTicket_channel_wbExternalId_key" ON "SupportTicket"("channel", "wbExternalId");
CREATE INDEX "SupportTicket_status_idx"       ON "SupportTicket"("status");
CREATE INDEX "SupportTicket_channel_idx"      ON "SupportTicket"("channel");
CREATE INDEX "SupportTicket_nmId_idx"         ON "SupportTicket"("nmId");
CREATE INDEX "SupportTicket_assignedToId_idx" ON "SupportTicket"("assignedToId");
CREATE INDEX "SupportTicket_createdAt_idx"    ON "SupportTicket"("createdAt");

ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "Customer"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SupportTicket"
    ADD CONSTRAINT "SupportTicket_assignedToId_fkey"
    FOREIGN KEY ("assignedToId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── SupportMessage ───────────────────────────────────────────────
CREATE TABLE "SupportMessage" (
    "id"          TEXT NOT NULL,
    "ticketId"    TEXT NOT NULL,
    "direction"   "Direction" NOT NULL,
    "text"        TEXT,
    "authorId"    TEXT,
    "isAutoReply" BOOLEAN NOT NULL DEFAULT false,
    "sentAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "wbSentAt"    TIMESTAMP(3),
    CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportMessage_ticketId_sentAt_idx" ON "SupportMessage"("ticketId", "sentAt");

ALTER TABLE "SupportMessage"
    ADD CONSTRAINT "SupportMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SupportMessage"
    ADD CONSTRAINT "SupportMessage_authorId_fkey"
    FOREIGN KEY ("authorId") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── SupportMedia ─────────────────────────────────────────────────
CREATE TABLE "SupportMedia" (
    "id"        TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "type"      "MediaType" NOT NULL,
    "wbUrl"     TEXT NOT NULL,
    "localPath" TEXT,
    "sizeBytes" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SupportMedia_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SupportMedia_expiresAt_idx" ON "SupportMedia"("expiresAt");

ALTER TABLE "SupportMedia"
    ADD CONSTRAINT "SupportMedia_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "SupportMessage"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
