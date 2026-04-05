# Phase 1: Foundation & Auth - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-05
**Phase:** 01-foundation-auth
**Areas discussed:** Session Strategy, Post-Login Dashboard, Auth Error UX, RBAC Sections
**Mode:** --auto (all decisions auto-selected as recommended defaults)

---

## Session Strategy

| Option | Description | Selected |
|--------|-------------|----------|
| JWT в cookies | Stateless, httpOnly, подходит для малой команды | ✓ |
| Database sessions | Серверные сессии в БД, можно отзывать мгновенно | |
| Redis sessions | Быстрые серверные сессии, требует Redis | |

**User's choice:** [auto] JWT в cookies (recommended default)
**Notes:** 10 пользователей, stateless достаточен. Отзыв сессий не критичен.

---

## Post-Login Dashboard

| Option | Description | Selected |
|--------|-------------|----------|
| Dashboard с карточками разделов | Навигация по доступным секциям после логина | ✓ |
| Перенаправление на последний раздел | Запоминать куда ходил пользователь | |
| Прямо на Товары | Основной раздел, сразу туда | |

**User's choice:** [auto] Dashboard с карточками разделов (recommended default)
**Notes:** Универсальный вход, показывает только доступные разделы.

---

## Auth Error UX

| Option | Description | Selected |
|--------|-------------|----------|
| Inline alert на странице логина | Ошибка показывается прямо на форме | ✓ |
| Toast notification | Всплывающее уведомление | |

**User's choice:** [auto] Inline alert (recommended default)
**Notes:** Проще, понятнее для пользователя.

---

## RBAC Sections Structure

| Option | Description | Selected |
|--------|-------------|----------|
| Prisma enum | Фиксированный список секций в схеме БД | ✓ |
| Таблица секций | Динамический список, CRUD для секций | |

**User's choice:** [auto] Prisma enum (recommended default)
**Notes:** Список секций известен и стабилен. Enum проще и безопаснее.

---

## Claude's Discretion

- Структура папок App Router
- Naming conventions в Prisma schema
- Начальный набор shadcn/ui компонентов
- Дизайн страниц ошибок
