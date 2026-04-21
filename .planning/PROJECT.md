# Zoiten ERP

## Current Milestone: v1.2 Управление остатками

**Goal:** Менеджер видит актуальные остатки по всем каналам (склад Иваново + Производство + маркетплейсы в разрезе кластеров/складов WB), считает оборачиваемость и дефицит, чтобы принимать решения о закупках.

**Target features:**
- Раздел `/stock` с агрегацией РФ = Иваново + МП по каждому товару и артикулу
- Excel-импорт остатков склада Иваново (по УКТ/Product.sku)
- Ручной глобальный ввод остатков Производства (0-N per Product)
- Подраздел `/stock/wb` с per-nmId × per-кластер × per-склад разрезом (7 кластеров ЦФО/ЮГ/Урал/ПФО/СЗО/СФО/Прочие с expand до конкретных складов WB)
- Формулы О/З/Об/Д (Остаток / Заказы в день за 7 дн / Оборачиваемость в днях / Дефицит в шт) для каждого уровня агрегации
- Глобальная «Норма оборачиваемости» (default 37 дней) в AppSetting, редактируется в шапке
- Справочник WB складов → кластеров (одноразовый парсинг со seller.wildberries.ru)
- Расширение `/api/wb-sync` до per-warehouse granularity (новая таблица WbCardWarehouseStock)

**Ключевой контекст:**
- Milestone сосредоточен на одной большой фазе (Phase 14); планирование закупок/продаж — отдельный милстоун v1.3+
- Стабы `/stock`, `/stock/wb`, `/stock/ozon` из Phase 5 заменяются реальным функционалом
- `STOCK` уже есть в `ERP_SECTION` enum, `/stock` зарегистрирован в lib/sections.ts
- WB `avgSalesSpeed7d` (Orders API, filter `isCancel=true` → minus 10-20% vs кабинет — это ожидаемо, см. project_zoiten_pro.md) уже в БД — не дёргаем повторно, переиспользуем как «З» для WB-уровня
- Новый AppSetting ключ `stock.turnoverNormDays` (int, 1-100, default 37) — переиспользуем существующий KV из Phase 7
- Excel-импорт по УКТ (Product.sku формат «УКТ-000001»); `Product.ivanovoStock Int?` + `Product.productionStock Int?` новые поля
- Per-warehouse остатки WB: `WbCardWarehouseStock(wbCardId, warehouseId, quantity)` с unique `(wbCardId, warehouseId)` — пишется при полном `/api/wb-sync`, не при fast СПП
- Справочник `WbWarehouse(id, name, cluster, shortCluster)` — seed через одноразовый скрипт браузером со страницы seller.wildberries.ru
- Ozon-раздел `/stock/ozon` — заглушка ComingSoon (Ozon-интеграция отдельный милстоун)

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

- **Tech stack**: Next.js 15 (App Router, TypeScript, React 19), PostgreSQL + Prisma 6, shadcn/ui v4 + Tailwind v4 + motion, Auth.js v5
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
*Last updated: 2026-04-21 — milestone v1.2 Управление остатками стартовал*
