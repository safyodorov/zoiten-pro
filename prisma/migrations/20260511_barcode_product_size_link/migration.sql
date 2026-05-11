-- Phase 17 extension (2026-05-11): связь Barcode ↔ ProductSize.
-- WB Content API возвращает sizes[].skus[] — каждый размер имеет свой штрих-код.
-- nullable FK — у не-размерных товаров (Zoiten) штрих-код продолжает быть «без размера».
-- onDelete: SetNull — удаление ProductSize обнуляет связь, штрих-код не удаляется.

ALTER TABLE "Barcode" ADD COLUMN "productSizeId" TEXT;

ALTER TABLE "Barcode" ADD CONSTRAINT "Barcode_productSizeId_fkey"
    FOREIGN KEY ("productSizeId") REFERENCES "ProductSize"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Barcode_productSizeId_idx" ON "Barcode"("productSizeId");
