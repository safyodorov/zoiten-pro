---
phase: 260422-oy5-per-user-stock-wb
plan: 01
subsystem: stock-wb
tags: [stock, wb, per-user-preferences, quick-task]
requires: [User model, lib/stock-wb-data.ts, lib/wb-clusters.ts]
provides: [saveStockWbHiddenWarehouses server action, WarehouseVisibilityPopover component, User.stockWbHiddenWarehouses field]
affects: [/stock/wb page, StockWbTable component]
tech-stack:
  added: []
  patterns: [per-user optimistic UI state, server action + revalidatePath, click-outside popup (inline без shadcn Popover)]
key-files:
  created:
    - prisma/migrations/20260422_add_user_stock_wb_hidden_warehouses/migration.sql
    - app/actions/stock-wb.ts
    - components/stock/WarehouseVisibilityPopover.tsx
  modified:
    - prisma/schema.prisma
    - components/stock/StockWbTable.tsx
    - app/(dashboard)/stock/wb/page.tsx
decisions:
  - "Семантика чекбокса: отмечен = видим, снят = скрыт. В БД храним массив ID скрытых — default [] означает 'всё видно' без миграции значений"
  - "RBAC: requireSection('STOCK') без MANAGE — это user preference (VIEWER меняет СВОЮ настройку, не admin)"
  - "Optimistic update через useTransition — UI мгновенно, server action в фоне; при ошибке следующий revalidate синхронизирует из БД"
  - "Inline popup (div + click-outside ref) вместо shadcn Popover — компонент отсутствует в проекте, паттерн MultiSelectDropdown"
  - "Миграция создана вручную (локальной PG нет) — применится через bash deploy.sh на VPS (prisma migrate deploy), установленный паттерн Phase 14/9"
metrics:
  duration: ~3.5 минуты
  tasks: 3
  files: 6
  completed: 2026-04-22T15:06:37Z
---

# Quick 260422-oy5: per-user фильтр видимости складов на /stock/wb

**One-liner:** Per-user визуальный фильтр WB-складов на `/stock/wb` с чекбоксами по кластерам, optimistic save, изоляция per-user — без влияния на агрегаты.

## Что сделано

### 1. Prisma schema + миграция

**Добавлено поле в `User`:**
```prisma
stockWbHiddenWarehouses Int[] @default([])
```

**Миграция** `prisma/migrations/20260422_add_user_stock_wb_hidden_warehouses/migration.sql`:
```sql
ALTER TABLE "User" ADD COLUMN "stockWbHiddenWarehouses" INTEGER[] NOT NULL DEFAULT '{}';
```

Миграция применится автоматически на VPS через `bash deploy.sh` (prisma migrate deploy).

### 2. Server action `saveStockWbHiddenWarehouses`

Новый файл `app/actions/stock-wb.ts`:
- RBAC: `requireSection("STOCK")` (VIEW — user может менять СВОЮ настройку)
- Zod валидация: `z.array(z.number().int()).max(500)`
- Дедупликация через Set + сортировка перед записью в БД
- `revalidatePath("/stock/wb")` после сохранения
- Возвращает дискриминированный union `{ ok: true } | { ok: false; error: string }`

### 3. Компонент `WarehouseVisibilityPopover`

Новый файл `components/stock/WarehouseVisibilityPopover.tsx`:
- Клиентский попап, группировка по `CLUSTER_ORDER`
- Семантика: отмечен = видим, снят = скрыт
- Кнопка "Сбросить" → очищает массив
- Per-cluster toggle "Скрыть все" / "Показать все"
- Optimistic update через `useTransition` + `onChange` prop наружу
- Click-outside через `ref` + `mousedown` listener (паттерн `MultiSelectDropdown`)
- `variant="default"` когда есть скрытые — визуальный индикатор активного фильтра
- Label: "Склады" или "Склады (12/20)" — быстрая обратная связь

### 4. Интеграция в `StockWbTable`

- Добавлен prop `hiddenWarehouseIds: number[]`
- Локальный state `useState<number[]>(hiddenWarehouseIds)` для optimistic реакции
- `visibleClusterWarehouses` теперь применяет 2 фильтра (AND):
  1. `hideSc && isSortingCenter(name)` — существующий
  2. `hiddenSet.has(warehouseId)` — новый per-user
- Попап отрендерен в toolbar рядом с кнопкой «Без СЦ»
- `rowClusterAgg` и `card.clusters[cluster]` **не тронуты** — агрегаты считаются по всем складам в `lib/stock-wb-data.ts`

### 5. RSC page (`app/(dashboard)/stock/wb/page.tsx`)

- Параллельный fetch: `Promise.all([getStockWbData(), auth()])`
- Prisma `findUnique({ where: { id }, select: { stockWbHiddenWarehouses: true } })`
- Передача `hiddenWarehouseIds` в `<StockWbTable>`

## Коммит

```
7d94d93 feat(stock-wb): per-user фильтр видимости складов на /stock/wb (260422-oy5)
```

6 файлов, +265/-6 строк.

## Деплой

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && git pull && bash deploy.sh"
```

`prisma migrate deploy` внутри deploy.sh применит миграцию `20260422_add_user_stock_wb_hidden_warehouses` автоматически.

## Smoke-test (после деплоя)

1. Открыть `/stock/wb` → видна новая кнопка «Склады» рядом с «Без СЦ».
2. Нажать кнопку → попап со списком складов сгруппированных по 7 кластерам (ЦФО, ЮГ, Урал, ПФО, СЗО, СФО, Прочие), все чекбоксы отмечены.
3. Развернуть ЦФО в таблице → запомнить значения колонок О/З/Об/Д и строки «Сводная».
4. Снять галки с 1-2 складов ЦФО в попапе → склады мгновенно исчезают из expanded-view.
5. **Проверить:** значения О/З/Об/Д в collapsed ЦФО и в «Сводной» **не изменились** — фильтр только визуальный.
6. Перезагрузить страницу (F5) → скрытые склады остались скрытыми (persisted в БД).
7. Нажать «Сбросить» в попапе → все склады снова видимы; перезагрузка страницы это подтверждает.
8. Зайти под другим пользователем (другой браузер / incognito + login) → скрытие не применяется (per-user isolation).
9. Per-cluster toggle: нажать «Скрыть все» в заголовке ЦФО → все склады кластера скрыты (expanded ЦФО показывает «нет складов» placeholder), collapsed агрегаты неизменны.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `prisma/schema.prisma`: `stockWbHiddenWarehouses Int[] @default([])` — FOUND (line 66)
- `prisma/migrations/20260422_add_user_stock_wb_hidden_warehouses/migration.sql` — FOUND
- `app/actions/stock-wb.ts`: exports `saveStockWbHiddenWarehouses`, `requireSection("STOCK")` без MANAGE — FOUND
- `components/stock/WarehouseVisibilityPopover.tsx`: использует `CLUSTER_ORDER`, `useTransition`, `saveStockWbHiddenWarehouses` — FOUND
- `components/stock/StockWbTable.tsx`: импорт + prop `hiddenWarehouseIds` + `useState` + второй фильтр в `visibleClusterWarehouses` + рендер попапа — FOUND
- `app/(dashboard)/stock/wb/page.tsx`: `auth()` + `prisma.user.findUnique` + передача `hiddenWarehouseIds` — FOUND
- Commit `7d94d93` — FOUND
- TypeScript `npx tsc --noEmit` — PASSED (no output)
- Prisma client `npx prisma generate` — UPDATED (field в `node_modules/.prisma/client/index.d.ts` строка 4857+)
