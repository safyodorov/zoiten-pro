---
status: resolved
trigger: "sales-plan-recalc-no-forward: /sales-plan/products, режим редактирования, УКТ-000068 план 50→40 шт/день, «Пересчитать план» — последующие месяцы не пересчитываются (остаётся 50). Вчера работало. Регрессия."
created: 2026-07-06T00:00:00Z
updated: 2026-07-06T00:00:00Z
resolved: 2026-07-06T00:00:00Z
commit: 49ed389
---

## Current Focus

hypothesis: CONFIRMED — distribute-forward пишет ЯВНЫЕ SalesPlanMonthLevel-строки в будущие месяцы; при повторном редактировании ранее протянутые месяцы считаются «ручными» (manualMonths) и НЕ перезаписываются. Нет маркера, отличающего авто-протянутую строку от ручной правки.
test: фикс задеплоен коммитом 49ed389 (маркер autoDistributed) + миграция применена на проде; повторная протяжка перезаписывает вперёд
expecting: —
next_action: — (resolved)

## Symptoms

expected: После смены уровня продаж товара (50→40 шт/день) и «Пересчитать план» новое значение 40 распространяется на последующие месяцы (авто-протяжка), как вчера.
actual: Последующие месяцы остаются со старым значением (50).
errors: пользователь не упоминал ошибок; проверить journalctl -u zoiten-erp.
reproduction: /sales-plan/products → режим редактирования → УКТ-000068 → продажи 50→40/день → «Пересчитать план».
started: Работало ~2026-07-05, сломалось 2026-07-06. Между ними деплой Phase 25-27 + quick 260705-*.

## Eliminated

## Evidence

- timestamp: 2026-07-06T00:00:00Z
  checked: lib/sales-plan/distribute-forward.ts
  found: distributeMonthLevelForward фильтрует horizonMonths по (m > targetMonth && !manual.has(m)). Логика корректна — исключает только явные manual-месяцы.
  implication: если у будущих месяцев есть явный SalesPlanMonthLevel, они не будут перезаписаны (by design).

- timestamp: 2026-07-06T00:00:00Z
  checked: app/actions/sales-plan.ts saveMonthLevels + distributeForward блок (стр 127-226)
  found: distributeForward работает только если item.targetOrdersPerDay !== null. manualMonthsByProduct строится из ВСЕХ существующих SalesPlanMonthLevel товара (select productId, month без фильтра по значению).
  implication: если у УКТ-000068 будущие месяцы уже имеют явные строки — они в manualMonths → протяжка их пропускает.

- timestamp: 2026-07-06T00:00:00Z
  checked: прод-БД SalesPlanMonthLevel WHERE productId='cmp6yg8oj1ddsvhew2gojtvx2' (УКТ-000068)
  found: |
    2026-07-01 → 40 (updatedAt 2026-07-06 09:16, СЕГОДНЯ — правка юзера)
    2026-08-01..2026-12-01 → 50 (все updatedAt 2026-07-05 17:57, ВЧЕРА — авто-протяжка)
  implication: Вчера была ПЕРВАЯ протяжка (будущие месяцы были авто/пустые → заполнились 50). Сегодня будущие месяцы уже явные (=50) → distribute-forward считает их ручными → пропускает → 40 не протягивается. Это НЕ код-регрессия (код distribute-forward тот же, коммит e44c2c2 от Jul 5 12:57, до вчерашней протяжки в 17:57). Это проявление отсутствия маркера на ВТОРОЙ правке.

- timestamp: 2026-07-06T00:00:00Z
  checked: git log за 2 суток + prisma/schema.prisma model SalesPlanMonthLevel
  found: distribute-forward введён вчера (e44c2c2). SalesPlanMonthLevel НЕ имеет поля, отличающего авто-протянутую строку от ручной. Кнопка «Пересчитать план» → applyRecalc → saveMonthLevels(payload,{distributeForward:true default, horizonMonths:MONTHS}) — привязка корректна, флаг НЕ перевёрнут, ABC-гейт ни при чём (УКТ-000068 = A, orderEnabled=true).
  implication: root cause — дизайн-дефект: распространение материализует явные строки, неотличимые от ручных правок → повторная протяжка блокируется by design.

- timestamp: 2026-07-06T00:00:00Z
  checked: масштаб прод-данных
  found: SalesPlanMonthLevel = 119 строк по 20 товарам (распространение уже применялось к 20 товарам).

## Resolution

root_cause: >
  distribute-forward (SP-15, коммит e44c2c2) при протяжке уровня вперёд пишет ЯВНЫЕ
  SalesPlanMonthLevel-строки в будущие месяцы (upsert). saveMonthLevels строит manualMonths
  из ВСЕХ существующих строк товара и исключает их из повторной протяжки (D-2 «не перезаписывать
  ручные»). Но авто-протянутая строка неотличима от ручной правки — в модели SalesPlanMonthLevel
  нет маркера. Итог: ПЕРВАЯ протяжка работает (вчера: Aug–Dec заполнились 50), а ВТОРАЯ правка
  раннего месяца (сегодня: Jul 50→40) НЕ распространяется — ранее протянутые Aug–Dec считаются
  ручными и пропускаются. Не код-регрессия между вчера/сегодня; то же поведение на втором
  редактировании. Данные УКТ-000068 доказывают: Aug–Dec=50 (updatedAt вчера 17:57), Jul=40 (сегодня 09:16).
fix: >
  Добавить маркер SalesPlanMonthLevel.autoDistributed (Boolean, default false). Payload-строки
  (ручной ввод) → autoDistributed=false; строки из протяжки → autoDistributed=true. manualMonths
  для исключения = только строки с autoDistributed=false. Так D-2 (защита реально-ручных будущих
  месяцев) сохраняется, а повторная протяжка перезаписывает ранее авто-протянутые месяцы.
verification: >
  Unit: 5/5 GREEN в tests/sales-plan-distribute-forward.test.ts (3 старых pure-function + 2 новых
  saveMonthLevels). Новые тесты доказывают: (1) повторная протяжка перезаписывает ранее
  авто-протянутые месяцы (Jul 40 → Aug–Dec=40, autoDistributed=true), (2) реально-ручной месяц
  (autoDistributed=false) защищён (D-2). Typecheck чист (единственная ошибка exceljs — пред-существующая,
  не связана). Полный сьют: 42 падения ЕСТЬ и на чистом HEAD (stash-проверка) — ни одного нового
  регресса, +2 новых прохода.
  PROD (коммит 49ed389, deploy.sh): https://zoiten.pro → 200, zoiten-erp.service active/running;
  миграция применена — колонка SalesPlanMonthLevel.autoDistributed есть, backfill 119/119 строк = true;
  УКТ-000068: Jul=40, Aug–Dec=50, все autoDistributed=true → следующая протяжка корректно перезапишет
  вперёд. Подтверждено пользователем: «confirmed fixed».
files_changed:
  - prisma/schema.prisma (SalesPlanMonthLevel.autoDistributed Boolean @default(false))
  - prisma/migrations/20260706_sales_plan_month_level_auto_distributed/migration.sql (ADD COLUMN + backfill всех строк в true)
  - app/actions/sales-plan.ts (saveMonthLevels: маркер autoDistributed; manualMonths только по autoDistributed=false)
  - tests/sales-plan-distribute-forward.test.ts (+2 теста повторной протяжки)
