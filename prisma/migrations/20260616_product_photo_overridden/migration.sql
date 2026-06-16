-- Quick 260616-v5x — Product Photo Overridden
--
-- Авто-фото товара из первой WB-карточки + флаг ручного override (по образцу nameOverridden, Phase 18).
-- photoOverridden=false → Product.photoUrl автоматически = photoUrl первой (sortOrder=0) WB-карточки.

ALTER TABLE "Product" ADD COLUMN "photoOverridden" BOOLEAN NOT NULL DEFAULT false;
