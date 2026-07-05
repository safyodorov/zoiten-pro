-- Phase 28 ПДДС — сид глобальных допущений (AppSetting KV). Схема НЕ меняется.
INSERT INTO "AppSetting" ("key", "value", "updatedAt")
VALUES
  ('finance.cashflow.wbPayoutPct', '55', NOW()),
  ('finance.cashflow.wbPayoutLagWeeks', '1', NOW()),
  ('finance.cashflow.opexMonthlyRub', '0', NOW()),
  ('finance.cashflow.gapThresholdRub', '0', NOW())
ON CONFLICT ("key") DO NOTHING;
