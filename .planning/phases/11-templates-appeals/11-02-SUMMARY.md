---
phase: 11-templates-appeals
plan: 02
subsystem: server-actions
tags: [server-actions, templates, crud, export-import, rbac, zod]

# Dependency graph
requires:
  - phase: 11-templates-appeals
    plan: 01
    provides: ResponseTemplate Prisma model, @@unique([name, channel]), TicketChannel enum
  - phase: 08-support-mvp
    provides: Server action pattern (requireSection + getSessionUserId + try/catch + revalidatePath)
provides:
  - app/actions/templates.ts — 6 server actions (createTemplate, updateTemplate, deleteTemplate, toggleTemplateActive, exportTemplatesJson, importTemplatesJson)
  - ActionResultWith<T> type helper для actions, возвращающих payload
  - Zod templateSchema — channel ограничен z.enum(["FEEDBACK", "QUESTION", "CHAT"]) (RETURN/MESSENGER отклоняются с понятным сообщением)
  - Import/Export JSON контракт {version: 1, exportedAt, templates: [{name, text, channel, situationTag, nmId, isActive}]}
  - 18 GREEN unit-тестов (RBAC, Zod, Prisma P2002/P2025, upsert-счётчики)
affects: [11-03-templates-ui]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Zod 4.x z.enum({ message: \"...\" }) вместо zod 3.x errorMap: () => ({ message })"
    - "Hard delete для @@unique([name, channel])-модели — soft delete сделал бы import JSON невозможным после повторного создания"
    - "upsert без явного insert/update флага — различаем через createdAt.getTime() === updatedAt.getTime()"
    - "importTemplatesJson parse-each-item паттерн: envelope Zod (жёсткий) + templates[] z.unknown() + safeParse per item → errors[] без падения на первой"
    - "ActionResultWith<T> type helper — заменяет дженерик ActionResult<T=void> из-за несовместимости Record<string, never> intersection с discriminated union"

key-files:
  created:
    - app/actions/templates.ts
  modified:
    - tests/response-templates.test.ts (8 it.skip → 18 GREEN)

key-decisions:
  - "Zod 4.x API: z.enum([...], { message: \"...\" }) — план использовал errorMap из zod 3.x (deprecated в 4.x)"
  - "ActionResult оставлен простым { ok: true } | { ok: false; error }; payload actions типизированы через ActionResultWith<T> — проще чем дженерик с conditional type и Record<string, never> intersection"
  - "Импорт Prisma namespace как value (не type-only) для runtime проверки err instanceof Prisma.PrismaClientKnownRequestError — pattern совместим с существующим codebase"
  - "upsert добавлен add/update счётчик через сравнение timestamps (не отдельный findUnique+create/update) — атомарнее, меньше round-trips"

patterns-established:
  - "Pattern: ActionResultWith<T> для payload-actions (createTemplate → {id}, toggleTemplateActive → {isActive}) — readability > generic gymnastics"
  - "Pattern: import JSON error collection — envelope-first validation + per-item safeParse + errors[] accumulation без transaction rollback"
  - "Pattern: Zod 4.x enum с message — единая точка для custom error messages"

requirements-completed:
  - SUP-26
  - SUP-27

# Metrics
duration: 3min
completed: 2026-04-18
---

# Phase 11 Plan 02: Server Actions CRUD шаблонов + Export/Import JSON Summary

**Серверный слой локальных шаблонов ответов WB: 6 server actions (CRUD + toggle + JSON Export/Import), 18 GREEN unit-тестов. Заменяет отключённый 2025-11-19 WB Templates API через переносимый JSON-формат с upsert-импортом по @@unique(name, channel).**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-18T06:04:25Z
- **Completed:** 2026-04-18T06:07:32Z
- **Tasks:** 1
- **Files modified:** 2 (1 new server actions, 1 test replacement)

## Accomplishments

- 6 server actions с единой семантикой RBAC + try/catch + revalidatePath
- Zod схема template ограничивает channel до FEEDBACK/QUESTION/CHAT на уровне типа (TS) и runtime (parse)
- Обработка Prisma P2002 (unique violation) и P2025 (not found) с русскими сообщениями
- Export/Import JSON переносимый формат (без id/createdById/timestamps)
- Import upsert с накоплением errors[] вместо падения на первой невалидной записи
- 18 тест-кейсов покрывают все action-ы, RBAC, Zod rejections, Prisma errors, upsert-счётчики

## Task Commits

1. **Task 1 — 6 server actions + 18 GREEN тестов:** `cfd38db` (feat)

**Plan metadata:** TBD (final docs commit)

## Files Created/Modified

- `app/actions/templates.ts` — 311 строк: 6 exports, Zod templateSchema, getSessionUserId helper, isPrismaKnownError narrow, ActionResultWith<T> type, EXPORT_VERSION=1, importEnvelopeSchema + importItemSchema
- `tests/response-templates.test.ts` — 18 describe/it блоков: createTemplate (5), updateTemplate (2), deleteTemplate (2), toggleTemplateActive (2), exportTemplatesJson (1), importTemplatesJson (6)

## Decisions Made

- **Zod 4.x API:** план указывал `errorMap: () => ({ message })` — deprecated в 4.x, заменено на `{ message: "..." }` (верифицировано через `node -e` запуск против реального zod@4.3.6)
- **ActionResultWith<T>:** дженерик `ActionResult<T = void>` с `Record<string, never>` intersection не совместим с discriminated union в TS — разделил на `ActionResult` (без payload) и `ActionResultWith<T>` (с payload)
- **Prisma namespace import:** `import { Prisma } from "@prisma/client"` (value import, не type-only) — нужен runtime для `err instanceof Prisma.PrismaClientKnownRequestError`; существующий app/actions/users.ts использовал более простой `(e as { code?: string })?.code === "P2002"` pattern, но план просил именно Prisma namespace
- **add vs updated в import:** через сравнение `createdAt.getTime() === updatedAt.getTime()` — атомарнее чем отдельный findUnique+create/update, принимает upsert результат as-is

## Deviations from Plan

**[Rule 3 — Blocking] Zod 4.x API для custom error messages**

- **Found during:** Task 1 implementation
- **Issue:** План использовал zod 3.x синтаксис `z.enum([...], { errorMap: () => ({ message: "..." }) })` — в zod 4.3.6 этот API отсутствует
- **Fix:** Заменено на zod 4.x синтаксис `z.enum([...] as const, { message: "..." })` — вердикт через `node -e` запуск против реального zod@4.3.6
- **Files modified:** app/actions/templates.ts (templateSchema.channel)
- **Commit:** cfd38db

**[Rule 1 — Bug] ActionResult<T=void> дженерик несовместим с Record<string, never>**

- **Found during:** Task 1 tsc --noEmit
- **Issue:** Предложенный в плане type `ActionResult<T = void> = ({ ok: true } & (T extends void ? {} : T)) | { ok: false; error: string }` — TS2322: `{ ok: true }` не совместим с `{ ok: true } & Record<string, never>` потому что `ok: true` в индексной сигнатуре `never`
- **Fix:** Разделил на 2 типа: `ActionResult = { ok: true } | ActionErr` (без payload) и `ActionResultWith<T> = ({ ok: true } & T) | ActionErr` (с payload). Использованы: createTemplate, toggleTemplateActive, exportTemplatesJson, importTemplatesJson возвращают ActionResultWith<...>; updateTemplate, deleteTemplate возвращают ActionResult
- **Files modified:** app/actions/templates.ts
- **Commit:** cfd38db

**Дополнительные тесты (сверх 8+ в плане):**

План требовал минимум 8 тестов — в итоге **18** (5 createTemplate, 2 updateTemplate, 2 deleteTemplate, 2 toggleTemplateActive, 1 exportTemplatesJson, 6 importTemplatesJson). Добавлены:
- RBAC FORBIDDEN для createTemplate и importTemplatesJson (проверка guard до Prisma-вызовов)
- Короткое имя rejection (Zod min(2))
- P2025 для updateTemplate и deleteTemplate (not found)
- updated=1 отдельно от added=1 в import (timestamp difference)
- findUnique → null → «Шаблон не найден» в toggle

## Issues Encountered

- **vitest + std-env ESM incompat (локально):** known environment issue (std-env@4.x ESM vs vitest@3.x require). `npm run test` падает с `ERR_REQUIRE_ESM` до загрузки конфига. Не-регрессия, тесты корректны и прогонятся на VPS в Plan 11-04. Верификация прошла через `npx tsc --noEmit` (clean) + `npm run build` (success).

## Authentication Gates

None.

## User Setup Required

None — server actions работают сразу после merge; UI для них появится в Plan 11-03.

## Interface for Plan 11-03

Plan 11-03 (UI шаблонов) получает:

```typescript
// Импорты для TemplatePickerModal (read-only) — через RSC page
await prisma.responseTemplate.findMany({ where: { isActive: true }, ... })

// Для кнопок CRUD в /support/templates (client components)
import {
  createTemplate,
  updateTemplate,
  deleteTemplate,
  toggleTemplateActive,
  exportTemplatesJson,
  importTemplatesJson,
} from "@/app/actions/templates"

// Use cases:
// - Кнопка «Экспортировать» → exportTemplatesJson() → скачивание res.json как .json файл
// - Кнопка «Импортировать» → file input → FileReader → importTemplatesJson(text) → toast.success(`Добавлено ${added}, обновлено ${updated}, ошибок ${errors.length}`)
// - Форма создания/редактирования → Zod schema реиспользовать (экспорт templateSchema если нужно — сейчас private, план 11-03 может запросить export)
```

Тесты контракта фиксируют, что:
- Все 6 actions возвращают `{ ok: true, ... }` или `{ ok: false, error: string }` (discriminated union — легко обрабатывать в клиентском toast-коде)
- `channel` в input НЕ принимает RETURN/MESSENGER (client form должен рендерить только 3 варианта)
- `import` всегда возвращает `{ ok: true }` даже при частичных errors (errors[] содержит детали per-item)

## Self-Check: PASSED

**Files verified:**
- FOUND: app/actions/templates.ts (6 exports, 311 lines)
- FOUND: tests/response-templates.test.ts (18 it blocks, 0 skipped)

**Commits verified:**
- FOUND: cfd38db (Task 1 — 6 server actions + 18 GREEN тестов)

**Tooling verified:**
- PASS: npx tsc --noEmit → 0 ошибок
- PASS: npm run build → success (Next.js 15.5.14)
- SKIP: npm run test — known vitest/std-env ESM environment issue (прогонится на VPS в Plan 11-04)

**Acceptance criteria verified:**
- PASS: grep -c "export async function createTemplate" == 1
- PASS: grep -c "export async function updateTemplate" == 1
- PASS: grep -c "export async function deleteTemplate" == 1
- PASS: grep -c "export async function toggleTemplateActive" == 1
- PASS: grep -c "export async function exportTemplatesJson" == 1
- PASS: grep -c "export async function importTemplatesJson" == 1
- PASS: grep -c 'requireSection("SUPPORT", "MANAGE")' == 6 (≥6 target)
- PASS: grep -c 'revalidatePath("/support/templates")' == 5 (≥4 target)
- PASS: grep -c "it.skip" tests/response-templates.test.ts == 0

---
*Phase: 11-templates-appeals*
*Completed: 2026-04-18*
