-- quick 260604: корректировки Плана продаж (заказы/цена/lead-times) стали ГЛОБАЛЬНЫМИ
-- (AppSetting, общие для всех), вместо per-user UserPreference.
-- Чтобы не потерять текущий план — переносим САМЫЕ СВЕЖИЕ per-user значения по каждому
-- ключу в AppSetting (value Json → text = JSON-строка). Не перезатираем, если уже задано.
INSERT INTO "AppSetting" (key, value, "updatedAt")
SELECT up.key, up.value::text, now()
FROM "UserPreference" up
WHERE up.key IN (
    'salesPlan.baselineOverrides',
    'salesPlan.priceOverrides',
    'salesPlan.leadTimes'
  )
  AND up."updatedAt" = (
    SELECT MAX(up2."updatedAt")
    FROM "UserPreference" up2
    WHERE up2.key = up.key
  )
ON CONFLICT (key) DO NOTHING;
