# Phase 21 — Deploy Notes

Этот файл описывает шаги деплоя Phase 21 (Credits) на VPS.

## Предусловия

- Все планы 21-01..21-08 выполнены локально и запушены в `main`.
- VPS: `root@85.198.97.89`, проект в `/opt/zoiten-pro/`.
- Неотслеживаемые файлы на локальной машине: папка `Кредиты/` и `Кредиты.xlsx` (НЕ в git).

---

## Шаг 1: Deploy приложения

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

`deploy.sh` выполняет:
1. `git pull origin main`
2. `npm ci --omit=dev`
3. `npx prisma migrate deploy` — применит миграцию `20260609_phase21_credits`:
   - `ALTER TYPE "ERP_SECTION" ADD VALUE 'CREDITS'`
   - Создаёт таблицы `Lender`, `Loan`, `LoanPayment`
4. `npm run build` (Next.js standalone build)
5. `systemctl restart zoiten-erp`

После рестарта сервис стартует с обновлённой схемой. До seed раздел `/credits` открывается (миграция применена), но список пустой.

**Важно про RBAC:** До `prisma migrate deploy` middleware/Edge runtime не знает о `ERP_SECTION.CREDITS` → `requireSection("CREDITS")` отдаёт 403. После применения миграции всё работает корректно.

---

## Шаг 2: Установка poppler-utils на VPS

seed-credits.ts парсит JetLend PDF через `pdftotext -layout` (бинарник из пакета `poppler-utils`).

```bash
ssh root@85.198.97.89 "apt-get install -y poppler-utils && pdftotext -v"
```

Ожидаемый вывод: `pdftotext version X.XX`. Если уже установлен — `apt-get` завершится без изменений.

---

## Шаг 3: Доставка untracked-файлов на VPS

Папка `Кредиты/` (11 JetLend PDF + 2 Сбербанк XLSX) и `Кредиты.xlsx` не находятся в git.
`git pull` их НЕ доставит — нужно `scp`.

**Вариант B (запуск seed на VPS — рекомендуется, файлы и pdftotext оба на VPS):**

```bash
# Копируем папку с графиками платежей
scp -r "C:/Users/User/zoiten-pro/Кредиты" root@85.198.97.89:/opt/zoiten-pro/

# Копируем сводный файл с метаданными и контрольными суммами
scp "C:/Users/User/zoiten-pro/Кредиты.xlsx" root@85.198.97.89:/opt/zoiten-pro/
```

Проверка на VPS:
```bash
ssh root@85.198.97.89 "ls /opt/zoiten-pro/Кредиты/ | head -20"
ssh root@85.198.97.89 "ls /opt/zoiten-pro/Кредиты.xlsx"
```

---

## Шаг 4: Запуск одноразового seed

**ВАЖНО:** seed НЕ является частью `deploy.sh`. Запускается вручную один раз после миграции и доставки файлов.

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && npx tsx scripts/seed-credits.ts 2>&1"
```

**Что делает seed:**
1. Проверяет наличие `pdftotext`, папки `Кредиты/` и `Кредиты.xlsx`.
2. Upsert кредиторов: Сбербанк, JetLend.
3. Парсит 11 JetLend PDF через `pdftotext -layout`.
4. Парсит 2 Сбербанк XLSX (только хвост с 08.06.2026).
5. Читает `Кредиты.xlsx` Лист2: метаданные кредитов + история Сбербанка + JetLend без PDF.
6. Создаёт 23 кредита (`Loan`) + все строки графиков (`LoanPayment`).
7. Выводит **сверку** per-кредит (Σtело vs amount) и per-org/Итого vs Лист2.

**Контрольные суммы для сверки (из Лист2, период апрель 2024 – декабрь 2026):**

| Орг | Σ Основной долг | Σ Проценты |
|-----|----------------|------------|
| Зойтен | 74 280 379,24 ₽ | 18 596 079,98 ₽ |
| Дрим Лайн | 56 261 014,34 ₽ | 11 337 869,94 ₽ |
| Пеликан | 10 783 800,00 ₽ | 264 325,34 ₽ |
| Сикрет Вэй | 7 193 280,00 ₽ | 435 156,51 ₽ |
| **ИТОГО** | **148 518 473,58 ₽** | **30 633 431,77 ₽** |

Допуск: ≤ 100 ₽ per-org, ≤ 200 ₽ для Итого.

**Идемпотентность:** seed удаляет все существующие `Loan` записи (cascade `LoanPayment`) перед созданием. Безопасно запускать повторно.

---

## Шаг 5: Smoke-проверка

Открыть в браузере:
- `https://zoiten.pro/credits` — список кредитов (Сбербанк + JetLend)
- `https://zoiten.pro/credits/schedule` — сводный горизонтальный график

---

## Замечание по RBAC (logout/login)

После выдачи прав на раздел CREDITS через `/admin/users` пользователю необходим **logout/login** — JWT не самообновляется (см. memory feedback_zoiten_rbac_jwt_refresh).

---

## Справочная информация

- Seed-скрипт: `scripts/seed-credits.ts`
- Зависит от: `xlsx` (уже в package.json), `@prisma/client`, `pdftotext` (системный бинарник)
- Источники строк (U-01): детальные файлы в `Кредиты/` (JetLend PDF + Сбербанк XLSX)
- Метаданные и сверка: `Кредиты.xlsx` Лист2
- Подробная структура источников: `.planning/phases/21-credits/21-04-SEED-NOTES.md`
