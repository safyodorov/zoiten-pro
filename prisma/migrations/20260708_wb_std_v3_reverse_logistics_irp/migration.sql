-- Фаза B v3 (2026-07-08): обратная логистика невыкупа volume-based + ИРП + ИЛ=1.11.
-- База/доп-литр обратной логистики (V>1), ₽; ИРП (индекс распределения продаж), %.
INSERT INTO "AppSetting" ("key","value","updatedAt") VALUES
  ('wbReverseLogBaseRub','46', now()),
  ('wbReverseLogPerLiterRub','14', now()),
  ('wbIrpPct','1.56', now())
ON CONFLICT ("key") DO NOTHING;
-- ИЛ (индекс локализации) — ручное значение пользователя 1.11 (было 1.0).
UPDATE "AppSetting" SET "value" = '1.11', "updatedAt" = now() WHERE "key" = 'wbLocalizationIndex';
