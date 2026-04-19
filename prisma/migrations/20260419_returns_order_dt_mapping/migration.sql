-- Phase 9 fix: wbOrderDt + retroactive (status, status_ex) → returnState mapping

ALTER TABLE "SupportTicket" ADD COLUMN "wbOrderDt" TIMESTAMP(3);

-- Маппинг подтверждён пользователем на реальных заявках 2026-04-19:
--   status=0            → PENDING  (ждёт решения продавца, счётчик)
--   status=1            → REJECTED (seller или покупатель отказались)
--   status=2, sex=10    → APPROVED (автовозврат, финал)
--   status=2, sex=5     → REJECTED (финальный отказ)
-- Обновляем ТОЛЬКО те тикеты, где локального решения ещё не было
-- (returnState='PENDING' AND нет ReturnDecision от менеджера).

UPDATE "SupportTicket" t
SET "returnState" = CASE
  WHEN t."wbClaimStatus" = 0 THEN 'PENDING'::"ReturnState"
  WHEN t."wbClaimStatus" = 1 THEN 'REJECTED'::"ReturnState"
  WHEN t."wbClaimStatus" = 2 AND t."wbClaimStatusEx" = 10 THEN 'APPROVED'::"ReturnState"
  WHEN t."wbClaimStatus" = 2 AND t."wbClaimStatusEx" = 5 THEN 'REJECTED'::"ReturnState"
  ELSE t."returnState"
END
WHERE t.channel = 'RETURN'
  AND t."returnState" = 'PENDING'
  AND NOT EXISTS (
    SELECT 1 FROM "ReturnDecision" d WHERE d."ticketId" = t.id
  );
