---
phase: quick-260420-oxd
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - package.json
  - prisma/schema.prisma
  - prisma/migrations/20260420_support_media_thumbnail/migration.sql
  - lib/support-media.ts
  - lib/wb-cdn.ts
  - components/support/MediaGallery.tsx
  - components/support/ReturnsTable.tsx
  - app/api/support-media-backfill-thumbs/route.ts
autonomous: true
requirements:
  - QT-260420-OXD-01  # ffmpeg thumbnail для VIDEO при sync + рендер в MediaGallery
  - QT-260420-OXD-02  # WB CDN tm/1.webp вместо big/ для фото товара в ReturnsTable
  - QT-260420-OXD-03  # sharp thumbnail для IMAGE при downloadMedia
  - QT-260420-OXD-04  # width/height/decoding="async" на <img>
  - QT-260420-OXD-05  # admin backfill endpoint для существующих медиа

must_haves:
  truths:
    - "Превью VIDEO в /support/returns рендерится как <img> (не <video>) — мгновенный первый paint"
    - "Превью IMAGE в /support/returns использует отдельный thumbnail ~96px (не полное фото 2-5 МБ)"
    - "Фото товара в колонке «Товар» загружается с WB CDN формата tm/1.webp (10-20 КБ вместо 100-300 КБ big/)"
    - "Все <img> на странице имеют width/height/decoding=async — нет layout shift, декодирование не блокирует main thread"
    - "Суперадмин может вручную запустить backfill thumbnail для уже скачанных медиа без ре-синка"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "SupportMedia.thumbnailPath String?"
      contains: "thumbnailPath"
    - path: "prisma/migrations/20260420_support_media_thumbnail/migration.sql"
      provides: "ALTER TABLE \"SupportMedia\" ADD COLUMN \"thumbnailPath\""
      contains: "thumbnailPath"
    - path: "lib/support-media.ts"
      provides: "downloadMedia возвращает thumbnailPath; generateImageThumbnail, generateVideoThumbnail helpers"
      exports: ["downloadMedia", "downloadMediaBatch", "generateImageThumbnail", "generateVideoThumbnail"]
    - path: "lib/wb-cdn.ts"
      provides: "toWbCdnThumb(url) — заменяет big/1.webp → tm/1.webp"
      exports: ["toWbCdnThumb"]
    - path: "components/support/MediaGallery.tsx"
      provides: "VIDEO рендерит <img src={thumbnailPath}> + Play; IMAGE рендерит <img src={thumbnailPath ?? src}>; width/height/decoding=async"
    - path: "components/support/ReturnsTable.tsx"
      provides: "Товарное <img> использует toWbCdnThumb(card.photoUrl) + width=36 height=48 decoding=async"
    - path: "app/api/support-media-backfill-thumbs/route.ts"
      provides: "POST endpoint, requireSuperadmin, batch-генерация thumbnails для media где thumbnailPath=null"
      exports: ["POST"]
  key_links:
    - from: "lib/support-media.ts downloadMedia"
      to: "generateImageThumbnail/generateVideoThumbnail"
      via: "after writeFile — генерация .thumb.webp в той же папке"
      pattern: "thumbnailPath.*\\.thumb\\.webp"
    - from: "lib/support-sync.ts syncReturns/syncSupport/syncChats"
      to: "SupportMedia.thumbnailPath"
      via: "updateMany после downloadMediaBatch пишет thumbnailPath"
      pattern: "thumbnailPath:\\s*r\\.thumbnailPath"
    - from: "components/support/MediaGallery.tsx"
      to: "SupportMedia.thumbnailPath"
      via: "props item.thumbnailSrc — рендерится в <img src={thumbnailSrc}>"
      pattern: "thumbnailSrc"
    - from: "components/support/ReturnsTable.tsx mediaSrc → MediaGallery props"
      to: "SupportMedia.thumbnailPath"
      via: "mapping m.thumbnailPath → /uploads/... + fallback на localPath/wbUrl"
      pattern: "thumbnailPath.*replace"
    - from: "app/api/support-media-backfill-thumbs/route.ts"
      to: "generateImageThumbnail/generateVideoThumbnail"
      via: "Читает media WHERE thumbnailPath IS NULL, применяет helpers, update thumbnailPath"
      pattern: "findMany.*thumbnailPath.*null"
---

<objective>
Оптимизация превью медиа на `/support/returns`:
пользователь жалуется на тормозящую прокрутку и долгую загрузку страницы
заявок на возврат. Причины:
(1) в колонке «Фото брака» ренедерится полноразмерный `<video>` элемент
    для каждого VIDEO — браузер декодирует MP4 на 10-50 МБ ради превью 40×40;
(2) в колонке «Товар» используется `big/1.webp` с WB CDN (~100-300 КБ),
    хотя у WB есть формат `tm/1.webp` — то же изображение в 10-20 КБ;
(3) у существующих скачанных photo (IMAGE) нет миниатюр — грузится оригинал
    ~2-5 МБ из `/var/www/zoiten-uploads/`;
(4) у тэгов `<img>` нет `width/height/decoding="async"`, отсюда layout shift
    и блокировка main thread.

**Purpose:** Сократить размер превью в 50-100×, убрать layout shift,
восстановить плавность на странице с 100+ заявками на возврат.

**Output:**
- Prisma миграция `SupportMedia.thumbnailPath String?`
- ffmpeg-based генерация JPEG thumbnails для VIDEO при sync (96×96)
- sharp-based генерация WebP thumbnails для IMAGE при sync (96 wide)
- WB CDN helper `toWbCdnThumb()` для замены big/ → tm/
- Атрибуты width/height/decoding="async" на всех <img>
- Admin backfill endpoint `/api/support-media-backfill-thumbs` для существующих медиа
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@./CLAUDE.md
@.planning/STATE.md

<!-- Текущая реализация — сюда добавляется thumbnail генерация -->
@lib/support-media.ts
@lib/support-sync.ts
@components/support/MediaGallery.tsx
@components/support/ReturnsTable.tsx
@prisma/schema.prisma

<interfaces>
<!-- Ключевые типы существующего кода — executor должен использовать их -->

Из lib/support-media.ts (после изменений):
```typescript
export interface DownloadItem {
  wbUrl: string
  ticketId: string
  messageId: string
  mediaType: "IMAGE" | "VIDEO" | "DOCUMENT" // ← новое поле
}

export interface DownloadResult extends DownloadItem {
  localPath?: string
  thumbnailPath?: string     // ← новое поле
  sizeBytes?: number
  error?: string
  thumbError?: string         // ← non-fatal: если thumbnail не сгенерился
}

export async function downloadMedia(item: DownloadItem, attempt?: number): Promise<DownloadResult>
export async function downloadMediaBatch(items: DownloadItem[], concurrency?: number): Promise<DownloadResult[]>
export async function generateImageThumbnail(sourcePath: string): Promise<string>
export async function generateVideoThumbnail(sourcePath: string): Promise<string>
```

Из prisma/schema.prisma (после миграции):
```prisma
model SupportMedia {
  id            String         @id @default(cuid())
  messageId     String
  message       SupportMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
  type          MediaType
  wbUrl         String         @db.Text
  localPath     String?        @db.Text
  thumbnailPath String?        @db.Text   // ← новое
  sizeBytes     Int?
  createdAt     DateTime       @default(now())
  expiresAt     DateTime
  @@index([expiresAt])
}
```

Из components/support/MediaGallery.tsx (после изменений):
```typescript
export interface MediaGalleryItem {
  id: string
  src: string                    // полноразмерный для lightbox
  thumbnailSrc?: string | null   // ← новое — для <img> в списке
  type: "IMAGE" | "VIDEO" | "DOCUMENT"
  fileName?: string | null
}
```

Из lib/wb-cdn.ts (новый файл):
```typescript
// Заменяет /big/1.webp → /tm/1.webp в WB CDN URL.
// WB выдаёт несколько размеров: big (~100-300 КБ), c246x328, tm (~10-20 КБ).
// big/ и c246x328/ → tm/. Незнакомые URL возвращаются без изменений.
export function toWbCdnThumb(url: string | null | undefined): string | null
```

Из lib/rbac.ts (существующий):
```typescript
export async function requireSuperadmin(): Promise<void>
// throws Response с 401/403 если не суперадмин
```
</interfaces>

<context_notes>
**Почему ffmpeg через spawn, а не ffmpeg-static:**
- VPS Linux (85.198.97.89) — ffmpeg ставится одной командой `apt install ffmpeg`
- ffmpeg-static npm пакет весит ~80 МБ, раздувает node_modules и build artifact
- На Windows dev не блокируем — если ffmpeg нет, `generateVideoThumbnail` ловит ENOENT и возвращает `thumbError`, сам downloadMedia не падает. Prod гарантированно ставится systemd.
- На VPS перед деплоем: `apt install -y ffmpeg` (один раз, записать в DEPLOY.md отдельной задачей).

**Почему sharp через npm:**
- Sharp — нативный биндинг, единственный sane способ обрабатывать картинки в Node.js
- Установится через `npm install sharp@^0.34` (ESM-совместимый, Node 20+)
- На VPS: prebuilt binary для linux-x64 автоматически подтянется при `npm ci`
- На Windows dev: aналогично. Нет никаких дополнительных действий.

**Почему backfill отдельным endpoint'ом, а не cron'ом:**
- Одноразовая миграция данных — запустить после деплоя, закоммитить результат, забыть
- Endpoint `/api/support-media-backfill-thumbs` защищён `requireSuperadmin()`, триггерится вручную через curl
- Не требует UI: `curl -X POST -H "Cookie: next-auth.session-token=..." https://zoiten.pro/api/support-media-backfill-thumbs`
- Возвращает JSON `{processed, generated, errors[]}`

**Мэппинг путей для UI:**
- Server хранит `thumbnailPath` как абсолютный путь: `/var/www/zoiten-uploads/support/{ticket}/{msg}/file.thumb.webp`
- Клиент получает через тот же хелпер `mediaSrc()` в ReturnsTable (существующий паттерн):
  `thumbnailPath.replace("/var/www/zoiten-uploads", "/uploads")` → nginx serve
- На dev Windows UPLOAD_DIR=/tmp/zoiten-uploads, отдача через `/api/uploads/[...path]` route handler

**Размер thumbnail:**
- MediaGallery thumbClassName по умолчанию `w-20 h-20` (80 CSS px × 2 density = 160 px real)
- В ReturnsTable передаётся `w-10 h-10` (40 CSS px × 2 = 80 px)
- Генерируем 96×96 — покрывает оба сценария без апскейла + запас на retina

**Какие файлы НЕ трогаем:**
- `components/support/MediaLightbox.tsx` — lightbox всегда открывает оригинал (src), не thumbnail
- `lib/support-sync.ts` — достаточно что `downloadMediaBatch` теперь возвращает `thumbnailPath` в `DownloadResult`, существующие вызовы `updateMany` нужно расширить 1 полем
- `components/support/MediaGallery.tsx` пропсы расширяются опциональным полем — обратная совместимость сохраняется
</context_notes>
</context>

<tasks>

<task type="auto">
  <name>Задача 1: Миграция Prisma + установка зависимостей + WB CDN helper</name>
  <files>package.json, prisma/schema.prisma, prisma/migrations/20260420_support_media_thumbnail/migration.sql, lib/wb-cdn.ts, tests/wb-cdn.test.ts</files>
  <action>
    1. **Установить зависимости** (dev Windows):
       ```bash
       npm install sharp@^0.34.0
       ```
       ffmpeg — НЕ через npm. На VPS установить через apt: `apt install -y ffmpeg`
       (записать в .planning/quick/260420-oxd-.../260420-oxd-DEPLOY.md отдельным шагом, см. задачу 4).
       На Windows dev — ffmpeg опционален; если его нет, `generateVideoThumbnail`
       ловит ENOENT и возвращает `thumbError` без падения всего downloadMedia.

    2. **Добавить поле в Prisma schema** (`prisma/schema.prisma`):
       Найти блок `model SupportMedia` (строки ~632-644) и добавить:
       ```prisma
       model SupportMedia {
         id            String         @id @default(cuid())
         messageId     String
         message       SupportMessage @relation(fields: [messageId], references: [id], onDelete: Cascade)
         type          MediaType
         wbUrl         String         @db.Text
         localPath     String?        @db.Text
         thumbnailPath String?        @db.Text   // ← НОВОЕ
         sizeBytes     Int?
         createdAt     DateTime       @default(now())
         expiresAt     DateTime
         @@index([expiresAt])
       }
       ```

    3. **Создать миграцию вручную** (локально нет PostgreSQL — паттерн Phase 9):
       `prisma/migrations/20260420_support_media_thumbnail/migration.sql`:
       ```sql
       -- Добавляем поле thumbnailPath для превью медиа
       ALTER TABLE "SupportMedia" ADD COLUMN "thumbnailPath" TEXT;
       ```
       Миграция применится на VPS через `deploy.sh` → `npx prisma migrate deploy`.

    4. **Создать lib/wb-cdn.ts** — helper для замены CDN размера:
       ```typescript
       // Заменяет WB CDN URL с full-size (big/, c246x328/) на thumbnail (tm/).
       // WB CDN URL pattern: https://basket-NN.wb.ru/vol.../part.../NMID/images/{size}/N.webp
       // где {size} ∈ {big, c246x328, c516x688, tm}, N ∈ {1..N} — индекс фото.
       //
       // Примеры:
       //   big/1.webp       → tm/1.webp    (~200 КБ → ~15 КБ)
       //   c246x328/1.webp  → tm/1.webp
       //   c516x688/3.webp  → tm/3.webp
       //   tm/1.webp        → tm/1.webp   (идемпотентно)
       //   null | ""        → null
       //   не-WB URL        → без изменений (возврат as-is)

       const WB_CDN_SIZE_REGEX = /\/images\/(big|c\d+x\d+)\//

       export function toWbCdnThumb(url: string | null | undefined): string | null {
         if (!url) return null
         if (!url.includes("wb.ru") && !url.includes("wbstatic.net")) return url
         return url.replace(WB_CDN_SIZE_REGEX, "/images/tm/")
       }
       ```

    5. **Unit-тест** `tests/wb-cdn.test.ts` (vitest, проект использует):
       ```typescript
       import { describe, it, expect } from "vitest"
       import { toWbCdnThumb } from "@/lib/wb-cdn"

       describe("toWbCdnThumb", () => {
         it("заменяет big/ на tm/", () => {
           expect(toWbCdnThumb("https://basket-12.wb.ru/vol1807/part180712/180712345/images/big/1.webp"))
             .toBe("https://basket-12.wb.ru/vol1807/part180712/180712345/images/tm/1.webp")
         })
         it("заменяет c246x328/ на tm/", () => {
           expect(toWbCdnThumb("https://basket-01.wb.ru/vol100/part10000/100001/images/c246x328/2.webp"))
             .toBe("https://basket-01.wb.ru/vol100/part10000/100001/images/tm/2.webp")
         })
         it("идемпотентен для tm/", () => {
           const url = "https://basket-12.wb.ru/vol1807/part180712/180712345/images/tm/1.webp"
           expect(toWbCdnThumb(url)).toBe(url)
         })
         it("возвращает null для null/undefined/пусто", () => {
           expect(toWbCdnThumb(null)).toBeNull()
           expect(toWbCdnThumb(undefined)).toBeNull()
           expect(toWbCdnThumb("")).toBeNull()
         })
         it("не трогает не-WB URL", () => {
           const url = "https://example.com/images/big/1.jpg"
           expect(toWbCdnThumb(url)).toBe(url)
         })
       })
       ```

    **Внимательно:** package-lock.json коммитить вместе — иначе `npm ci` на VPS сломается.
  </action>
  <verify>
    <automated>npx prisma validate && npm run test -- tests/wb-cdn.test.ts</automated>
  </verify>
  <done>
    - `SupportMedia.thumbnailPath String?` присутствует в schema.prisma
    - Миграция SQL создана вручную и readиbale (`ALTER TABLE "SupportMedia" ADD COLUMN "thumbnailPath" TEXT`)
    - `sharp` добавлен в package.json dependencies
    - `lib/wb-cdn.ts` экспортирует `toWbCdnThumb`, все 5 vitest кейсов GREEN
    - `package-lock.json` обновлён (sharp + транзитивные)
  </done>
</task>

<task type="auto">
  <name>Задача 2: ffmpeg/sharp thumbnail generation в support-media.ts + integration в sync</name>
  <files>lib/support-media.ts, lib/support-sync.ts</files>
  <action>
    Расширить `lib/support-media.ts` двумя helper'ами и интегрировать их в `downloadMedia`:

    1. **Расширить DownloadItem / DownloadResult** новыми полями:
       ```typescript
       export interface DownloadItem {
         wbUrl: string
         ticketId: string
         messageId: string
         mediaType: "IMAGE" | "VIDEO" | "DOCUMENT"  // ← NEW
       }

       export interface DownloadResult extends DownloadItem {
         localPath?: string
         thumbnailPath?: string  // ← NEW
         sizeBytes?: number
         error?: string
         thumbError?: string     // ← NEW — non-fatal
       }
       ```

    2. **Добавить `generateImageThumbnail(sourcePath)`** через sharp:
       ```typescript
       import sharp from "sharp"
       // ...
       export async function generateImageThumbnail(sourcePath: string): Promise<string> {
         const thumbPath = sourcePath.replace(/\.[^./\\]+$/, "") + ".thumb.webp"
         await sharp(sourcePath)
           .resize(96, 96, { fit: "cover", position: "center" })
           .webp({ quality: 75 })
           .toFile(thumbPath)
         return thumbPath
       }
       ```

    3. **Добавить `generateVideoThumbnail(sourcePath)`** через spawn ffmpeg:
       ```typescript
       import { spawn } from "node:child_process"
       // ...
       export async function generateVideoThumbnail(sourcePath: string): Promise<string> {
         const thumbPath = sourcePath.replace(/\.[^./\\]+$/, "") + ".thumb.jpg"
         return new Promise((resolve, reject) => {
           // -ss 00:00:01 — кадр на первой секунде (первые frames часто чёрные)
           // -vframes 1 — ровно 1 кадр
           // -vf scale=96:96:force_original_aspect_ratio=increase,crop=96:96 — square crop
           // -q:v 5 — JPEG quality (1-31, ниже = лучше; 5 даёт ~5 КБ)
           const proc = spawn("ffmpeg", [
             "-y",
             "-ss", "00:00:01",
             "-i", sourcePath,
             "-vframes", "1",
             "-vf", "scale=96:96:force_original_aspect_ratio=increase,crop=96:96",
             "-q:v", "5",
             thumbPath,
           ])
           let stderr = ""
           proc.stderr.on("data", (d) => { stderr += String(d) })
           proc.on("error", (err) => reject(err))  // ENOENT на Windows без ffmpeg
           proc.on("close", (code) => {
             if (code === 0) resolve(thumbPath)
             else reject(new Error(`ffmpeg exit ${code}: ${stderr.slice(0, 500)}`))
           })
         })
       }
       ```

    4. **Интегрировать в `downloadMedia`** — после успешной записи файла:
       ```typescript
       export async function downloadMedia(item: DownloadItem, attempt = 0): Promise<DownloadResult> {
         const dir = path.join(DEFAULT_UPLOAD_DIR, "support", item.ticketId, item.messageId)
         try {
           await fs.mkdir(dir, { recursive: true })
           const rawName = path.basename(new URL(item.wbUrl).pathname)
           const sanitized = rawName.replace(/[^a-zA-Z0-9.\-_]/g, "_").slice(-128)
           const filename = sanitized || `file_${Date.now()}`
           const localPath = path.join(dir, filename)

           const res = await fetch(item.wbUrl)
           if (!res.ok) throw new Error(`HTTP ${res.status}`)
           const buf = Buffer.from(await res.arrayBuffer())
           await fs.writeFile(localPath, buf)

           // ── NEW: thumbnail generation (non-fatal) ──
           let thumbnailPath: string | undefined
           let thumbError: string | undefined
           try {
             if (item.mediaType === "IMAGE") {
               thumbnailPath = await generateImageThumbnail(localPath)
             } else if (item.mediaType === "VIDEO") {
               thumbnailPath = await generateVideoThumbnail(localPath)
             }
             // DOCUMENT — skip, рендерим иконкой
           } catch (err) {
             thumbError = err instanceof Error ? err.message : String(err)
           }

           return { ...item, localPath, thumbnailPath, sizeBytes: buf.length, thumbError }
         } catch (err) {
           if (attempt === 0) {
             await new Promise((r) => setTimeout(r, 1000))
             return downloadMedia(item, 1)
           }
           return {
             ...item,
             error: err instanceof Error ? err.message : "Ошибка скачивания медиа",
           }
         }
       }
       ```

    5. **Пробросить mediaType из lib/support-sync.ts** — найти все места, где `mediaToDownload.push(...)` / `mediaQueue.push(...)` / `pendingDownloads` собираются и добавить `mediaType`:

       **syncSupport** (строки ~138-158):
       ```typescript
       mediaToDownload.push({
         wbUrl: photo.fullSize,
         ticketId: ticket.id,
         messageId: msg.id,
         mediaType: "IMAGE",  // ← NEW
       })
       // ... для видео:
       mediaToDownload.push({
         wbUrl: fb.video.link,
         ticketId: ticket.id,
         messageId: msg.id,
         mediaType: "VIDEO",  // ← NEW
       })
       ```

       **syncReturns** (строки ~459-482):
       ```typescript
       // photos
       mediaQueue.push({ wbUrl: url, ticketId: ticket.id, messageId: msg.id, mediaType: "IMAGE" })
       // videos
       mediaQueue.push({ wbUrl: url, ticketId: ticket.id, messageId: msg.id, mediaType: "VIDEO" })
       ```

       **syncChats** — чат-вложения через DOWNLOAD_ID не используют `downloadMediaBatch`,
       у них отдельный блок «Download queue» (строки ~797-816). Для чатов добавить
       thumbnail генерацию прямо inline после `fs.writeFile(localPath, buffer)`:
       ```typescript
       await fs.writeFile(localPath, buffer)
       let thumbnailPath: string | undefined
       try {
         // CHAT: img.fileName может не иметь расширения; определяем по MediaType
         // из БД — но проще: sharp умеет читать по содержимому.
         // У CHAT только IMAGE + DOCUMENT (из attachments.images[] / files[]).
         // Поэтому: смотрим в БД тип media по messageId + filename.
         // Проще — generateImageThumbnail для всех попытаться, и если sharp не распознал → catch.
         // Альтернатива — передавать mediaType в PendingChatDownload.
       } catch (err) { /* non-fatal */ }
       ```

       **Решение для CHAT** (проще): расширить `PendingChatDownload` полем `mediaType`:
       ```typescript
       interface PendingChatDownload {
         downloadId: string
         ticketId: string
         messageId: string
         fileName: string
         mediaType: "IMAGE" | "DOCUMENT"  // ← NEW
       }
       ```
       И при `pendingDownloads.push({...})` (строки ~748-769) добавлять `mediaType: "IMAGE"` для images[], `mediaType: "DOCUMENT"` для files[]. Затем в блоке download (строки ~797-816) после `fs.writeFile`:
       ```typescript
       let thumbnailPath: string | undefined
       if (dl.mediaType === "IMAGE") {
         try { thumbnailPath = await generateImageThumbnail(localPath) }
         catch { /* non-fatal */ }
       }
       await prisma.supportMedia.updateMany({
         where: { messageId: dl.messageId, wbUrl: `DOWNLOAD_ID:${dl.downloadId}` },
         data: { localPath, thumbnailPath, sizeBytes: buffer.length },  // ← +thumbnailPath
       })
       ```

    6. **Обновить `updateMany` после `downloadMediaBatch`** в `syncSupport` и `syncReturns` — добавить поле:
       ```typescript
       await prisma.supportMedia.updateMany({
         where: { wbUrl: r.wbUrl, messageId: r.messageId },
         data: {
           localPath: r.localPath,
           thumbnailPath: r.thumbnailPath,   // ← NEW
           sizeBytes: r.sizeBytes,
         },
       })
       ```
       И выводить r.thumbError в errors только на info уровне (не ломает sync):
       ```typescript
       if (r.thumbError) {
         console.warn(`[support-media] thumb ${r.wbUrl}: ${r.thumbError}`)
         // result.errors НЕ добавляем — это не ошибка sync, просто отсутствие preview
       }
       ```

    **КРИТИЧЕСКИ ВАЖНО:** все try/catch вокруг thumbnail — non-fatal. Sync не должен падать, если ffmpeg отсутствует на Windows dev или sharp не распознал формат.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run lint</automated>
  </verify>
  <done>
    - `lib/support-media.ts` экспортирует `generateImageThumbnail`, `generateVideoThumbnail`
    - `downloadMedia` возвращает `thumbnailPath` для IMAGE и VIDEO (если тулчейн доступен)
    - Ошибки thumbnail не ломают основной поток sync (non-fatal, пишутся в console.warn)
    - `lib/support-sync.ts` во всех 3 sync-функциях (syncSupport/syncReturns/syncChats):
      * DownloadItem собирается с корректным `mediaType`
      * `updateMany` пишет `thumbnailPath`
    - `npx tsc --noEmit` проходит без ошибок
    - `npm run lint` чистый
  </done>
</task>

<task type="auto">
  <name>Задача 3: UI — MediaGallery + ReturnsTable (thumbnails, WB tm/, width/height/decoding)</name>
  <files>components/support/MediaGallery.tsx, components/support/ReturnsTable.tsx</files>
  <action>
    **Часть 3.1 — MediaGallery.tsx:**

    1. Расширить интерфейс `MediaGalleryItem` опциональным полем:
       ```typescript
       export interface MediaGalleryItem {
         id: string
         src: string                     // полноразмерный для Lightbox
         thumbnailSrc?: string | null    // ← NEW — для превью; fallback на src
         type: "IMAGE" | "VIDEO" | "DOCUMENT"
         fileName?: string | null
       }
       ```

    2. Заменить рендер VIDEO (строки ~60-64) — **убрать `<video>`**, использовать `<img>`:
       ```tsx
       ) : m.type === "VIDEO" ? (
         <>
           {m.thumbnailSrc ? (
             // eslint-disable-next-line @next/next/no-img-element
             <img
               src={m.thumbnailSrc}
               alt=""
               width={96}
               height={96}
               decoding="async"
               loading="lazy"
               className="w-full h-full object-cover"
             />
           ) : (
             // Fallback: серый прямоугольник — НЕ <video>, чтобы не грузить оригинал
             <div className="w-full h-full bg-muted" />
           )}
           <Play className="absolute w-6 h-6 text-white drop-shadow-md fill-white/90" />
         </>
       ) : (
       ```

    3. Заменить рендер IMAGE (строки ~52-59) — использовать thumbnailSrc если есть:
       ```tsx
       {m.type === "IMAGE" ? (
         // eslint-disable-next-line @next/next/no-img-element
         <img
           src={m.thumbnailSrc ?? m.src}
           alt=""
           width={96}
           height={96}
           decoding="async"
           loading="lazy"
           className="w-full h-full object-cover"
         />
       ) : m.type === "VIDEO" ? (
       ```

    **Часть 3.2 — ReturnsTable.tsx:**

    1. Импортировать WB CDN helper:
       ```typescript
       import { toWbCdnThumb } from "@/lib/wb-cdn"
       ```

    2. Обновить хелпер `mediaSrc` — добавить `mediaThumbSrc`:
       ```typescript
       function mediaSrc(m: SupportMedia): string {
         if (m.localPath) return m.localPath.replace("/var/www/zoiten-uploads", "/uploads")
         return m.wbUrl
       }

       // ← NEW
       function mediaThumbSrc(m: SupportMedia): string | null {
         if (m.thumbnailPath) return m.thumbnailPath.replace("/var/www/zoiten-uploads", "/uploads")
         // Fallback: для IMAGE — оригинал, для VIDEO — null (серый прямоугольник в MediaGallery)
         if (m.type === "IMAGE" && m.localPath) {
           return m.localPath.replace("/var/www/zoiten-uploads", "/uploads")
         }
         return null
       }
       ```

    3. Заменить `<img>` товарного фото (строки ~116-124):
       ```tsx
       {card?.photoUrl && (
         // eslint-disable-next-line @next/next/no-img-element
         <img
           src={toWbCdnThumb(card.photoUrl) ?? card.photoUrl}
           alt=""
           width={36}
           height={48}
           decoding="async"
           loading="lazy"
           className="h-12 w-9 rounded object-cover flex-shrink-0"
         />
       )}
       ```
       Note: width=36, height=48 — это intrinsic size, aspect-ratio 3:4 совпадает с CSS `h-12 w-9`.

    4. Пробросить `thumbnailSrc` при маппинге media в MediaGallery (строки ~170-178):
       ```tsx
       <MediaGallery
         items={media.map((m) => ({
           id: m.id,
           src: mediaSrc(m),
           thumbnailSrc: mediaThumbSrc(m),  // ← NEW
           type: m.type,
         }))}
         thumbClassName="w-10 h-10"
         limit={3}
       />
       ```

    **Проверить что тип `SupportMedia` из @prisma/client содержит thumbnailPath:**
    После задачи 1 Prisma schema обновлена, но `@prisma/client` регенерится только после `npx prisma generate`. Убедиться в задаче 1 что `npx prisma generate` выполняется (или вручную), иначе TS сломается на `m.thumbnailPath`.

    **Windows dev:** fallback thumbnailSrc → localPath → wbUrl — UI не деградирует если backfill ещё не запущен.

    **Никаких `<video>` в списке.** Все VIDEO превью теперь `<img>` + Play icon поверх.
  </action>
  <verify>
    <automated>npx prisma generate && npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>
    - `MediaGallery.tsx` для VIDEO рендерит `<img>` (или серую заглушку), иконка Play поверх — `<video>` в списке отсутствует
    - `MediaGallery.tsx` для IMAGE использует `thumbnailSrc ?? src` — приоритет thumbnail
    - Все `<img>` в MediaGallery имеют `width={96} height={96} decoding="async" loading="lazy"`
    - `ReturnsTable.tsx` товарное `<img>`: `toWbCdnThumb(card.photoUrl)`, `width={36} height={48} decoding="async"`
    - `ReturnsTable.tsx` передаёт `thumbnailSrc` в `MediaGallery` через новый helper `mediaThumbSrc`
    - `npx tsc --noEmit` — 0 ошибок
    - `npm run build` успешно собирается
    - Ручной smoke: открыть /support/returns — `<video>` тегов в DOM быть не должно (проверить через devtools)
  </done>
</task>

<task type="auto">
  <name>Задача 4: Backfill endpoint + DEPLOY инструкция для VPS ffmpeg</name>
  <files>app/api/support-media-backfill-thumbs/route.ts, .planning/quick/260420-oxd-support-returns-ffmpeg-thumbnail-wb-cdn-/260420-oxd-DEPLOY.md</files>
  <action>
    **Часть 4.1 — backfill endpoint `app/api/support-media-backfill-thumbs/route.ts`:**

    ```typescript
    // POST /api/support-media-backfill-thumbs
    // Одноразовая генерация thumbnail для существующих медиа (thumbnailPath IS NULL).
    // Защищён requireSuperadmin(). Запуск:
    //   curl -X POST -H "Cookie: next-auth.session-token=..." https://zoiten.pro/api/support-media-backfill-thumbs
    //
    // Обрабатывает пакетами по 50, внутри цикла — для каждой media:
    //   - если localPath нет → skip (файл не скачан, ждём регулярный sync)
    //   - если IMAGE → generateImageThumbnail
    //   - если VIDEO → generateVideoThumbnail
    //   - если DOCUMENT → skip
    //   - ошибки non-fatal, копятся в errors[]
    // Возвращает JSON: { processed, generated, skipped, errors }

    import { NextResponse } from "next/server"
    import { promises as fs } from "node:fs"
    import { prisma } from "@/lib/prisma"
    import { requireSuperadmin } from "@/lib/rbac"
    import { generateImageThumbnail, generateVideoThumbnail } from "@/lib/support-media"

    const BATCH_SIZE = 50

    export async function POST() {
      await requireSuperadmin()

      const errors: string[] = []
      let processed = 0
      let generated = 0
      let skipped = 0

      // Обрабатываем батчами — чтобы не держать открытый query на тысячи rows
      // (Prisma findMany без take читает всё в память).
      for (let offset = 0; ; offset += BATCH_SIZE) {
        const rows = await prisma.supportMedia.findMany({
          where: { thumbnailPath: null, localPath: { not: null } },
          select: { id: true, type: true, localPath: true },
          orderBy: { createdAt: "desc" },
          take: BATCH_SIZE,
          skip: offset,
        })
        if (rows.length === 0) break

        for (const row of rows) {
          processed++
          if (!row.localPath) { skipped++; continue }
          if (row.type === "DOCUMENT") { skipped++; continue }

          // Убедиться что файл существует
          try {
            await fs.access(row.localPath)
          } catch {
            errors.push(`${row.id}: file missing at ${row.localPath}`)
            skipped++
            continue
          }

          try {
            const thumbnailPath =
              row.type === "IMAGE"
                ? await generateImageThumbnail(row.localPath)
                : await generateVideoThumbnail(row.localPath)
            await prisma.supportMedia.update({
              where: { id: row.id },
              data: { thumbnailPath },
            })
            generated++
          } catch (err) {
            errors.push(`${row.id}: ${err instanceof Error ? err.message : String(err)}`)
          }
        }

        if (rows.length < BATCH_SIZE) break
      }

      return NextResponse.json({ processed, generated, skipped, errors })
    }
    ```

    **Часть 4.2 — создать `.planning/quick/260420-oxd-support-returns-ffmpeg-thumbnail-wb-cdn-/260420-oxd-DEPLOY.md`:**

    ```markdown
    # Деплой Quick Task 260420-oxd

    ## Порядок действий

    ### 1. Установить ffmpeg на VPS (ОДНОРАЗОВО)

    ```bash
    ssh root@85.198.97.89 "apt update && apt install -y ffmpeg"
    ssh root@85.198.97.89 "ffmpeg -version"
    ```
    Должна вывестись версия (5.x или 6.x на Debian 12).

    ### 2. Деплой ERP (стандартный)

    ```bash
    ssh root@85.198.97.89 "cd /opt/zoiten-pro && bash deploy.sh"
    ```
    `deploy.sh` выполнит:
    - `git pull`
    - `npm ci` (установит sharp — prebuilt binary для linux-x64 автоматически)
    - `npx prisma migrate deploy` (применит миграцию `20260420_support_media_thumbnail`)
    - `npm run build`
    - `systemctl restart zoiten-erp`

    ### 3. Запустить backfill существующих медиа

    После успешного деплоя:

    ```bash
    # Получить session cookie (или логин через браузер и скопировать из devtools)
    COOKIE="next-auth.session-token=...."

    curl -X POST \
      -H "Cookie: $COOKIE" \
      https://zoiten.pro/api/support-media-backfill-thumbs

    # Ожидаемый ответ (может занять 5-30 минут в зависимости от кол-ва медиа):
    # {"processed":1234,"generated":1200,"skipped":30,"errors":["..."]}
    ```

    Если endpoint упадёт по таймауту (nginx proxy_read_timeout 600s — достаточно обычно),
    запустить повторно — идемпотентен, пропускает уже обработанные.

    ### 4. Smoke тесты на проде

    Открыть https://zoiten.pro/support/returns :
    - Проверить что в devtools Network нет запросов к `big/1.webp` (все `tm/1.webp`)
    - Проверить что в DOM нет `<video>` тэгов в списке превью (только `<img>`)
    - Проверить размер передачи: фотокарточки товаров ~10-20 КБ вместо ~100-300 КБ
    - Скроллить — плавно, без лагов
    ```

    **НЕ использовать** Bash heredoc — файлы создаём через Write tool.
  </action>
  <verify>
    <automated>npx tsc --noEmit && npm run build</automated>
  </verify>
  <done>
    - `app/api/support-media-backfill-thumbs/route.ts` экспортирует POST handler
    - Защищён `requireSuperadmin()` (запрос без куки суперадмина → 401/403)
    - Батчит по 50, пишет `thumbnailPath`, возвращает JSON `{processed, generated, skipped, errors}`
    - `.planning/quick/.../260420-oxd-DEPLOY.md` создан с инструкцией по ffmpeg install + backfill
    - `npx tsc --noEmit` чистый
    - `npm run build` успешен
  </done>
</task>

</tasks>

<verification>
**Post-merge проверка (после деплоя + backfill):**

1. **Prisma:** `SupportMedia.thumbnailPath` столбец существует в БД:
   ```sql
   \d "SupportMedia"
   -- ожидаем: thumbnailPath | text | nullable
   ```

2. **Network (chrome devtools на /support/returns):**
   - Картинки товаров загружаются с `tm/` в URL (не `big/`)
   - Каждая товарная карточка — ~10-20 КБ
   - Превью VIDEO — это `<img>` с `.thumb.jpg` (или `.thumb.webp`), не `<video>`
   - Превью IMAGE — `<img>` с `.thumb.webp`, размер 3-10 КБ

3. **DOM:** `document.querySelectorAll('td video').length === 0` на /support/returns

4. **Backfill metric:** response `/api/support-media-backfill-thumbs` показывает `generated > 0`,
   ошибок минимум (допустимы: файлы протухли, медиа удалены).

5. **Lighthouse (опционально):** на /support/returns CLS должен улучшиться
   (добавили width/height), LCP сократиться (tm/ вместо big/).
</verification>

<success_criteria>
- [ ] Миграция `20260420_support_media_thumbnail` применена на VPS
- [ ] `sharp` и ffmpeg (apt) доступны на VPS
- [ ] Все новые медиа (IMAGE/VIDEO) из sync имеют `thumbnailPath`
- [ ] Backfill endpoint успешно обработал существующие медиа
- [ ] `/support/returns` загружается заметно быстрее (subjective smoke на 100+ заявках)
- [ ] В DOM нет `<video>` в списке превью — только `<img>`
- [ ] WB CDN URL карточек содержат `/images/tm/` вместо `/images/big/` или `/images/c246x328/`
- [ ] Все `<img>` в MediaGallery и ReturnsTable имеют `width`, `height`, `decoding="async"`
- [ ] `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm run test` — все зелёные
- [ ] Коммиты атомарные:
  1. `feat(support): добавить SupportMedia.thumbnailPath + sharp + WB CDN helper`
  2. `feat(support): ffmpeg/sharp thumbnail generation в downloadMedia + sync`
  3. `feat(support): превью VIDEO как <img>, WB tm/, width/height/decoding на /support/returns`
  4. `feat(support): backfill endpoint для thumbnail existing media + DEPLOY инструкция`
</success_criteria>

<output>
После выполнения всех 4 задач создать `.planning/quick/260420-oxd-support-returns-ffmpeg-thumbnail-wb-cdn-/260420-oxd-SUMMARY.md` с:
- Описанием что было сделано (thumbnail generation, WB CDN tm/, width/height)
- Ссылками на коммиты
- Замерами производительности до/после (размер bundle, CLS, LCP) — опционально
- Обновить .planning/STATE.md → Quick Tasks Completed: добавить строку `260420-oxd`
</output>
