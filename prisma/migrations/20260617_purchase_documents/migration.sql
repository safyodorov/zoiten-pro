-- Документы закупки
CREATE TYPE "PurchaseDocCategory" AS ENUM ('INVOICE', 'CONTRACT', 'CERTIFICATION', 'PACKING_LIST', 'PAYMENT', 'CUSTOMS_OTHER', 'OTHER');

CREATE TABLE "PurchaseDocument" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "category" "PurchaseDocCategory" NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PurchaseDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PurchaseDocument_purchaseId_idx" ON "PurchaseDocument"("purchaseId");

ALTER TABLE "PurchaseDocument" ADD CONSTRAINT "PurchaseDocument_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;
