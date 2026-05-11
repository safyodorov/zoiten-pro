# Phase 18 — Product Name Refactor

**Status:** PLANNED (awaiting user approval before implementation)
**Date:** 2026-05-11
**Initiator:** Сергей Фёдоров

## Цель

Заменить ручное `Product.name` (которое сейчас используется как краткий артикул, например `Navy30` или `GM-300`) на **составное автогенерируемое наименование** + переименовать текущее `name` в `article`.

## Бизнес-правила формирования name

Ветвление по `Brand.direction.hasSizes`:

**Одежда** (`hasSizes = true`):
```
name = [Category.name] [Subcategory.name] [...properties где includeInName=true (by value)] [Article]
```
Пример: УКТ-000053 → `Костюм классический двойка слим Navy30` (если subcategory = "двойка", "Покрой" = "слим")

**Бытовая техника и прочее** (`hasSizes = false`):
```
name = [Subcategory.name ?? Category.name] [Article]
```
Пример: GM-300 → `Кофемашина GM-300` (Subcategory="Кофемашина", Category="Кухня" игнорируется)

**Общие правила:**
- Пустые/null части пропускаются
- Trim каждой части перед join
- Разделитель — пробел

## Ручное редактирование

- `Product.nameOverridden: Boolean @default(false)`.
- Юзер на форме может включить ручное редактирование → `nameOverridden=true`, name редактируется свободно.
- Если `nameOverridden=true` — автогенерация **не перезаписывает** ручной текст ни при save, ни при WB import, ни при изменении свойств.
- Кнопка «Сгенерировать автоматически» → `nameOverridden=false` + сразу пересчитать name.
- В UI явная пометка «Сформировано вручную» когда `nameOverridden=true`.

## Скоуп изменений

1. **Schema migration** (PostgreSQL):
   - `Product.name` → `Product.article` (rename column, ALTER TABLE RENAME COLUMN)
   - `Product.name` — новая колонка String, заполняется backfill'ом
   - `Product.nameOverridden Boolean @default(false)` — новая
   - `CategoryProperty.includeInName Boolean @default(false)` — новая

2. **Pure generation function** в `lib/product-name.ts`

3. **Auto-regenerate** при createProduct, updateProduct, saveProductProperties, importFromWb (через `regenerateProductName(productId)` helper).

4. **UI** в ProductForm:
   - Поле «Артикул» (replace «Наименование» по позиции в форме)
   - Поле «Наименование товара» — readonly когда `nameOverridden=false`, с кнопкой «Редактировать вручную»; editable когда `nameOverridden=true`, с кнопкой «Сгенерировать автоматически»

5. **Settings UI** — в `/admin/settings/Категории/<category>/Свойства/<property>` checkbox «Включать в название товара» → `CategoryProperty.includeInName`

6. **Backfill** одноразовый script `scripts/backfill-product-names.js`:
   - article ← старое name
   - name ← generateProductName(...)
   - nameOverridden = false

7. **References** — обновить везде где сейчас читается `product.name`:
   - `/products` table: показывать name (display), искать по name + article
   - `/cards/wb` linking: search по article + name
   - `/stock`, `/stock/wb`, `/prices/wb`, `/batches`: column «Товар» показывает name
   - product search во всех server actions (поиск по обоим полям)

## Риски

| Риск | Митигация |
|---|---|
| Rename column сломает существующий код | `npx prisma migrate dev --create-only` — generate миграцию + типы, найти все TS-references через сборку |
| Backfill сгенерирует "плохие" name (пустые, дубли) | Скрипт логирует preview перед write; fallback на article если все части пустые |
| WB import переписывает name | Защита через nameOverridden + автогенерация не трогает manual |
| Поломка фильтров/поиска | Update search predicates во всех server actions: `OR: [{name: contains}, {article: contains}]` |
| Простой формы во время migration на проде | Migration быстрая (< 5 sec на 100 товарах) — окно простоя минимальное |
