---
phase: 21-credits
plan: "08"
subsystem: credits
tags: [settings-ui, lender-crud, docs, deploy, seed, uat, rbac]
dependency_graph:
  requires: [21-01, 21-03, 21-04, 21-05, 21-06, 21-07]
  provides: [components/settings/LendersTab.tsx, .planning/phases/21-credits/21-UAT.md, .planning/phases/21-credits/21-DEPLOY-NOTES.md]
  affects: []
tech_stack:
  added: []
  patterns:
    - LendersTab по образцу BrandsTab (CRUD справочника в /admin/settings, requireSuperadmin)
    - VPS deploy через deploy.sh + scp untracked источников (Кредиты/, Кредиты.xlsx) + apt poppler-utils для pdftotext
    - Разовый seed на VPS (npx tsx scripts/seed-credits.ts) со сверкой контрольных сумм Лист2
key_files:
  created:
    - components/settings/LendersTab.tsx
    - .planning/phases/21-credits/21-UAT.md
    - .planning/phases/21-credits/21-DEPLOY-NOTES.md
  modified:
    - components/settings/SettingsTabs.tsx
    - app/(dashboard)/admin/settings/page.tsx
    - .planning/REQUIREMENTS.md
    - .planning/ROADMAP.md
    - components/credits/SummaryScheduleTable.tsx
    - CLAUDE.md
decisions:
  - "Seed сверка: per-credit 23/23 ✓ (Σтело == amount, diff=0 по всем 23 кредитам) — принято пользователем как основной критерий корректности. Per-org суммы превышают Лист2 control-колонки на 4 075 945,66 ₽ ИТОГО, потому что control-формулы Лист2 стартуют с поздних дат (пропускают ранние платежи Сбербанка); каждый diff трассируется до пропущенных месяцев. Это особенность окна контрольных формул, не ошибка данных — approve as-is (D-04 сверка)."
  - "JetLend PDF номер договора: парсинг адаптирован под формат pdftotext -layout на Ubuntu (отличается от локального)."
  - "Сбербанк XLSX: фикс двойного учёта хвостовой строки на границе следующего месяца."
  - "Доступ к разделу CREDITS: по решению пользователя выдан ТОЛЬКО суперадмину (bypass). Остальным 5 MANAGER + 1 VIEWER роль на CREDITS не назначалась — Кредиты чувствительный фин-раздел. Провижинить позже через /admin/users при необходимости."
  - "Post-UAT инлайн-фиксы (commit 05738ad): /credits/schedule sticky-подытоги bg-muted/40 → bg-muted (просвечивание при гориз. прокрутке) + иерархия границ тело/% исправлена (intra /40, inter полный цвет). Правило сплошного фона sticky добавлено в CLAUDE.md."
metrics:
  duration: "~33 минуты (вкл. deploy + 4 прогона seed) + post-UAT фиксы"
  completed: "2026-06-09"
  tasks: 3
  files: 8
---

# Phase 21 Plan 08: Lenders Settings + Docs + Deploy + Seed + UAT Summary

Финальный план Phase 21: UI справочника «Кредиторы» в /admin/settings, документация (UAT + DEPLOY), обновление REQUIREMENTS/ROADMAP, деплой на VPS с доставкой источников + установкой poppler-utils, разовый seed со сверкой, UAT с пользователем + инлайн-фиксы найденных UI-проблем.

## What Was Built

### Task 1: LendersTab CRUD + интеграция в SettingsTabs (commit 45d258e)

`components/settings/LendersTab.tsx` — CRUD справочника кредиторов (создать/переименовать/удалить с FK-guard) по образцу BrandsTab, под `requireSuperadmin`. Интегрирован в SettingsTabs + admin/settings/page.tsx.

### Task 2: Docs + REQUIREMENTS/ROADMAP (commit 39e7c7d)

`21-UAT.md` (пункты ручного тестирования live UI), `21-DEPLOY-NOTES.md` (poppler-utils, доставка Кредиты/ через scp, запуск seed), секция Phase 21 в REQUIREMENTS.md, обновление ROADMAP.md.

### Task 3: Deploy + Seed + UAT (commits 5a7dbd4, e3a57f7 + VPS)

Деплой на VPS (prisma migrate deploy применил миграцию phase21), `apt install poppler-utils`, scp `Кредиты/` + `Кредиты.xlsx`, 2 фикса парсера (JetLend PDF номер договора под Ubuntu pdftotext; Сбербанк XLSX хвост), затем разовый seed.

**Результат seed:** 23 кредита, 508 платежей. **Per-credit сверка 23/23 ✓** (Σтело == amount, diff=0). Per-org суммы > Лист2 control на 4 075 945,66 ₽ ИТОГО — трассируется до поздних стартов control-колонок Лист2 (пропуск ранних платежей Сбербанка). **Approve as-is** по решению пользователя.

## Deviations from Plan

- **Seed сверка per-org ✗ (обоснованно):** см. decisions — данные в БД корректны, расхождение = особенность контрольных формул Лист2. Принято as-is.
- **Post-UAT фиксы UI (commit 05738ad):** пользователь при live UAT нашёл 2 проблемы в `/credits/schedule` — (1) просвечивание контента сквозь sticky-подытоги при горизонтальной прокрутке (`bg-muted/40` → сплошной `bg-muted`); (2) инверсия иерархии границ тело/% (тело|% было полным цветом, кредит|кредит — /40; исправлено: intra /40, inter полный). Общий вывод про сплошной фон sticky-ячеек задокументирован в CLAUDE.md sticky-паттерн + память проекта. Найдены остаточные аналогичные баги в finance-models таблицах (не трогали — вне scope Phase 21).
- **RBAC:** доступ к CREDITS выдан только суперадмину (решение пользователя).

## Known Stubs

None. Раздел полностью функционален. Остаточные UAT-пункты (полная ручная проверка всех экранов) — на усмотрение пользователя; фиксы выкачены в прод.

## Self-Check: PASSED

Files exist:
- components/settings/LendersTab.tsx: FOUND
- .planning/phases/21-credits/21-UAT.md: FOUND
- .planning/phases/21-credits/21-DEPLOY-NOTES.md: FOUND

Commits:
- 45d258e: feat(21-08): LendersTab + SettingsTabs + settings page
- 39e7c7d: docs(21-08): UAT + DEPLOY notes + REQUIREMENTS + ROADMAP
- 5a7dbd4, e3a57f7: fix(21-08): seed parser fixes (JetLend PDF, Сбербанк XLSX)
- 05738ad: fix(21): sticky bleed + border hierarchy (post-UAT)

Deploy: VPS zoiten-erp.service active (running), migration applied, seed executed (23 loans / 508 payments).
