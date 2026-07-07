-- Фаза B (2026-07-07): сырые box-тарифы складов WB (/tariffs/box) + новые ставки AppSetting.
CREATE TABLE "WbBoxTariff" (
  "warehouseName"   TEXT NOT NULL,
  "deliveryBase"    DOUBLE PRECISION,
  "deliveryLiter"   DOUBLE PRECISION,
  "deliveryCoefPct" DOUBLE PRECISION,
  "storageBase"     DOUBLE PRECISION,
  "storageLiter"    DOUBLE PRECISION,
  "storageCoefPct"  DOUBLE PRECISION,
  "dtTillMax"       TIMESTAMP(3),
  "updatedAt"       TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WbBoxTariff_pkey" PRIMARY KEY ("warehouseName")
);
-- Ставки Фазы B (Зод [0,100] для процентных, wbReturnLogisticsRub — рубли до ~1000): возврат-логистика ₽, индекс локализации ×.
INSERT INTO "AppSetting" ("key","value","updatedAt") VALUES
  ('wbReturnLogisticsRub','50.0', now()),
  ('wbLocalizationIndex','1.0', now())
ON CONFLICT ("key") DO NOTHING;
