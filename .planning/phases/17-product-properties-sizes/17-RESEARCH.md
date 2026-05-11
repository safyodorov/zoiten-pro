# Phase 17 — Research Notes

## Wave 0 — WB Content API формат characteristics + sizes

Прогон 2026-05-11 на проде (100 cards limit, токен с scope «Контент»).

### characteristics[].value — variadic тип

```jsonc
// Из Zoiten аэрогриль:
{ "id": 89064, "name": "Вес без упаковки (кг)", "value": 5 }                     // number
{ "id": 9623,  "name": "Гарантийный срок", "value": ["1 год", "12 месяцев"] }    // string[]
{ "id": 90652, "name": "Глубина предмета", "value": 23 }                          // number
{ "id": 5023,  "name": "Модель", "value": ["аэрогриль"] }                         // string[] (single)

// Из Alverto «Костюм классический двойка»:
{ "id": 14177449, "name": "Цвет",   "value": ["черный"] }                          // string[]
{ "id": 204557,   "name": "Пол",    "value": ["Мужской"] }                          // string[]
{ "id": 14177450, "name": "Состав", "value": ["68% полиэстер","20% вискоза","10% хлопок","2% спандекс"] } // multi-value
```

**Вывод:**
- Тип `value` зависит от свойства. Может быть `string`, `number`, `string[]`, `number[]`.
- Single-value свойства часто оборачиваются в массив длины 1 (`["Мужской"]`).
- Multi-value свойства приходят как `string[]` (Гарантия, Состав).
- Числовые приходят как сырое `number` (Глубина, Вес).

**Решение для парсинга → ProductPropertyValue.value: String:**

```typescript
function normalizeWbValue(raw: unknown): string {
  if (raw == null) return ""
  if (Array.isArray(raw)) return raw.map(v => String(v)).join(", ")
  return String(raw)
}
```

- Multi-value хранится как `"68% полиэстер, 20% вискоза, 10% хлопок, 2% спандекс"` (с разделителем `,`).
- Если CategoryProperty.kind=ENUM и пришёл массив `["Мужской"]` — нормализуется в `"Мужской"` (один элемент → строка без скобок). При записи в form — `options[]` должен содержать `"Мужской"` чтобы быть валидным выбором.
- Для NUMBER values приходящих как массив `[5]` — нормализуется в `"5"`.

### sizes[].techSize

```jsonc
// Zoiten аэрогриль (без размеров):
[ { "techSize": "0", "wbSize": "" } ]                                       // placeholder

// Alverto костюм:
[ { "techSize": "46", "wbSize": "46" }, { "techSize": "50", "wbSize": "50" }, ... ]
```

**Решение:**
- При парсинге `WbCard.techSizes` — filter `s.techSize` где `s.techSize !== "0"` и не пустая.
- Для одно-размерных товаров (бытовая техника) — техсайз `"0"` — пропускаем.
- В UI размерной сетки появится только реальные размеры одежды.

### Имена свойств в WB ↔ CategoryProperty.wbAttrName

Для seed data (если решим в acceptance):
- «Пол» → WB name `"Пол"`, kind=ENUM, options=["Мужской","Женский","Унисекс","Детский"]
- «Цвет» → WB name `"Цвет"`, kind=STRING (на старте; в будущем ENUM с справочником цветов)

Точные имена нужно копировать **с учётом регистра** — WB возвращает Cyrillic с заглавной буквы.

### Risk mitigation

- **R-01 (формат value):** разрешено через `normalizeWbValue()`. ✅
- **R-02 (товар с 2 WB карточками):** при импорте — берём только sortOrder=0 MarketplaceArticle. ✅
- **R-03 (cascade Category→Property→Value):** проверено в schema — onDelete: Cascade в обеих FK.
- **R-04 (нет local prisma):** валидируем через `npx prisma@6.19.3 validate` с dummy DATABASE_URL — работает.
