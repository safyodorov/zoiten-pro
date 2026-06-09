-- Phase 20: Управление закупками — 6 enums + 10 tables + indexes + partial unique.
-- Применяется через `prisma migrate deploy` на VPS (Plan 20-07).
-- DO NOT ALTER "ERP_SECTION" — PROCUREMENT уже существует (Pitfall 1).

-- ──────────────────────────────────────────────────────────────────
-- 1. Enums
-- ──────────────────────────────────────────────────────────────────

CREATE TYPE "PurchaseStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED');
CREATE TYPE "PaymentStatus" AS ENUM ('PLANNED', 'PAID', 'OVERDUE');
CREATE TYPE "PaymentType" AS ENUM ('DEPOSIT', 'BALANCE');
CREATE TYPE "DeliveryType" AS ENUM ('CARGO', 'WHITE');
CREATE TYPE "ContactMethod" AS ENUM ('WECHAT', 'PHONE', 'ALIBABA', 'OTHER');
CREATE TYPE "SupplierContactType" AS ENUM ('SUPPLIER_MANAGER', 'SUPPLIER_BOSS');

-- ──────────────────────────────────────────────────────────────────
-- 2. Supplier (D-01, soft delete)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "Supplier" (
  "id"                 TEXT NOT NULL,
  "nameForeign"        TEXT NOT NULL,
  "nameEnglish"        TEXT NOT NULL,
  "buyerEmployeeId"    TEXT,
  "cooperationSummary" TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  "deletedAt"          TIMESTAMP(3),
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Supplier_buyerEmployeeId_idx" ON "Supplier"("buyerEmployeeId");

ALTER TABLE "Supplier"
  ADD CONSTRAINT "Supplier_buyerEmployeeId_fkey"
  FOREIGN KEY ("buyerEmployeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 3. SupplierContact (D-02)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "SupplierContact" (
  "id"                     TEXT NOT NULL,
  "supplierId"             TEXT NOT NULL,
  "type"                   "SupplierContactType" NOT NULL,
  "name"                   TEXT NOT NULL,
  "phone"                  TEXT,
  "preferredContact"       "ContactMethod" NOT NULL,
  "preferredContactCustom" TEXT,
  "description"            TEXT,
  "isPrimary"              BOOLEAN NOT NULL DEFAULT false,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierContact_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierContact_supplierId_idx" ON "SupplierContact"("supplierId");

ALTER TABLE "SupplierContact"
  ADD CONSTRAINT "SupplierContact_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 4. SupplierProductLink (D-03, per-product параметры)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "SupplierProductLink" (
  "id"                  TEXT NOT NULL,
  "supplierId"          TEXT NOT NULL,
  "productId"           TEXT,
  "productNameFallback" TEXT,
  "leadTimeDays"        INTEGER,
  "leadTimeComment"     TEXT,
  "unitPrice"           DECIMAL(14, 4),
  "currency"            TEXT,
  "deliveryType"        "DeliveryType",
  "deliveryComment"     TEXT,
  "exclusivityStatus"   BOOLEAN NOT NULL DEFAULT false,
  "exclusivityTerms"    TEXT,
  "depositPct"          DECIMAL(5, 2),
  "balancePct"          DECIMAL(5, 2),
  "deferralPct"         DECIMAL(5, 2),
  "deferralTerms"       TEXT,
  "inspectionCity"      TEXT,
  "inspectionAddress"   TEXT,
  "inspectionMapUrl"    TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupplierProductLink_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "SupplierProductLink_supplierId_productId_idx" ON "SupplierProductLink"("supplierId", "productId");
CREATE INDEX "SupplierProductLink_productId_idx" ON "SupplierProductLink"("productId");

-- Partial unique: (supplierId, productId) только когда productId задан (D-03).
CREATE UNIQUE INDEX "SupplierProductLink_supplierId_productId_partial_key"
  ON "SupplierProductLink"("supplierId", "productId")
  WHERE "productId" IS NOT NULL;

ALTER TABLE "SupplierProductLink"
  ADD CONSTRAINT "SupplierProductLink_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SupplierProductLink"
  ADD CONSTRAINT "SupplierProductLink_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 5. Negotiation (D-04)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "Negotiation" (
  "id"         TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "date"       TIMESTAMP(3) NOT NULL,
  "goals"      TEXT NOT NULL,
  "summary"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Negotiation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Negotiation_supplierId_idx" ON "Negotiation"("supplierId");

ALTER TABLE "Negotiation"
  ADD CONSTRAINT "Negotiation_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 6. NegotiationProduct (D-04, M:N)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "NegotiationProduct" (
  "id"            TEXT NOT NULL,
  "negotiationId" TEXT NOT NULL,
  "productId"     TEXT NOT NULL,
  CONSTRAINT "NegotiationProduct_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "NegotiationProduct_negotiationId_productId_key"
  ON "NegotiationProduct"("negotiationId", "productId");

ALTER TABLE "NegotiationProduct"
  ADD CONSTRAINT "NegotiationProduct_negotiationId_fkey"
  FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NegotiationProduct"
  ADD CONSTRAINT "NegotiationProduct_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 7. NegotiationParticipant (D-04, polymorphic)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "NegotiationParticipant" (
  "id"                TEXT NOT NULL,
  "negotiationId"     TEXT NOT NULL,
  "employeeId"        TEXT,
  "supplierContactId" TEXT,
  "customName"        TEXT,
  "customRole"        TEXT,
  CONSTRAINT "NegotiationParticipant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NegotiationParticipant_negotiationId_idx" ON "NegotiationParticipant"("negotiationId");

ALTER TABLE "NegotiationParticipant"
  ADD CONSTRAINT "NegotiationParticipant_negotiationId_fkey"
  FOREIGN KEY ("negotiationId") REFERENCES "Negotiation"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "NegotiationParticipant"
  ADD CONSTRAINT "NegotiationParticipant_employeeId_fkey"
  FOREIGN KEY ("employeeId") REFERENCES "Employee"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "NegotiationParticipant"
  ADD CONSTRAINT "NegotiationParticipant_supplierContactId_fkey"
  FOREIGN KEY ("supplierContactId") REFERENCES "SupplierContact"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 8. Purchase (D-05)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "Purchase" (
  "id"                 TEXT NOT NULL,
  "status"             "PurchaseStatus" NOT NULL DEFAULT 'PLANNED',
  "currency"           TEXT NOT NULL DEFAULT 'CNY',
  "supplierId"         TEXT NOT NULL,
  "optionsDescription" TEXT,
  "optionsExtraCost"   DECIMAL(14, 2),
  "logisticsCost"      DECIMAL(14, 2),
  "logisticsComment"   TEXT,
  "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"          TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Purchase_supplierId_idx" ON "Purchase"("supplierId");
CREATE INDEX "Purchase_status_idx" ON "Purchase"("status");

ALTER TABLE "Purchase"
  ADD CONSTRAINT "Purchase_supplierId_fkey"
  FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 9. PurchaseItem (D-06, multi-product)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "PurchaseItem" (
  "id"         TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "productId"  TEXT NOT NULL,
  "quantity"   INTEGER NOT NULL,
  "unitPrice"  DECIMAL(14, 4) NOT NULL,
  CONSTRAINT "PurchaseItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseItem_purchaseId_idx" ON "PurchaseItem"("purchaseId");

ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_productId_fkey"
  FOREIGN KEY ("productId") REFERENCES "Product"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 10. PurchasePayment (D-08, multi-payment)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "PurchasePayment" (
  "id"         TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "type"       "PaymentType" NOT NULL,
  "ordinal"    INTEGER NOT NULL,
  "percent"    DECIMAL(5, 2),
  "amount"     DECIMAL(14, 2) NOT NULL,
  "currency"   TEXT NOT NULL,
  "dueDate"    TIMESTAMP(3) NOT NULL,
  "paidDate"   TIMESTAMP(3),
  "status"     "PaymentStatus" NOT NULL DEFAULT 'PLANNED',
  "comment"    TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PurchasePayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchasePayment_purchaseId_idx" ON "PurchasePayment"("purchaseId");

ALTER TABLE "PurchasePayment"
  ADD CONSTRAINT "PurchasePayment_purchaseId_fkey"
  FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- ──────────────────────────────────────────────────────────────────
-- 11. CurrencyRate (D-09, forward-only ЦБ РФ sync)
-- ──────────────────────────────────────────────────────────────────

CREATE TABLE "CurrencyRate" (
  "id"        TEXT NOT NULL,
  "date"      DATE NOT NULL,
  "code"      TEXT NOT NULL,
  "nominal"   INTEGER NOT NULL,
  "rateToRub" DECIMAL(14, 6) NOT NULL,
  "syncedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CurrencyRate_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CurrencyRate_date_code_key" ON "CurrencyRate"("date", "code");
CREATE INDEX "CurrencyRate_code_idx" ON "CurrencyRate"("code");
