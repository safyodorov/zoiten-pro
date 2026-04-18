-- Phase 10: Чат + Автоответы
-- Новая модель AutoReplyConfig (singleton), расширения SupportTicket (+2 nullable поля),
-- SupportMessage (+wbEventId @unique), enum MediaType (+DOCUMENT). Обратно-совместимо с
-- Phase 8/9/11: все новые поля в existing моделях nullable.

-- ── 1. Enum MediaType: добавляем DOCUMENT (для PDF из chat attachments.files[]) ──
ALTER TYPE "MediaType" ADD VALUE 'DOCUMENT';

-- ── 2. SupportTicket: 2 новых поля для CHAT канала ──
ALTER TABLE "SupportTicket"
    ADD COLUMN "chatReplySign"        TEXT,
    ADD COLUMN "customerNameSnapshot" TEXT;

-- ── 3. SupportMessage: wbEventId + unique index ──
ALTER TABLE "SupportMessage" ADD COLUMN "wbEventId" TEXT;
CREATE UNIQUE INDEX "SupportMessage_wbEventId_key" ON "SupportMessage"("wbEventId");

-- ── 4. AutoReplyConfig singleton (id = 'default') ──
CREATE TABLE "AutoReplyConfig" (
    "id"           TEXT NOT NULL,
    "isEnabled"    BOOLEAN NOT NULL DEFAULT false,
    "workdayStart" TEXT NOT NULL DEFAULT '09:00',
    "workdayEnd"   TEXT NOT NULL DEFAULT '18:00',
    "workDays"     INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "messageText"  TEXT NOT NULL DEFAULT 'Здравствуйте, {имя_покупателя}! Спасибо за обращение по товару «{название_товара}». Мы ответим в рабочее время.',
    "timezone"     TEXT NOT NULL DEFAULT 'Europe/Moscow',
    "updatedById"  TEXT,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AutoReplyConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "AutoReplyConfig"
    ADD CONSTRAINT "AutoReplyConfig_updatedById_fkey"
    FOREIGN KEY ("updatedById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- ── 5. Seed singleton row (идемпотентно — ON CONFLICT DO NOTHING) ──
INSERT INTO "AutoReplyConfig" ("id", "isEnabled", "workdayStart", "workdayEnd", "workDays", "messageText", "timezone", "updatedAt")
VALUES (
    'default',
    false,
    '09:00',
    '18:00',
    ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    'Здравствуйте, {имя_покупателя}! Спасибо за обращение по товару «{название_товара}». Мы ответим в рабочее время.',
    'Europe/Moscow',
    NOW()
)
ON CONFLICT ("id") DO NOTHING;
