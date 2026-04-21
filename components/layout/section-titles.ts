// components/layout/section-titles.ts
// Map pathname → human-readable section title (used in Header)
// Order matters — more specific patterns first.

const SECTION_TITLES: Array<{ match: RegExp; title: string }> = [
  { match: /^\/dashboard/, title: "Главная" },

  { match: /^\/products\/new/, title: "Новый товар" },
  { match: /^\/products\/[^/]+\/edit/, title: "Редактировать товар" },
  { match: /^\/products/, title: "Товары" },

  { match: /^\/cards\/wb/, title: "Карточки товаров — WB" },
  { match: /^\/cards\/ozon/, title: "Карточки товаров — Ozon" },
  { match: /^\/cards/, title: "Карточки товаров" },

  { match: /^\/prices\/wb/, title: "Управление ценами — WB" },
  { match: /^\/prices\/ozon/, title: "Управление ценами — Ozon" },
  { match: /^\/prices/, title: "Управление ценами" },

  { match: /^\/weekly/, title: "Недельные карточки" },
  { match: /^\/stock/, title: "Управление остатками" },
  { match: /^\/batches/, title: "Себестоимость партий" },
  { match: /^\/purchase-plan/, title: "План закупок" },
  { match: /^\/sales-plan/, title: "План продаж" },
  { match: /^\/support\/stats/, title: "Статистика службы поддержки" },
  { match: /^\/support\/templates\/new/, title: "Новый шаблон ответа" },
  { match: /^\/support\/templates\/[^/]+\/edit/, title: "Редактирование шаблона" },
  { match: /^\/support\/templates/, title: "Шаблоны ответов" },
  { match: /^\/support\/returns/, title: "Возвраты" },
  { match: /^\/support\/customers\/[^/]+/, title: "Профиль покупателя" },
  { match: /^\/support\/new/, title: "Новый тикет" },
  { match: /^\/support/, title: "Служба поддержки" },
  { match: /^\/employees/, title: "Сотрудники" },

  { match: /^\/admin\/users/, title: "Пользователи" },
  { match: /^\/admin\/settings/, title: "Настройки" },
]

export function getSectionTitle(pathname: string): string {
  for (const { match, title } of SECTION_TITLES) {
    if (match.test(pathname)) return title
  }
  return ""
}
