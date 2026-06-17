-- Инспекция закупки (1:1) + контакты инспектора + фото для отчёта
CREATE TABLE "PurchaseInspection" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "plannedDate" TIMESTAMP(3),
    "actualDate" TIMESTAMP(3),
    "costRub" DECIMAL(14,2),
    "inspectorName" TEXT,
    "reportSummary" TEXT,
    "techSpecName" TEXT,
    "techSpecStored" TEXT,
    "techSpecMime" TEXT,
    "techSpecSize" INTEGER,
    "reportName" TEXT,
    "reportStored" TEXT,
    "reportMime" TEXT,
    "reportSize" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseInspection_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PurchaseInspection_purchaseId_key" ON "PurchaseInspection"("purchaseId");
ALTER TABLE "PurchaseInspection" ADD CONSTRAINT "PurchaseInspection_purchaseId_fkey"
    FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InspectionContact" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "phone" TEXT,
    "wechat" TEXT,
    CONSTRAINT "InspectionContact_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InspectionContact_inspectionId_idx" ON "InspectionContact"("inspectionId");
ALTER TABLE "InspectionContact" ADD CONSTRAINT "InspectionContact_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "PurchaseInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "InspectionPhoto" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InspectionPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InspectionPhoto_inspectionId_idx" ON "InspectionPhoto"("inspectionId");
ALTER TABLE "InspectionPhoto" ADD CONSTRAINT "InspectionPhoto_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "PurchaseInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
