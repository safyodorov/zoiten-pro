# Phase 30: Аналитика — дашборд «Топ-30 SKU в нише» - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-13
**Phase:** 30-analytics
**Areas discussed:** MPSTATS (токен + запуск), Источник фото/характеристик
**Areas deferred to Claude's discretion:** Хранение прогона, Графики в PDF

---

## MPSTATS — хранение токена

| Option | Description | Selected |
|--------|-------------|----------|
| AppSetting, ввод в UI один раз | Сохранён в БД (AppSetting KV), редактируется в шапке раздела (GlobalRatesBar), MANAGE-гейт | ✓ |
| Per-run, не хранится | Вводится каждый прогон, в БД не ложится | |
| В env, как WB-токены | В /etc/zoiten.pro.env рядом с WB_API_TOKEN | |

**User's choice:** AppSetting, ввод в UI один раз
**Notes:** Ключ `analytics.mpstatsToken`; заголовок запроса `X-Mpstats-TOKEN`.

## MPSTATS — запуск сбора

| Option | Description | Selected |
|--------|-------------|----------|
| Фоновый прогон + прогресс | NicheRun.status PENDING→COLLECTING→READY/PARTIAL/FAILED, UI поллит | ✓ |
| Синхронный server action | Один долгий запрос собирает всё; проще, но риск таймаута | |

**User's choice:** Фоновый прогон + прогресс
**Notes:** 30+ MPSTATS-запросов + пагинация + 30 сканов не влезают в один HTTP без риска таймаута nginx/Next; лимиты тарифа обрабатываются в статусе прогона.

## Источник фото листинга + характеристик конкурентов

| Option | Description | Selected |
|--------|-------------|----------|
| card.json (фото+характ.) + detail (цена) | basket-CDN /info/ru/card.json — фото+характеристики; card.wb.ru v4 detail — цена/СПП/рейтинг | ✓ |
| Только card.wb.ru v4 detail | Минимум нового кода, но характеристик мало/нет | |
| Только card.json | Один источник фото+характеристики; цена из файлов details | |

**User's choice:** card.json (фото+характ.) + detail (цена)
**Notes:** Формат card.json и транспорт (native fetch vs curl) подтвердить на research; medianPrice по ТЗ — из файлов details (−3%).

---

## Claude's Discretion

- **Хранение прогона:** immutable JSON-снапшот `NicheRun.payloadJson` (паттерн finance-weekly) + лёгкая индекс-таблица (метаданные/статус); посуточные ряды внутри payloadJson.
- **Графики в PDF:** серверный рендер линий прямо в pdfkit из массивов series (без headless-браузера / recharts на сервере).
- **Движок:** pure `lib/analytics/{types,engine,data}.ts` + golden-тесты (паттерн sales-plan/finance-cashflow).
- **UI:** sticky-таблицы, URL-searchParams для контролов (сортировка/метрики/период).

## Deferred Ideas

- Ozon и другие МП; автосбор файлов «Сравнение карточек» (нет API WB); автообновление/cron; экспорт Excel/CSV; прогнозы/AI-инсайты; UI-сравнение прогонов ниши во времени.
