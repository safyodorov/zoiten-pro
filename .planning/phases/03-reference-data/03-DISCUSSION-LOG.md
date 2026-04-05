# Phase 3: Reference Data - Discussion Log

> **Audit trail only.**

**Date:** 2026-04-05
**Phase:** 03-reference-data
**Areas discussed:** UI Layout, Inline Creation, Category Hierarchy, Seed Data
**Mode:** --auto

---

## UI Layout
| Option | Description | Selected |
|--------|-------------|----------|
| Единая страница /admin/settings с табами | Бренды, Категории, Маркетплейсы в одном месте | ✓ |
| Отдельные страницы | /admin/brands, /admin/categories, /admin/marketplaces | |
**User's choice:** [auto] Единая страница с табами (recommended)

---

## Inline Creation (для продуктовой формы)
| Option | Description | Selected |
|--------|-------------|----------|
| Combobox с "Добавить новую" | Inline input внутри dropdown | ✓ |
| Модалка из combobox | Открывать Dialog для создания | |
**User's choice:** [auto] Combobox с inline input (recommended)

---

## Category Hierarchy
| Option | Description | Selected |
|--------|-------------|----------|
| Accordion-style | Категория раскрывается, показывая подкатегории | ✓ |
| Flat list | Подкатегории рядом с категориями | |
**User's choice:** [auto] Accordion-style (recommended)

---

## Seed Data
| Option | Description | Selected |
|--------|-------------|----------|
| Расширить seed.ts | Добавить бренды/категории/маркетплейсы в существующий файл | ✓ |
| Отдельный seed файл | Новый файл для reference data | |
**User's choice:** [auto] Расширить seed.ts (recommended)
