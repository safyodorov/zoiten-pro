---
phase: 19-wb-ads
plan: W0
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/19-wb-ads/19-W0-NOTES.md
autonomous: false
requirements: [W0-VERIFY-API, W0-VERIFY-TOKEN]
must_haves:
  truths:
    - "Подтверждено, что `GET https://advert-api.wildberries.ru/adv/v1/promotion/count` отвечает 200 с реальным WB_ADS_TOKEN (через curl с VPS)"
    - "Sample shape /promotion/count + /promotion/adverts + /fullstats совпадает с описанием в 19-RESEARCH.md секция 2"
    - "JWT scope WB_ADS_TOKEN декодирован, подтверждено что bit 30 (Реклама) включён — либо запланирована замена токена"
    - "Зафиксирован реальный список campaign types (актуальный, не только тип 9) и статусов из ответа /promotion/count"
  artifacts:
    - path: ".planning/phases/19-wb-ads/19-W0-NOTES.md"
      provides: "Smoke check log + sample responses + decoded scope + любые корректировки к плану"
      min_lines: 30
  key_links:
    - from: ".planning/phases/19-wb-ads/19-W0-NOTES.md"
      to: "19-01-PLAN.md, 19-03-PLAN.md"
      via: "Согласует реальный response shape со схемой БД и сигнатурами lib/wb-adv-api.ts; если расхождения — пометить TODO для plan-revision"
      pattern: "promotion/count|promotion/adverts|fullstats|balance"
---

<objective>
Smoke-check WB Advert API endpoints на проде через VPS curl с реальным WB_ADS_TOKEN. Цель: подтвердить, что (1) endpoint base URL + paths из 19-RESEARCH.md живые, (2) shape ответа совпадает с тем, что мы заложили в Prisma модели и сигнатуры lib/wb-adv-api.ts, (3) scope JWT достаточен для всех нужных endpoint'ов. Если расхождения — зафиксировать в 19-W0-NOTES.md и при необходимости откорректировать Plan 19-01 и 19-03 до начала реализации.

Purpose: Phase 14 показала, что прыжок в код без curl smoke теста стоит дороже, чем 15 минут проверки — WB регулярно меняет URL/format/rate limits. Wave 0 является дешёвой страховкой.

Output: `.planning/phases/19-wb-ads/19-W0-NOTES.md` с raw JSON, decoded scope, корректировками плана.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/ROADMAP.md
@.planning/phases/19-wb-ads/19-RESEARCH.md
@CLAUDE.md
@lib/wb-jwt.ts

<interfaces>
<!-- Существующий JWT-декодер (quick 260512-jxh). Используется в Task 2 для decode scope. -->

From lib/wb-jwt.ts:
```typescript
export interface WbJwtPayload {
  scopeBitmask: number
  scopeBits: number[]            // массив включённых битов: [1, 2, 3, 5, 6, 7, 30]
  issuedAt: Date | null
  expiresAt: Date
  sellerId: string | null
  organizationId: string | null
}
export function decodeWbJwt(token: string): WbJwtPayload
export function decodeScopeBits(bitmask: number): number[]
export const WB_SCOPE_LABELS: Record<number, string>  // { 1: "Контент", 2: "Аналитика", 3: "Цены", 5: "Отзывы", 6: "Статистика", 7: "Тарифы", ... }
```

WB Advert API base URL (из 19-RESEARCH.md секция 2):
- `https://advert-api.wildberries.ru/adv/v1/promotion/count`
- `https://advert-api.wildberries.ru/adv/v1/promotion/adverts` (POST с массивом advertId)
- `https://advert-api.wildberries.ru/adv/v2/fullstats` (POST)
- `https://advert-api.wildberries.ru/adv/v1/balance`

Rate limits (предположительно из docs):
- /promotion/* — 5 req/sec
- /fullstats — 1 req/sec, batch ≤100 advertId

WB scope bit 30 (предположительно) = Реклама. Подтвердить через decodeWbJwt + WB docs.
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Curl smoke check endpoints WB Advert API на VPS</name>
  <read_first>
    - .planning/phases/19-wb-ads/19-RESEARCH.md (секция 2 «WB Advert API — endpoints»)
    - CLAUDE.md (секция «WB API rate-limit защиты»)
    - /etc/zoiten.pro.env на VPS (для подтверждения наличия WB_ADS_TOKEN или WB_API_TOKEN)
  </read_first>
  <files>.planning/phases/19-wb-ads/19-W0-NOTES.md</files>
  <action>
    Получить от пользователя WB_ADS_TOKEN (или подтвердить, что использовать существующий WB_API_TOKEN — он по логам имеет bits 1,2,3,5,6,7 без bit 30 «Реклама», поэтому скорее всего нужен новый токен). Если WB_ADS_TOKEN отсутствует — создать checkpoint:human-action для генерации JWT в ЛК WB (Настройки → API-токены → создать с галочкой «Продвижение»).

    Затем через `ssh root@85.198.97.89 "curl -fsS ..."` (не Node.js fetch — TLS fingerprint, см. CLAUDE.md) выполнить 4 запроса с заголовком `Authorization: <WB_ADS_TOKEN>`:

    1. `GET https://advert-api.wildberries.ru/adv/v1/promotion/count` — список кампаний.
    2. Взять первые 5 advertId из (1), POST `https://advert-api.wildberries.ru/adv/v1/promotion/adverts` с body `[<advertId>, ...]` и Content-Type `application/json`.
    3. POST `https://advert-api.wildberries.ru/adv/v2/fullstats` с body `[{"id": <advertId>, "interval": {"begin": "<yyyy-mm-dd 7 дней назад>", "end": "<сегодня>"}}, ...]` (max 5 для smoke).
    4. `GET https://advert-api.wildberries.ru/adv/v1/balance`.

    Сохранить raw JSON ответов в `19-W0-NOTES.md` (поджав сэмпл до 1-2 элементов на endpoint, чтобы не разбухал; полный лог можно в /tmp на VPS оставить).

    Проверить и зафиксировать в NOTES:
    - HTTP статус, наличие непредвиденных полей по сравнению с 19-RESEARCH.md
    - Реальный список значений `type` (4..9 vs новые) и `status` (-1, 4, 7, 8, 9, 11 vs новые)
    - Реальный shape `/promotion/adverts`: поля `name`, `nmId targets`, `dailyBudget`, `startTime`, `endTime`, `changeTime` (имена могут отличаться — приходит ли `nms` или `nmIds` или `params[].nmIds[]` и т.п.)
    - Реальный shape `/fullstats` ответа per (advertId, date, nmId, appType) — поля views/clicks/ctr/cpc/sum/atbs/orders/cr/shks/sum_price
    - Реальный shape `/balance` — `balance`, `bonus`, `net` (точные ключи)
    - Любой 429 / rate-limit header (Retry-After, X-RateLimit-*)

    Если что-то расходится — добавить в NOTES секцию «Корректировки плана» с конкретными правками для 19-01 (schema) и 19-03 (API client signatures).
  </action>
  <verify>
    <automated>test -s .planning/phases/19-wb-ads/19-W0-NOTES.md && grep -q "promotion/count" .planning/phases/19-wb-ads/19-W0-NOTES.md && grep -q "fullstats" .planning/phases/19-wb-ads/19-W0-NOTES.md && grep -q "balance" .planning/phases/19-wb-ads/19-W0-NOTES.md</automated>
  </verify>
  <acceptance_criteria>
    - 19-W0-NOTES.md существует и содержит raw responses от всех 4 endpoint'ов (или явное указание, какой endpoint вернул error и как обходить)
    - Зафиксирован реальный набор полей в JSON для каждого endpoint'а
    - Зафиксирован реальный список campaign types и statuses
    - Если есть расхождения с RESEARCH.md — добавлена секция «Корректировки плана»
  </acceptance_criteria>
  <done>Все 4 endpoint'a проверены на проде; raw shape + список type/status задокументированы; план 19-01/19-03 либо подтверждён, либо помечен на ревизию</done>
</task>

<task type="auto">
  <name>Task 2: Decode JWT scope WB_ADS_TOKEN и подтвердить bit 30</name>
  <read_first>
    - lib/wb-jwt.ts (для понимания структуры payload)
    - .planning/phases/19-wb-ads/19-W0-NOTES.md (результаты Task 1)
  </read_first>
  <files>.planning/phases/19-wb-ads/19-W0-NOTES.md</files>
  <action>
    На локальной машине запустить `node -e` (или через временный test файл) с импортом из `lib/wb-jwt.ts` для декодинга JWT. Альтернатива: декодировать pure base64 — payload между двумя `.` декодируется в JSON, поле `s` = bitmask.

    Цель: подтвердить, что в WB_ADS_TOKEN включён bit 30 (Продвижение/Реклама). WB документация утверждает, что Advert API требует scope-бит «Продвижение». Если в smoke check (Task 1) `/promotion/count` ответил 200 — значит, scope корректный, но decode всё равно зафиксировать для аудита и для расширения `REQUIRED_SCOPE_BITS` в `lib/wb-token-validate.ts` в Plan 19-02.

    Дополнить `19-W0-NOTES.md` секцией «JWT scope analysis» с:
    - `scopeBitmask: <число>`
    - `scopeBits: [<массив>]`
    - `expiresAt: <ISO>`
    - `sellerId: <строка>`
    - подтверждение что bit 30 присутствует (или TODO для замены токена)

    Если bit 30 отсутствует — добавить checkpoint:human-action в NOTES для регенерации токена пользователем в ЛК WB.
  </action>
  <verify>
    <automated>grep -E "scopeBits|bit 30|Продвижение|Реклама" .planning/phases/19-wb-ads/19-W0-NOTES.md</automated>
  </verify>
  <acceptance_criteria>
    - В 19-W0-NOTES.md секция «JWT scope analysis» с массивом scopeBits
    - Явно зафиксировано, включает ли токен bit 30 (или эквивалент scope «Реклама/Продвижение»)
    - Если bit 30 отсутствует — есть TODO/checkpoint для генерации нового токена пользователем
  </acceptance_criteria>
  <done>Scope подтверждён или помечен blocker; Plan 19-02 знает какие биты добавить в REQUIRED_SCOPE_BITS</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 3: User reviews W0-NOTES перед началом кодинга</name>
  <files>.planning/phases/19-wb-ads/19-W0-NOTES.md</files>
  <what-built>Curl smoke check всех 4 endpoint'ов + JWT scope decode</what-built>
  <how-to-verify>
    1. Открыть `.planning/phases/19-wb-ads/19-W0-NOTES.md`
    2. Просмотреть raw responses — соответствуют ли они твоим ожиданиям?
    3. Проверить scope — bit 30 присутствует?
    4. Если в секции «Корректировки плана» есть пункты — решить, применять их сейчас (через plan-revision) или продолжать с TODO
  </how-to-verify>
  <action>Пользователь читает 19-W0-NOTES.md и решает: approved → начинаем Wave 2 (Plans 19-01, 19-02). Если расхождения — запускаем plan-revision для затронутых планов до старта реализации.</action>
  <verify>
    <automated>test -f .planning/phases/19-wb-ads/19-W0-NOTES.md</automated>
  </verify>
  <done>Пользователь подтвердил готовность к Wave 2 (approved) или указал что нужно поправить</done>
  <resume-signal>Type "approved" если NOTES в порядке и можно начинать с Wave 1 (Plans 19-01/19-02). Иначе опиши, что нужно поправить в плане.</resume-signal>
</task>

</tasks>

<verification>
- 19-W0-NOTES.md existence + size > 0
- Все 4 endpoint'a задокументированы (grep по именам)
- JWT scope decode присутствует (grep "scopeBits")
- Решения по token замене (если нужны) зафиксированы
</verification>

<success_criteria>
- Phase 19 готова к Wave 1 со 100% уверенностью в shape WB Advert API
- Если есть несоответствия — план откорректирован до того, как код был написан
- Пользователь подтвердил готовность (checkpoint approved)
</success_criteria>

<output>
After completion, create `.planning/phases/19-wb-ads/19-W0-SUMMARY.md`
</output>
