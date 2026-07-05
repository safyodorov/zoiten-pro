-- Quick 260705-f1p: WbSalesDaily
-- Дневной факт выкупов по дате реализации (Statistics Sales API supplier/sales).
-- Аддитивная миграция — применяется через prisma migrate deploy на VPS.
-- nmId без FK (паттерн проекта: WbCard может быть soft-delete).

CREATE TABLE "WbSalesDaily" (
    "id"           SERIAL              NOT NULL,
    "nmId"         INTEGER             NOT NULL,
    "date"         DATE                NOT NULL,
    "buyoutsRub"   DOUBLE PRECISION    NOT NULL DEFAULT 0,
    "buyoutsCount" INTEGER             NOT NULL DEFAULT 0,
    "returnsRub"   DOUBLE PRECISION    NOT NULL DEFAULT 0,
    "returnsCount" INTEGER             NOT NULL DEFAULT 0,
    "forPayRub"    DOUBLE PRECISION    NOT NULL DEFAULT 0,
    "updatedAt"    TIMESTAMP(3)        NOT NULL,

    CONSTRAINT "WbSalesDaily_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WbSalesDaily_nmId_date_key" ON "WbSalesDaily"("nmId", "date");
CREATE INDEX "WbSalesDaily_date_idx" ON "WbSalesDaily"("date");
