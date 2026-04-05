# Zoiten ERP

## What This Is

Корпоративная мини-ERP система для компании Zoiten — торговля на маркетплейсах (Wildberries, Ozon, Детский Мир, Яндекс Маркет). Веб-приложение на zoiten.pro для управления товарами, ценами, остатками, закупками и службой поддержки. Целевая аудитория — команда из 10+ сотрудников компании.

## Core Value

Единая база товаров компании, от которой зависят все остальные процессы ERP — цены, закупки, остатки, поддержка.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Главная страница с логотипом, слоганом, навигацией по разделам и анимацией
- [ ] Аутентификация: логин/пароль, суперадмин создаёт пользователей, RBAC по разделам
- [ ] Раздел «Товары»: полный CRUD с фильтрацией по статусу наличия
- [ ] Модель товара: наименование, фото (3:4, JPEG/PNG, до 2K), артикулы по маркетплейсам (до 10 на МП), штрих-коды (1-20), характеристики (вес, габариты, авто-объём), бренд, категория/подкатегория, ABC-статус, наличие
- [ ] Маркетплейсы: WB, Ozon, ДМ, ЯМ + возможность добавлять новые
- [ ] Бренды: Zoiten по умолчанию, CRUD
- [ ] Категории/подкатегории: настраиваются per бренд, CRUD с inline-добавлением. Zoiten: Дом, Кухня, Красота и здоровье
- [ ] Копирование товара из списка
- [ ] Мягкое удаление: статус «удалено», автоочистка через 30 дней
- [ ] Вкладки-заглушки: Управление ценами, Недельные карточки, Управление остатками, Себестоимость партий, План закупок, План продаж
- [ ] Раздел «Служба поддержки» — интеграция из github.com/safyodorov/ai-cs-zoiten
- [ ] Хранение фото на VPS (локальная файловая система)
- [ ] Деплой на VPS (root@85.198.97.89) с systemd + nginx

### Out of Scope

- API интеграция с маркетплейсами (WB, Ozon) — будет в следующем milestone, после MVP
- Управление ценами (функционал) — пока только заглушка-вкладка
- Недельные карточки (функционал) — пока только заглушка-вкладка
- Управление остатками (функционал) — пока только заглушка-вкладка
- Себестоимость партий (функционал) — пока только заглушка-вкладка
- План закупок (функционал) — пока только заглушка-вкладка
- План продаж (функционал) — пока только заглушка-вкладка
- S3/облачное хранение фото — VPS достаточно для 50-200 товаров

## Context

- Компания Zoiten торгует на маркетплейсах, основной — Wildberries
- Ассортимент: 50-200 товаров, 3 категории (Дом, Кухня, Красота и здоровье)
- Команда: 10+ человек, нужен RBAC
- На VPS (85.198.97.89) уже работает CantonFairBot (/opt/CantonFairBot/)
- PostgreSQL нужно установить на VPS
- Домен zoiten.pro пока не привязан к серверу
- Слоган: "Время для жизни, свобода от рутины"
- Суперадмин: sergey.fyodorov@gmail.com
- GitHub: safyodorov/zoiten-pro (private)
- Служба поддержки берётся из существующего проекта github.com/safyodorov/ai-cs-zoiten

## Constraints

- **Tech stack**: Next.js 14 (App Router, TypeScript), PostgreSQL + Prisma, shadcn/ui + Tailwind + Framer Motion, NextAuth.js
- **Hosting**: Один VPS (85.198.97.89), нужно не мешать CantonFairBot
- **Storage**: Фото на VPS filesystem, не в облаке
- **Security**: bcrypt для паролей, HTTPS/SSL через Let's Encrypt, CSRF protection
- **Deploy**: systemd + nginx reverse proxy → localhost:3000

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Next.js 14 fullstack | Единый стек для фронта и бэка, лучшая экосистема UI | — Pending |
| PostgreSQL + Prisma | Промышленный стандарт БД + безопасный ORM с миграциями | — Pending |
| Фото на VPS | 50-200 товаров, S3 избыточен для такого масштаба | — Pending |
| shadcn/ui + Framer Motion | Красивый UI с анимациями, Magic MCP совместимость | — Pending |
| NextAuth.js credentials | Простая авторизация логин/пароль, RBAC через роли | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-05 after initialization*
