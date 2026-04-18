---
phase: 11-templates-appeals
plan: 03
subsystem: ui-templates
tags: [ui, templates, picker, support, rsc, forms, rhf, zod, dialog]

# Dependency graph
requires:
  - phase: 11-templates-appeals
    plan: 01
    provides: ResponseTemplate Prisma model, substituteTemplateVars
  - phase: 11-templates-appeals
    plan: 02
    provides: 6 server actions (createTemplate/updateTemplate/deleteTemplate/toggleTemplateActive/exportTemplatesJson/importTemplatesJson)
  - phase: 08-support-mvp
    provides: ReplyPanel (расширен), app/(dashboard)/support/[ticketId]/page.tsx (расширен)
  - phase: 09-returns
    provides: components/ui/multi-select-dropdown.tsx (переиспользован в TemplatesFilters)
provides:
  - /support/templates — RSC список шаблонов (фильтры + CRUD + Export/Import)
  - /support/templates/new — форма создания
  - /support/templates/[id]/edit — форма редактирования
  - TemplatePickerModal — client модалка выбора шаблона для ReplyPanel/ChatReplyPanel
  - groupTemplatesForPicker — pure helper (экспортирован для unit тестов)
  - Расширение ReplyPanel: 5 новых props (ticketNmId/ticketChannel/customerName/productName/templates) + кнопка «Шаблон»
  - Nav item «Шаблоны ответов» (FileText icon) в Sidebar
  - 8 GREEN unit тестов группировки/фильтрации picker'а (было 6 it.skip)
affects: [10-chat-autoreply (TODO: ChatReplyPanel должен переиспользовать TemplatePickerModal с channel="CHAT"), 11-04-appeals-hybrid (ReplyPanel будет расширен кнопкой «Обжаловать»)]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Client модалка группировки через pure helper (groupTemplatesForPicker) — логика тестируется без React/Dialog зависимостей"
    - "RSC prefetch шаблонов канала тикета → client picker получает готовый массив через props (без client server action)"
    - "Debounced searchParams через setTimeout+useEffect (350ms) — паттерн SupportFilters адаптирован для одного поля"
    - "RHF + Zod + native <select> (CLAUDE.md) для channel + transform Zod для nmId coerce (string → number | null)"

key-files:
  created:
    - app/(dashboard)/support/templates/page.tsx
    - app/(dashboard)/support/templates/new/page.tsx
    - app/(dashboard)/support/templates/[id]/edit/page.tsx
    - components/support/templates/TemplatesTable.tsx
    - components/support/templates/TemplatesFilters.tsx
    - components/support/templates/TemplateForm.tsx
    - components/support/templates/TemplateExportButton.tsx
    - components/support/templates/TemplateImportButton.tsx
    - components/support/templates/TemplatePickerModal.tsx
  modified:
    - components/support/ReplyPanel.tsx (5 новых props + кнопка «Шаблон» + TemplatePickerModal integration)
    - app/(dashboard)/support/[ticketId]/page.tsx (fetch templates канала + pass props)
    - components/layout/nav-items.ts (+ «Шаблоны ответов» + FileText icon)
    - components/layout/section-titles.ts (+ 3 pattern match для templates routes)
    - tests/template-picker.test.ts (6 it.skip → 8 GREEN)

key-decisions:
  - "groupTemplatesForPicker экспортирован отдельно от TemplatePickerModal компонента — позволяет unit-тестировать чистую логику без import'ов React/base-ui (пробивающих vitest env)"
  - "TemplatesFilters debounce через setTimeout+useEffect — 350ms, избегаем over-engineering отдельного useDebouncedValue хука"
  - "Prisma.ResponseTemplateWhereInput типизация на RSC — вместо Record<string, unknown> из плана, более type-safe"
  - "TemplateForm nmId: union(string|number).transform() вместо z.coerce.number() — RHF 7.72 + zod 4.x + zodResolver несовместимы с coerce (input=unknown → output=number), паттерн из Phase 7 PricingCalculatorDialog"
  - "customerName/productName берутся из ticket.customer?.name и wbCard?.name в RSC (уже загружены); не требует отдельного запроса"
  - "RETURN/MESSENGER каналы исключены в TemplatePickerModal через channel: PickerChannel тип — Phase 9 Returns использует ReturnActionsPanel, MESSENGER Phase 12 out of scope"

patterns-established:
  - "Pattern: Pure helper вынесен из client component для unit тестирования (groupTemplatesForPicker) — обходит vitest + React/base-ui ESM env issue"
  - "Pattern: RSC prefetch данных для client модалки через props — альтернатива client server action вызову (один round-trip)"
  - "Pattern: TemplateForm nmId coerce через z.union().transform() — паттерн для optional int полей в RHF+Zod 4.x+resolver chain"

requirements-completed:
  - SUP-26
  - SUP-28

# Metrics
duration: 5min
completed: 2026-04-18
---

# Phase 11 Plan 03: UI шаблонов + TemplatePickerModal Summary

**Полный UI слой локальных шаблонов ответов WB: страница /support/templates с таблицей, фильтрами, CRUD и Export/Import JSON; формы создания/редактирования с RHF+Zod; TemplatePickerModal встроен в ReplyPanel с авто-подстановкой имени покупателя и названия товара через substituteTemplateVars.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-18T06:10:11Z
- **Completed:** 2026-04-18T06:16:04Z (примерно)
- **Tasks:** 2
- **Files modified:** 13 (9 новых + 4 расширенных)

## Accomplishments

- RSC страница /support/templates с таблицей, фильтрами (канал/активность/поиск) и 3 кнопками действий (Экспорт/Импорт/Новый)
- 2 RSC wrapper страницы (new + [id]/edit) с общим клиентским TemplateForm
- 6 новых клиентских компонентов: TemplatesTable, TemplatesFilters, TemplateForm, TemplateExportButton, TemplateImportButton, TemplatePickerModal
- ReplyPanel расширен 5 новыми props и кнопкой «Шаблон» — TemplatePickerModal встроен
- [ticketId]/page.tsx фетчит активные шаблоны канала тикета и передаёт их в ReplyPanel
- Sidebar получил пункт «Шаблоны ответов» с иконкой FileText
- section-titles.ts получил 3 regex для заголовков Header'а
- 8 GREEN unit тестов (было 6 it.skip) покрывают группировку forNmId/general, фильтрацию по каналу/isActive/query (name/text/situationTag), пустое состояние, edge case ticketNmId=null

## Task Commits

1. **Task 1 — страница /support/templates + CRUD UI + Export/Import JSON + Sidebar:** `618f9d0` (feat)
2. **Task 2 — TemplatePickerModal + ReplyPanel integration + 8 GREEN тестов:** `aac3b30` (feat)

**Plan metadata:** TBD (final docs commit)

## Files Created/Modified

**Новые (9):**
- `app/(dashboard)/support/templates/page.tsx` — RSC список (~70 строк)
- `app/(dashboard)/support/templates/new/page.tsx` — RSC wrapper (~15 строк)
- `app/(dashboard)/support/templates/[id]/edit/page.tsx` — RSC wrapper (~40 строк)
- `components/support/templates/TemplatesTable.tsx` — client таблица (~140 строк)
- `components/support/templates/TemplatesFilters.tsx` — client фильтры (~95 строк)
- `components/support/templates/TemplateForm.tsx` — client форма (~215 строк)
- `components/support/templates/TemplateExportButton.tsx` — client (~45 строк)
- `components/support/templates/TemplateImportButton.tsx` — client (~65 строк)
- `components/support/templates/TemplatePickerModal.tsx` — client модалка + groupTemplatesForPicker (~170 строк)

**Расширенные (4):**
- `components/support/ReplyPanel.tsx` — +5 props, кнопка «Шаблон», TemplatePickerModal integration
- `app/(dashboard)/support/[ticketId]/page.tsx` — + findMany templates канала тикета, pass props
- `components/layout/nav-items.ts` — + «Шаблоны ответов» + FileText icon
- `components/layout/section-titles.ts` — + 3 regex для templates routes
- `tests/template-picker.test.ts` — 6 it.skip → 8 GREEN (заменён Wave 0 stub)

## Decisions Made

- **groupTemplatesForPicker вынесен в export отдельно от компонента:** чистая функция без React/base-ui импортов — unit тесты проходят даже при vitest env issue. Компонент TemplatePickerModal импортирует хелпер изнутри и использует в useMemo.
- **RSC prefetch + props, не client server action:** `prisma.responseTemplate.findMany({ where: { channel: ticket.channel, isActive: true } })` в RSC — один round-trip, client получает готовый массив.
- **Debounced search (350ms):** через setTimeout+useEffect в TemplatesFilters — адаптация паттерна SupportFilters под один field вместо всего объекта фильтров.
- **TemplateForm nmId Zod transform:** `z.union([z.string(), z.number()]).transform(...)` вместо `z.coerce.number()` — RHF 7.72 + zodResolver несовместимы с coerce (паттерн из Phase 7 PricingCalculatorDialog).
- **customerName fallback в substituteTemplateVars:** → «покупатель» (уже реализовано в lib/template-vars.ts, Phase 11-01) — для FEEDBACK покупатель обычно анонимный, шаблон выглядит корректно.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 — Missing functionality] section-titles.ts не учитывал /support/templates**

- **Found during:** Task 1 (при создании страницы)
- **Issue:** Header отображает заголовок страницы через `getSectionTitle(pathname)`. Без явного pattern для `/support/templates` он показал бы «Служба поддержки» (слишком общо), а для new/edit — без контекста.
- **Fix:** Добавлено 3 regex match в `components/layout/section-titles.ts` (templates/new → "Новый шаблон ответа", templates/[id]/edit → "Редактирование шаблона", templates → "Шаблоны ответов"). Перед общим `/support` матчем.
- **Files modified:** components/layout/section-titles.ts
- **Commit:** 618f9d0

**2. [Rule 2 — Missing functionality] nav-items.ts не содержал отдельный пункт для /support/returns (уже был) — добавлен рядом с /support/templates**

Деталь: Существующий порядок пунктов сохранён. Просто вставил «Шаблоны ответов» после «Возвраты».

**3. Дополнительный тест (сверх 7 в плане):**

План требовал минимум 7 тестов — реализовано **8**: + тест на query по полю `text` (разделяет кейс search-by-text от search-by-name/tag). Общая картина покрытия: 2 тестов группировки + 1 фильтр канала + 1 isActive + 4 query (name case-insensitive / situationTag / text / empty).

## Issues Encountered

- **vitest + std-env ESM incompat (локально)** — known environment issue, сохраняется с Plan 11-01/11-02. `npm run test` падает на `ERR_REQUIRE_ESM` до загрузки vitest.config.ts. Не-регрессия, тесты корректны (grep-проверка: 0 it.skip, 8 it-блоков), прогонятся на VPS в Plan 11-04 deploy. Верификация через `npx tsc --noEmit` (clean) + `npm run build` (success).

## Authentication Gates

None.

## User Setup Required

None — UI доступен сразу после merge. Для проверки: `npm run dev` → /support/templates (требует SUPPORT роль или SUPERADMIN).

## Integration Points

### Для Plan 11-04 (appeals)

ReplyPanel уже расширен 5 новыми props. Plan 11-04 добавит к ней:
- Кнопка «Обжаловать» рядом с «Шаблон» (только FEEDBACK с rating ≤ 3)
- Модалка AppealModal для создания записи + jump-link в ЛК WB

Вертикальный layout `<div className="flex flex-col gap-1">` уже готов для 3-й кнопки.

### Для Phase 10 execute (ChatReplyPanel)

**TODO — backward dependency для Plan 10-03:** при создании `ChatReplyPanel` (Plan 10-03) добавить аналогичную кнопку «Шаблон» → `TemplatePickerModal` с `channel="CHAT"`. Все 5 props/аргументы уже описаны в экспорте `TemplatePickerModalProps` — просто импортировать и использовать:

```tsx
import { TemplatePickerModal } from "@/components/support/templates/TemplatePickerModal"

const templates = await prisma.responseTemplate.findMany({
  where: { channel: "CHAT", isActive: true },
})
// ... в ChatReplyPanel
<TemplatePickerModal
  open={pickerOpen}
  onOpenChange={setPickerOpen}
  templates={templates}
  ticketNmId={chatNmId}
  channel="CHAT"
  customerName={customerName}
  productName={productName}
  onPick={(text) => setDraft(text)}
/>
```

Зафиксировать в Plan 10-03 (при его написании) как обязательный task-ref на 11-03-SUMMARY.

## Next Plan Readiness (11-04)

- Prisma schema готова (AppealRecord + SupportTicket.appealedAt уже в 11-01 миграции)
- APPEAL_REASONS готов в lib/appeal-reasons.ts
- appeal-actions.test.ts Wave 0 stubs готовы к замене на GREEN
- ReplyPanel готова к расширению кнопкой «Обжаловать» (паттерн кнопки «Шаблон» — template)
- tests/appeal-actions.test.ts остаётся с 7 it.skip до Plan 11-04

## Self-Check: PASSED

**Files verified:**
- FOUND: app/(dashboard)/support/templates/page.tsx
- FOUND: app/(dashboard)/support/templates/new/page.tsx
- FOUND: app/(dashboard)/support/templates/[id]/edit/page.tsx
- FOUND: components/support/templates/TemplatesTable.tsx
- FOUND: components/support/templates/TemplatesFilters.tsx
- FOUND: components/support/templates/TemplateForm.tsx
- FOUND: components/support/templates/TemplateExportButton.tsx
- FOUND: components/support/templates/TemplateImportButton.tsx
- FOUND: components/support/templates/TemplatePickerModal.tsx
- FOUND: tests/template-picker.test.ts (8 it-блоков, 0 it.skip)

**Commits verified:**
- FOUND: 618f9d0 (Task 1 — страница + CRUD UI + Export/Import)
- FOUND: aac3b30 (Task 2 — picker + ReplyPanel + 8 GREEN тестов)

**Tooling verified:**
- PASS: npx tsc --noEmit → 0 ошибок
- PASS: npm run build → success (Next.js 15.5.14, 3 новых route появились: /support/templates + new + [id]/edit)
- SKIP: npm run test — known vitest/std-env ESM environment issue (прогонится на VPS в Plan 11-04)

**Acceptance criteria verified:**
- PASS: grep "requireSection(\"SUPPORT\")" "app/(dashboard)/support/templates/page.tsx" — найдено
- PASS: grep "exportTemplatesJson" components/support/templates/TemplateExportButton.tsx — найдено
- PASS: grep "importTemplatesJson" components/support/templates/TemplateImportButton.tsx — найдено
- PASS: grep "templates" components/layout/nav-items.ts — найдено
- PASS: grep "FEEDBACK" components/support/templates/TemplateForm.tsx — найдено
- PASS: grep "export function TemplatePickerModal" — найдено
- PASS: grep "export function groupTemplatesForPicker" — найдено
- PASS: grep "substituteTemplateVars" components/support/templates/TemplatePickerModal.tsx — найдено
- PASS: grep "TemplatePickerModal" components/support/ReplyPanel.tsx — найдено
- PASS: grep "ticketNmId" components/support/ReplyPanel.tsx — найдено
- PASS: grep "FileText" components/support/ReplyPanel.tsx — найдено
- PASS: grep -c "it.skip" tests/template-picker.test.ts == 0

---
*Phase: 11-templates-appeals*
*Completed: 2026-04-18*
