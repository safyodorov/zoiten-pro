-- Видео инспекции
CREATE TABLE "InspectionVideo" (
    "id" TEXT NOT NULL,
    "inspectionId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InspectionVideo_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "InspectionVideo_inspectionId_idx" ON "InspectionVideo"("inspectionId");
ALTER TABLE "InspectionVideo" ADD CONSTRAINT "InspectionVideo_inspectionId_fkey"
    FOREIGN KEY ("inspectionId") REFERENCES "PurchaseInspection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
