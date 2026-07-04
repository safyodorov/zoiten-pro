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

  { match: /^\/procurement\/suppliers\/[^/]+/, title: "Поставщик" },
  { match: /^\/procurement\/suppliers/, title: "Поставщики" },
  { match: /^\/procurement\/purchases\/[^/]+/, title: "Закупка" },
  { match: /^\/procurement\/purchases/, title: "Закупки" },
  { match: /^\/procurement\/plan/, title: "План закупок" },
  { match: /^\/procurement/, title: "Управление закупками" },

  { match: /^\/purchase-plan/, title: "План закупок (временный)" },
  { match: /^\/sales-plan\/products/, title: "План продаж — Товары" },
  { match: /^\/sales-plan\/purchases/, title: "План продаж — Пора заказывать" },
  { match: /^\/sales-plan/, title: "План продаж" },
  { match: /^\/credits\/schedule/, title: "Кредиты — сводный график" },
  { match: /^\/credits\/[^/]+/, title: "Кредит" },
  { match: /^\/credits/, title: "Кредиты" },
  { match: /^\/bank/, title: "Банковские счета" },
  { match: /^\/cash/, title: "Наличные расчёты" },
  { match: /^\/finance\/balance/, title: "Финансы — Баланс" },
  { match: /^\/finance\/cashflow/, title: "Финансы — ОДДС" },
  { match: /^\/finance\/pnl/, title: "Финансы — ОПиУ" },
  { match: /^\/finance-models/, title: "Финансовые модели" },
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
