# Phase 16 — Human UAT

**Status:** ✅ APPROVED 2026-04-28
**Phase:** 16-wb-stock-sizes
**Дата deploy:** 2026-04-28 11:48 UTC
**Git rev:** 62a9b8e (после двух gap-fix коммитов)
**Migration applied:** 2026-04-28 11:48:23 UTC (20260423_phase16_size_breakdown)
**Re-synced:** 2026-04-28 11:50 UTC (2312 per-size rows для 110 nmId)
**Tester:** Сергей Фёдоров

**Gap fixes during UAT:**
1. `9770d69` fix(stock-wb-data): SUM quantity per warehouse — Map.set перезаписывал rows per (warehouseId, techSize), totalStock показывал только один размер (для nmId 859398279 видел 95 вместо 408)
2. `62a9b8e` fix(stock-wb): размерная строка — сплошной bg-muted (не /30) — sticky-cell просвечивал при горизонтальном scroll, нарушение паттерна CLAUDE.md «Sticky data-таблицы»

---

## Pre-UAT (Deploy + Re-sync)

### 1. Deploy на VPS

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && git pull && bash deploy.sh"
```

После завершения проверить:
- `prisma migrate deploy` применил `20260423_phase16_size_breakdown` — без ошибок
- `npm run build` собран — без TypeScript ошибок
- `systemctl status zoiten-erp` — active (running)
- `journalctl -u zoiten-erp -n 50` — запуск без ошибок

**Критично:** после миграции `WbCardWarehouseStock` опустошается (DELETE WHERE
`techSize = ''`). UI `/stock/wb` будет показывать пустые размерные строки/нули
~30 секунд до завершения re-sync.

### 2. Re-sync на VPS

```bash
ssh root@85.198.97.89 'cd /opt/zoiten-pro && WB_API_TOKEN="$(grep WB_API_TOKEN /etc/zoiten.pro.env | cut -d= -f2)" node scripts/wb-sync-stocks.js'
```

Скрипт работает 1-2 минуты (Statistics API rate limit ~1 req/min).
Должен вывести:
- `[STOCKS] Matched nmIds: ~50 / ~50`
- `[STOCKS] Новых записей WbCardWarehouseStock: NN` (сколько per-size rows создано)
- `[ORDERS] Matched nmIds: NN` (если orders API работает)

После re-sync таблица `WbCardWarehouseStock` имеет per-size rows для всех
nmId. До re-sync таблица была пустой (legacy DELETE в миграции).

**Альтернатива:** открыть https://zoiten.pro/stock и нажать «Обновить из WB» —
запустит `/api/wb-sync` HTTP route (Plan 16-02 идентично пишет per-size).

### 3. Diagnostic

```bash
ssh root@85.198.97.89 'cd /opt/zoiten-pro && WB_API_TOKEN="$(grep WB_API_TOKEN /etc/zoiten.pro.env | cut -d= -f2)" node scripts/wb-stocks-diagnose.js'
```

Ожидание: `No diffs found — БД соответствует API` ИЛИ файл
`wb-stocks-diff-YYYY-MM-DD.csv` содержит только header.

Скопировать CSV локально для архива:

```bash
scp root@85.198.97.89:/opt/zoiten-pro/wb-stocks-diff-*.csv ./
```

---

## UAT Чеклист (9 пунктов)

### 1. `/stock/wb` открывается без ошибок

[ ] Открыть https://zoiten.pro/stock/wb
[ ] Страница рендерится без «500 Internal Server Error» и без «Hydration mismatch»
[ ] Console (DevTools → F12 → Console) — нет красных ошибок
[ ] Network tab — нет 500/4xx на главных запросах

**Если FAIL:** проверить `journalctl -u zoiten-erp -n 100 --no-pager`. Обычно
причина — Prisma generate не отработал в deploy.sh ИЛИ TS-ошибка не
сборки (но `tsc --noEmit` зелёный по Plan 16-05 verify).

### 2. Кнопка «По размерам» появилась и работает

[ ] В toolbar `/stock/wb` присутствует кнопка «По размерам» рядом с «Без СЦ» /
    «Склады» / «Развернуть все»
[ ] При нажатии: размерные строки появляются (или скрываются) с приглушённым
    фоном `bg-muted/30` (наблюдается отступ слева, префикс `↳ {techSize}`)
[ ] Кнопка меняет variant: outline (выкл) ↔ default (вкл)
[ ] Refresh страницы (F5) — состояние persist в БД

**Если FAIL persist:** проверить `User.stockWbShowSizes`:
```sql
SELECT id, email, "stockWbShowSizes" FROM "User"
  WHERE email = 'sergey.fyodorov@gmail.com';
```
Должно меняться при кликах кнопки.

### 3. nmId 859398279 — Брюки: sum размеров = stockQty карточки

Контрольный товар: nmId **859398279** «Брюки классические мужские прямые»
(УКТ-000029, 8 размеров: 46/48/50/52/54/56/58/60).

[ ] Найти строку nmId 859398279 в `/stock/wb`
[ ] Запомнить значение колонки «Итого склады WB → О» (значение stockQty карточки)
[ ] Включить «По размерам»
[ ] Сумма totalStock всех размерных строк под этой nmId = значение «О»
[ ] (опционально) Проверка SQL:
    ```sql
    SELECT "stockQty" FROM "WbCard" WHERE "nmId" = 859398279;
    -- vs
    SELECT SUM(quantity) FROM "WbCardWarehouseStock" s
      JOIN "WbCard" c ON s."wbCardId" = c.id
      WHERE c."nmId" = 859398279;
    ```
    — оба значения должны совпадать.

### 4. nmId 859398279 Котовск — 6 размерных строк {46:11, 48:10, 50:10, 54:10, 58:10, 60:10}

Известные данные WB API на 2026-04-22 для Котовск:
- techSize **46**: 11 шт
- techSize **48**: 10 шт
- techSize **50**: 10 шт
- techSize **54**: 10 шт
- techSize **58**: 10 шт
- techSize **60**: 10 шт
- → Сумма Котовск = **61 шт**

[ ] Развернуть кластер с Котовском (см. справочник `WbWarehouse`, обычно ЦФО
    или ПФО — после `seed-wb-warehouses` уточнить через
    `SELECT cluster, "shortCluster" FROM "WbWarehouse" WHERE name = 'Котовск';`)
[ ] Включить «По размерам»
[ ] В колонке Котовск под nmId 859398279 видны размерные строки
[ ] Числа консистентны с API snapshot (могут отличаться от 2026-04-22 — главное:
    consistency между API и БД, см. пункт 9)
[ ] sortSizes — размеры в порядке ASC numeric (46 → 60)

**Замечание:** реальные числа могли измениться с 2026-04-22 (новые поступления/продажи),
главное — diff=0 в diagnostic пункт 9.

### 5. Per-cluster агрегаты при «Без СЦ» / hidden warehouses не меняются

Locked в CONTEXT.md: фильтры визуальные, агрегаты считаются по всем складам.

[ ] Зафиксировать значение колонки «ЦФО → О» (сводно по кластеру) для контрольного nmId
[ ] Включить «По размерам»
[ ] Включить «Без СЦ» (`hideSc`)
[ ] «ЦФО → О» НЕ изменилось
[ ] То же самое с per-user скрытием через popover «Склады» — выключить какой-нибудь
    склад в кластере и убедиться что cluster aggregate не меняется
[ ] Размерные строки тоже не показывают другие per-cluster агрегаты при hide
    (visible filter only — данные те же, видимость склада другая)

### 6. one-size товары без размерных строк

[ ] Найти nmId где `techSize = "0"` (одно-размерный товар — пылесос, чайник,
    ароматизатор и т.п.). Quick поиск:
    ```sql
    SELECT DISTINCT c."nmId", p.name
      FROM "WbCardWarehouseStock" s
      JOIN "WbCard" c ON s."wbCardId" = c.id
      LEFT JOIN "MarketplaceArticle" m ON m.article = c."nmId"::text
      LEFT JOIN "Product" p ON p.id = m."productId"
      WHERE s."techSize" = '0'
      LIMIT 5;
    ```
[ ] При showSizes ON под этими nmId размерных строк НЕТ (одинокий "0" не
    дублирует основную строку — это решение из CONTEXT.md, decision «когда у
    nmId 1 размер — скрывать»)
[ ] У товаров с реальными размерами (брюки, костюм) размерные строки есть

### 7. Sticky cells не пересекаются при showSizes + expand-all

[ ] «Развернуть все» (все 7 кластеров expanded)
[ ] «По размерам» включить
[ ] Скроллить **вертикально** — sticky header (Фото / Сводка / Артикул /
    Иваново) остаётся на месте
[ ] Скроллить **горизонтально** — sticky левые 4 колонки остаются на месте
[ ] Нет дубликатов sticky cells при rowSpan через размерные строки
[ ] Performance acceptable (50 nmId × до 8 размеров × все кластеры expanded —
    scroll не лагает на проде)

**Если FAIL performance:** записать в Blockers + Plan 16-FUT — virtualization
(react-virtuoso / @tanstack/virtual).

### 8. `/inventory` → `/stock` редирект работает

[ ] Открыть https://zoiten.pro/inventory/wb (старый URL до Phase 14)
[ ] Должен быть 308 redirect на https://zoiten.pro/stock/wb (старые закладки
    работают)
[ ] (Это поведение установлено в Phase 14 через `next.config.ts` —
    Phase 16 НЕ менял; пункт UAT для регрессии-проверки)

### 9. Diagnostic CSV: diff=0 — главное условие success

На VPS:

```bash
ssh root@85.198.97.89 'cd /opt/zoiten-pro && WB_API_TOKEN="$(grep WB_API_TOKEN /etc/zoiten.pro.env | cut -d= -f2)" node scripts/wb-stocks-diagnose.js'
```

[ ] Console output: `No diffs found — БД соответствует API`
[ ] ИЛИ файл `wb-stocks-diff-YYYY-MM-DD.csv` содержит только header
    (`nmId,warehouseName,apiTotal,dbTotal,diff,ratio` — единственная строка)
[ ] Если есть diffs — записать в Blockers (дальнейшее расследование, sync
    не идемпотентен или баг в diagnostic)

Опционально расширить диапазон nmId до всех:

```bash
ssh root@85.198.97.89 'cd /opt/zoiten-pro && \
  ALL=$(psql -h 85.198.97.89 -U zoiten zoiten_erp -t -c "SELECT string_agg(\"nmId\"::text, '','') FROM \"WbCard\";") && \
  WB_STOCKS_DIAGNOSE_NMIDS="$ALL" \
  WB_API_TOKEN="$(grep WB_API_TOKEN /etc/zoiten.pro.env | cut -d= -f2)" \
  node scripts/wb-stocks-diagnose.js'
```

Если diff=0 на полном наборе nmId — Phase 16 sync corrupt полностью resolved.

---

## Результаты

| # | Пункт | Статус | Заметки |
|---|-------|--------|---------|
| 1 | /stock/wb открывается | [ ] PASS / [ ] FAIL | |
| 2 | Кнопка «По размерам» persist | [ ] PASS / [ ] FAIL | |
| 3 | nmId 859398279 sum=stockQty | [ ] PASS / [ ] FAIL | |
| 4 | nmId 859398279 Котовск 6 строк | [ ] PASS / [ ] FAIL | |
| 5 | hideSc/hidden не меняют агрегаты | [ ] PASS / [ ] FAIL | |
| 6 | one-size без размерных строк | [ ] PASS / [ ] FAIL | |
| 7 | Sticky cells при expand-all+showSizes | [ ] PASS / [ ] FAIL | |
| 8 | /inventory → /stock 308 | [ ] PASS / [ ] FAIL | |
| 9 | diagnostic diff=0 | [ ] PASS / [ ] FAIL | |

**Verdict:**
- [ ] All 9 PASS → Phase 16 Complete
- [ ] Blockers есть → создать gap closure план через `/gsd:plan-phase 16 --gaps`

---

## Blockers (если есть)

| # | Что не сработало | Reproduce | Hypothesis |
|---|-------------------|-----------|-------------|
| | | | |

---

## Sign-off

- **Tester:** ___________________
- **Date:** ___________________
- **Resume signal:**
  - `approved` — все 9 пунктов PASS, Phase 16 завершена
  - `blocker: <описание>` — что не сработало, для gap closure
