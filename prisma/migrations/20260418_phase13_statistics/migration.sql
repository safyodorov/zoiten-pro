-- Phase 13: Статистика службы поддержки
-- 1. ManagerSupportStats — денормализованная статистика менеджеров (SUP-39)
-- 2. Performance индексы для per-product и avg response time агрегаций

CREATE TABLE "ManagerSupportStats" (
  "id"                 TEXT         NOT NULL PRIMARY KEY,
  "userId"             TEXT         NOT NULL,
  "period"             TIMESTAMP(3) NOT NULL,
  "totalProcessed"     INTEGER      NOT NULL DEFAULT 0,
  "feedbacksAnswered"  INTEGER      NOT NULL DEFAULT 0,
  "questionsAnswered"  INTEGER      NOT NULL DEFAULT 0,
  "chatsAnswered"      INTEGER      NOT NULL DEFAULT 0,
  "returnsDecided"     INTEGER      NOT NULL DEFAULT 0,
  "returnsApproved"    INTEGER      NOT NULL DEFAULT 0,
  "returnsRejected"    INTEGER      NOT NULL DEFAULT 0,
  "appealsResolved"    INTEGER      NOT NULL DEFAULT 0,
  "avgResponseTimeSec" INTEGER,
  "updatedAt"          TIMESTAMP(3) NOT NULL
);

CREATE UNIQUE INDEX "ManagerSupportStats_userId_period_key" ON "ManagerSupportStats"("userId", "period");
CREATE INDEX "ManagerSupportStats_period_idx" ON "ManagerSupportStats"("period");

ALTER TABLE "ManagerSupportStats"
  ADD CONSTRAINT "ManagerSupportStats_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Phase 13 — performance индексы для агрегаций (add-only, не breaking)
CREATE INDEX "SupportTicket_channel_nmId_createdAt_idx"
  ON "SupportTicket"("channel", "nmId", "createdAt");
CREATE INDEX "SupportMessage_direction_isAutoReply_wbSentAt_idx"
  ON "SupportMessage"("direction", "isAutoReply", "wbSentAt");
