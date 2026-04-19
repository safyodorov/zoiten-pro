-- Auto-link CHAT ticket ↔ RETURN ticket
-- Когда syncChats видит новый chat (isNewChat=true) с nmId совпадающим с
-- recent RETURN — проставляет linkedReturnId, чтобы в UI показать связь.

ALTER TABLE "SupportTicket" ADD COLUMN "linkedReturnId" TEXT;
ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_linkedReturnId_fkey"
  FOREIGN KEY ("linkedReturnId") REFERENCES "SupportTicket"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "SupportTicket_linkedReturnId_idx" ON "SupportTicket"("linkedReturnId");
