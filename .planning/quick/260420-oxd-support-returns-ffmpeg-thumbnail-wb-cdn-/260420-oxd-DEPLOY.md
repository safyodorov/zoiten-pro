# Деплой Quick Task 260420-oxd

Цель: применить thumbnail генерацию (ffmpeg для VIDEO, sharp для IMAGE),
WB CDN `tm/`, `width/height/decoding="async"` на `/support/returns`
и запустить backfill существующих медиа.

## Порядок действий

### 1. Установить ffmpeg на VPS (ОДНОРАЗОВО)

```bash
ssh root@85.198.97.89 "apt update && apt install -y ffmpeg"
ssh root@85.198.97.89 "ffmpeg -version"
```

Должна вывестись версия (5.x или 6.x на Debian 12). Если версии нет — deploy
не выполнять, thumbnail VIDEO не будет генерироваться.

### 2. Деплой ERP (стандартный)

```bash
ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
```

`deploy.sh` выполнит:

- `git pull` — подтянет новые коммиты (665bad7, d14dd98, 3f6c704 + финальный metadata)
- `npm ci` — установит `sharp@^0.34` (prebuilt binary для linux-x64)
- `npx prisma migrate deploy` — применит миграцию `20260420_support_media_thumbnail`
  (добавит колонку `"SupportMedia"."thumbnailPath" TEXT`)
- `npm run build` — production build
- `systemctl restart zoiten-erp`

Проверить что миграция применилась:

```bash
ssh root@85.198.97.89 'psql -U zoiten -d zoiten_erp -c "\d \"SupportMedia\""' | grep thumbnail
# ожидаем: thumbnailPath | text |
```

### 3. Запустить backfill существующих медиа

После успешного деплоя:

```bash
# Получить session cookie из браузера:
# 1) Открыть https://zoiten.pro/support/returns (должен быть залогинен суперадмин)
# 2) DevTools → Application → Cookies → скопировать next-auth.session-token

COOKIE="next-auth.session-token=...."

curl -X POST \
  -H "Cookie: $COOKIE" \
  https://zoiten.pro/api/support-media-backfill-thumbs
```

Ожидаемый ответ (может занять 5-30 минут в зависимости от кол-ва медиа):

```json
{"processed":1234,"generated":1200,"skipped":30,"errors":["..."]}
```

Если endpoint упадёт по таймауту (nginx `proxy_read_timeout 600s` обычно
достаточно) — запустить повторно, он идемпотентен: фильтр
`WHERE thumbnailPath IS NULL` пропускает уже обработанные.

### 4. Smoke тесты на проде

Открыть https://zoiten.pro/support/returns в Chrome:

1. **Network tab** → reload:
   - Фото товаров (колонка «Товар») должны грузиться с `/images/tm/` в URL,
     НЕ `/images/big/` или `/images/c246x328/`.
   - Размер каждой товарной фотки ~10-20 КБ.
   - Превью VIDEO (колонка «Фото брака») грузится как `.thumb.jpg` ~5 КБ,
     не оригинал MP4.
   - Превью IMAGE грузится как `.thumb.webp` ~3-10 КБ, не оригинал.

2. **Elements / Console:**

   ```js
   document.querySelectorAll('td video').length
   // ожидаем: 0
   ```

   В DOM нет `<video>` тегов внутри ячеек таблицы (только `<img>`).

3. **Лагов нет** — прокрутка плавная на 100+ заявках (subjective smoke).

## Rollback (если что-то пошло не так)

Миграция additive (добавление nullable колонки) — откат не требуется.
Если UI показывает битые превью — backfill не запускать, UI fallback
использует оригиналы для IMAGE и серую заглушку для VIDEO.
