---
quick: 260518-hz7
type: summary
status: complete
requirements:
  - QUICK-260518-HZ7
files_created:
  - tests/format-feedback-body.test.ts
  - app/api/cron/feedbacks-backfill-pros-cons/route.ts
files_modified:
  - lib/wb-support-api.ts
  - lib/support-sync.ts
  - tests/support-sync.test.ts
commits:
  - ed557a5  # Task 1: helper + 8 unit tests
  - 8ddf15b  # Task 2: support-sync uses helper + self-heal
  - dbc43ba  # Task 3: backfill endpoint
tasks: 3
duration: ~7min
completed: 2026-05-18
---

# Quick Task 260518-hz7: WB feedbacks pros/cons sync + backfill Summary

Фикс WB feedbacks sync: `SupportMessage.text` теперь содержит полный body (`text` + `Достоинства` + `Недостатки`); раньше писался только `fb.text`. Добавлен self-heal в `syncFeedbacks` и one-shot backfill endpoint для исторических данных.

## Changes

**Created (2 files)**

- `tests/format-feedback-body.test.ts` — 8 unit-кейсов для pure helper (empty / text only / pros only / cons only / all three / leading empty / trim / null|undefined)
- `app/api/cron/feedbacks-backfill-pros-cons/route.ts` — one-shot POST endpoint защищён `x-cron-secret`, query `?days=N` (default 180, max 365), идемпотентен

**Modified (3 files)**

- `lib/wb-support-api.ts` — добавлена `export function formatFeedbackBody(fb): string` после `interface Feedback`. Pure function, склеивает `text + Достоинства: pros + Недостатки: cons` через `"\n\n"`, пустые/null/whitespace части пропускаются.
- `lib/support-sync.ts`:
  - Импорт `formatFeedbackBody` из `@/lib/wb-support-api`
  - `syncFeedbacks` INBOUND create: `text: formatFeedbackBody(fb) || null` вместо `text: fb.text`
  - Self-heal else-ветка: если existing INBOUND `text` ≠ новому formatted (с pros/cons) — `tx.supportMessage.update` (idempotent — skip если равно). Медиа-блок (photos + video) остаётся ВНУТРИ `if (!inbound)`, не дублируется в else.
- `tests/support-sync.test.ts` — mock `formatFeedbackBody` (inline pure), мок `supportMessage.update` для self-heal path; все 14 тестов проходят.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `ed557a5` | `test(quick-260518-hz7): add formatFeedbackBody helper + 8 unit tests` |
| 2 | `8ddf15b` | `feat(quick-260518-hz7): syncFeedbacks использует formatFeedbackBody + self-heal` |
| 3 | `dbc43ba` | `feat(quick-260518-hz7): one-shot backfill endpoint for feedbacks pros/cons` |

## Verification

- `npx tsc --noEmit` — passes (clean)
- `npm run build` — passes, route `/api/cron/feedbacks-backfill-pros-cons` зарегистрирован
- `npx vitest run tests/format-feedback-body.test.ts tests/support-sync.test.ts tests/wb-support-api.test.ts` — **32/32 passed** (8 new + 14 support-sync + 10 wb-support-api)
- Pre-existing failures в `tests/support-sync-returns.test.ts` и `tests/support-sync-chats.test.ts` (4 теста, unrelated к feedbacks) — подтверждено `git stash`-ом до изменений, не вызвано этим quick task.

## Deploy + backfill (для orchestrator/пользователя)

Делегировано пользователю (memory `feedback_deploy_delegation`):

```bash
# 1. Deploy
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"

# 2. Backfill (one-shot). Рекомендуется days=365 — самый длинный период,
#    охватывает все retroactive feedback'и с pros/cons. Endpoint идемпотентен,
#    повторный запуск безопасен.
ssh root@85.198.97.89 "source /etc/zoiten.pro.env && curl -sS -X POST \
  -H \"x-cron-secret: \$CRON_SECRET\" \
  'https://zoiten.pro/api/cron/feedbacks-backfill-pros-cons?days=365'"
```

Ответ endpoint'а:
```json
{
  "ok": true,
  "scanned": N,    // всего feedback'и обработано из WB API
  "updated": N,    // обновлено SupportMessage.text
  "skipped": N,    // пропущено (нет pros/cons || нет ticket || уже актуальный text)
  "days": 365,
  "errors": []     // ошибки per-fb, не критичны
}
```

**Рекомендация по days:**
- `days=180` — минимум, покрывает текущий quarter
- `days=365` — рекомендуется (вся история, что WB отдаёт)
- WB Feedbacks API hard limit ≈ 10000 на ответ без `nmId` фильтра — если за 365 дней их больше, скрипт возьмёт только последние

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Поле `SupportMessage.createdAt` отсутствует в схеме**

- **Found during:** Task 3 — план говорил orderBy `createdAt asc`, но `prisma/schema.prisma:777` показал что у `SupportMessage` есть только `sentAt @default(now())` (createdAt не определён)
- **Fix:** `orderBy: { sentAt: "asc" }` в `findFirst` INBOUND для backfill
- **Files modified:** `app/api/cron/feedbacks-backfill-pros-cons/route.ts`
- **Commit:** `dbc43ba`

**2. [Rule 2 - Critical Functionality] Mock `formatFeedbackBody` в существующих тестах**

- **Found during:** Task 2 — после добавления импорта `formatFeedbackBody` в `lib/support-sync.ts`, существующие тесты `tests/support-sync.test.ts` упали с ошибкой `vi.mock` модуля `@/lib/wb-support-api` не экспортирует `formatFeedbackBody`
- **Fix:** В `vi.mock("@/lib/wb-support-api", ...)` добавлен inline mock `formatFeedbackBody` (pure helper, воспроизводит логику). Также добавлен mock `supportMessage.update` для self-heal path в transaction mock.
- **Files modified:** `tests/support-sync.test.ts`
- **Commit:** `8ddf15b`

План явно разрешал адаптацию тестов: "Существующие тесты ... проходят без изменений (или адаптированы — pre-existing моки не проверяют content fb.pros/cons, должно остаться зелёным)".

## Truths Verified

- [x] Новые WB feedback'и сохраняются в `SupportMessage.text` с блоками text + Достоинства + Недостатки — подтверждено через support-sync test, формат `"<text>\n\nДостоинства: <pros>\n\nНедостатки: <cons>"`
- [x] Существующие FEEDBACK тикеты с потерянными pros/cons можно восстановить через one-shot endpoint — подтверждено tsc + build
- [x] Helper `formatFeedbackBody` корректно склеивает 1/2/3 части и пустые поля даёт пустую строку — 8 unit-кейсов pass
- [x] Существующий sync flow не сломан — 14 support-sync тестов pass

## Self-Check: PASSED

- [x] `lib/wb-support-api.ts` — exports `formatFeedbackBody` (verified via test import)
- [x] `lib/support-sync.ts` — imports `formatFeedbackBody`, uses in INBOUND create + self-heal
- [x] `app/api/cron/feedbacks-backfill-pros-cons/route.ts` — created, registered in build output as `/api/cron/feedbacks-backfill-pros-cons`
- [x] `tests/format-feedback-body.test.ts` — created, 8 cases all pass
- [x] Commits exist: `ed557a5`, `8ddf15b`, `dbc43ba` (all in `git log --oneline`)
- [x] Type-check clean, build green
