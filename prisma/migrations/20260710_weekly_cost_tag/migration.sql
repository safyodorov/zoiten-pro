-- Quick 260710-lmb (W3a): тег недельного фин-отчёта на банковских операциях.
-- OPEX → пул «Общие расходы (бытовая)»; DELIVERY_MP → пул «Доставка до МП»;
-- CAPEX — только маркировка/исключение, в пулы НЕ идёт.
CREATE TYPE "WeeklyCostTag" AS ENUM ('OPEX', 'CAPEX', 'DELIVERY_MP');

ALTER TABLE "BankTransaction" ADD COLUMN "weeklyCostTag" "WeeklyCostTag";

CREATE INDEX "BankTransaction_weeklyCostTag_date_idx" ON "BankTransaction"("weeklyCostTag", "date");
