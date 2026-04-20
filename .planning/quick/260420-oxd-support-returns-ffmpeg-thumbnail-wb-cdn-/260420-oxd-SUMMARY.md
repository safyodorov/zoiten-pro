---
phase: quick-260420-oxd
plan: 01
subsystem: support/returns
tags: [thumbnail, ffmpeg, sharp, wb-cdn, performance, support-returns]
requires: []
provides:
  - SupportMedia.thumbnailPath (Prisma)
  - generateImageThumbnail, generateVideoThumbnail (lib/support-media)
  - toWbCdnThumb (lib/wb-cdn)
  - POST /api/support-media-backfill-thumbs
affects:
  - /support/returns (MediaGallery, ReturnsTable)
  - lib/support-sync.ts (syncSupport, syncReturns, syncChats)
tech-stack:
  added:
    - sharp@^0.34.5 (prebuilt binary, ESM-совместимый)
    - ffmpeg через child_process.spawn (требует apt install -y ffmpeg на VPS)
  patterns:
    - non-fatal thumbnail generation (try/catch → thumbError, sync не падает)
    - idempotent backfill endpoint (WHERE thumbnailPath IS NULL)
    - WB CDN size swap через regex (/images/big|cNxN/ → /images/tm/)
key-files:
  created:
    - prisma/migrations/20260420_support_media_thumbnail/migration.sql
    - lib/wb-cdn.ts
    - tests/wb-cdn.test.ts
    - app/api/support-media-backfill-thumbs/route.ts
    - .planning/quick/260420-oxd-.../260420-oxd-DEPLOY.md
  modified:
    - prisma/schema.prisma (+thumbnailPath)
    - package.json, package-lock.json (+sharp)
    - lib/support-media.ts (+helpers, mediaType, thumbnailPath)
    - lib/support-sync.ts (mediaType в 3 sync-функциях, chat inline thumbnail)
    - components/support/MediaGallery.tsx (VIDEO → <img>, width/height/decoding)
    - components/support/ReturnsTable.tsx (toWbCdnThumb, mediaThumbSrc)
decisions:
  - Thumbnail генерация non-fatal — на Windows dev без ffmpeg downloadMedia
    не падает, thumbError пишется в console.warn (не в sync errors[])
  - ffmpeg через spawn, не ffmpeg-static npm (экономия ~80 МБ в node_modules)
  - sharp через прямой impoprt, prebuilt binary для linux-x64 автоматически
  - Backfill отдельным POST endpoint (не cron) — одноразовая миграция данных
  - CHAT attachments: inline generateImageThumbnail после fs.writeFile
    (не через downloadMediaBatch, т.к. chat использует свой download path)
metrics:
  completed: 2026-04-20
  duration: 12min
  tasks: 4
---

# Quick Task 260420-oxd: ffmpeg thumbnail + WB CDN tm/ + width/height — Summary

Оптимизация превью медиа на `/support/returns`: VIDEO превью теперь
`<img src={thumbnailSrc}>` (из ffmpeg 96×96 .thumb.jpg ~5 КБ) вместо полноразмерного
`<video>` тега с декодированием MP4 10-50 МБ ради превью 40×40; фото товаров
грузятся с WB CDN формата `tm/1.webp` (~15 КБ) вместо `big/1.webp` (~200 КБ);
IMAGE превью получили `.thumb.webp` 96×96 (sharp, quality 75) вместо оригинала
2-5 МБ; все `<img>` на странице получили `width/height/decoding="async"` для
устранения layout shift и декодирования вне main thread.

## Что сделано

### Task 1 — Prisma миграция + sharp + WB CDN helper (commit 665bad7)

- Добавлено поле `SupportMedia.thumbnailPath String?` в `prisma/schema.prisma`
- Создана миграция `20260420_support_media_thumbnail/migration.sql`
  (`ALTER TABLE "SupportMedia" ADD COLUMN "thumbnailPath" TEXT`) — применится
  на VPS через `deploy.sh → prisma migrate deploy`
- `sharp@^0.34.5` добавлен в dependencies (`npm install sharp`)
  + `package-lock.json` обновлён (559 транзитивных пакетов)
- `lib/wb-cdn.ts`: `toWbCdnThumb(url)` — regex замена `/images/big|cNxN/ → /images/tm/`
  - Идемпотентно для `tm/` URL
  - `null | undefined | ""` → `null`
  - Не-WB URL возвращаются без изменений
- `tests/wb-cdn.test.ts`: 5 GREEN кейсов (big, cNxN, idempotent tm, null, не-WB)

### Task 2 — ffmpeg/sharp generation + sync integration (commit d14dd98)

- `lib/support-media.ts`:
  - `generateImageThumbnail(source)`: sharp → 96×96 webp quality 75
  - `generateVideoThumbnail(source)`: ffmpeg spawn, `-ss 00:00:01 -vframes 1
    -vf scale=96:96:force_original_aspect_ratio=increase,crop=96:96 -q:v 5`
  - `DownloadItem` получил поле `mediaType: "IMAGE"|"VIDEO"|"DOCUMENT"`
  - `DownloadResult` получил `thumbnailPath`, `thumbError` (non-fatal)
  - `downloadMedia` после `writeFile` вызывает helper по mediaType
    в try/catch — ошибка thumbnail не ломает основной поток
- `lib/support-sync.ts`:
  - Все 3 sync-функции (`syncSupport`, `syncReturns`, `syncChats`) проброс
    `mediaType` в `mediaToDownload.push(...)` / `mediaQueue.push(...)`
  - `updateMany` пишет `thumbnailPath` в БД
  - `r.thumbError` идёт в `console.warn` (не в `result.errors[]`)
  - `PendingChatDownload` расширен полем `mediaType`; для IMAGE вызывается
    inline `generateImageThumbnail` после `fs.writeFile` (CHAT attachments
    используют отдельный download path через `downloadChatAttachment`)

### Task 3 — UI: MediaGallery + ReturnsTable (commit 3f6c704)

- `components/support/MediaGallery.tsx`:
  - `MediaGalleryItem` расширен полем `thumbnailSrc?: string | null`
    (обратная совместимость — optional)
  - **VIDEO больше не рендерит `<video>`** — рендерит `<img src={thumbnailSrc}>`
    + Play иконка поверх; если `thumbnailSrc=null` — серый прямоугольник `bg-muted`
  - IMAGE использует `thumbnailSrc ?? src` (приоритет thumbnail)
  - Все `<img>` получили `width={96} height={96} decoding="async" loading="lazy"`
- `components/support/ReturnsTable.tsx`:
  - Импорт `toWbCdnThumb`
  - Товарное `<img>`: `src={toWbCdnThumb(card.photoUrl) ?? card.photoUrl}`,
    `width=36 height=48 decoding="async"` (intrinsic 3:4 совпадает с `h-12 w-9`)
  - Новый helper `mediaThumbSrc(m)`:
    - `thumbnailPath` → `/uploads/...` через `.replace("/var/www/zoiten-uploads", "/uploads")`
    - fallback на `localPath` для IMAGE (backfill deferred)
    - `null` для VIDEO (без thumbnail → серая заглушка в MediaGallery)
  - `MediaGallery` теперь получает `thumbnailSrc: mediaThumbSrc(m)` в props

### Task 4 — Backfill endpoint + DEPLOY (commit eceae9e)

- `app/api/support-media-backfill-thumbs/route.ts`:
  - POST handler, защищён `requireSuperadmin()`
  - Батчит Prisma findMany по 50 (чтобы не держать тысячи rows в памяти)
  - Фильтр `WHERE thumbnailPath IS NULL AND localPath IS NOT NULL`
  - Для каждой записи: `fs.access` → generate helper по type → update DB
  - DOCUMENT пропускается (нет превью)
  - Ошибки non-fatal, копятся в `errors[]`
  - Идемпотентен — повторный запуск пропустит уже обработанные
  - Возвращает JSON `{ processed, generated, skipped, errors }`
- `.planning/quick/.../260420-oxd-DEPLOY.md`: пошаговая инструкция
  (apt install ffmpeg → deploy.sh → curl backfill → smoke tests, rollback)

## Почему именно такие решения

- **ffmpeg через spawn, не ffmpeg-static**: ffmpeg-static npm пакет весит ~80 МБ
  и раздувает node_modules + build artifact. На VPS ffmpeg ставится одной командой
  `apt install -y ffmpeg`. На Windows dev без ffmpeg — `proc.on('error')` ловит
  ENOENT, thumbError записывается, sync продолжается.
- **sharp через npm**: единственный sane способ обработки изображений в Node.js.
  Prebuilt binary для linux-x64 подтянется автоматически при `npm ci` на VPS.
- **Backfill endpoint, не cron**: одноразовая миграция данных — запустить после
  деплоя, посмотреть результат, забыть. Идемпотентность через `WHERE
  thumbnailPath IS NULL` — можно перезапускать при таймаутах.
- **CHAT inline thumbnail**: `downloadChatAttachment` возвращает buffer
  (не использует `downloadMediaBatch`) — проще вызвать `generateImageThumbnail`
  прямо после `fs.writeFile`, чем рефакторить chat download pipeline под общий
  `downloadMediaBatch`.

## Deviations from Plan

None — плана выполнен как написан. Единственные отклонения — незначительные:

- ESLint не запущен в верификации: `npm run lint` в worktree требует
  интерактивного setup (`next lint` deprecated + multiple lockfiles detected).
  В проекте нет `.eslintrc` / `eslint.config.*`. TypeScript check (`tsc
  --noEmit`) и production build (`next build`) успешно пройдены — они
  покрывают типы и статический анализ, необходимый для безопасного merge.

## Коммиты

| # | Hash | Task | Message |
|---|------|------|---------|
| 1 | 665bad7 | T1 | feat(support): добавить SupportMedia.thumbnailPath + sharp + WB CDN helper |
| 2 | d14dd98 | T2 | feat(support): ffmpeg/sharp thumbnail generation в downloadMedia + sync |
| 3 | 3f6c704 | T3 | feat(support): превью VIDEO как <img>, WB tm/, width/height/decoding на /support/returns |
| 4 | eceae9e | T4 | feat(support): backfill endpoint для thumbnail existing media + DEPLOY инструкция |

## Verification

- `npx prisma validate` — schema valid
- `npm run test -- tests/wb-cdn.test.ts` — 5 passed (toWbCdnThumb)
- `npx prisma generate` — client с `thumbnailPath` сгенерирован
- `npx tsc --noEmit` — 0 ошибок (после Task 2, Task 3, Task 4)
- `npm run build` — production build успешно, route
  `/api/support-media-backfill-thumbs` зарегистрирован

## Что осталось (post-deploy)

После merge на main (человек делает):

1. На VPS: `apt install -y ffmpeg` (одноразово)
2. `ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"`
3. `curl -X POST -H "Cookie: next-auth.session-token=..." https://zoiten.pro/api/support-media-backfill-thumbs`
4. Smoke tests на `/support/returns`:
   - В Network: все товарные фотки с `tm/`, не `big/`
   - В DOM: `document.querySelectorAll('td video').length === 0`
   - Превью VIDEO — `.thumb.jpg`, превью IMAGE — `.thumb.webp`

Все шаги задокументированы в `260420-oxd-DEPLOY.md`.

## Self-Check: PASSED

Проверены все объявленные артефакты:

- prisma/migrations/20260420_support_media_thumbnail/migration.sql — FOUND
- lib/wb-cdn.ts — FOUND (exports toWbCdnThumb)
- lib/support-media.ts — FOUND (exports generateImageThumbnail, generateVideoThumbnail)
- components/support/MediaGallery.tsx — FOUND (thumbnailSrc + width/height/decoding)
- components/support/ReturnsTable.tsx — FOUND (toWbCdnThumb + mediaThumbSrc)
- app/api/support-media-backfill-thumbs/route.ts — FOUND (POST handler)
- .planning/quick/.../260420-oxd-DEPLOY.md — FOUND
- tests/wb-cdn.test.ts — FOUND (5 passed)

Commits 665bad7, d14dd98, 3f6c704, eceae9e — все присутствуют в git log.
