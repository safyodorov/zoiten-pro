-- Phase 7 follow-up: добавить глобальную ставку «Брак» (wbDefectRatePct)
-- в AppSetting как 7-й параметр GlobalRatesBar. Дефолт 2.0%.
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES ('wbDefectRatePct', '2.0', NOW())
ON CONFLICT ("key") DO NOTHING;
