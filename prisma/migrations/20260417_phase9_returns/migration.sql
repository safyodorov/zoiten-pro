-- Phase 9: Возвраты — WB Claims API.
-- Новая модель ReturnDecision (audit log решений) + 2 enum (ReturnDecisionAction, ReturnState)
-- + 8 nullable полей в SupportTicket + relation User.returnDecisions.
-- Никаких breaking changes для Phase 8.

-- ── Enums ─────────────────────────────────────────────────────────
CREATE TYPE "ReturnDecisionAction" AS ENUM ('APPROVE', 'REJECT', 'RECONSIDER');
CREATE TYPE "ReturnState"          AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- ── SupportTicket: добавляем 8 полей Phase 9 ─────────────────────
ALTER TABLE "SupportTicket"
    ADD COLUMN "wbClaimStatus"   INTEGER,
    ADD COLUMN "wbClaimStatusEx" INTEGER,
    ADD COLUMN "wbClaimType"     INTEGER,
    ADD COLUMN "wbActions"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    ADD COLUMN "wbComment"       TEXT,
    ADD COLUMN "srid"            TEXT,
    ADD COLUMN "price"           DOUBLE PRECISION,
    ADD COLUMN "returnState"     "ReturnState";

CREATE INDEX "SupportTicket_returnState_idx" ON "SupportTicket"("returnState");

-- ── ReturnDecision ───────────────────────────────────────────────
CREATE TABLE "ReturnDecision" (
    "id"           TEXT NOT NULL,
    "ticketId"     TEXT NOT NULL,
    "action"       "ReturnDecisionAction" NOT NULL,
    "wbAction"     TEXT NOT NULL,
    "reason"       TEXT,
    "decidedById"  TEXT NOT NULL,
    "decidedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reconsidered" BOOLEAN NOT NULL DEFAULT false,
    "wbResponseOk" BOOLEAN NOT NULL DEFAULT true,
    "wbError"      TEXT,
    CONSTRAINT "ReturnDecision_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReturnDecision_ticketId_decidedAt_idx" ON "ReturnDecision"("ticketId", "decidedAt");
CREATE INDEX "ReturnDecision_decidedById_idx"        ON "ReturnDecision"("decidedById");

ALTER TABLE "ReturnDecision"
    ADD CONSTRAINT "ReturnDecision_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ReturnDecision"
    ADD CONSTRAINT "ReturnDecision_decidedById_fkey"
    FOREIGN KEY ("decidedById") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
