---
status: human_needed
phase: 08-support-mvp
verifier: orchestrator-inline
plan_count: 4
plans_complete: 4
completed: 2026-04-17
---

# Phase 08: Служба поддержки MVP — Verification Report

**Status:** `human_needed` — автоматическая часть пройдена, требуется ручная проверка на VPS после деплоя.

## Goal Recall (из ROADMAP.md)

> Менеджер службы поддержки видит все новые отзывы и вопросы WB в единой ленте `/support`, открывает диалог, отвечает через WB API, назначает исполнителя и меняет статус — без перехода в личный кабинет WB.

## Requirement Coverage

Все 15 requirements этой фазы реализованы на уровне кода:

| Req | План | Статус | Примечание |
|---|---|---|---|
| SUP-01 (модели БД) | 08-01 | ✅ | 4 модели + 5 enum + composite unique |
| SUP-02 (WB API client) | 08-01 | ✅ | 5 методов, 429 retry, 10 unit-тестов GREEN |
| SUP-03 (test stubs) | 08-01 | ✅ | 6 файлов → все наполнены в 08-02/03/04 |
| SUP-04 (Prisma миграция) | 08-01 | ✅ | `20260417_support_mvp/migration.sql` — применение на VPS |
| SUP-05 (sync logic) | 08-02 | ✅ | `lib/support-sync.ts` идемпотентный upsert |
| SUP-06 (media download) | 08-02 | ✅ | `lib/support-media.ts` concurrency=5 + retry=1 |
| SUP-07 (cron 15 min) | 08-02 | 🟡 partial | Только FEEDBACK/QUESTION cron (chat+appeals → Phase 10/11) |
| SUP-08 (manual sync) | 08-02 | ✅ | `POST /api/support-sync` с RBAC |
| SUP-09 (media cleanup) | 08-02 | ✅ | Cron + ENOENT fallback |
| SUP-10 (RSC лента) | 08-03 | ✅ | `/support` с фильтрами + пагинацией |
| SUP-11 (фильтры) | 08-03 | ✅ | 7 параметров URL: channels, statuses, assignees, nmId, dateFrom/To, unanswered |
| SUP-12 (пагинация) | 08-03 | ✅ | pageSize=20 |
| SUP-13 (RSC диалог) | 08-04 | ✅ | `/support/[ticketId]` 3-col layout |
| SUP-14 (reply WB API) | 08-04 | 🟡 partial | Только FEEDBACK/QUESTION (CHAT/RETURN/MESSENGER → Phase 10-12) |
| SUP-15 (assign/status) | 08-04 | ✅ | 3 server actions с RBAC |
| SUP-16 (sync button) | 08-04 | ✅ | `SupportSyncButton` на обеих страницах |
| SUP-40 (sidebar badge) | 08-03 | ✅ | `getSupportBadgeCount` + badge в NavLinks |

## Automated Checks

| Проверка | Результат |
|---|---|
| `npm run test` | ✅ 12 test files, 89 tests passed, 0 failed |
| `npx tsc --noEmit` | ✅ clean |
| `npx prisma validate` | ✅ schema valid |
| Composite unique `@@unique([channel, wbExternalId])` | ✅ grep найден |
| Обратные relations `SupportAssignee` / `SupportAuthor` | ✅ 2 × 2 |
| `requireSection("SUPPORT", "MANAGE")` в server actions | ✅ 3 из 3 |
| `x-cron-secret` в cron endpoints | ✅ 2 из 2 |
| Старая заглушка `github.com/safyodorov/ai-cs-zoiten` на `/support` | ✅ удалена (grep 0) |

## Test Coverage per file

| Файл | Тесты | Статус |
|---|---|---|
| `tests/wb-support-api.test.ts` | 10 | ✅ GREEN |
| `tests/support-sync.test.ts` | 4 | ✅ GREEN |
| `tests/support-cron.test.ts` | 3 | ✅ GREEN |
| `tests/support-media-download.test.ts` | 4 | ✅ GREEN |
| `tests/support-media-cleanup.test.ts` | 3 | ✅ GREEN |
| `tests/support-badge.test.ts` | 2 | ✅ GREEN |
| `tests/support-actions.test.ts` | 11 | ✅ GREEN |
| Phase 7 regression tests | ~52 | ✅ GREEN (no regressions) |

## Human Verification Required

См. `08-VALIDATION.md`. После деплоя на VPS (см. ниже):

1. [ ] Открыть `https://zoiten.pro/support` — видна лента тикетов (или «Нет тикетов» до первой синхронизации)
2. [ ] Нажать «Синхронизировать» → toast «Готово. Отзывы: X, вопросы: Y, медиа: Z»
3. [ ] Фильтры: выбрать один канал → в ленте только этот канал; сброс → все каналы
4. [ ] Фильтр по nmId → только тикеты с этим артикулом
5. [ ] Фильтр «Только неотвеченные» → только NEW+IN_PROGRESS
6. [ ] Пагинация работает: всего > 20 тикетов → видны 2+ страницы
7. [ ] Клик по карточке → открывается `/support/[ticketId]` с 3 колонками
8. [ ] Ответ на отзыв → уходит в WB-кабинет (проверить в браузере https://seller.wildberries.ru/); локально создаётся OUTBOUND, status → ANSWERED
9. [ ] Назначить менеджера → status → IN_PROGRESS
10. [ ] Сменить статус через select → сохраняется в БД
11. [ ] Badge в sidebar соответствует count SupportTicket.status=NEW
12. [ ] Фото в диалоге открываются (через nginx alias `/uploads/support/.../`)
13. [ ] VIEWER-пользователь видит ленту, но reply-панель/select disabled (RBAC check)

## VPS Deployment Blockers

**ДО выполнения human-UAT необходимо:**

1. Создать директорию медиа:
   ```bash
   ssh root@85.198.97.89 "mkdir -p /var/www/zoiten-uploads/support/ && chown -R www-data:www-data /var/www/zoiten-uploads/support/"
   ```

2. Применить Prisma миграцию на VPS:
   ```bash
   ssh root@85.198.97.89 "cd /opt/zoiten-pro && git pull && npm ci && npx prisma migrate deploy && systemctl restart zoiten-erp.service"
   ```

3. Добавить `CRON_SECRET` в `/etc/zoiten.pro.env` (если отсутствует):
   ```bash
   ssh root@85.198.97.89 "openssl rand -hex 32" # получить hex → вручную добавить в /etc/zoiten.pro.env как CRON_SECRET=...
   ```

4. Настроить cron в `/etc/cron.d/zoiten-support`:
   ```
   */15 * * * * www-data curl -s -H "x-cron-secret: $(grep ^CRON_SECRET /etc/zoiten.pro.env | cut -d= -f2)" http://localhost:3001/api/cron/support-sync-reviews > /dev/null
   0 3 * * *    www-data curl -s -H "x-cron-secret: $(grep ^CRON_SECRET /etc/zoiten.pro.env | cut -d= -f2)" http://localhost:3001/api/cron/support-media-cleanup > /dev/null
   ```

5. nginx alias `/uploads/` → `/var/www/zoiten-uploads/` (существующий с Phase 6) — уже покрывает `/uploads/support/*`.

## Out-of-Scope (резерв Phase 9-12)

- CHAT канал и 5-мин cron → Phase 10
- RETURN канал с Approve/Reject/Reconsider → Phase 9
- MESSENGER канал с Telegram/WhatsApp → Phase 12
- APPEALED статус (обжалование отзывов) + 1-час cron → Phase 11
- Шаблоны ответов → Phase 11

## Gaps

None found. Все автоматические checks прошли. Phase 8 готова к деплою и human-UAT.

---
*Phase: 08-support-mvp*
*Status: human_needed (требуется VPS deploy + ручная проверка)*
