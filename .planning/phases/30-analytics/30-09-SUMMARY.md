# Phase 30 — Plan 09 Summary (Wave 5: UI-оболочка)

**Status:** ✅ executed (tsc чист; `next build` зелёный).

## Файлы
- `app/(dashboard)/analytics/page.tsx` — RSC список прогонов (история), «завис» для COLLECTING >15 мин + форма «Пометить FAILED» (MANAGE), PDF-ссылка, шапка с токеном.
- `app/(dashboard)/analytics/upload/page.tsx` — RSC страница нового прогона.
- `components/analytics/AnalyticsUploadForm.tsx` — 6 файлов → превью 30 → «Начать сбор» → poller.
- `components/analytics/AnalyticsTokenBar.tsx` — ввод MPSTATS-токена (password, debounced, маска).
- `components/analytics/NicheRunStatusPoller.tsx` — polling статуса, редирект на дашборд при READY/PARTIAL.

## Маршруты (для RBAC 30-13)
- `/analytics` (VIEW), `/analytics/upload` (VIEW; запуск внутри — MANAGE), `/analytics/runs/[id]` (VIEW).

## Решения
- Токен-бар и «Начать сбор» видны/активны только при MANAGE (getSectionRole).
- Poller: `GET status` каждые 2.5с; READY/PARTIAL → `router.push`; FAILED → errorMessage.
- Список: ссылки `prefetch={false}` (CLAUDE.md §601). «Завис» = COLLECTING && updatedAt старше 15 мин.
