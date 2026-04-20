-- Quick Task 260420-oxd: thumbnail для SupportMedia
-- Добавляем поле thumbnailPath для превью медиа (VIDEO .thumb.jpg, IMAGE .thumb.webp)
ALTER TABLE "SupportMedia" ADD COLUMN "thumbnailPath" TEXT;
