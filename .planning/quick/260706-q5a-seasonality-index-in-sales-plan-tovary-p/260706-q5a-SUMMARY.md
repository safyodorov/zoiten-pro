---
quick_id: 260706-q5a
title: Индекс сезонности в План продаж → Товары
status: complete
date: 2026-07-06
commits: [fb9e982, 5e21816, da31a47]
spec: docs/superpowers/specs/2026-07-06-sales-plan-seasonality-design.md
---

# Итог

Реализован помесячный **индекс сезонности** плана продаж (вкладка Товары). Множит итоговую ставку → каскадит в план и виртуальные закупки. Задеплоен на прод (da31a47), миграция применена, 0 ошибок.

## Сделано (по спеке)

- **Schema/миграция:** enum `SeasonalityScope` + `SalesPlanSeasonality(versionId?/scope/scopeId/month/indexPct)`; unique `NULLS NOT DISTINCT` (черновик versionId=null / GLOBAL scopeId=null дедупятся на PG16).
- **Движок (pure, TDD):** `lib/sales-plan/seasonality.ts` — `resolveIndexByMonth` (приоритет подкат→кат→напр→глоб, один самый точный) + пере-якорение `effective = stored(m)/stored(текущий)×100` + `storedFromEntered` + `monthsInRange`. `engine.getRateRequested`: `rate = base × index/100`. `data.ts` грузит черновик, резолвит per товар → `indexByMonth`.
- **Actions:** `saveSeasonalityIndex` (замена набора scope, обратная нормировка, 100% не хранятся), `resetSeasonality` (весь набор / один scope); снапшот индексов в `fixSalesPlanVersion`. RBAC SALES MANAGE + regenerate VP.
- **UI:** `SeasonalityBar` над таблицей — scope-селектор, инпуты по месяцам (текущий=100% якорь, будущие редактируемые), debounced save, чипы активных наборов + сброс, read-only при просмотре версии.

## Проверка

- `tsc --noEmit` чисто; тесты: seasonality (9) + engine множитель + обратная совместимость (index=100 не меняет golden). Все sales-plan 100/100 (одна флака vmForks на combined-run — не моя, мои тесты детерминированно зелёные).
- Прод: HEAD da31a47, миграция «All migrations applied», таблица есть, NULLS NOT DISTINCT индекс подтверждён, /sales-plan/products 200, логи чистые.

## Осталось / примечания

- UAT пользователя: задать индекс (напр. авг 120 глоб), проверить сдвиг плана/закупок в Товарах + Сводном; зафиксировать версию → индексы вмораживаются.
- Вне v1: правка индексов замороженной версии in-place (через загрузку в черновик), шаблоны/автоподбор сезонности, индекс на отдельный товар.
- Пере-якорение: абсолютный план будущих месяцев снижается при прокрутке месяца (одобрено пользователем).
