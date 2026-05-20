# Phase 20: Управление закупками — Discussion Log

> **Audit trail only.** Decisions captured in CONTEXT.md.
> Mode: `--auto` (user сказал «делай максимально без меня, завтра отвечу на все вопросы»).
> Все decisions = recommended defaults, помечены `[auto]`. Review для подтверждения утром.

**Date:** 2026-05-20
**Phase:** 20-procurement
**Areas auto-decided:** Database schema (Suppliers), Multi-payment, Currency rates, Routes & RBAC, UI patterns, Numeric & locale, Deletion strategy

---

## Database schema — Поставщики

| Option | Description | Selected |
|--------|-------------|----------|
| Single `Supplier` table + nested phones/emails (как Employee) | Тонкий supplier + детали в child tables | ✓ (D-01..D-04) |
| Wide table со всеми контактами как JSON | Меньше join'ов, гибче, но плохо для query | |
| Раздельные tables `Manager` + `Boss` | Дублирование, complexity | |

**Auto-selected:** Single `Supplier` + child tables (`SupplierContact`, `SupplierProductLink`, `Negotiation`).
**Rationale:** Симметрия с существующим `Employee` (D-01 в CLAUDE.md паттерны). Easy query, type-safe relations через Prisma.

---

## Multi-payment scheme

| Option | Description | Selected |
|--------|-------------|----------|
| Отдельная таблица `PurchasePayment` | Каждый платёж = row с ordinal | ✓ (D-08) |
| Поля `deposit{1,2,3}_amount` в Purchase | Static, max 3 deposits | |
| JSON array of payments | Гибко но плохо для type safety / SUM queries | |

**Auto-selected:** `PurchasePayment` table с `(type, ordinal)` ключом.
**Rationale:** Пользователь явно сказал «по умолчанию один депозитный и один балансовый. При этом... может быть несколько». Открытая мощность = explicit table.

---

## Currency rates source

| Option | Description | Selected |
|--------|-------------|----------|
| `cbr-xml-daily.ru` simplified JSON | One-line GET, без auth, обновляется ~11:30 МСК | ✓ (D-09) |
| Raw `cbr.ru` XML feed `XML_daily.asp?date_req=` | Стандарт, требует XML parser | |
| Третий-party API (fixer.io / open.er-api.com) | Не official ЦБ РФ, может быть delayed | |

**Auto-selected:** `cbr-xml-daily.ru/daily_json.js`.
**Rationale:** Пользователь явно сказал «БД официальных курсов валют ЦБ РФ — отдельный вопрос как». JSON wrapper над CBR XML, обновляется автоматически. Cron в 12:00 МСК (после публикации в 11:30).

---

## Routes & RBAC

| Option | Description | Selected |
|--------|-------------|----------|
| Один section `PROCUREMENT` + UI tabs | Меньше permissions, проще | ✓ (D-10..D-11) |
| Три section `SUPPLIERS` / `PURCHASES` / `PROCUREMENT_PLAN` | Granular permissions, сложнее | |

**Auto-selected:** Один `PROCUREMENT` enum (уже существует в схеме).
**Rationale:** Существующий `ERP_SECTION.PROCUREMENT` уже в БД. Granular per sub-section permissions не запрашивался пользователем. Можем split в v2 если потребуется.

---

## UI patterns

| Option | Description | Selected |
|--------|-------------|----------|
| Sticky data-tables (как /prices/wb /stock/wb /cards/wb) | Стандарт проекта | ✓ (D-12) |
| shadcn `<Table>` | Имеет sticky bug, см. CLAUDE.md | |
| TanStack Table | Overengineering для v1 | |

**Auto-selected:** Raw HTML table с sticky `<thead>` (CLAUDE.md «Sticky data-таблицы» pattern).

| Option | Description | Selected |
|--------|-------------|----------|
| Modal dialogs для CRUD (как Employee) | Inline edit, без route changes | ✓ (D-14) |
| Отдельные create-страницы (как /products/new) | Лучше для очень больших форм | |

**Auto-selected:** Modal dialogs (форма Поставщика умеренного размера).

---

## Multi-supplier / Multi-currency on Purchase

| Option | Description | Selected |
|--------|-------------|----------|
| Один Supplier + одна currency per Purchase (v1) | Простая схема, два разных контракта = две Purchase | ✓ (D-07) |
| Multi-supplier via junction table | Сложнее schema, нужно multiple address для inspection | |
| Multi-currency items | Сложнее UI с mixed currencies | |

**Auto-selected:** V1 minimalism — один Supplier + одна currency.
**Rationale:** Пользователь не уточнил multi-supplier требование явно. Открытый вопрос для утра (см. CONTEXT.md «Questions for User Review»).

---

## Soft delete strategy

| Option | Description | Selected |
|--------|-------------|----------|
| Soft delete Supplier (deletedAt) + cascade preserve children | Чтобы история закупок не терялась | ✓ (D-20..D-21) |
| Hard delete с restrict если есть Purchase | Чисто, но теряет историю | |

**Auto-selected:** Soft delete Supplier (как Product).

---

## Claude's Discretion

Следующие decisions сделаны без user input — это implementation-level:

1. **Sidebar порядок** — between «Себестоимость партий» и «План продаж».
2. **Icon Lucide** — Truck или Package для /procurement nav item.
3. **Default sorts** — Suppliers by buyer ASC, Purchases by createdAt DESC.
4. **Status colors** — следуем существующему style (Phase 19 SpendSummary): grey/blue/emerald/amber/red.
5. **Precision Decimal types** — `(14, 2)` для денег, `(14, 4)` для unit prices, `(5, 2)` для percent. Same precision как в Phase 19 / Phase 7.
6. **Default currency** — CNY (юань) per user description.

---

## Deferred Ideas

Все списано в CONTEXT.md `<deferred>` section. Краткая выжимка:

- **v2:** Audit log, Notifications cron, Forecast в Plan, Map embed, Auto-batch creation, Multi-supplier mix, Historical CBR backfill, Print/Export.
- **Open questions для review** — 11 пунктов в CONTEXT.md, разделены на критические / важные / низкоприоритетные.

---

## Auto-mode log entries

```
[auto] Context exists — updating with auto-selected decisions.
[auto] Selected all gray areas: [Schema, Multi-payment, Currency rates, Routes/RBAC, UI patterns, Numeric, Soft delete].
[auto] Schema — Q: "Структура tables?" → Selected: "Supplier + child tables" (recommended default, parallel to Employee).
[auto] Multi-payment — Q: "Storage?" → Selected: "PurchasePayment table with (type, ordinal)" (matches user's «может быть несколько»).
[auto] Currency rates — Q: "Source?" → Selected: "cbr-xml-daily.ru JSON" (simplest official-derived).
[auto] RBAC — Q: "Granularity?" → Selected: "Один PROCUREMENT enum" (already in schema).
[auto] Plan-phase advance — auto-advancing to /gsd:plan-phase 20 --auto.
```
