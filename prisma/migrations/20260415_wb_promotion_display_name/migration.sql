-- Пользовательское название акции для отображения в UI.
-- Оригинальное WbPromotion.name остаётся нетронутым при синхронизации с WB API
-- (оно используется как fallback + ключ для парсинга). displayName — поверх,
-- меняется только через UI и глобально для всех строк этой акции.
ALTER TABLE "WbPromotion" ADD COLUMN "displayName" TEXT;
