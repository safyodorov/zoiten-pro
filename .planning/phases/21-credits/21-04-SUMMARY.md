---
phase: 21-credits
plan: "04"
subsystem: credits
tags: [seed, data-import, xlsx, pdf, jetlend, sberbank, checkpoint-deferred]
dependency_graph:
  requires: [21-01]
  provides: [scripts/seed-credits.ts]
  affects: [21-08]
tech_stack:
  added: []
  patterns:
    - Разовый seed-скрипт через npx tsx (паттерн scripts/)
    - Источник строк графика — детальные файлы папки Кредиты/ (U-01): Сбербанк XLSX (npm xlsx) + JetLend PDF (pdftotext -layout)
    - Метаданные + контрольные суммы из Кредиты.xlsx Лист2
    - replaceLoanPayments (clean-replace) для идемпотентного импорта графика
key_files:
  created:
    - scripts/seed-credits.ts
    - .planning/phases/21-credits/21-04-SEED-NOTES.md
  modified: []
decisions:
  - "Seed run + сверка контрольных сумм Лист2 ЯВНО ОТЛОЖЕНЫ до Plan 21-08 deploy (решение пользователя 2026-06-09): нет локальной PostgreSQL + скрипту нужен poppler-utils (pdftotext) и файлы Кредиты/ на VPS — все эти prerequisites устанавливаются в 21-08. UI-планы Wave 3 (21-05/06/07) не зависят от seeded данных."
  - "Сбербанк: ставки hardcode 19.3% (в Лист2 явно не указаны) — уточнить при сверке на VPS если потребуются точные"
metrics:
  duration: "~14 минут (до checkpoint)"
  completed: "2026-06-09"
  tasks: "2/3 (Task 3 сверка отложена в 21-08)"
  files: 2
---

# Phase 21 Plan 04: Seed Credits Script Summary

Разовый seed-скрипт импорта текущих кредитов из детальных файлов папки `Кредиты/` (Сбербанк XLSX + JetLend PDF) с метаданными и контрольными суммами из `Кредиты.xlsx` Лист2.

## What Was Built

### Task 1: Разведка данных + 21-04-SEED-NOTES.md (commit 661988a)

Документирована структура источников: Лист2 метаданные/помесячные основной долг+проценты, детальные дневные графики Сбербанка (XLSX) и JetLend (PDF), маппинг колонок контрольных сумм per-орг (Зойтен 76/77, ДрЛайн 80/81, Пеликан 84/85, СикрВэй 88/89, Итого 92/93).

### Task 2: scripts/seed-credits.ts (commit 48bc99f)

Скрипт парсит JetLend PDF (`pdftotext -layout`) + Сбербанк XLSX (npm `xlsx`), создаёт `Lender`/`Loan`/`LoanPayment` записи, печатает построчную сверку накопленных остатков и per-org/Итого против Лист2 (`✓`/`✗`, допуск 100 ₽/орг).

### Task 3: Checkpoint — сверка с Лист2 (ОТЛОЖЕНО в 21-08)

**Не выполнено локально по решению пользователя.** Причина: сверка требует запуска скрипта против PostgreSQL, которой нет локально, плюс `poppler-utils` (pdftotext) и исходные файлы `Кредиты/` на VPS. Эти prerequisites — задачи Plan 21-08 (deploy + poppler-utils install + доставка файлов + `prisma migrate deploy` + одноразовый запуск seed). Сверка контрольных сумм будет выполнена и отрапортована как часть 21-08 deploy.

**Ожидаемые контрольные суммы (Лист2):**

| Орг | Σ основной долг | Σ проценты |
|-----|-----------------|------------|
| Зойтен | 74 280 379,24 ₽ | 18 596 079,98 ₽ |
| Дрим Лайн | 56 261 014,34 ₽ | 11 337 869,94 ₽ |
| Пеликан | 10 783 800,00 ₽ | 264 325,34 ₽ |
| Сикрет Вэй | 7 193 280,00 ₽ | 435 156,51 ₽ |
| **ИТОГО** | **148 518 473,58 ₽** | **30 633 431,77 ₽** |

## Deviations from Plan

**Checkpoint Task 3 deferred to 21-08** — see decision above. Seed-скрипт написан и закоммичен; его исполнение + сверка структурно принадлежат deploy-шагу 21-08 (нужны VPS, PostgreSQL, poppler-utils, файлы Кредиты/).

## Known Stubs

Seed данные ещё не в БД — появятся после запуска скрипта в 21-08. UI Wave 3 строится против схемы (21-01) и actions (21-03), пустая таблица кредитов до сидинга — ожидаемое состояние.

## Self-Check: PASSED (pending deploy-time сверка)

Files exist:
- scripts/seed-credits.ts: FOUND
- .planning/phases/21-credits/21-04-SEED-NOTES.md: FOUND

Commits:
- 661988a: docs(21-04): write 21-04-SEED-NOTES.md — data structure + control sums
- 48bc99f: feat(21-04): write seed-credits.ts — JetLend PDF + Сбербанк XLSX + Лист2 pomesyachno

Note: Task 3 (сверка контрольных сумм) explicitly deferred to Plan 21-08 deploy per user decision 2026-06-09.
