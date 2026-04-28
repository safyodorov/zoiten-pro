---
phase: 16-wb-stock-sizes
plan: W0
subsystem: diagnostics
tags: [wb-api, statistics-api, prisma, csv, diagnostics, sync-bug]

# Dependency graph
requires:
  - phase: 14-stock
    provides: WbCardWarehouseStock таблица + Prisma client
  - phase: 15-per-cluster-orders
    provides: scripts/wb-sync-stocks.js паттерн curl + Prisma + execSync
provides:
  - scripts/wb-stocks-diagnose.js — standalone CSV-diagnostic для расхождений API ↔ БД
  - Golden baseline tooling — повторный запуск после re-sync даёт diff=0 ⇒ доказательство фикса
affects:
  - 16-01-PLAN.md (schema migration)
  - 16-02-PLAN.md (sync bug fix — этот скрипт станет инструментом верификации)
  - 16-06-PLAN.md (UAT на VPS — реальный запуск скрипта ДО и ПОСЛЕ re-sync)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Diagnostic CSV script: curl + Prisma findMany + Map-based aggregation, export per (nmId, warehouseName)"

key-files:
  created:
    - scripts/wb-stocks-diagnose.js
  modified: []

key-decisions:
  - "Скрипт CommonJS (require, не import) — соответствует существующему scripts/wb-sync-stocks.js, не требует ESM tooling"
  - "execSync('curl ...') для WB API вместо node fetch — единый паттерн с wb-sync-stocks.js (TLS fingerprint безопасный путь)"
  - "DEFAULT_NMIDS = [859398279, 901585883] из CONTEXT.md §specifics; env override через WB_STOCKS_DIAGNOSE_NMIDS для произвольных списков"
  - "Только rows с diff != 0 пишутся в CSV — концентрация на расхождениях; пустой CSV (только header) = БД соответствует API"
  - "Aggregation по (nmId, warehouseName) суммированием по всем techSize — корректно для legacy schema до Plan 16-01"
  - "exit 0 при наличии diff (это data, не ошибка); exit 1 только при отказах (нет токена, не-JSON, не-массив)"

patterns-established:
  - "Diagnostic скрипт: standalone Node.js без HTTP route, читает env (WB_API_TOKEN/DATABASE_URL/опционально WB_STOCKS_DIAGNOSE_NMIDS), выгружает CSV с timestamp в имени"
  - "Идемпотентность через timestamp в имени CSV — повторный запуск в один день перезаписывает файл, в разные дни создаёт новый"

requirements-completed: [STOCK-30]

# Metrics
duration: ~1min
completed: 2026-04-28
---

# Phase 16 Plan W0: WB Stocks Diagnostic Script Summary

**Standalone Node.js CSV-diagnostic для сравнения WB Statistics API ↔ WbCardWarehouseStock — golden baseline tooling для верификации фикса sync-бага.**

## Performance

- **Duration:** ~1 минута
- **Started:** 2026-04-28T10:57:04Z
- **Completed:** 2026-04-28T10:58:12Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments

- Создан `scripts/wb-stocks-diagnose.js` (129 строк, CommonJS) — standalone diagnostic
- Скрипт делает curl на WB Statistics API (`/api/v1/supplier/stocks?dateFrom=2019-06-20T00:00:00`) и читает `WbCardWarehouseStock` через Prisma
- Агрегирует обе стороны по `(nmId, warehouseName)` суммированием `quantity` по всем techSize
- Выгружает CSV `wb-stocks-diff-YYYY-MM-DD.csv` со столбцами `nmId,warehouseName,apiTotal,dbTotal,diff,ratio` для всех расхождений (`diff != 0`)
- Контрольные nmId 859398279 (Брюки) и 901585883 (Костюм) из CONTEXT.md §specifics — defaults; env override `WB_STOCKS_DIAGNOSE_NMIDS="..."` для произвольного списка
- Защищён от пустого `WB_API_TOKEN`, не-JSON ответа, не-массива в API

## Task Commits

1. **Task 1: Создать scripts/wb-stocks-diagnose.js** — `6b919e4` (feat)

## Files Created/Modified

- `scripts/wb-stocks-diagnose.js` — diagnostic CSV-скрипт WB stocks API ↔ БД (новый, 129 строк)

## Как запускать

**Локально (если есть локальная PostgreSQL с актуальными WbCard/WbCardWarehouseStock данными):**
```bash
WB_API_TOKEN="<your_token>" node scripts/wb-stocks-diagnose.js
```

**На VPS (правильный путь — env уже настроен в /etc/zoiten.pro.env):**
```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && set -a && source /etc/zoiten.pro.env && set +a && node scripts/wb-stocks-diagnose.js"
```

**С произвольным списком nmId:**
```bash
WB_STOCKS_DIAGNOSE_NMIDS="859398279,901585883,418725481" node scripts/wb-stocks-diagnose.js
```

**Output:** файл `wb-stocks-diff-YYYY-MM-DD.csv` в текущей рабочей директории + console-лог количества rows.

## Ожидаемое поведение

### ДО Plan 16-02 (фикс sync-бага)
Согласно CONTEXT.md §specifics и RESEARCH.md §«Sync Bug Forensics»:
- Для **nmId 859398279 «Брюки»** на складе **Котовск** ожидался `apiTotal ≥ 61, dbTotal = 8, diff = +53` (real example zafiksirovan 2026-04-22).
- Аналогичные расхождения возможны для других складов и контрольных nmId — точные числа зависят от состояния БД на момент baseline-запуска.
- CSV должен содержать **хотя бы 1 row** с `diff != 0`.

### ПОСЛЕ Plan 16-06 (re-sync на VPS)
- CSV должен содержать **0 rows** (только header) → `Console: "No diffs found — БД соответствует API"`.
- Это объективное доказательство фикса для UAT (см. STOCK-37 acceptance в 16-HUMAN-UAT.md пункт 9).

**ВАЖНО:** реальный запуск (для baseline) — manual step во время Plan 16-06 на VPS пользователем; Wave 0 ограничилась подготовкой скрипта (задача STOCK-30, type=execute, autonomous=true).

## Decisions Made

См. frontmatter `key-decisions`. Основные:
- CommonJS вместо ESM — соответствие существующему `wb-sync-stocks.js`, нет необходимости в ESM tooling.
- `execSync('curl ...')` — паттерн scripts/wb-sync-stocks.js, не node fetch (TLS fingerprint безопасный путь).
- Default nmIds = `[859398279, 901585883]` из CONTEXT.md §specifics; env override для гибкости.
- Только rows с `diff != 0` в CSV — концентрация на расхождениях; пустой CSV = норма после фикса.
- exit 0 при наличии diff (это data) — exit 1 только при отказах (нет токена, не-JSON, не-массив).

## Deviations from Plan

None — plan executed exactly as written. План `16-W0-PLAN.md` Task 1 содержал готовый эскиз кода в `<action>`-блоке (предоставлен из RESEARCH.md §«Diagnostic скрипт (Wave 0)»). Реализация полностью соответствует спецификации `<behavior>`:

- [x] Default `TARGET_NMIDS = [859398279, 901585883]`, env-override `WB_STOCKS_DIAGNOSE_NMIDS`
- [x] Один curl на Statistics API (не batched per nmId — rate limit)
- [x] Filter `apiRows.filter(r => TARGET_NMIDS.includes(r.nmId))` ДО агрегации
- [x] `apiAgg`/`dbAgg` Map с ключом `"nmId:warehouseName"`, суммирование `quantity` по techSize
- [x] CSV header: `nmId,warehouseName,apiTotal,dbTotal,diff,ratio`
- [x] Только `diff != 0` в CSV; пустой CSV — header + "No diffs found" сообщение
- [x] `ratio = dbTotal > 0 ? (apiTotal/dbTotal).toFixed(2) : "—"`
- [x] Имя `wb-stocks-diff-${YYYY-MM-DD}.csv` в текущей директории
- [x] exit 0 при success (даже с diff'ами); exit 1 только при отказах env/parse

**Total deviations:** 0
**Impact on plan:** Полное соответствие спецификации.

## Issues Encountered

None. Скрипт сразу прошёл `node --check` syntax validation и automated verify из плана.

## User Setup Required

None — никаких новых env vars или dashboard настроек не добавлено. Скрипт переиспользует существующие `WB_API_TOKEN` (scope Statistics bit 6 уже есть, см. PROJECT.md/CLAUDE.md) и `DATABASE_URL` из `/etc/zoiten.pro.env` на VPS / локального `.env`.

## Next Phase Readiness

- **16-W0 baseline tooling готово.** Plan 16-01 (schema migration `techSize`) и 16-02 (sync bug fix) могут стартовать параллельно — они не зависят от Wave 0 (W0 только готовит инструмент верификации).
- **Plan 16-06 (UAT)** будет использовать этот скрипт как объективный измеритель: запуск ДО re-sync (фиксация baseline diff != 0) и ПОСЛЕ re-sync (проверка diff == 0).
- CSV-формат закреплён как контракт между W0/06 — изменения столбцов потребуют ревизии acceptance criteria 16-06.

## Self-Check: PASSED

- [x] `scripts/wb-stocks-diagnose.js` существует (129 строк)
- [x] `node --check scripts/wb-stocks-diagnose.js` exits 0
- [x] Commit `6b919e4` существует в git log
- [x] Все 9 grep-acceptance criteria из плана прошли (`statistics-api.wildberries.ru`=1, `wbCardWarehouseStock.findMany`=1, `859398279`=1, `901585883`=1, `WB_STOCKS_DIAGNOSE_NMIDS`=3, `wb-stocks-diff-`=1, `#!/usr/bin/env node` — yes, lines >= 70)

---
*Phase: 16-wb-stock-sizes*
*Plan: W0*
*Completed: 2026-04-28*
