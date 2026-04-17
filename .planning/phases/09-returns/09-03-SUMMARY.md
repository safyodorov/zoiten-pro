---
phase: 09-returns
plan: 03
subsystem: ui
tags: [ui, rsc, support, returns, multi-select, sidebar]

# Dependency graph
requires:
  - phase: 09-returns
    plan: 01
    provides: ReturnDecision/ReturnState модель + 8 полей SupportTicket (channel RETURN, returnState, wbActions)
  - phase: 09-returns
    plan: 02
    provides: syncReturns() — создаёт тикеты channel=RETURN с returnState=PENDING и INBOUND media
provides:
  - "Общий компонент components/ui/multi-select-dropdown.tsx (reuse в будущих фильтрах)"
  - "RSC-страница /support/returns — таблица 9 колонок с фото товара, фильтрами, пагинацией"
  - "ReturnsTable и ReturnsFilters компоненты (9 колонок / 6 фильтров)"
  - "Sidebar пункт «Возвраты» под «Служба поддержки»"
affects: [09-04-actions]

# Tech tracking
tech-stack:
  added: []  # все библиотеки уже есть (Next.js 15, React 19, Prisma, Tailwind v4, lucide-react)
  patterns:
    - "Общий MultiSelectDropdown извлечён в components/ui/ — inline-копии (PricesFilters/SupportFilters/ProductFilters) оставлены как есть (вне scope)"
    - "distinct on ticketId + orderBy [ticketId asc, decidedAt desc] для preload последнего ReturnDecision per ticket без N+1"
    - "Реальный Record<K, V> вместо Map в props — RSC → client boundary требует serializable, Object.fromEntries(Map) на сервере"
    - "localPath /var/www/zoiten-uploads → /uploads через replace — единая точка в mediaSrc() helper"
    - "Lucide PackageX для «Возвраты» в sidebar (добавлен в imports + ICON_MAP)"

key-files:
  created:
    - "components/ui/multi-select-dropdown.tsx"
    - "app/(dashboard)/support/returns/page.tsx"
    - "components/support/ReturnsTable.tsx"
    - "components/support/ReturnsFilters.tsx"
  modified:
    - "components/layout/nav-items.ts"

key-decisions:
  - "MultiSelectDropdown скопирован 1-в-1 из PricesFilters (канонический источник) — inline-копии в PricesFilters/SupportFilters/ProductFilters НЕ трогаем, чтобы не создавать регрессию Phase 7/8. Рефакторинг может быть сделан отдельным Quick Task позже."
  - "Record<K, V> вместо Map в props ReturnsTable — RSC → client serialization не переносит Map через props boundary. Object.fromEntries(decisionByTicket.entries) конвертирует на сервере."
  - "Empty state и пагинация рендерятся conditionally (total === 0 → message, иначе Table + Pagination) — избавляет от рендера пустой таблицы с заголовками + лишней пагинации."
  - "Иконка PackageX для sidebar (а не ArchiveRestore/Undo2) — семантически точное 'отменённая упаковка', единый визуальный стиль с Package для товаров."

patterns-established:
  - "RSC page pattern для фильтруемой таблицы: parseSearchParams → buildWhere → Promise.all count+findMany+supportUsers → preload related tables → Object.fromEntries для Record props"
  - "Preload latest X per Y через distinct + orderBy [Y asc, timestamp desc] — один запрос вместо N+1 или GROUP BY"

requirements-completed:
  - SUP-18

# Metrics
duration: ~6min
completed: 2026-04-17
---

# Phase 09 Plan 03: UI List Summary

**RSC-страница /support/returns с таблицей 9 колонок (фото товара из WbCard.photoUrl) + 6 фильтров через searchParams + общий MultiSelectDropdown компонент + пункт «Возвраты» в sidebar**

## Performance

- **Duration:** ~6 min
- **Completed:** 2026-04-17
- **Tasks:** 3
- **Files created:** 4
- **Files modified:** 1

## Accomplishments

- `components/ui/multi-select-dropdown.tsx` — общий компонент (скопирован 1-в-1 из `PricesFilters.tsx` строки 34-102), экспорт `MultiSelectDropdown` + `MultiSelectOption` type
- `app/(dashboard)/support/returns/page.tsx` — RSC страница:
  - `requireSection("SUPPORT")` (достаточно VIEW)
  - WHERE: `channel: "RETURN"` + фильтры из searchParams (returnStates, nmId, assignees, dateFrom/dateTo, reconsideredOnly)
  - Preload latest `ReturnDecision` per ticket (distinct on ticketId + orderBy decidedAt desc)
  - Preload `WbCard` с `photoUrl/name` по уникальным nmIds из тикетов
  - Preload первого INBOUND сообщения с IMAGE media (≤ 3) для колонки «Фото брака»
  - Пагинация 20/page через `SupportPagination` Phase 8
  - Empty state: «Заявок на возврат пока нет. Нажмите «Синхронизировать» в шапке.»
- `components/support/ReturnsTable.tsx` — client таблица 9 колонок:
  - Товар (фото h-12 w-9 + название + nmID ссылкой на `/cards/wb?nmId={n}`)
  - Покупатель (`Покупатель #{last6}`), Причина (line-clamp-2 из первого INBOUND)
  - Фото брака (до 3 превью 40×40, клик → `/support/{ticketId}`)
  - Дата (Europe/Moscow timezone ru-RU format)
  - Решение (бейдж по `returnState` — Ожидает/Одобрен/Отклонён)
  - Кто принял (имя + дата решения)
  - Пересмотрено (Да/—)
  - Действия (кнопка «Открыть» → `/support/{ticketId}`, где Plan 09-04 добавит ReturnActionsPanel)
- `components/support/ReturnsFilters.tsx` — 6 фильтров через searchParams с `next/navigation`:
  - `returnStates` (MultiSelectDropdown — Ожидает/Одобрен/Отклонён)
  - `nmId` (text input, numeric)
  - `assignees` (MultiSelectDropdown из реальных User с SUPPORT access)
  - `dateFrom`, `dateTo` (date inputs)
  - `reconsideredOnly` (Checkbox)
  - Кнопка «Сбросить» при наличии активных фильтров
- `components/layout/nav-items.ts` — пункт «Возвраты» (section SUPPORT, href `/support/returns`, иконка `PackageX` из lucide-react)

## Task Commits

1. **Task 0: извлечь MultiSelectDropdown в общий компонент** — `7016c19` (refactor)
2. **Task 1: RSC-страница /support/returns + ReturnsTable** — `56e1f34` (feat)
3. **Task 2: ReturnsFilters + пункт «Возвраты» в sidebar** — `c133512` (feat)

Все коммиты с `--no-verify` — parallel wave execution с Plan 09-04. Orchestrator запустит pre-commit хуки один раз после wave.

## Files Created/Modified

- **Created:**
  - `components/ui/multi-select-dropdown.tsx` — 86 строк (общий компонент)
  - `app/(dashboard)/support/returns/page.tsx` — 150 строк (RSC + parseSearchParams/buildWhere)
  - `components/support/ReturnsTable.tsx` — 196 строк (9 колонок client)
  - `components/support/ReturnsFilters.tsx` — 128 строк (6 фильтров client)
- **Modified:**
  - `components/layout/nav-items.ts` — +3 строки (PackageX import + NAV_ITEMS entry + ICON_MAP entry)

## Decisions Made

- **MultiSelectDropdown: copy-first, refactor-later**: скопировал из PricesFilters (канонический источник) в общий `components/ui/`. Inline-копии в PricesFilters/SupportFilters/ProductFilters НЕ трогаем — unified usage = отдельный Quick Task (вне scope Phase 9 Plan 03). Это защищает Phase 7/8 от регрессии.
- **Record<K, V> вместо Map в props**: изначально планировал Map для decisionByTicket/cardByNm, но Map не сериализуется через RSC → client boundary. Применил `Object.fromEntries(...)` на сервере перед передачей в client component.
- **Conditional rendering пустого состояния**: `total === 0` → empty message ИЛИ `<ReturnsTable /> + <SupportPagination />` — не рендерим пустую таблицу с заголовками + лишнюю пагинацию "Стр. 1 из 1".
- **PackageX иконка**: выбрана из трёх кандидатов (PackageX/ArchiveRestore/Undo2) по семантике «отменённая упаковка» + визуальной консистентности с Package для Товаров.

## Deviations from Plan

None - plan executed exactly as written.

Все 3 задачи выполнены точно по спецификации:
- Task 0 — скопирован MultiSelectDropdown 1-в-1 из PricesFilters, inline-копии не тронуты
- Task 1 — page.tsx содержит все требуемые элементы (requireSection, channel=RETURN, distinct on ticketId, photoUrl: true, SupportPagination с реальными props, no TODO)
- Task 2 — ReturnsFilters содержит все 6 полей, nav-items.ts содержит /support/returns + PackageX

## Issues Encountered

- **Parallel plan 09-04 изменил shared-файлы**: `tests/return-actions.test.ts` и `app/actions/support.ts` были модифицированы параллельным executor'ом Plan 09-04 (активация Wave 0 stubs + реализация server actions). Это их scope — не стейжил и не коммитил эти файлы в наших коммитах. Исключил их из `git add` явным указанием конкретных файлов.
- **Тесты после build**: из 124 тестов 107 passed, 17 failed. Все 17 failures в `tests/return-actions.test.ts` — это активные тесты Plan 09-04 (ранее it.skip → теперь it() + expect implementation). Они GREEN станут после completion Plan 09-04 commits. **Baseline 107 passed сохранён — 0 regression от Plan 09-03 изменений.**

## Verification Results

- ✅ `npx tsc --noEmit` → exit 0 (clean)
- ✅ `npm run build` → success (route `/support/returns` 4.97 kB / 139 kB First Load JS)
- ✅ 107/107 tests GREEN в нашем scope (0 regressions; 17 failures в 09-04 scope — параллельный executor)
- ✅ Все 28 acceptance grep-проверок passed

## Next Phase Readiness

- ✅ UI List готов — Plan 09-04 добавит `ReturnActionsPanel` в `/support/{ticketId}` (клик по строке / «Открыть» из ReturnsTable)
- ✅ MultiSelectDropdown доступен для reuse в других разделах (future Quick Task мог бы унифицировать inline-копии в Prices/Products/Support)
- ✅ Sidebar навигация работает — менеджеры видят «Возвраты» под «Служба поддержки»

**Plan 09-04 выполняется параллельно** — actions API (approveReturn/rejectReturn/reconsiderReturn) + ReturnActionsPanel компонент в диалоге `/support/{ticketId}`. После его commits: `npm run test` должен показать 124/124 GREEN.

## Self-Check: PASSED

**Files verified:**
- FOUND: components/ui/multi-select-dropdown.tsx
- FOUND: app/(dashboard)/support/returns/page.tsx
- FOUND: components/support/ReturnsTable.tsx
- FOUND: components/support/ReturnsFilters.tsx
- FOUND: components/layout/nav-items.ts (модифицирован)

**Commits verified:**
- FOUND: 7016c19 (Task 0 — MultiSelectDropdown extract)
- FOUND: 56e1f34 (Task 1 — RSC page + ReturnsTable)
- FOUND: c133512 (Task 2 — ReturnsFilters + sidebar)

**Build verified:**
- `npx tsc --noEmit` exit 0
- `npm run build` exit 0 — route `/support/returns` рендерится
- 107 tests GREEN (baseline сохранён, 0 regression)

**Acceptance criteria verified:**
- Task 0: file exists, MultiSelectDropdown + MultiSelectOption exported, tsc clean ✓
- Task 1: requireSection("SUPPORT"), channel="RETURN", distinct ticketId, returnDecision.findMany, photoUrl: true, SupportPagination, no TODO, ReturnsTable export, <img>, photoUrl used, Europe/Moscow, /support/${t.id} link ✓
- Task 2: ReturnsFilters export, MultiSelectDropdown import from @/components/ui/multi-select-dropdown, 6 filter fields (returnStates/nmId/assignees/dateFrom/dateTo/reconsideredOnly), nav-items.ts /support/returns + PackageX, section=SUPPORT count == 2 ✓

---
*Phase: 09-returns*
*Completed: 2026-04-17*
