-- quick 260714-ij9: амортизация единовременных комиссий JetLend + НДФЛ per транш
-- (кредитный пул /finance/weekly v2, закрывает W3b). Оба поля nullable.
ALTER TABLE "Loan" ADD COLUMN "monthlyCommissionRub" DECIMAL(12,2);
ALTER TABLE "Loan" ADD COLUMN "monthlyNdflRub" DECIMAL(12,2);
