# Zoiten ERP

Корпоративная мини-ERP система для управления товарами и карточками маркетплейсов.

**Продакшн:** https://zoiten.pro

## Дизайн

- **Landing**: Glassmorphism — стеклянные карточки, анимированные градиентные блобы, адаптивный
- **Тема**: светлая по умолчанию + переключатель dark/light (next-themes)
- **Палитра**: тёплый оранжево-красный accent
- **Dashboard**: Lucide иконки, карточки с hover-эффектами
- **Sidebar**: свёртываемый (полный/только иконки), persist в localStorage, tooltip по hover, RBAC-фильтрация
- **Header**: название раздела по pathname (динамический заголовок вместо h1 на страницах)

## Возможности

### Товары
- Полный CRUD с фото (кроп 3:4), артикулами маркетплейсов, штрих-кодами
- УКТ — автоматический уникальный код товара (УКТ-000001)
- Габариты (Д×Ш×В), вес, объём (авто), ABC-статус, ярлык
- Мягкое удаление с физическим удалением из корзины
- Фильтры по бренду, категории, подкатегории

### Карточки товаров WB
- Синхронизация всех карточек из Wildberries через API
- Данные: фото, видео, штрихкоды, габариты, ярлыки
- Цена продавца (до/после скидки), скидка WB (СПП), скидка клуба
- Остатки по складам, процент выкупа за месяц
- Комиссии стандартные (FBW/FBS) и индивидуальные (из Excel)
- Создание товаров из выбранных карточек (чекбоксы + кнопки)
- Фильтры по бренду/категории, пагинация, сортировка

### Управление ценами — WB
- Калькулятор юнит-экономики WB карточек — таблица 30 колонок расчёта с rowSpan + sticky колонками
- 7 глобальных ставок (Кошелёк WB, Эквайринг, ВБ Джем, Кредит, Накладные, **Брак**, Налог) с debounced save + мгновенный `router.refresh()` после сохранения
- Синхронизация regular-акций через WB Promotions Calendar API (rate limit 10 req/6 sec)
- Загрузка Excel отчётов auto-акций из кабинета WB
- Realtime модалка пересчёта юнит-экономики — изменение ДРР/брака/скидок мгновенно пересчитывает прибыль, ROI, re-продажи
- Расчётные цены: 1-3 слота на карточку, сохранение snapshot входных параметров
- Fallback chain: **Брак** Product.override → Category.default → AppSetting.wbDefectRatePct → 2% hardcoded; **ДРР** Product.override → Subcategory.default → 10% hardcoded
- Фильтры: MultiSelect (бренд/категория/подкатегория) + toggle «Товар с остатком/Весь товар» + toggle «Карточки с остатком/без»; состояние в URL
- Заголовки столбцов таблицы выравнены `text-center` + `align-middle` (по горизонтали и вертикали)
- RBAC: read через `requireSection("PRICES")`, write через `requireSection("PRICES", "MANAGE")`
- Покрытие vitest: pricing-math (golden test), pricing-fallback, pricing-settings, wb-promotions-api, excel-auto-promo
- **UX таблицы:** регулируемые ширины столбцов (drag handle на правой границе, double-click → reset), перенос заголовков по словам, персистентное сохранение ширин per-user в таблицу `UserPreference` (debounced save, кросс-девайс), денежные значения отображаются без копеек (в БД хранятся полные)
- Ozon — заглушка ComingSoon

### Себестоимость партий
- Inline-редактирование себестоимости товаров
- Фильтры, поиск

### Настройки
- Бренды, категории, подкатегории — CRUD с drag-and-drop сортировкой
- Маркетплейсы — WB, Ozon, ДМ, ЯМ + кастомные

### Сотрудники
- Полный CRUD с модалкой создания/редактирования
- Привязка к компаниям (M:N): должность, ставка, оклад, документы по каждой компании
- Даты приёма/увольнения по каждой компании (автовычисление на уровне сотрудника)
- Подразделения (Офис/Склад), пол, номера пропусков
- Телефоны/email (личные и рабочие), паспорта
- Фильтры: Актуальная база/Уволенные/Все, по компании, по подразделению, поиск
- Группировка по компаниям, сортировка офис→склад→фамилия
- Подсветка дней рождения (10 дней), салют в день рождения
- Экспорт актуальной базы в XLSX
- Маска телефона +7 (XXX) XXX-XX-XX, склонение возраста

### Пользователи
- Создание только из справочника Сотрудники (1:1 привязка)
- Имя/Фамилия/email автоподставляются при выборе сотрудника
- Общая роль (Суперадмин/Менеджер/Просмотр) как пресет для прав
- Гранулярные права per раздел: **Нет / Просмотр / Управление**
- Переключение общей роли проставляет права ко всем разделам разом
- Генератор случайных паролей (crypto.getRandomValues, 12 символов)
- Plain text пароли видимы только суперадмину (показать/скрыть/копировать)
- `requireSection(section, "MANAGE")` для write-операций, `"VIEW"` по умолчанию

## Технологии

- **Next.js 15** (App Router, TypeScript, React 19)
- **PostgreSQL 16** + **Prisma 6**
- **shadcn/ui v4** + Tailwind v4 + motion 12.x
- **next-themes** (light/dark toggle)
- **Auth.js v5** (credentials, JWT)
- **Wildberries API** (Content, Prices, Statistics, Analytics, Tariffs)

## Синхронизация с Wildberries

### Три кнопки

| Кнопка | Endpoint | Что делает | Время |
|--------|----------|------------|-------|
| Синхронизировать с WB | `POST /api/wb-sync` | Полная синхронизация всех данных | ~2 мин |
| Скидка WB | `POST /api/wb-sync-spp` | Только актуальная СПП | ~45 сек |
| Загрузить ИУ | `POST /api/wb-commission-iu` | Excel с индивидуальными комиссиями | мгновенно |

### API WB — используемые endpoint'ы

| API | Endpoint | Данные |
|-----|----------|--------|
| Content | `POST /content/v2/get/cards/list` | Карточки, фото, видео, штрихкоды, габариты |
| Prices | `GET /api/v2/list/goods/filter` | Цены, скидки продавца, скидка клуба |
| Tariffs | `GET /api/v1/tariffs/commission` | Комиссии FBW (`paidStorageKgvp`) и FBS (`kgvpSupplier`) |
| Statistics | `GET /api/v1/supplier/stocks` | Остатки по складам |
| Statistics | `GET /api/v1/supplier/sales` | СПП из продаж (fallback) |
| Analytics | `POST /api/v2/nm-report/downloads` | Процент выкупа (CSV в ZIP) |
| Публичный | `GET card.wb.ru/cards/v4/detail` | Цена покупателя для расчёта СПП |
| Calendar | `GET dp-calendar-api.wildberries.ru/api/v1/calendar/promotions` | Список акций WB (Phase 7) |
| Calendar | `GET /api/v1/calendar/promotions/details` | Детали акций — описание, преимущества |
| Calendar | `GET /api/v1/calendar/promotions/nomenclatures` | nmId в regular-акциях (auto через Excel) |

### Скидка WB (СПП) — как работает

WB не даёт СПП через seller API. Решение:

1. **Основной:** `curl` → `card.wb.ru/v4` → цена покупателя → `СПП = (1 - цена_покупателя / цена_продавца) × 100`
2. **Fallback:** Statistics Sales API → поле `spp` из последних продаж

**Важно:** Node.js `fetch()` блокируется WB по TLS fingerprint (403). Используем `execSync('curl ...')`. Батчи по 20 артикулов, пауза 3 сек.

## Деплой

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

`deploy.sh` выполняет: git pull → npm ci → prisma migrate deploy → next build → systemctl restart

## Env переменные

```
DATABASE_URL=postgresql://zoiten:***@localhost:5432/zoiten_erp
AUTH_SECRET=<openssl rand -hex 32>
AUTH_URL=https://zoiten.pro
CRON_SECRET=<openssl rand -hex 32>
UPLOAD_DIR=/var/www/zoiten-uploads
WB_API_TOKEN=<токен из кабинета WB>
```
