---
phase: 08-support-mvp
plan: 03
subsystem: ui, layout

tags: [next-app-router, rsc, server-components, tailwind, lucide, sidebar-badge]

requires:
  - phase: 08-support-mvp
    provides: "Plans 08-01+08-02 — SupportTicket + SupportMessage + sync logic"

provides:
  - "Страница /support — лента тикетов с фильтрами и пагинацией"
  - "SupportTicketCard / SupportFilters / SupportPagination компоненты"
  - "Sidebar badge для Служба поддержки — через DashboardShell → Sidebar → NavLinks"
  - "lib/support-badge.ts — счётчик NEW тикетов для UI"

affects: [08-04-dialog]

tech-stack:
  added: []
  patterns:
    - "Фильтры через URL searchParams (панель клиент-компонент обновляет URL, страница — RSC, перечитывает)"
    - "MultiSelectDropdown inline: useState+useRef+useEffect для click-outside (паттерн WbFilters.tsx)"
    - "Layout-level data fetching: RSC layout.tsx вызывает getSupportBadgeCount() и пробрасывает через props"
    - "Badge 99+/9+ в раскрытом/свёрнутом sidebar"

key-files:
  created:
    - "app/(dashboard)/support/page.tsx (РЕДИЗАЙН — заменена заглушка ai-cs-zoiten)"
    - "components/support/SupportTicketCard.tsx"
    - "components/support/SupportFilters.tsx"
    - "components/support/SupportPagination.tsx"
    - "components/support/SupportSyncButton.tsx (используется и в 08-04)"
    - "lib/support-badge.ts"
  modified:
    - "app/(dashboard)/layout.tsx (+ getSupportBadgeCount на каждый запрос)"
    - "components/layout/DashboardShell.tsx (+ supportBadgeCount prop)"
    - "components/layout/Sidebar.tsx (+ supportBadgeCount prop)"
    - "components/layout/NavLinks.tsx (+ badge render на item.href=/support)"
    - "tests/support-badge.test.ts (Wave 0 stub → 2 теста GREEN)"

key-decisions:
  - "WbCard JOIN через nmId делается в RSC странице (а не в Prisma include — т.к. relation нет): Set уникальных nmId → findMany → Map<nmId, {photoUrl, title}>"
  - "getSupportBadgeCount возвращает 0 при DB-ошибке — не валим layout, если миграция ещё не применена"
  - "Badge рендерится только если hasSupportAccess (SUPERADMIN или allowedSections.SUPPORT) — не делаем лишний count для пользователей без доступа"
  - "pageSize=20 фиксирован (не настраивается пользователем в MVP)"
  - "При смене любого фильтра — page сбрасывается в 1 (паттерн UX)"

patterns-established:
  - "Server Component карточка тикета: индикатор-полоса border-l-4 + color по статусу"
  - "URL-driven фильтры с default=all, reset-кнопка видна только при активных фильтрах"
  - "Layout-level badge data: один запрос getSupportBadgeCount() на корневом layout"

requirements-completed:
  - SUP-10
  - SUP-11
  - SUP-12
  - SUP-40

duration: 20min
completed: 2026-04-17
---

# Phase 08 Plan 03: UI лента + Sidebar badge

**RSC лента /support с фильтрами+пагинацией, badge «новых» тикетов в Sidebar**

## Performance

- **Duration:** ~20 мин (inline execution)
- **Completed:** 2026-04-17
- **Files created:** 6
- **Files modified:** 5 (layout chain + badge test)
- **Tests:** 2 support-badge GREEN, full suite 89/89

## Accomplishments

- **Полный редизайн `/support`**: заглушка ai-cs-zoiten удалена, создана RSC-лента с фильтрами (канал, статус, менеджер, nmId, dateFrom/To, unanswered toggle), карточками с индикатор-полосой статуса, пагинацией 20/страницу
- **Компоненты `components/support/`:** SupportTicketCard (RSC, server), SupportFilters (client, MultiSelectDropdown inline), SupportPagination (client, href), SupportSyncButton (client, sonner toast)
- **Sidebar badge:** `lib/support-badge.ts` getSupportBadgeCount() → app/(dashboard)/layout.tsx → DashboardShell → Sidebar → NavLinks. Badge `99+/9+` рендерится справа от «Служба поддержки» если NEW count > 0, адаптируется под collapsed sidebar (точка в углу иконки)
- **WbCard JOIN через nmId без FK:** уникальные nmId → single findMany → Map<nmId, {photoUrl, title}> — корректная реализация паттерна проекта
- **Graceful DB-degradation:** getSupportBadgeCount возвращает 0 при любой ошибке БД — не валит layout при отсутствии миграции

## Task Commits

Выполнено одним атомарным коммитом после прохождения tests+tsc:

1. **feat(08-03): лента /support + фильтры + пагинация + sidebar badge** — (см. git log)

## Files Created/Modified

### Создано
- `app/(dashboard)/support/page.tsx` — полностью переписана
- `components/support/SupportTicketCard.tsx` — RSC карточка
- `components/support/SupportFilters.tsx` — client фильтры с URL
- `components/support/SupportPagination.tsx` — client пагинация
- `components/support/SupportSyncButton.tsx` — client кнопка sync (используется и в Plan 08-04)
- `lib/support-badge.ts` — getSupportBadgeCount()

### Изменено
- `app/(dashboard)/layout.tsx` — + await getSupportBadgeCount() если есть SUPPORT access
- `components/layout/DashboardShell.tsx` — + supportBadgeCount prop
- `components/layout/Sidebar.tsx` — + supportBadgeCount prop
- `components/layout/NavLinks.tsx` — + badge render логика
- `tests/support-badge.test.ts` — Wave 0 stub заменён двумя тестами (count NEW + DB-fail fallback)

## URL параметры `/support`

| Параметр | Формат | Пример |
|---|---|---|
| `channels` | CSV из FEEDBACK\|QUESTION\|CHAT\|RETURN\|MESSENGER | `channels=FEEDBACK,QUESTION` |
| `statuses` | CSV из NEW\|IN_PROGRESS\|ANSWERED\|CLOSED\|APPEALED | `statuses=NEW` |
| `assignees` | CSV User.id | `assignees=clx123,clx456` |
| `nmId` | Integer | `nmId=12345678` |
| `dateFrom`, `dateTo` | YYYY-MM-DD | `dateFrom=2026-01-01` |
| `unanswered` | `1` = фильтр IN [NEW, IN_PROGRESS] (если statuses не задан) | `unanswered=1` |
| `page` | Integer (1-based) | `page=3` |

## Decisions Made

- Выбран пакет `support/` компонентов вместо объединения в один файл — будущие фазы (возвраты, чаты, мессенджеры) будут переиспользовать базовые компоненты.
- `SupportSyncButton` формально принадлежит Plan 08-04, но создан заранее в этом же коммите — он используется и на ленте (`/support`) и в диалоге (`/support/[ticketId]`), удобно держать его в одном коммите.
- WbCard.photos (String[]) не используется — предпочли `photoUrl` (главное фото) для карточек.

## Deviations from Plan

**Минимальные отклонения:**

- Button из shadcn не поддерживает `asChild` в проекте → `SupportPagination` использует native `<button>` и `<Link>` напрямую с tailwind стилями (более простой подход).
- Поле `WbCard.photos` в плане описано как JSON, но в реальной схеме это `String[]`. Использовали `photoUrl: String?` как источник фото.
- Поле в плане указано как `title`, в реальной схеме WbCard — `name`. Адаптировано.
- `SupportSyncButton` сразу реализован здесь (а не плейсхолдер-комментарий), потому что Plan 08-04 выполняется в той же wave и ссылается на него.

Все отклонения нейтральные (технические адаптации к реальной схеме).

## Issues Encountered

- TS error на Button asChild → заменили на native button+Link (см. Deviations).

## User Setup Required

Нет — изменения применяются с деплоем.

## Next Phase Readiness

**Готово для Plan 08-04:**
- `SupportSyncButton` интегрирован и на ленте, и будет использован в диалоге
- `/support/[ticketId]` может rely на те же layout-компоненты
- RSC страница фильтрует/пагинирует — ссылка из карточки на /support/[ticketId] идёт через `<Link>`

---
*Phase: 08-support-mvp*
*Completed: 2026-04-17*
