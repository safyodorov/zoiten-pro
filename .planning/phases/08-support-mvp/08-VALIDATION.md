---
phase: 8
slug: support-mvp
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-17
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Детальная стратегия Validation Architecture — в `08-RESEARCH.md`.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest 4.1.x (уже установлен с Phase 7) |
| **Config file** | `vitest.config.ts` (корень проекта) |
| **Quick run command** | `npm run test -- tests/wb-support-api.test.ts` |
| **Full suite command** | `npm run test` |
| **Estimated runtime** | ~8-15 секунд (unit), ~30 сек с integration-моками |

---

## Sampling Rate

- **After every task commit:** Run `npm run test -- tests/wb-support-api.test.ts` (затрагиваемый тестовый файл)
- **After every plan wave:** Run `npm run test` (full suite) + `npx prisma validate`
- **Before `/gsd:verify-work`:** Full suite зелёный + `npx tsc --noEmit` без ошибок + `npm run build` (если нет type-errors → зелёный)
- **Max feedback latency:** 30 секунд

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 08-01-01 | 01 | 1 | SUP-01 | schema | `npx prisma validate && npx prisma format --check` | ✅ Wave 0 | ⬜ pending |
| 08-01-02 | 01 | 1 | SUP-02 | unit | `npm run test -- tests/wb-support-api.test.ts` | ❌ W0 (создать) | ⬜ pending |
| 08-01-03 | 01 | 1 | SUP-03 | type | `npx tsc --noEmit` (RBAC проверки в server actions) | ✅ | ⬜ pending |
| 08-01-04 | 01 | 1 | SUP-04 | manual | VPS `ls -la /var/www/zoiten-uploads/support/` | n/a | ⬜ manual |
| 08-02-01 | 02 | 2 | SUP-06 | integration | `npm run test -- tests/support-sync.test.ts` (mock WB + Prisma) | ❌ W0 (создать) | ⬜ pending |
| 08-02-02 | 02 | 2 | SUP-07 | unit | `npm run test -- tests/support-cron.test.ts` (CRON_SECRET auth) | ❌ W0 (создать) | ⬜ pending |
| 08-02-03 | 02 | 2 | SUP-08 | unit | `npm run test -- tests/support-media-download.test.ts` (mock fs) | ❌ W0 (создать) | ⬜ pending |
| 08-02-04 | 02 | 2 | SUP-05 | unit | `npm run test -- tests/support-media-cleanup.test.ts` | ❌ W0 (создать) | ⬜ pending |
| 08-02-05 | 02 | 2 | SUP-09 | type | `npx tsc --noEmit` (API route types) | ✅ | ⬜ pending |
| 08-03-01 | 03 | 3 | SUP-10 | build | `npm run build` (компиляция RSC ленты) | ✅ | ⬜ pending |
| 08-03-02 | 03 | 3 | SUP-11 | manual | UAT: проверить работу каждого фильтра через URL params | n/a | ⬜ manual |
| 08-03-03 | 03 | 3 | SUP-12 | unit | `npm run test -- tests/support-badge.test.ts` (count query) | ❌ W0 (создать) | ⬜ pending |
| 08-03-04 | 03 | 3 | SUP-40 | build | `npm run build` (nav-items.ts компилится) | ✅ | ⬜ pending |
| 08-04-01 | 04 | 3 | SUP-13 | build | `npm run build` (диалог компилится) | ✅ | ⬜ pending |
| 08-04-02 | 04 | 3 | SUP-14 | integration | `npm run test -- tests/support-actions.test.ts` (replyToTicket mock) | ❌ W0 (создать) | ⬜ pending |
| 08-04-03 | 04 | 3 | SUP-15 | integration | `npm run test -- tests/support-actions.test.ts` (assignTicket) | ❌ W0 (создать) | ⬜ pending |
| 08-04-04 | 04 | 3 | SUP-16 | integration | `npm run test -- tests/support-actions.test.ts` (updateStatus) | ❌ W0 (создать) | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Тестовые файлы которые Plan 08-01 должен создать как пустые stub-ы (наполнятся в Plan 08-01 задачей 2):

- [ ] `tests/wb-support-api.test.ts` — unit-тесты клиента WB Feedbacks/Questions (mock fetch, проверка endpoints/headers, парсинг responses, обработка 429 через X-Ratelimit-Retry)
- [ ] `tests/support-sync.test.ts` — integration-тесты `/api/support-sync` с mock WB + real Prisma (upsert idempotency, скачивание медиа мокается через fs)
- [ ] `tests/support-cron.test.ts` — unit-тесты cron эндпоинтов (CRON_SECRET auth success/fail, 401 без секрета)
- [ ] `tests/support-media-download.test.ts` — unit-тесты downloadMedia (mock fs + fetch, проверка пути `/var/www/zoiten-uploads/support/{ticketId}/{messageId}/`)
- [ ] `tests/support-media-cleanup.test.ts` — unit-тесты очистки (mock fs.unlink, проверка фильтра expiresAt < now())
- [ ] `tests/support-badge.test.ts` — unit-тест count query для sidebar badge (mock Prisma)
- [ ] `tests/support-actions.test.ts` — integration-тесты server actions (replyToTicket, assignTicket, updateStatus; mock WB API, real Prisma)

Framework install — не требуется (vitest уже есть с Phase 7 + Prisma singleton уже настроен).

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Медиа реально отдаются по `/uploads/support/...` URL в браузере | SUP-04, SUP-08 | Требует живой nginx + реальные файлы на VPS | На VPS: `curl -I https://zoiten.pro/uploads/support/{ticketId}/{messageId}/{filename}` → 200 OK. После первого sync — открыть диалог тикета, убедиться что превью фото отображается |
| Cron действительно запускается по расписанию | SUP-07 | Требует systemd timer / внешний cron-планировщик | VPS: настроить `/etc/cron.d/zoiten-support` или Vercel Cron; после 15 мин — проверить `SupportTicket.updatedAt` обновился и есть новые записи |
| Реальный ответ через WB API попадает в кабинет продавца WB | SUP-14 | Требует живой WB API + тестовый артикул с реальным отзывом | Sergey вручную ответит на реальный тикет из ERP, затем зайдёт в https://seller.wildberries.ru/ и проверит что ответ появился |
| Sidebar badge корректно обновляется после ответа | SUP-12 | Требует визуальной проверки RSC revalidation | Ответить на тикет → проверить что badge уменьшился на 1 без hard refresh |
| Фильтры ленты по каналу/статусу/дате/менеджеру/только неотвеченные работают | SUP-11 | UI behaviour — проще визуально | Пройти 6 фильтр-комбинаций, проверить что URL/результаты корректны |
| Старая заглушка `/support` полностью заменена на новую ленту | SUP-10, SUP-40 | UI check | Открыть `/support` — убедиться что нет ссылки на github.com/safyodorov/ai-cs-zoiten, вместо этого — лента тикетов |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies (unit-тесты или type-check/build)
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify — проверяется per-plan
- [ ] Wave 0 covers all MISSING references (7 новых test-файлов, stub-ы создаются в Plan 08-01 T2)
- [ ] No watch-mode flags (используем `npm run test` = vitest run, не watch)
- [ ] Feedback latency < 30s (vitest unit run ~8 сек, full suite ~30 сек)
- [ ] `nyquist_compliant: true` set in frontmatter (поставить после заполнения всех Status в per-task map)

**Approval:** pending
