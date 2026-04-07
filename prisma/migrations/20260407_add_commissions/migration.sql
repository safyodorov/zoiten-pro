-- Стандартные и ИУ комиссии для карточек WB
ALTER TABLE "WbCard" ADD COLUMN "commFbwStd" DOUBLE PRECISION;
ALTER TABLE "WbCard" ADD COLUMN "commFbsStd" DOUBLE PRECISION;
ALTER TABLE "WbCard" ADD COLUMN "commFbwIu" DOUBLE PRECISION;
ALTER TABLE "WbCard" ADD COLUMN "commFbsIu" DOUBLE PRECISION;

-- Справочник индивидуальных условий комиссий (из Excel)
CREATE TABLE "WbCommissionIu" (
    "id" TEXT NOT NULL,
    "parentName" TEXT NOT NULL,
    "subjectName" TEXT NOT NULL,
    "fbw" DOUBLE PRECISION NOT NULL,
    "fbs" DOUBLE PRECISION NOT NULL,
    "dbs" DOUBLE PRECISION NOT NULL,
    "express" DOUBLE PRECISION NOT NULL,
    "pickup" DOUBLE PRECISION NOT NULL,
    "booking" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "WbCommissionIu_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbCommissionIu_subjectName_key" ON "WbCommissionIu"("subjectName");
