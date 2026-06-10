-- Phase 22: Банковские счета — ERP_SECTION.BANK + Company реквизиты + Lender.bankId
-- + Bank, BankAccount, Counterparty, BankTransaction, ImportBatch + enums TxDirection/TxCategory
-- Применяется через `prisma migrate deploy` на VPS (Plan 22-05).

-- 1. Новое значение enum ERP_SECTION
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'BANK';

-- 2. Новые enum
CREATE TYPE "TxDirection" AS ENUM ('DEBIT', 'CREDIT');
CREATE TYPE "TxCategory" AS ENUM ('UNCATEGORIZED', 'INTERNAL_TRANSFER', 'BANK_FEE', 'SUPPLIER_PAYMENT', 'INCOME', 'TAX', 'LOAN', 'OTHER');

-- 3. Реквизиты в Company
ALTER TABLE "Company" ADD COLUMN "inn" TEXT;
ALTER TABLE "Company" ADD COLUMN "kpp" TEXT;
ALTER TABLE "Company" ADD COLUMN "ogrn" TEXT;
ALTER TABLE "Company" ADD COLUMN "shortName" TEXT;
CREATE UNIQUE INDEX "Company_inn_key" ON "Company"("inn");

-- 4. Bank (по БИК)
CREATE TABLE "Bank" (
  "id"        TEXT NOT NULL,
  "bic"       TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Bank_bic_key" ON "Bank"("bic");

-- 5. Lender.bankId (nullable FK на будущее)
ALTER TABLE "Lender" ADD COLUMN "bankId" TEXT;
ALTER TABLE "Lender"
  ADD CONSTRAINT "Lender_bankId_fkey"
  FOREIGN KEY ("bankId") REFERENCES "Bank"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- 6. BankAccount
CREATE TABLE "BankAccount" (
  "id"        TEXT NOT NULL,
  "number"    TEXT NOT NULL,
  "companyId" TEXT NOT NULL,
  "bankId"    TEXT NOT NULL,
  "currency"  TEXT NOT NULL DEFAULT 'RUR',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankAccount_number_key" ON "BankAccount"("number");
CREATE INDEX "BankAccount_companyId_idx" ON "BankAccount"("companyId");
CREATE INDEX "BankAccount_bankId_idx" ON "BankAccount"("bankId");
ALTER TABLE "BankAccount"
  ADD CONSTRAINT "BankAccount_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BankAccount"
  ADD CONSTRAINT "BankAccount_bankId_fkey"
  FOREIGN KEY ("bankId") REFERENCES "Bank"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Counterparty (дедуп по ИНН)
CREATE TABLE "Counterparty" (
  "id"        TEXT NOT NULL,
  "inn"       TEXT,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Counterparty_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Counterparty_inn_key" ON "Counterparty"("inn");

-- 8. ImportBatch
CREATE TABLE "ImportBatch" (
  "id"           TEXT NOT NULL,
  "fileName"     TEXT NOT NULL,
  "sourceBank"   TEXT NOT NULL,
  "rowsTotal"    INTEGER NOT NULL,
  "rowsImported" INTEGER NOT NULL,
  "rowsSkipped"  INTEGER NOT NULL,
  "importedById" TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImportBatch_pkey" PRIMARY KEY ("id")
);

-- 9. BankTransaction (fingerprint @unique — дедуп; amount Decimal(18,2))
CREATE TABLE "BankTransaction" (
  "id"                  TEXT NOT NULL,
  "accountId"           TEXT NOT NULL,
  "date"                DATE NOT NULL,
  "direction"           "TxDirection" NOT NULL,
  "amount"              DECIMAL(18, 2) NOT NULL,
  "currency"            TEXT NOT NULL,
  "docNumber"           TEXT,
  "operationType"       TEXT,
  "purpose"             TEXT NOT NULL,
  "counterpartyId"      TEXT,
  "counterpartyName"    TEXT,
  "counterpartyInn"     TEXT,
  "counterpartyBic"     TEXT,
  "counterpartyAccount" TEXT,
  "category"            "TxCategory" DEFAULT 'UNCATEGORIZED',
  "fingerprint"         TEXT NOT NULL,
  "importBatchId"       TEXT,
  "sourceBank"          TEXT NOT NULL,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "BankTransaction_fingerprint_key" ON "BankTransaction"("fingerprint");
CREATE INDEX "BankTransaction_accountId_date_idx" ON "BankTransaction"("accountId", "date");
CREATE INDEX "BankTransaction_category_idx" ON "BankTransaction"("category");
CREATE INDEX "BankTransaction_counterpartyId_idx" ON "BankTransaction"("counterpartyId");
CREATE INDEX "BankTransaction_importBatchId_idx" ON "BankTransaction"("importBatchId");
ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "BankAccount"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_counterpartyId_fkey"
  FOREIGN KEY ("counterpartyId") REFERENCES "Counterparty"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "BankTransaction"
  ADD CONSTRAINT "BankTransaction_importBatchId_fkey"
  FOREIGN KEY ("importBatchId") REFERENCES "ImportBatch"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
