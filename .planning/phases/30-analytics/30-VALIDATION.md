---
phase: 30
slug: analytics
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-13
---

# Phase 30 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.
> Derived from `30-RESEARCH.md § Validation Architecture`. Requirement IDs R1–R12 map 1:1 to `30-SPEC.md` requirements 1–12.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest ^4.1.4 (уже настроен) |
| **Config file** | `vitest.config.ts` (alias `@` → корень, pool `vmForks` для Windows-стабильности) |
| **Quick run command** | `npx vitest run tests/analytics-*.test.ts` |
| **Full suite command** | `npm test` (= `vitest run`, 100+ существующих файлов + новые) |
| **Estimated runtime** | quick ~5–15s; full ~1–3 min |

---

## Sampling Rate

- **After every task commit:** `npx vitest run tests/analytics-*.test.ts`
- **After every plan wave:** `npm test` (существующие 100+ файлов не должны сломаться)
- **Before `/gsd:verify-work`:** полный набор зелёный
- **Max feedback latency:** ~15s (quick), ~3 min (full)

---

## Per-Requirement Verification Map

> Task-level IDs проставит planner (задачи ещё не созданы). Здесь — карта требование → тест из RESEARCH.md.

| Req | Behavior | Test Type | Automated Command | File Exists | Status |
|-----|----------|-----------|-------------------|-------------|--------|
| R1 | Парсинг 6 файлов → 30 SKU; отклонение дубликатов/невалидной структуры | unit | `npx vitest run tests/analytics-data.test.ts` | ❌ W0 | ⬜ pending |
| R2 | aggregateFunnel golden (÷30, «от сумм», клик→заказ=произведение, цена×0.97) | unit (golden) | `npx vitest run tests/analytics-engine.test.ts` | ❌ W0 | ⬜ pending |
| R3 | MPSTATS-клиент — контрактный тест на мок-ответах | unit (mocked fetch) | `npx vitest run tests/analytics-mpstats.test.ts` | ❌ W0 (блок. Open Q#1) | ⬜ pending |
| R4 | wb-card-scan (обёртка curl) — тест на фикстуре card.json | unit (mocked execSync) | `npx vitest run tests/analytics-wb-card-scan.test.ts` | ❌ W0 | ⬜ pending |
| R5 | Персистентность — snapshot build/parse payload | unit (mocked prisma) | `npx vitest run tests/analytics-snapshot.test.ts` | ❌ W0 | ⬜ pending |
| R6 | Сортировка одинакова на всех вкладках | unit (pure sort) + UI smoke | `npx vitest run tests/analytics-engine.test.ts` | ❌ W0 | ⬜ pending |
| R7 | evaluateCompleteness golden (топ-10 провал→FAILED; 11-30→PARTIAL) | unit (golden) | `npx vitest run tests/analytics-engine.test.ts` | ❌ W0 | ⬜ pending |
| R8 | 5 вкладок рендерят все 30 строк | manual UI smoke | — | — | manual-only |
| R9 | N метрик → N графиков в строке | manual UI smoke | — | — | manual-only |
| R10 | Тепловая карта — средняя позиция игнорирует дни-прочерки | unit (pure aggregation) | `npx vitest run tests/analytics-engine.test.ts` | ❌ W0 | ⬜ pending |
| R11 | PDF генерируется; 30 строк + по-SKU блоки; magic bytes + ненулевой размер | integration | `npx vitest run tests/analytics-pdf.test.ts` | ❌ W0 | ⬜ pending |
| R12 | RBAC 403 без гранта / доступ SUPERADMIN + грант ANALYTICS | manual smoke (curl 403 на VPS) | — | — | manual-only |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `30-WAVE0-NOTES.md` — **curl-верификация реальных MPSTATS-эндпоинтов** (позиции organic/ad per SKU + список запросов с частотностью) с токеном пользователя. **БЛОКИРУЕТ** полноценный R3 (см. RESEARCH Open Question #1).
- [ ] `30-WAVE0-NOTES.md` (или отдельно) — актуальная карта `vol→basket-host` + проверка формата `card.json` для реального nmID (R4).
- [ ] `tests/fixtures/analytics-detail-sample.json` — реальный/правдоподобный образец detail-файла (нужен ≥1 настоящий файл от пользователя; Open Q#4) — для R1/R2.
- [ ] `tests/fixtures/analytics-card-sample.json` — образец basket-CDN card.json — для R4.
- [ ] `tests/analytics-*.test.ts` (7 файлов по карте выше) — новые; framework уже настроен, установки не требуется.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 5 вкладок рендерят все 30 строк | R8 | нет прецедента component-тестов полных страниц | открыть `/analytics/<runId>`, переключить 5 вкладок, проверить 30 строк |
| N метрик → N графиков в строке | R9 | UI-интеракция | на «Статистика карточки» включить 2–3 метрики, проверить N графиков в строке |
| RBAC-гейт раздела | R12 | зависит от прод-сессии/грантов | `curl` 403 без гранта; логин SUPERADMIN → раздел виден (паттерн DEPLOY.md) |

---

## Validation Sign-Off

- [ ] Все задачи имеют `<automated>` verify или Wave 0 зависимость
- [ ] Непрерывность сэмплинга: нет 3 подряд задач без automated verify
- [ ] Wave 0 покрывает все MISSING-ссылки (MPSTATS-эндпоинты, card.json формат, фикстуры)
- [ ] Нет watch-режимных флагов
- [ ] Feedback latency < 15s (quick)
- [ ] `nyquist_compliant: true` выставлен планировщиком после раскладки задач

**Approval:** pending
