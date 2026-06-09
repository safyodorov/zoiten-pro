-- Phase 21: Кредиты — добавить CREDITS в ERP_SECTION + создать Lender, Loan, LoanPayment
-- Применяется через `prisma migrate deploy` на VPS (Plan 21-08).

-- 1. Добавить CREDITS в enum ERP_SECTION
ALTER TYPE "ERP_SECTION" ADD VALUE IF NOT EXISTS 'CREDITS';

-- 2. Справочник кредиторов (U-03: называется Lender, НЕ Bank)
CREATE TABLE "Lender" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Lender_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Lender_name_key" ON "Lender"("name");

-- 3. Кредиты (soft delete, Decimal precision D-19)
CREATE TABLE "Loan" (
  "id"             TEXT NOT NULL,
  "contractNumber" TEXT NOT NULL,
  "companyId"      TEXT NOT NULL,
  "lenderId"       TEXT NOT NULL,
  "amount"         DECIMAL(14, 2) NOT NULL,
  "annualRatePct"  DECIMAL(6, 3) NOT NULL,
  "termMonths"     INTEGER,
  "issueDate"      TIMESTAMP(3),
  "notes"          TEXT,
  "deletedAt"      TIMESTAMP(3),
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Loan_deletedAt_idx" ON "Loan"("deletedAt");
CREATE INDEX "Loan_companyId_idx" ON "Loan"("companyId");
CREATE INDEX "Loan_lenderId_idx" ON "Loan"("lenderId");

ALTER TABLE "Loan"
  ADD CONSTRAINT "Loan_companyId_fkey"
  FOREIGN KEY ("companyId") REFERENCES "Company"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Loan"
  ADD CONSTRAINT "Loan_lenderId_fkey"
  FOREIGN KEY ("lenderId") REFERENCES "Lender"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- 4. Строки графика погашения (onDelete Cascade)
CREATE TABLE "LoanPayment" (
  "id"        TEXT NOT NULL,
  "loanId"    TEXT NOT NULL,
  "date"      DATE NOT NULL,
  "principal" DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "interest"  DECIMAL(14, 2) NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoanPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LoanPayment_loanId_date_idx" ON "LoanPayment"("loanId", "date");

ALTER TABLE "LoanPayment"
  ADD CONSTRAINT "LoanPayment_loanId_fkey"
  FOREIGN KEY ("loanId") REFERENCES "Loan"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
