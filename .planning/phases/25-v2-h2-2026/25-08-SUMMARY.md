---
phase: 25-v2-h2-2026
plan: "08"
subsystem: sales-plan
tags: [versioning, immutable-snapshot, plan-fact, active-version, drift, read-only]
dependency_graph:
  requires: ["25-06", "25-07"]
  provides: ["SalesPlanVersion immutable snapshot", "activeVersionId baseline", "compareVersions drift", "PlanVersionBar", "FixPlanVersionDialog", "version read-only mode"]
  affects: ["app/actions/sales-plan.ts", "lib/sales-plan/plan-fact.ts", "app/(dashboard)/sales-plan/page.tsx", "app/(dashboard)/sales-plan/products/page.tsx"]
tech_stack:
  added: []
  patterns: ["immutable snapshot createMany чанками 5000", "AppSetting activeVersionId", "native select версий", "amber read-only баннер", "compareVersions drift"]
key_files:
  created:
    - components/sales-plan/PlanVersionBar.tsx
    - components/sales-plan/FixPlanVersionDialog.tsx
  modified:
    - app/actions/sales-plan.ts
    - lib/sales-plan/plan-fact.ts
    - app/(dashboard)/sales-plan/page.tsx
    - app/(dashboard)/sales-plan/products/page.tsx
decisions:
  - "fixSalesPlanVersion: createMany чанками CHUNK_SIZE=5000; дни <today из активной версии"
  - "paramsJson содержит снапшот VP (ACCEPTED+SUGGESTED) + iuTargets + modelParams для ПДДС Wave 8"
  - "Первая версия unconstrained (стоки 01.07 не сохранены): помечается бейджем 'номинал' в UI"
  - "activeVersionId в AppSetting как источник истины baseline для план/факт"
  - "PlanVersionBar: native <select> (CLAUDE.md), amber-баннер при ?version=, кнопка Lock (canManage + черновик)"
  - "compareVersions: pure function buyouts-rub метрика, дрейф вычисляется на сервере в page.tsx"
  - "getProductPlanDays: versionId → SalesPlanVersionDay read-only (Wave 7 TODO реализован)"
metrics:
  duration: "~15 минут"
  completed: "2026-07-04T15:04:38Z"
  tasks: 2
  files: 6
requirements: [SP-11]
---

# Phase 25 Plan 08: Версионирование плана продаж (Этап 5) — SUMMARY

**Одной строкой:** Immutable-снапшот плана продаж с чанками 5000, активная версия как baseline план/факт, read-only просмотр версий через ?version=, «дрейф» черновика vs зафиксированного (SP-11).

## Выполненные задачи

### Task 1: Версионные actions + compareVersions (дрейф)

**Коммит:** `ede3296`
**Файлы:** `app/actions/sales-plan.ts`, `lib/sales-plan/plan-fact.ts`

**Реализовано:**

- `fixSalesPlanVersion(label?, note?)` — транзакция:
  - `loadSalesPlanInputs` + `computeSalesPlan` → дневной ряд [today…horizonTo]
  - Дни `< today` → копируются из активной версии (`salesPlan.activeVersionId`); первая версия — unconstrained из драфта
  - Header `SalesPlanVersion` с `paramsJson` = снапшот VP (ACCEPTED+SUGGESTED) + iuTargets + modelParams (для ПДДС Wave 8)
  - `createMany SalesPlanVersionDay` чанками по 5000; zero-строки пропускаются
  - Автоматически устанавливает новую версию активной
  - Покрывает горизонт 01.07–31.12 целиком

- `setActiveSalesPlanVersion(id)` — переключает `salesPlan.activeVersionId`
- `renamePlanVersion(id, label)` — update только label (строки immutable)
- `deleteSalesPlanVersion(id)` — каскад days через FK; при удалении активной — сброс activeVersionId
- Все write-actions: `requireSection("SALES", "MANAGE")`

- `compareVersions(versionA_days, versionB_days)` — pure, метрика `buyouts-rub`:
  - `driftRub = planB - planA` (черновик vs версия)
  - `driftPct = driftRub / planA × 100`
  - Показывает «насколько правки уводят план от зафиксированного»

### Task 2: PlanVersionBar + FixPlanVersionDialog + переключение план/факт

**Коммит:** `45e09cf`
**Файлы:** `components/sales-plan/PlanVersionBar.tsx` (новый), `components/sales-plan/FixPlanVersionDialog.tsx` (новый), `app/(dashboard)/sales-plan/page.tsx`, `app/(dashboard)/sales-plan/products/page.tsx`, `app/actions/sales-plan.ts`

**Реализовано:**

**PlanVersionBar** (client):
- Native `<select>` версий (CLAUDE.md: не base-ui): «Рабочий план (черновик)» + версии по убыванию даты
- Смена значения → `?version=` в URL (или delete для черновика)
- Кнопка «Зафиксировать план» (Lock icon): только `canManage && isDraft`
- Дрейф (при черновике + есть активная): emerald/red badge с ₽ + %
- Amber-баннер при `versionId` в URL: «Просмотр версии …. Редактирование недоступно. [Вернуться к рабочему плану]»
- Проп `readOnly`: `!canManage || Boolean(versionId)` — единый флаг для всех инпутов

**FixPlanVersionDialog** (client, overlay-модалка):
- Поля: label (default «План от DD.MM.YYYY»), note (textarea)
- Сводка «что фиксируется»: горизонт, N товаров, N VP, предупреждение про прошлые дни
- Submit → `fixSalesPlanVersion` → toast + редирект `?version=<newId>` + delete `?mode=edit`

**sales-plan/page.tsx** (Сводный):
- Читает `salesPlan.activeVersionId` из AppSetting
- `selectedVersionId = currentVersionId ?? activeVersionId` → загружает из `SalesPlanVersionDay`
- Агрегирует company-level (Σ по товарам per дата) для buildPlanFactReport
- Fallback на драфт (`computeSalesPlan`) при `usingDraft=true`; бейдж «номинал»
- Дрейф: вычисляется если activeVersionId есть + просматриваем черновик/активную
- PlanVersionBar с `versionsForBar` + `drift`

**sales-plan/products/page.tsx** (Товары):
- Загружает `salesPlan.activeVersionId` + все версии из БД
- Прокидывает PlanVersionBar с `versionsForBar`
- `readOnly = mode !== "edit" || !canManage || Boolean(versionId)` — уже был реализован в Wave 4

**getProductPlanDays** (actions):
- Wave 7 TODO реализован: `versionId` → читает `SalesPlanVersionDay` из БД, возвращает read-only дни

## Задача 3: CHECKPOINT — Отложен для пользователя

Task 3 (checkpoint:human-verify) НЕ выполнена — требует деплоя на прод и ручного UAT.

**Что нужно сделать пользователю:**
1. Деплой этапов 3-4-5 (waves 5-6-7, планы 25-06/07/08) — плотной серией: push → `nohup bash deploy.sh` → проверить `curl https://zoiten.pro/sales-plan` → 200
2. Применить миграцию если нужно (`prisma migrate deploy` в deploy.sh — делается автоматически)
3. **Фиксация первой версии:** открыть `/sales-plan/products`, нажать «Зафиксировать план» → FixPlanVersionDialog → зафиксировать **в день деплоя** (минимизация unconstrained-зоны прошлого)
4. UAT:
   - Селектор версий показывает новую версию → URL `?version=<id>` → amber-баннер → инпуты disabled
   - Вернуться к черновику → редактирование доступно → дрейф = 0 сразу после фиксации
   - `/sales-plan` (Сводный): план/факт против активной версии; прошедшие дни без бейджа «номинал»
5. Написать «approved» или описать проблемы

## Deviations from Plan

**Нет** — план выполнен точно по spec. CLAUDE.md нарушений нет.

Уточнение: в `getProductPlanDays` при `versionId` productInput берётся из свежего `loadSalesPlanInputs` (для метаданных: arrivals, monthLevels) — это корректно: версия хранит только дневные ряды, не весь ProductPlanInput.

## Верификация

- `npx tsc --noEmit` — без ошибок
- `npm run test` (sales-plan suite): 49 тестов зелёных (engine, arrivals, plan-fact, virtual, iu)
- `sales-plan-pdds-feed.test.ts` — ожидаемо падает (Wave 8, файл не существует)
- 41 pre-existing failure в appeal-actions / customer / support-sync / wb-sync-route — не связаны с 25-08

## Self-Check

- [x] `components/sales-plan/PlanVersionBar.tsx` существует
- [x] `components/sales-plan/FixPlanVersionDialog.tsx` существует
- [x] Коммиты `ede3296` и `45e09cf` в git log
- [x] `fixSalesPlanVersion` + `setActiveSalesPlanVersion` + `renamePlanVersion` + `deleteSalesPlanVersion` (4 functions exported)
- [x] `compareVersions` (1 function exported)
- [x] `<select` в PlanVersionBar (native, CLAUDE.md)
- [x] amber-баннер read-only при `versionId`
- [x] `activeVersionId` + `SalesPlanVersionDay` в page.tsx (8 вхождений)
- [x] `version` + `readOnly` в products/page.tsx (10 вхождений)

## Self-Check: PASSED
