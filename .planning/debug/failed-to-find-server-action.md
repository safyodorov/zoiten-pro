---
slug: failed-to-find-server-action
status: resolved
trigger: |
  В журнале zoiten-erp.service регулярно появляются ошибки
  "Failed to find Server Action 'x'. This request might be from an older or newer deployment."
  ~50+ раз за последние несколько часов 10 мая 2026.
created: 2026-05-10
updated: 2026-05-10
resolution_type: not-a-bug
---

# Failed to find Server Action "x" — Root Cause Report

## Symptoms

| | |
|---|---|
| Error | `[Error: Failed to find Server Action "x". This request might be from an older or newer deployment.]` |
| Источник | `journalctl -u zoiten-erp.service` |
| Частота | 30+ событий за 8 часов 10 мая (10:00–19:00 UTC), всплески по 2–3 подряд |
| Action ID | Всегда литеральная строка `"x"` (один символ) — не настоящий 40-символьный SHA1 hex |
| Build / HEAD на VPS | `62a9b8e`, `BUILD_ID` = 2026-04-28 14:22 — стабильны 12 дней |
| Service uptime | 3 дня (с 2026-05-07 19:01 UTC), без перезапусков |
| Browser-сессии | Никто из реальных пользователей жалоб не присылал |

## Hypothesis Tested

**H1:** Stale browser tabs от старого деплоя (типичный сценарий из Next.js docs).
→ Опровергнута. Action ID был бы 40-символьный hex, а не `"x"`. Также на одного юзера должно было бы быть ~1 событие после reload, а здесь тысячи.

**H2:** Нестабильные хеши Server Action между билдами (если `experimental.serverActions.encryption.key` не зафиксирован).
→ Опровергнута. `next.config.ts` не использует `experimental.serverActions`, дефолт Next.js 15 = детерминированные ID per-build. Build не пересобирался 12 дней.

**H3 ✓:** Бот-трафик отправляет `POST` с произвольным заголовком `Next-Action: x`. Next.js пытается найти action `x`, не находит, логирует как Error.
→ **Подтверждена экспериментально (см. ниже).**

## Reproduction

Один curl-запрос с локальной машины:

```bash
curl -X POST -H "Next-Action: x" -H "Content-Type: text/plain" --data "" https://zoiten.pro/
# HTTP/200 (404 на самом деле — но Next.js перехватывает action lookup ДО роутинга страницы)
```

Через 1 секунду в логе:

```
May 10 19:10:35 hcqgxonyei node[429168]: [Error: Failed to find Server Action "x"...]
```

Тот же эффект через `http://85.198.97.89:3001/` напрямую (минуя nginx).

## Evidence

1. **Action ID = `"x"`** — литерал, не хеш. Реальные Next.js Server Action ID = 40-символьный hex (например, `40c9def68c81ff64c34fae2b16c47e4f5c3b41a1`).
2. **Корреляция с nginx access.log:** в окне 17:40-17:42 UTC (3 события `Failed to find...`) **ноль POST-запросов** в `/var/log/nginx/access.log`. Бот стучится напрямую в порт 3001.
3. **Service binding:** `Environment=HOSTNAME=0.0.0.0` в systemd unit → `0.0.0.0:3001 LISTEN` (`ss -tlnp`). Порт открыт всему интернету, минуя nginx, SSL, rate-limit.
4. **Бот-фон в nginx access.log:** массовые пробы `/wp-admin/install.php`, `/cgi-bin/.%2e/.%2e/...bin/sh`, `/mcp` (python-httpx), `/v1`, `/version`, `/xmlrpc.php` — стандартный сканерный шум. Те же IP пробуют port 3001 с `Next-Action` мусором.
5. **Live reproduction:** мой curl 2026-05-10 19:10:35 UTC сгенерировал 2 новые записи `Failed to find Server Action "x"` в журнале с задержкой ~1 сек.

## Root Cause

**Не баг приложения.** Это log-шум от бот-трафика. Boты отправляют POST с заголовком `Next-Action: x`, Next.js 15 как фреймворк всегда логирует такие запросы через `console.error()` — это не настраивается без патчинга или кастомного error overlay.

## Side finding (security)

`Environment=HOSTNAME=0.0.0.0` в systemd unit делает Next.js слушающим на всех интерфейсах:

- Порт 3001 открыт всему интернету напрямую (curl с моей машины проходит за 8ms)
- Минует nginx (нет SSL, нет HSTS, нет security headers, нет rate limit)
- UFW неактивен
- iptables только fail2ban для SSH

**Это не вызывает текущих ошибок** (бот через `https://zoiten.pro/` тоже их генерит), но это самостоятельный security-issue.

## Fix Options

### Option A — Закрыть порт 3001 от внешнего интернета (рекомендуется)

Меняем systemd unit:

```diff
- Environment=HOSTNAME=0.0.0.0
+ Environment=HOSTNAME=127.0.0.1
```

Плюсы: defense-in-depth, бот-трафик упирается в nginx (где можно поставить rate limit), HTTPS обязателен.
Минусы: requires `systemctl daemon-reload && systemctl restart zoiten-erp.service`.
**НЕ убирает шум `Failed to find Server Action`** — бот всё равно достучится через nginx.

### Option B — Заглушить именно эту ошибку в логах

Перехват в `instrumentation.ts` или в кастомном error logger Next.js. Альтернатива: журналу systemd дать фильтр через rsyslog `:msg, contains, "Failed to find Server Action"  stop`.

Плюсы: убирает шум.
Минусы: Next.js пишет error через `console.error` без route-context, перехват хрупкий и может скрыть реальные баги.

### Option C — Просто принять как фоновый шум

Эти запросы не могут ничего сделать (нет валидного action ID = нет исполнения), это framework-level no-op. Можно добавить journald rate-limit и оставить.

Плюсы: zero work.
Минусы: журналу периодически придётся ротироваться чаще.

## Recommendation

1. **Сделать Option A немедленно** — security best-practice, закрывает реальный issue (открытый порт 3001 в интернет).
2. **Опционально Option C через journald rate-limit** — убирает массовый шум без хрупкого error filtering.
3. **Option B пропустить** — слишком рискованно скрывать framework errors, можно случайно потерять реальный сигнал.

Никаких изменений в код приложения **не нужно**.

## Files Examined

- `next.config.ts:1-17` — Server Actions не настроены (дефолты Next.js 15)
- `/etc/systemd/system/zoiten-erp.service` — `Environment=HOSTNAME=0.0.0.0` (root cause `0.0.0.0:3001`)
- `/etc/zoiten.pro.env` — `PORT=3001` без `HOSTNAME`
- `/var/log/nginx/access.log` — нет POST-запросов в окне ошибок
- `journalctl -u zoiten-erp.service` — точные timestamps + Live repro
