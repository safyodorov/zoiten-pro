-- Phase 27: флаг «заказываем / не заказываем» (гейт виртуальных закупок)
ALTER TABLE "Product" ADD COLUMN "orderEnabled" BOOLEAN NOT NULL DEFAULT true;
