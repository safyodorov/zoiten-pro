-- 2026-05-12: WB JWT часто не содержит `iat` — делаем колонку nullable.
-- Обнаружено сразу после первого деплоя 260512-jxh: bootstrap из env падал
-- с "Invalid JWT payload — отсутствуют обязательные поля s/iat/exp".

ALTER TABLE "WbApiToken" ALTER COLUMN "issuedAt" DROP NOT NULL;
