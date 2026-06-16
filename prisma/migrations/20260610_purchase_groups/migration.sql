-- Группы инвойсов (PurchaseGroup) + Purchase.groupId
CREATE TABLE "PurchaseGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PurchaseGroup_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Purchase" ADD COLUMN "groupId" TEXT;
CREATE INDEX "Purchase_groupId_idx" ON "Purchase"("groupId");
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_groupId_fkey"
    FOREIGN KEY ("groupId") REFERENCES "PurchaseGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;
