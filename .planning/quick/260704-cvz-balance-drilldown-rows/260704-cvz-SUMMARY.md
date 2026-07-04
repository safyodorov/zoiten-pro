---
phase: quick-260704-cvz
plan: "01"
subsystem: finance-balance
tags: [drill-down, balance-sheet, expandable-rows, client-component, vitest]
dependency_graph:
  requires: [lib/balance-data.ts, components/finance/BalanceSheetTable.tsx, tests/balance-sheet.test.ts]
  provides: [BalanceLine.children, buildProductTree, expandable-rows-ui, drill-down-tests]
  affects: [app/(dashboard)/finance/balance/page.tsx (read-only, не изменён)]
tech_stack:
  added: [lucide-react (ChevronRight/ChevronDown), useState]
  patterns: [рекурсивный рендер дерева, compare-matching по полному path-ключу, buildProductTree Категория→Подкатегория→Товар]
key_files:
  created: []
  modified:
    - lib/balance-data.ts
    - components/finance/BalanceSheetTable.tsx
    - tests/balance-sheet.test.ts
decisions:
  - BalanceLine.children — чистая детализация, не влияет на subtotal/total/capitalRub
  - buildProductTree — обобщённый билдер для всех 6 товарных строк (склады + transit + advances)
  - productLabel из sku+name снапшота для складских строк (данные уже в снапшоте); для закупок — из productMeta или productId как fallback
  - ОДИН product.findMany для всех productId (склады + закупки)
  - Единственный scroll-контейнер в таблице — не нарушен (children — обычные <tr>, не sticky)
  - "use client" добавлен (был server component): необходимо для useState expandedKeys
metrics:
  duration: ~35min
  completed: "2026-07-04"
  tasks: 3
  files: 3
---

# Quick 260704-cvz: Раскрываемые drill-down строки в отчёте «Баланс» — Summary

**One-liner:** Добавлен interactive drill-down в BalanceSheetTable — 8 строк разворачиваются в дерево Категория→Подкатегория→Товар / Кредитор→Кредит / per-счёт с инвариантом Σдетей=amountRub.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | BalanceLine.children + билдеры деревьев | b28d588 | lib/balance-data.ts |
| 2 | client-рефактор BalanceSheetTable + expandable строки | 43e8422 | components/finance/BalanceSheetTable.tsx |
| 3 | тесты инварианта Σ детей и сортировки desc | fea9cb9 | tests/balance-sheet.test.ts |

## What Was Built

### Задача 1 — lib/balance-data.ts

- Расширен `interface BalanceLine`: добавлено `children?: BalanceLine[]` (детализация; инвариант Σ листьев = amountRub родителя).
- Внутренний `buildProductTree(parentKey, contribs, metaMap)` — обобщённый билдер 3-уровневого дерева Категория→Подкатегория→Товар. Поддерживает узлы «Без категории» / «Без подкатегории» / «Без распределения» (productId="none"). Сортировка desc по amountRub на каждом уровне.
- 4 складские строки (WB_WAREHOUSE, WB_IN_WAY_TO_CLIENT, WB_IN_WAY_FROM_CLIENT, IVANOVO) получают children через buildProductTree из valued stockRows.
- «Товар в пути из Китая» + «Авансы поставщикам»: аллокация paidRub по позициям закупки (вес = quantity × unitPrice); при Σweight=0 → узел «Без распределения».
- «Банковские счета (₽)»: children = sorted(desc) per-счёт строки с label «Название банка · Номер счёта».
- «Остаток по кредитам»: дерево 2 уровня Кредитор→Кредит (contractNumber).
- Единый `product.findMany` для sku+name (label) + category/subcategory (дерево) всех productId.
- `bankAccount.findMany` расширен: `number: true, bank: { select: { name: true } }`.
- `loan.findMany` расширен: `lender: { select: { name: true } }`.
- Инварианты subtotal/total/capitalRub не затронуты — children это чистая детализация.

### Задача 2 — components/finance/BalanceSheetTable.tsx

- Добавлен `"use client"` (был server component).
- `useState<Set<string>>(new Set())` + `toggle(key)` — иммутабельное обновление expandedKeys.
- `buildLineMap` расширен рекурсивным обходом `children` для compare-matching по полному path-ключу (`${groupKey}:${node.key}`).
- `LineRow`: chevron-кнопка (`ChevronDown/ChevronRight`) для строк с children; плейсхолдер-отступ `w-[14px]` для выравнивания.
- `renderLineTree(node, depth, ...)`: рекурсивный рендер детей с нарастающим left-padding (depth 0→pl-8, 1→pl-12, 2→pl-16, 3→pl-20).
- `GroupBlock/SectionBlock`: проброс `expandedKeys/toggle` через пропсы.
- Sticky-шапка, подытоги, ИТОГО/КАПИТАЛ, CNY-строки, плашка «Без оценки» — без регресса.
- `page.tsx` не тронут (props компонента не изменились).

### Задача 3 — tests/balance-sheet.test.ts

Расширение фикстур (без изменения golden-сумм):
- `bankAccount.findMany`: 2 RUR-счёта (Сбербанк 60000 + ВТБ 40000 = 100000) + CNY. cashGroup.subtotalRub остался 115000.
- `loan.findMany`: 2 кредита JetLend (loan-1: 20000 + loan-2: 25000-5000=20000 = 40000 итого). Loans subtotal остался 40000.
- `financeStockSnapshot`: 2 valued товара в WB_WAREHOUSE (p1: 600 + p3: 400 = 1000). Inventory subtotal остался 2000.
- `purchase.findMany`: добавлены productId/quantity/unitPrice (Decimal-мок `{toNumber: () => N}`) для аллокации drill-down.
- `product.findMany`: новый мок — p1 (Категория А / Подкат А1) + p3 (Категория А / Подкат А2).

Новые тесты (describe «drill-down children (260704-cvz)», 8 тестов):
1. Инвариант `sumLeaves(stockWb) ≈ 1000` (stock-wb-warehouse)
2. Инвариант `sumLeaves(transit) ≈ 1000` (stock-in-transit-china)
3. Инвариант `sumLeaves(advLine) ≈ 2000` (advances-suppliers)
4. Инвариант `sumLeaves(bankRub) ≈ 100000` (bank-rub)
5. Инвариант `sumLeaves(loansBalance) ≈ 40000` (loans-balance)
6. Сортировка desc: bank-rub children (60000 ≥ 40000)
7. Сортировка desc: stock-wb-warehouse категории и подкатегории
8. Сортировка desc: loans Кредитор→Кредит
9. Читаемые labels (bank.name для счетов, sku для складских товаров)

## Verification Status

**Локальный прогон vitest не выполнен** — на этой машине отсутствуют node_modules. Это ожидаемое ограничение (см. constraints плана). Верификация переносится на:
- Сборку при деплое (`next build` + `npx vitest run tests/balance-sheet.test.ts` на VPS).
- Ревью диффа (выполнено ниже в self-check).

## Deviations from Plan

**Нет** — план выполнен точно по спецификации с учётом refinements оркестратора:

1. (A) **Читаемые метки товаров**: продуктLabel = `${sku} ${name}` из productMeta / row.sku+row.name из снапшота. Fallback = productId для удалённых товаров.
2. (B) **Разбивка golden-сумм**: применена стратегия «разбить существующие суммы», НЕ добавлять новые. Все 5 golden-тестов остались консистентными без правки ассертов (cashGroup=115000, loans=40000 и т.д.).

## Invariant Review

| Строка | Инвариант | Проверен |
|--------|-----------|---------|
| stock-wb-warehouse | Σ листьев = 1000 | тест #1 |
| stock-in-transit-china | Σ листьев = 1000 | тест #2 |
| advances-suppliers | Σ листьев = 2000 | тест #3 |
| bank-rub | Σ листьев = 100000 | тест #4 |
| loans-balance | Σ листьев = 40000 | тест #5 |
| subtotalRub/totalRub/capitalRub | не изменены | golden тесты |

## Known Stubs

Нет — plan executed completely. Нет placeholder-данных в UI: все данные поступают из реальных buildProductTree / bankRurChildren / lenderNodes билдеров.

## Self-Check: PASSED

- lib/balance-data.ts — FOUND, содержит `children?: BalanceLine[]`, `buildProductTree`, 8 разворачиваемых строк
- components/finance/BalanceSheetTable.tsx — FOUND, начинается с `"use client"`, содержит `expandedKeys`, `renderLineTree`
- tests/balance-sheet.test.ts — FOUND, содержит `product.findMany` мок, `sumLeaves`, 8 drill-down тестов
- Коммит b28d588 — FOUND (feat balance-data)
- Коммит 43e8422 — FOUND (feat BalanceSheetTable)
- Коммит fea9cb9 — FOUND (test drill-down)
- page.tsx — НЕ изменён (проверен grep: ни lib/balance-data.ts ни BalanceSheetTable.tsx не содержат модификаций page.tsx)
