-- Фаза B v2 (2026-07-08): приёмочные коэффициенты складов (короб) + ставка возврата продавцу.
CREATE TABLE "WbAcceptanceCoef" (
  "warehouseID"             INTEGER NOT NULL,
  "warehouseName"           TEXT NOT NULL,
  "boxTypeID"               INTEGER NOT NULL,
  "coefficient"             DOUBLE PRECISION,
  "deliveryCoef"            DOUBLE PRECISION,
  "storageCoef"             DOUBLE PRECISION,
  "deliveryBaseLiter"       DOUBLE PRECISION,
  "deliveryAdditionalLiter" DOUBLE PRECISION,
  "storageBaseLiter"        DOUBLE PRECISION,
  "storageAdditionalLiter"  DOUBLE PRECISION,
  "updatedAt"               TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WbAcceptanceCoef_pkey" PRIMARY KEY ("warehouseID","boxTypeID")
);
-- Возврат продавцу (deliveryDumpSupReturnExpr базовых), ₽. Дефолт = 250 (recon).
INSERT INTO "AppSetting" ("key","value","updatedAt") VALUES
  ('wbReturnToSellerRub','250.0', now())
ON CONFLICT ("key") DO NOTHING;
