-- Phase 22 (22-06): Add opening/closing balance fields to BankAccount
-- for dashboard "Остатки по счетам" feature.

ALTER TABLE "BankAccount" ADD COLUMN "openingBalance" DECIMAL(18,2);
ALTER TABLE "BankAccount" ADD COLUMN "closingBalance" DECIMAL(18,2);
ALTER TABLE "BankAccount" ADD COLUMN "balanceDate" DATE;
