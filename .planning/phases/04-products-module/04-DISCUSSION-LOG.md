# Phase 4: Products Module - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-05
**Phase:** 04-products-module
**Areas discussed:** Product List, Product Form, Photo Upload, Articles/Barcodes, Soft Delete
**Mode:** --auto

---

## Product List
| Option | Description | Selected |
|--------|-------------|----------|
| Таблица с превью | Фото, имя, бренд, категория, ABC, статус, действия | ✓ |
| Карточки grid | Grid карточек товаров | |
**User's choice:** [auto] Таблица (recommended)

## Product Form
| Option | Description | Selected |
|--------|-------------|----------|
| Отдельная страница | /products/new, /products/[id]/edit | ✓ |
| Модалка | Dialog поверх списка | |
**User's choice:** [auto] Отдельная страница (recommended — слишком много полей)

## Photo Upload
| Option | Description | Selected |
|--------|-------------|----------|
| Drag-n-drop + button | Preview 3:4, валидация на клиенте | ✓ |
| Только кнопка | Простой file input | |
**User's choice:** [auto] Drag-n-drop (recommended)

## Articles/Barcodes UI
| Option | Description | Selected |
|--------|-------------|----------|
| Dynamic arrays | Кнопка "Добавить", input + delete per item | ✓ |
| Фиксированные поля | Заранее показать все слоты | |
**User's choice:** [auto] Dynamic arrays (recommended)

## Soft Delete + Purge
| Option | Description | Selected |
|--------|-------------|----------|
| API cron endpoint | /api/cron/purge-deleted + systemd timer | ✓ |
| Prisma middleware | Lazy purge при каждом запросе | |
**User's choice:** [auto] API cron endpoint (recommended)
