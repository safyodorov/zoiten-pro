-- Phase 12: Профиль покупателя + Мессенджеры
-- enum MessengerType + SupportTicket.messengerType/messengerContact + backfill CHAT тикетов.
-- Hybrid strategy (D-01): CHAT получает auto-linked Customer через namespace 'chat:<chatID>',
-- FEEDBACK/QUESTION/RETURN остаются customerId=NULL (manual link через UI в Plan 12-02).

-- pgcrypto для gen_random_uuid() в backfill (идемпотентно)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1. CreateEnum MessengerType
CREATE TYPE "MessengerType" AS ENUM ('TELEGRAM', 'WHATSAPP', 'OTHER');

-- 2. AlterTable SupportTicket — новые поля (nullable, только для channel=MESSENGER)
ALTER TABLE "SupportTicket"
    ADD COLUMN "messengerType"    "MessengerType",
    ADD COLUMN "messengerContact" TEXT;

-- 3. Backfill: для всех CHAT тикетов с customerId=NULL и wbExternalId NOT NULL
--    создать/переиспользовать Customer с wbUserId='chat:'||wbExternalId и name=customerNameSnapshot.
--    Идемпотентно через ON CONFLICT (wbUserId unique).

WITH candidate_chats AS (
    SELECT DISTINCT
        'chat:' || t."wbExternalId" AS wb_user_id,
        t."customerNameSnapshot"    AS client_name
    FROM "SupportTicket" t
    WHERE t."channel"      = 'CHAT'
      AND t."customerId"   IS NULL
      AND t."wbExternalId" IS NOT NULL
)
INSERT INTO "Customer" ("id", "wbUserId", "name", "createdAt", "updatedAt")
SELECT
    gen_random_uuid()::text,
    cc.wb_user_id,
    cc.client_name,
    NOW(),
    NOW()
FROM candidate_chats cc
ON CONFLICT ("wbUserId") DO UPDATE SET "name" = COALESCE(EXCLUDED."name", "Customer"."name");

-- 4. Проставить customerId в существующих CHAT тикетах
UPDATE "SupportTicket" t
SET "customerId" = c."id"
FROM "Customer" c
WHERE c."wbUserId"   = 'chat:' || t."wbExternalId"
  AND t."channel"      = 'CHAT'
  AND t."customerId"   IS NULL
  AND t."wbExternalId" IS NOT NULL;
