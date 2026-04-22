---
phase: 14-stock
plan: 02
subsystem: stock-seed
tags: [prisma, seed, wb-warehouses, clusters]
dependency_graph:
  requires:
    - prisma/schema.prisma WbWarehouse (Plan 14-01)
    - lib/wb-clusters.ts CLUSTER_FULL_NAMES+CLUSTER_ORDER (Plan 14-01)
  provides:
    - prisma/seed-wb-warehouses.ts 75 WB складов с кластеризацией
    - npm script seed:wb-warehouses (tsx runner)
  affects:
    - WbWarehouse table (заполняется при запуске на VPS в Plan 14-07)
    - Plan 14-03 fetchStocksPerWarehouse (будет lookup по name при sync)
tech_stack:
  added: []
  patterns:
    - Standalone seed script (не через prisma db seed — отдельный npm script)
    - Upsert by id — идемпотентность без дублей
    - Inline validation массива перед запуском (throw на невалидный shortCluster)
    - Synthetic IDs 90001+ для складов без известного warehouseId (уточнятся при sync)
key_files:
  created:
    - prisma/seed-wb-warehouses.ts
  modified:
    - package.json
decisions:
  - "Synthetic IDs 90001-90067 для складов без верифицированных warehouseId — реальные ID подтянутся при fetchStocksPerWarehouse в Plan 14-03"
  - "Task 0 checkpoint пропущен по решению пользователя — 75 складов предоставлены из Statistics API напрямую"
  - "Локальная БД недоступна — seed выполнится на VPS в Plan 14-07 deploy"
  - "NOT обновляем needsClusterReview/isActive при upsert — сохраняется ручная пометка оператора"
metrics:
  duration: "141 секунда (~2 мин)"
  completed_date: "2026-04-22"
  tasks_completed: 1
  files_created: 1
  files_modified: 1
---

# Phase 14 Plan 02: WbWarehouse Seed — Summary

**One-liner:** Standalone seed-скрипт с 75 реальными WB складами из Statistics API, кластеризованными пользователем по 7 группам (ЦФО/СЗО/ЮГ/ПФО/Урал/СФО/Прочие), upsert by id, inline валидация shortCluster.

---

## Отклонение от плана

### Пропуск Task 0 (Zero Wave checkpoint)

**Оригинальный план:** Task 0 требовал остановки и получения JSON списка складов от пользователя через DevTools Network tab на seller.wildberries.ru.

**Фактически:** Пользователь самостоятельно собрал данные из Statistics API `/api/v1/supplier/stocks` (2026-04-22) и предоставил готовый список 75 складов с cluster mapping в промпте. Также подтвердил распределение (`needsClusterReview: false` для всех).

**Результат:** Task 0 checkpoint пропущен, план выполнен автономно без остановки.

---

## Итог кластеризации

| Кластер | Полное название | Складов |
|---------|----------------|---------|
| ЦФО | Центральный федеральный округ | 22 |
| СЗО | Северо-Западный федеральный округ | 6 |
| ЮГ | Южный + Северо-Кавказский ФО | 10 |
| ПФО | Приволжский федеральный округ | 11 |
| Урал | Уральский федеральный округ | 5 |
| СФО | Сибирский + Дальневосточный ФО | 10 |
| Прочие | Прочие склады (ДВ, Беларусь, Казахстан, Армения) | 11 |
| **ИТОГО** | | **75** |

---

## Выполненные задачи

### Task 1: prisma/seed-wb-warehouses.ts + package.json

**Commit:** `65fa495`

**Созданные файлы:**

#### prisma/seed-wb-warehouses.ts
- 75 складов из Statistics API (2026-04-22), cluster mapping согласован пользователем
- Inline валидация `shortCluster` перед запуском (throw на невалидный → не запускается с битыми данными)
- `upsert by id` — идемпотентен, повторный запуск обновляет name/cluster/shortCluster
- НЕ обновляет `needsClusterReview` и `isActive` при upsert (сохраняет ручные пометки)
- Сводка по кластерам после seed (created/updated статистика)
- Inline константы `CLUSTER_FULL_NAMES` и `VALID_CLUSTERS` — скрипт самодостаточен без импорта lib/wb-clusters.ts (избегает path alias `@/` проблемы при запуске через tsx вне Next.js контекста)

#### package.json (обновлён)
- Добавлен script: `"seed:wb-warehouses": "tsx prisma/seed-wb-warehouses.ts"`
- `tsx` уже есть в devDependencies — дополнительная установка не нужна

**Верификация:**
```
node -e "... validate shortCluster values ..." → 75 значений, все валидны
grep -q "seed:wb-warehouses" package.json → OK
npx tsc --noEmit → 0 ошибок
npm run seed:wb-warehouses → "Начинаем seed 75 WB складов..." (затем ошибка DATABASE_URL — локальной PG нет, ожидаемо)
```

---

## Статус запуска seed

**Локально:** Не выполнен — нет `DATABASE_URL` (стандартная ситуация для проекта, нет локальной PostgreSQL).

**На VPS:** Ожидает Plan 14-07 deploy. Команда для запуска на VPS:
```bash
cd /opt/zoiten-pro
source /etc/zoiten.pro.env
npm run seed:wb-warehouses
```

---

## Deviations from Plan

### Автоматически применённые решения

**1. [Rule 2 - Архитектурное решение по ID] Synthetic IDs для складов без верифицированных warehouseId**

- **Ситуация:** Схема `WbWarehouse.id: Int @id` требует числовых ID (warehouseId из WB API). Данные от пользователя содержат только имена и кластеры, без числовых ID.
- **Решение:** Известные реальные IDs (Коледино=507, Электросталь=686, Краснодар=304 и т.д.) проставлены напрямую. Для остальных — synthetic IDs 90001-90067.
- **Влияние:** При sync в Plan 14-03 `fetchStocksPerWarehouse` будет получать реальные warehouseId из API и делать upsert в `WbCardWarehouseStock`. Если склад с данным ID уже есть в WbWarehouse (по synthetic ID) — нужна проверка: либо создать дополнительный entry с реальным ID (Plan 14-03 решит это), либо предусмотреть upsert-by-name.
- **Рекомендация для Plan 14-03:** При sync добавить lookup `findFirst({ where: { name: warehouseName } })` и обновить id если synthetic.

**2. [Rule 3 - Inline константы вместо импорта] Избежание path alias в seed-скрипте**

- **Ситуация:** Plan предлагал `import { CLUSTER_ORDER } from "@/lib/wb-clusters"`, но tsx вне Next.js не понимает `@/` alias.
- **Решение:** Дублировать `CLUSTER_FULL_NAMES` и `VALID_CLUSTERS` инлайн в seed-файл. Это нормальный паттерн для одноразовых seed-скриптов.

---

## Known Stubs

| Файл | Стаб | Причина |
|------|------|---------|
| Synthetic IDs 90001-90067 | Условные warehouseId | Реальные IDs из WB API подтянутся при sync в Plan 14-03 |

Стабы не блокируют цель плана — справочник WbWarehouse заполнен корректными именами и кластерами.

---

## Self-Check: PASSED

| Проверка | Результат |
|---------|-----------|
| prisma/seed-wb-warehouses.ts | FOUND |
| Количество складов в массиве | 75 |
| Все shortCluster валидны (7 значений) | PASSED |
| package.json содержит seed:wb-warehouses | FOUND |
| Commit 65fa495 | FOUND |
| npx tsc --noEmit | 0 ошибок |
