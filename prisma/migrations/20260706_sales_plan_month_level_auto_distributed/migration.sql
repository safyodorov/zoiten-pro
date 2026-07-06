-- Debug fix: sales-plan-recalc-no-forward
-- Маркер авто-протянутой строки уровня (distribute-forward), чтобы повторная
-- протяжка перезаписывала ранее протянутые месяцы, но НЕ трогала реально-ручные.
ALTER TABLE "SalesPlanMonthLevel"
  ADD COLUMN "autoDistributed" BOOLEAN NOT NULL DEFAULT false;

-- Backfill: фича distribute-forward введена 2026-07-05 (коммит e44c2c2), т.е. ей ~1 сутки.
-- Реально-ручных кросс-сессионных будущих оверрайдов ещё практически нет, а дефолт false
-- оставил бы все 20 товаров, распространённых вчера, «залипшими» (повторная протяжка их пропускала бы).
-- Помечаем ВСЕ существующие строки уровней как авто-протянутые → следующая протяжка их корректно перезапишет.
-- Ручной ввод в конкретный месяц снова выставит autoDistributed=false (защита D-2 восстанавливается).
UPDATE "SalesPlanMonthLevel" SET "autoDistributed" = true;
