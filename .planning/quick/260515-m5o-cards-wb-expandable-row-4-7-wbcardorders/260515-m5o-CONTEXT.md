---
name: 260515-m5o-context
description: Expandable row на /cards/wb с графиком заказов за 4 недели + новая БД-таблица WbCardOrdersDaily + daily cron 05:00 МСК
---

# Quick Task 260515-m5o: /cards/wb expandable row + WbCardOrdersDaily — Context

**Gathered:** 2026-05-15
**Status:** Ready for planning

<domain>
## Task Boundary

На странице `/cards/wb` при клике по строке карточки строка раздвигается вниз с панелью:
1. Столбчатая диаграмма заказов **по дням за последние 4 недели** (28 столбцов).
2. **Средние заказы в день за последний месяц** (числом).
3. **Средние заказы в день за последние 7 дней** (числом).

Источник данных — новая таблица **`WbCardOrdersDaily`** (snapshot заказов per nmId per date). Daily cron в **05:00 МСК** записывает заказы за прошедший день. На старте записываем только `qty` (количество заказов), схема рассчитана на расширение полями (sumRub, returnsQty, и т.п.) в будущем.

Backfill **с 2026-04-01** одноразово через WB Statistics Orders API.
</domain>

<decisions>
## Implementation Decisions

### Источник данных — WB API

- **Endpoint:** `https://statistics-api.wildberries.ru/api/v1/supplier/orders?dateFrom={YYYY-MM-DD}T00:00:00`
- **Лимит:** 5 req/min (Statistics API). `retryFetch` в `lib/wb-api.ts` уже умеет backoff на 429.
- Возвращает **индивидуальные заказы** (массив). Поле `nmId: number`, `date: string ISO`, `isCancel: boolean`.
- **Группировка на нашей стороне:** `GROUP BY (nmId, date::date)`, считаем `COUNT(*)` где `isCancel = false` (отменённые в счёт не идут).
- НЕ используем Sales API (это выкупы, не заказы) и НЕ Analytics nm-report (cap 3/UTC-сутки, занят buyoutPercent).

### Backfill стратегия

- **Одноразовый backfill** с `dateFrom = 2026-04-01`.
- Запускается **автоматически при первом запуске** daily cron (если таблица пустая) либо через отдельную manual-кнопку «Backfill заказов» в шапке `/cards/wb` (на усмотрение планировщика — оба варианта приемлемы; рекомендуется автоматически + кнопка для пересинхрона).
- WB Statistics Orders API возвращает все заказы с `dateFrom` за один HTTP-запрос (rrdid пагинация если результат > некоторого порога, обычно не достигается за 45 дней). Если массив большой — итерируем по `rrdid` last record.
- **Идемпотентность:** `WbCardOrdersDaily` имеет `@@unique([nmId, date])` — upsert по этому ключу, повторный backfill не дублирует записи.

### Claude's Discretion

Следующие зоны не обсуждались — планировщик выбирает по этим guidelines:

- **UI способ раскрытия:** Inline expand row (строка раздвигается вниз, дополнительная `<tr>` под кликнутой). Одновременно открыта **только одна** строка (клик по другой → закрывает предыдущую). Не ломает sticky header. Анимация плавная через `motion`. Клик по «кликабельным» элементам внутри строки (артикул copy, чекбокс) не должен триггерить раскрытие — `e.stopPropagation()`.
- **Chart-библиотека:** `recharts` через shadcn-charts pattern (npx shadcn@latest add chart) — стилистически согласуется с остальным UI, типизирован, малый bundle (tree-shake), уже знакомый pattern в экосистеме shadcn. Альтернативно — pure SVG bars если recharts даст overhead.
- **Cron-реализация:** systemd timer на VPS, который вызывает curl на `POST /api/cron/wb-orders-daily` с секретным `Authorization` header (паттерн как у `/api/cron/purge-deleted`). Time spec `OnCalendar=*-*-* 05:00:00 Europe/Moscow`. Endpoint защищён по `process.env.CRON_SECRET`.

</decisions>

<specifics>
## Specific Ideas

- **Схема `WbCardOrdersDaily`** (расширяемая):
  ```prisma
  model WbCardOrdersDaily {
    id        Int      @id @default(autoincrement())
    nmId      Int
    date      DateTime @db.Date     // только дата без времени
    qty       Int                   // количество заказов за день
    // future: sumRub Decimal?, returnsQty Int?, cancelQty Int?, ...
    createdAt DateTime @default(now())

    @@unique([nmId, date])
    @@index([nmId])
    @@index([date])
  }
  ```
- **Расчёт средних в page query:**
  - last 7 days avg: `SUM(qty WHERE date >= today-7) / 7` (включая дни с 0)
  - last 30 days avg: `SUM(qty WHERE date >= today-30) / 30`
- **График — 28 столбцов**, начиная с `today - 28` по `today - 1` (сегодня неполный день, исключаем).
- **Дни без заказов** — отдельных записей в БД нет (только дни с qty > 0 пишем). При построении графика на сервере reduce'им raw rows в массив `Array<{date: Date, qty: number}>` длиной 28 с qty=0 для отсутствующих дат.
- **MSK timezone:** WB Statistics возвращает время в МСК ISO. Группируем по дате в МСК, не UTC — иначе расчёт «вчера» сдвинется на 3 часа.

## Тесты

- `wb-card-orders-daily.test.ts` — golden test: фиксированный набор WB Orders → ожидаемые `(nmId, date, qty)` строки.
- Покрыть: фильтр `isCancel=true`, МСК timezone группировку, дни с 0.

</specifics>

<canonical_refs>
## Canonical References

- `lib/wb-api.ts` — паттерн `retryFetch`, обращения к Statistics API, fetchSales для SPP fallback (близкий паттерн)
- `app/api/wb-sync/route.ts` — main sync route, паттерн логирования и rate-limit guard
- `app/api/cron/purge-deleted/route.ts` — паттерн cron-endpoint с CRON_SECRET (если есть; планировщик проверяет)
- WB Statistics API docs: https://dev.wildberries.ru/openapi/statistics → `/api/v1/supplier/orders`
- CLAUDE.md секция «WB API rate-limit защиты» — лимиты Statistics 5/мин, паттерн retryFetch
- CLAUDE.md секция «Sticky data-таблицы» — sticky header + scroll контейнер (не сломать при добавлении expand-row)
- CLAUDE.md секция «Production performance gotchas» — `<Link prefetch={false}>` обязателен
</canonical_refs>
