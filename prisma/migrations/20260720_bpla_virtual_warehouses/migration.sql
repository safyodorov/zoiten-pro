-- quick 260720-oh2: виртуальные склады БПЛА (сгоревшие остатки Электросталь/Котовск
-- 17.07.2026) — isVirtual защищает строки от clean-replace синка, WB_BURNED — красная
-- строка потенциальной компенсации в /finance/balance.
ALTER TABLE "WbWarehouse" ADD COLUMN "isVirtual" BOOLEAN NOT NULL DEFAULT false;
ALTER TYPE "FinanceStockLocation" ADD VALUE 'WB_BURNED';
