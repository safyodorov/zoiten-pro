-- Phase 23: новая категория «Нейросети» (Perplexity, ChatGPT, Anthropic/Claude и т.п.)
-- Прочее сдвигаем в конец (sortOrder 25), Нейросети — 24.
UPDATE "CashCategory" SET "sortOrder" = 25, "updatedAt" = now() WHERE name = 'Прочее';
INSERT INTO "CashCategory" (id, name, "sortOrder", "createdAt", "updatedAt")
VALUES (gen_random_uuid()::text, 'Нейросети', 24, now(), now())
ON CONFLICT (name) DO NOTHING;
