# GSD Debug Knowledge Base

Resolved debug sessions. Used by `gsd-debugger` to surface known-pattern hypotheses at the start of new investigations.

---

## sales-plan-recalc-no-forward — авто-протяжка уровня не распространяется на последующие месяцы при повторном редактировании
- **Date:** 2026-07-06
- **Error patterns:** sales-plan, /sales-plan/products, Пересчитать план, distributeForward, distributeMonthLevelForward, saveMonthLevels, SalesPlanMonthLevel, manualMonths, последующие месяцы не пересчитываются, авто-протяжка, distribute-forward
- **Root cause:** distribute-forward (SP-15) при протяжке уровня вперёд материализует ЯВНЫЕ SalesPlanMonthLevel-строки в будущих месяцах. saveMonthLevels строит manualMonths из ВСЕХ существующих строк товара и исключает их из повторной протяжки (D-2). Модель не имела маркера, отличающего авто-протянутую строку от ручной правки → на ВТОРОМ редактировании ранее протянутые месяцы считались «ручными» и пропускались. Не код-регрессия; проявление отсутствия маркера. Классический «follow the indirection»: писатель и читатель одного ресурса (SalesPlanMonthLevel) расходились в семантике «ручной».
- **Fix:** Добавлен маркер SalesPlanMonthLevel.autoDistributed (Boolean @default(false)). Payload-строки (ручной ввод) → false; строки протяжки → true. manualMonths считается только по строкам autoDistributed=false. Миграция ADD COLUMN + backfill всех существующих строк в true (unstick 20 уже-распространённых товаров; фиче ~1 сутки, реально-ручных кросс-сессионных оверрайдов ещё нет). Деплой коммитом 49ed389.
- **Files changed:** prisma/schema.prisma, prisma/migrations/20260706_sales_plan_month_level_auto_distributed/migration.sql, app/actions/sales-plan.ts, tests/sales-plan-distribute-forward.test.ts
---
