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
- Realtime модалка пересчёта юнит-экономики — пользователь вводит **Цену продавца** (финальную), priceBeforeDiscount вычисляется из скидки продавца автоматически; изменение любых параметров мгновенно пересчитывает прибыль, ROI, re-продажи
- **13 редактируемых параметров в модалке** (Процент выкупа, WB Клуб, Кошелёк, Эквайринг, Комиссия, Тариф Джем, ДРР, Брак, Кредит, Общие расходы, Налог, Доставка, Закупка) + seller fields. Для каждого: инпут + **«↻ применить глобальные»** (локально подставляет значение без override и помечает флагом isReset — фактический сброс в БД при Сохранении)
- Две кнопки сохранения:
  - **«Сохранить как расчётную цену»** — создаёт/перезаписывает слот 1/2/3 (все параметры как per-slot override, включая sellerPrice/sellerDiscountPct/costPrice)
  - **«Сохранить»** — scope определяется типом строки, откуда вошли: Текущая/Regular/Auto → Product.XOverride (обновляет все non-calc строки товара); Расчётная → только этот CalculatedPrice.X. Disabled при изменении sellerPrice или sellerDiscountPct (они только в новый слот)
- Расчётные цены: до 3 слотов на карточку. **Изолированы** от Product.XOverride — fallback chain для calc-строк: `CalculatedPrice.X ?? globalValue (source/default)`, без product-уровня
- Удаление расчётных цен: чекбокс на каждой calc-строке + кнопка «Удалить выбранные (N)» в toolbar таблицы (`deleteCalculatedPrices` server action)
- Логика цен унифицирована: **Цена продавца** (финальная) + **Скидка продавца %** + **Цена для установки** (вычисляемая) для всех типов строк (Текущая / Regular / Auto / Расчётная); planPrice из WB API интерпретируется как финальная цена, planDiscount — как скидка продавца (fallback на текущую с карточки)
- Fallback chain для non-calc: **Брак** Product.override → Category.default → AppSetting.wbDefectRatePct → 2% hardcoded; **ДРР** Product.override → Subcategory.default → 10% hardcoded. Для прочих: `Product.XOverride → card.X / rates.wbX → default`
- Подсвечена акцентным цветом ключевая колонка **«Цена с WB кошельком, руб.»** (primary-fon + рамки по бокам + полужирный)
- **Фильтры** (single-choice dropdown, компактные): Бренд / Категория / Подкатегория + Товар (весь/с остатком) + Карточки (все/с остатком) + Акции (с/без) + Расчётные цены (с/без); состояние в URL
- **Вид** — кнопка настройки видимости 26 data-колонок (checkbox-список, persist в `UserPreference`, primary-подсветка + счётчик скрытых)
- **Sticky шапка**: GlobalRatesBar, фильтры, кнопки синхронизации и заголовок таблицы остаются на месте при скролле (flex-col h-full + overflow-auto внутри контейнера таблицы)
- **Редактируемое название акции**: `WbPromotion.displayName` — override поверх `name` (WB API sync не перезаписывает), инлайн-редактирование в ячейке «Статус цены» (карандаш → Enter/Esc), изменение глобально для всех строк этой акции
- **Точность Скидки WB**: хранится как `Float` до 0.1% (раньше `Int` — `Math.round` терял до 0.5% при каждой синхронизации)
- Тултип акции показывает сроки (жирным primary-цветом «с DD.MM.YYYY по DD.MM.YYYY»), описание и преимущества
- Клик по sticky-колонкам не открывает модалку; Артикул копирует nmId в буфер по клику (toast). Hover-подсветка только на data-колонках.
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

### Служба поддержки (milestone v1.1)
Единая лента работы с обращениями покупателей WB — отзывы, вопросы, возвраты, чаты, мессенджеры. Замена перехода в кабинет WB.

- **Лента `/support`**: FEEDBACK / QUESTION / RETURN / CHAT / MESSENGER тикеты в одном потоке, фильтры (канал, статус, товар, менеджер, период, unanswered), пагинация 20, sidebar-бейдж «количество новых»
- **Диалог `/support/[ticketId]`**: 3-колоночный layout — покупатель/товар слева, хронология сообщений центр, управление (статус / назначение / метаданные) справа
- **Отзывы + Вопросы** (Phase 8): cron 15 мин, reply через WB Feedbacks API (bit 5 scope), авто-повышение NEW → ANSWERED при ответе в кабинете WB
- **Возвраты `/support/returns`** (Phase 9): таблица заявок (9 колонок — Товар, Покупатель, Причина, Фото брака, Дата, Решение, Кто принял, Пересмотрено), **кнопки «Одобрить / Отклонить / Пересмотреть»** в диалоге канала RETURN, state machine `PENDING → APPROVED | REJECTED`, REJECTED → APPROVED через `reconsidered=true`. ⚠ **Требует отдельный токен `WB_RETURNS_TOKEN`** (bit 11 scope «Возвраты покупателей»), Basic tier лимит 1 req/hour → cron 65 мин
- **Чат + Автоответы** (Phase 10): cron 5 мин через `WB_CHAT_TOKEN` (bit 9 scope «Чат с покупателями»). `ChatReplyPanel` — multipart upload (JPEG/PNG/PDF, ≤5MB/файл, ≤30MB total). Страница `/support/auto-reply` — настройки локального cron-автоответа (Moscow TZ + workDays + workdayStart/End + dedup 24h), вне рабочих часов покупатель получает autoreply с `{имя_покупателя}` / `{название_товара}`, помечен 🤖 бейджем. WB sync autoreply НЕ существует — фича локальная
- **Шаблоны + Обжалование** (Phase 11): `/support/templates` CRUD + Export/Import JSON (вместо WB sync, т.к. WB отключил templates API 2025-11). `TemplatePickerModal` в ReplyPanel — поиск + группировка по nmId + substitution переменных. **Обжалование отзывов** — hybrid manual (WB отключил appeals API 2025-12): создаёт `AppealRecord` + открывает seller.wildberries.ru в новой вкладке + manual toggle статуса (PENDING/APPROVED/REJECTED), индикаторы в ленте и диалоге
- **Профиль покупателя + Мессенджеры** (Phase 12): `/support/customers/[id]` — карточка (имя/телефон/заметка) + агрегаты по каналам + AVG rating для FEEDBACK + хронология всех тикетов. **Hybrid linking** (WB не даёт `wbUserId`): CHAT — auto-create Customer через namespace `chat:<chatID>`, остальные каналы — manual через `LinkCustomerButton`. **Merge дубликатов** через AlertDialog. `/support/new` — ручное создание MESSENGER тикета (Telegram/WhatsApp/OTHER)
- **Статистика** (Phase 13): `/support/stats` — вкладки «По товарам» и «По менеджерам», PeriodFilter (7д/30д/квартал_календарный/custom, Moscow TZ), без графиков — таблицы + summary cards. ProductStatsTab (отзывы, рейтинг, % ответов, возвраты по статусам, топ причин REJECT, вопросы, avg response), ManagerStatsTab (обработано, каналы, approval %, avg response, **Live badge** для текущего месяца, **AutoRepliesSummary** глобально). Cron 03:00 МСК upsert `ManagerSupportStats` (unique `userId,period` где period = начало месяца)

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

### Три кнопки (товары/цены)

| Кнопка | Endpoint | Что делает | Время |
|--------|----------|------------|-------|
| Синхронизировать с WB | `POST /api/wb-sync` | Полная синхронизация всех данных | ~2 мин |
| Скидка WB | `POST /api/wb-sync-spp` | Только актуальная СПП | ~45 сек |
| Загрузить ИУ | `POST /api/wb-commission-iu` | Excel с индивидуальными комиссиями | мгновенно |

### Службa поддержки — systemd timers (milestone v1.1)

| Timer | Interval | Endpoint | Что делает |
|-------|----------|----------|-----------|
| `zoiten-chat-sync.timer` | 5 мин | `/api/cron/support-sync-chat` | syncChats + runAutoReplies |
| `zoiten-support-sync.timer` | 15 мин | `/api/cron/support-sync-reviews` | syncSupport (Feedbacks + Questions) |
| `zoiten-returns-sync.timer` | **65 мин** (отключён — нет токена) | `/api/cron/support-sync-returns` | syncReturns (WB Basic tier 1/hour limit) |
| `zoiten-stats-refresh.timer` | daily 03:00 МСК | `/api/cron/support-stats-refresh` | upsert ManagerSupportStats за текущий месяц |

### Архитектура трёх WB-токенов

WB API не имеет единого scope — для каждой секции отдельный токен:

| ENV | Scope | Назначение |
|-----|-------|-----------|
| `WB_API_TOKEN` | Контент + Аналитика + Цены + Отзывы (bit 5) + Статистика + Тарифы + Продвижение | Товары, карточки, цены, отзывы, вопросы |
| `WB_CHAT_TOKEN` | **bit 9** «Чат с покупателями» | Buyer Chat API (listChats, events, sendMessage multipart, download) |
| `WB_RETURNS_TOKEN` | **bit 11** «Возвраты покупателей» (отдельный scope — не «Общение с покупателями»!) | Returns API (listReturns, approve/reject/reconsider) |

Helper-функции в `lib/wb-support-api.ts`: `getToken()` / `getChatToken()` / `getReturnsToken()` + параметризованный `callApi(baseUrl, token, path, init)` с 429 retry (cap 60s чтобы не висеть на WB 1366s hint).

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

1. **Основной:** `curl` → `card.wb.ru/v4` → цена покупателя → `СПП = (1 - цена_покупателя / цена_продавца) × 100`, округление до 0.1%
2. **Fallback:** Statistics Sales API → поле `spp` из последних продаж

**Важно:** Node.js `fetch()` блокируется WB по TLS fingerprint (403). Используем `execSync('curl ...')`. Батчи по 20 артикулов, пауза 3 сек. `WbCard.discountWb` хранится как `Float` с точностью до 0.1% (`Math.round(x × 1000) / 10`), чтобы не терять до 0.5% в расчётах юнит-экономики.

## Деплой

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

`deploy.sh` выполняет: git pull → npm ci → prisma migrate deploy → next build → **копирование `.next/static` и `public` в `.next/standalone/`** → systemctl restart.

### ⚠ Критично: standalone output требует копирования

`next.config.ts` использует `output: "standalone"`. Next build **не копирует автоматически**:
1. `.next/static/` → chunks, CSS, webpack runtime
2. `public/` → favicons, логотипы, прочие static assets

Без этих шагов сайт выдаёт:
- `404` на все chunks → `ChunkLoadError` → «Application error: a client-side exception»
- `500` на `/_next/image` → фотографии товаров не отображаются
- CSS не загружается → «вся красота пропала»

**Поэтому:**
- ❌ Никогда `ssh root@... "cd /opt/zoiten-pro && git pull && npm run build && systemctl restart"` — сломает прод
- ✅ Всегда `bash deploy.sh` — есть sanity check (`ls chunks | wc -l`), который выдаст `exit 1` если chunks не скопированы

### Восстановление после сломанного shortcut deploy

```bash
ssh root@85.198.97.89 'cd /opt/zoiten-pro && \
  rm -rf .next/standalone/.next/static && \
  cp -r .next/static .next/standalone/.next/static && \
  cp -r public .next/standalone/public; \
  systemctl restart zoiten-erp.service'
```

Пользователю после fix — **Ctrl+Shift+R** (hard reload), чтобы сбросить кешированный HTML со старыми chunk hashes.

### ChunkLoadError для старых вкладок

Даже при корректном deploy старые вкладки пользователя ломаются после rebuild (chunk hashes меняются). В проекте есть `app/global-error.tsx`, который ловит `ChunkLoadError` и делает автоматический `window.location.reload()` — но только если webpack runtime успел подгрузиться.

### Фото и картинки — используй `<img>`, не `next/image`

nginx обслуживает `/uploads/*` напрямую через alias на `/var/www/zoiten-uploads` (минуя Next.js middleware). Next.js `<Image>` делает internal fetch к `/_next/image?url=/uploads/...`, и middleware редиректит этот запрос на `/login` → optimizer получает null → 500. Поэтому во всех таблицах (`PriceCalculatorTable`, `StockProductTable`, `StockWbTable`, `WbCardsTable`) используется плоский `<img>` с `eslint-disable @next/next/no-img-element`.

## Env переменные

```
DATABASE_URL=postgresql://zoiten:***@localhost:5432/zoiten_erp
AUTH_SECRET=<openssl rand -hex 32>
AUTH_URL=https://zoiten.pro
CRON_SECRET=<openssl rand -hex 32>
UPLOAD_DIR=/var/www/zoiten-uploads
WB_API_TOKEN=<токен — Контент/Цены/Отзывы/Статистика/Тарифы/Аналитика/Продвижение>
WB_CHAT_TOKEN=<токен — scope bit 9 «Чат с покупателями»>
WB_RETURNS_TOKEN=<токен — scope bit 11 «Возвраты покупателей», ОТДЕЛЬНЫЙ от чата>
```
