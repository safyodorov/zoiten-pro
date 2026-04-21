-- Заказы минус отмены за вчерашний день (Moscow TZ) — для сравнения
-- с 7д-средней в разделе /prices/wb.
ALTER TABLE "WbCard" ADD COLUMN "ordersYesterday" INTEGER;
