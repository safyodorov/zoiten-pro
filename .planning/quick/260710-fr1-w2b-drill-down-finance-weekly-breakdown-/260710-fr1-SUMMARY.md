---
phase: quick-260710-fr1
plan: 01
subsystem: finance-weekly
tags: [finance, weekly, drill-down, unit-economics, ui, engine]
requirements: [W2b]
dependency-graph:
  requires: [quick-260710-e7h (движок), quick-260710-evz (W2a таблица)]
  provides: "Per-unit CostBreakdown из движка + read-only drill-down модалка per-article"
  affects: [/finance/weekly]
tech-stack:
  added: []
  patterns: [shadcn Dialog (base-ui), rules-of-hooks (хуки выше early-return), additive engine field]
key-files:
  created:
    - components/finance/WeeklyFinArticleDialog.tsx
  modified:
    - lib/finance-weekly/types.ts
    - lib/finance-weekly/engine.ts
    - tests/finance-weekly-engine.test.ts
    - components/finance/WeeklyFinReportTable.tsx
decisions:
  - "CostBreakdown — additive: значения УЖЕ считались в internal ScenarioBreakdown, единственное новое вычисляемое поле — commissionPct (pass-through commPct)"
  - "netOfCommissionPerUnit = существующий cutPricePerUnit (не переименовано/пересчитано → golden green)"
  - "Хуки open/selectedNmId объявлены ПЕРВЫМИ, выше early-return пустой недели (rules-of-hooks)"
metrics:
  duration: ~5min
  completed: 2026-07-10
---

# Phase quick-260710-fr1: W2b — Drill-down модалка /finance/weekly Summary

Клик по строке артикула в понедельном WB фин-отчёте `/finance/weekly` открывает read-only модалку с полной пооперационной юнит-экономикой (₽/ед) в двух сценариях (ИУ и Оферта), как строка Excel «Показатели».

## Что сделано

**Task 1 — движок (additive):**
- `lib/finance-weekly/types.ts`: exported `CostBreakdown` (16 полей: 15 ₽/ед + commissionPct %), добавлены `ScenarioResult.breakdown` и `ArticleResult.qtyOrders`. Существующие поля/формулы не тронуты.
- `lib/finance-weekly/engine.ts`: `commissionPct` (J) добавлен в internal `ScenarioBreakdown` (= commPct), `breakdown` собран в `toScenarioResult` из уже посчитанных per-unit значений, `qtyOrders` проброшен в `articles.push`.
- `tests/finance-weekly-engine.test.ts`: 5 новых ассертов (netOfCommissionPerUnit≈8047.93, taxPerUnit≈939.9, acquiringPerUnit≈337.19, std.logisticsPerUnit≈1380, qtyOrders=4, commissionPct 31.5/25.5). Golden 523.58 / −2176.7 остался зелёным.

**Task 2 — модалка:**
- `components/finance/WeeklyFinArticleDialog.tsx` (новый, 195 строк): shadcn Dialog, чисто презентационный (без form/input/server action). Header (название + артикул/бренд/заказы/цена), 16-строчная breakdown-таблица ИУ/Оферта, футер (Прибыль/ед, Выручка, Прибыль, Re продаж %, ROI %). Строки differs (комиссия %, цена минус комиссия, логистика, прибыль/ед, прибыль) подсвечены amber. Guard `{article && ...}` — при null тело не рендерится.

**Task 3 — wiring:**
- `components/finance/WeeklyFinReportTable.tsx`: `Row.nmId?`, article-строки получают `cursor-pointer` + `onClick` → `setSelectedNmId` + `setOpen(true)`. Вселенная / Бренд / Подытог / Итого НЕ кликабельны. Модалка смонтирована один раз. Sticky-паттерн / водопад / подытоги / итого нетронуты.
- Хуки `open` / `selectedNmId` объявлены ПЕРВЫМИ, выше early-return пустой недели (rules-of-hooks — иначе runtime crash на empty↔non-empty неделе).

## Deviations from Plan

None — план выполнен ровно как написан.

## Результаты гейтов

- `npx tsc --noEmit` — clean (0 ошибок) после каждой задачи.
- `npx vitest run tests/finance-weekly-engine.test.ts tests/pricing-math.test.ts` — 68 passed (engine 20 + pricing-math 48). Golden green, pricing-math не тронут.
- Полный `npx vitest run` — 42 failed | 984 passed (1026), 11 файлов: appeal-actions, customer-actions, customer-sync-chat, merge-customers, messenger-ticket, response-templates, support-sync-chats, support-sync-returns, template-picker, wb-sync-route, wb-token-validate. Все — известные pre-existing support/CRM/wb-sync падения, НЕ связаны с finance-weekly/pricing-math, НЕ чинились.

## Commits

- `2ffc38a` feat(260710-fr1): expose per-unit CostBreakdown из движка фин-отчёта
- `ccc0926` feat(260710-fr1): WeeklyFinArticleDialog — read-only drill-down модалка
- `7697c1d` feat(260710-fr1): кликабельные строки артикулов → drill-down модалка

Запушено в origin/main (`9961b56..7697c1d`). Deploy выполняет оркестратор после верификации.

## Known Stubs

None.

## Self-Check: PASSED
- components/finance/WeeklyFinArticleDialog.tsx — FOUND
- lib/finance-weekly/types.ts (CostBreakdown exported) — FOUND
- Commits 2ffc38a / ccc0926 / 7697c1d — FOUND in git log
