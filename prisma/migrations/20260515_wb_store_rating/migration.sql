-- 2026-05-15: точные значения рейтинга с витрины WB (card.wb.ru v4).
-- Заполняются через curl в /api/wb-sync и /api/wb-sync-spp (тот же batch что СПП).
-- WB v4 не различает per-nmId и per-imt — для всех карточек склейки одинаковая цифра.

ALTER TABLE "WbCard"
  ADD COLUMN "wbStoreRating"    DOUBLE PRECISION,
  ADD COLUMN "wbStoreFeedbacks" INTEGER;
