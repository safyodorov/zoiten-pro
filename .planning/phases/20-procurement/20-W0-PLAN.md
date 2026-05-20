---
phase: 20-procurement
plan: W0
type: execute
wave: 1
depends_on: []
files_modified:
  - .planning/phases/20-procurement/20-W0-NOTES.md
autonomous: false
requirements:
  - D-09  # CBR currency rate sync (CONTEXT.md)
must_haves:
  truths:
    - "CBR endpoint https://www.cbr-xml-daily.ru/daily_json.js доступен через curl с VPS"
    - "Shape ответа подтверждён: Valute.{CODE}.{Nominal, Value, CharCode, Name}"
    - "Latency приемлемый (<5s)"
    - "User подтвердил что endpoint живой (или принял решение использовать XML fallback)"
  artifacts:
    - path: ".planning/phases/20-procurement/20-W0-NOTES.md"
      provides: "Зафиксированный shape JSON + примеры значений + решение пользователя"
  key_links:
    - from: "lib/cbr-rates.ts (Plan 20-02)"
      to: "https://www.cbr-xml-daily.ru/daily_json.js"
      via: "fetch с JSON parsing"
      pattern: "Valute\\.[A-Z]{3}\\.Value"
---

<objective>
Wave 0 — Smoke check ЦБ РФ API эндпоинта перед началом схемы/реализации. Проверить что endpoint живой, shape соответствует ожиданиям из CONTEXT.md D-09, latency приемлемый, нет блокировок по IP/User-Agent.

Purpose: Защита от ситуации где основная логика 20-02 (CurrencyRate sync) реализована, а на проде endpoint не работает (404, изменился shape, требует auth). Wave 0 завершается checkpoint'ом с user'ом.

Output: 20-W0-NOTES.md с зафиксированным shape, примером JSON для 3-х валют (CNY/USD/EUR), curl команда для воспроизведения, latency измерения.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/phases/20-procurement/20-CONTEXT.md
</context>

<tasks>

<task type="auto">
  <name>Task W0-1: Probe CBR JSON endpoint</name>
  <read_first>
    - .planning/phases/20-procurement/20-CONTEXT.md (D-09 decision + canonical_refs)
  </read_first>
  <files>.planning/phases/20-procurement/20-W0-NOTES.md</files>
  <action>
    Выполнить curl probe ЦБ РФ daily JSON endpoint:

    ```bash
    curl -s -w "\n---\nHTTP: %{http_code}\nTime: %{time_total}s\nSize: %{size_download} bytes\n" \
      -o /tmp/cbr-daily.json \
      https://www.cbr-xml-daily.ru/daily_json.js
    ```

    Затем извлечь shape:

    ```bash
    # Топ-level ключи
    cat /tmp/cbr-daily.json | python3 -c "import json,sys; d=json.load(sys.stdin); print('TOP:', list(d.keys()))"

    # CNY/USD/EUR values
    cat /tmp/cbr-daily.json | python3 -c "import json,sys; d=json.load(sys.stdin); v=d['Valute']; [print(c, json.dumps(v[c], ensure_ascii=False)) for c in ['CNY','USD','EUR']]"
    ```

    Зафиксировать всё в `.planning/phases/20-procurement/20-W0-NOTES.md` со структурой:

    ```markdown
    # Phase 20 Wave 0 — CBR API Smoke Check

    **Date:** 2026-05-20
    **Endpoint:** https://www.cbr-xml-daily.ru/daily_json.js

    ## HTTP Response
    - Status: {200}
    - Time: {X.Xs}
    - Size: {N bytes}

    ## Top-level keys
    {array}

    ## Sample (Valute.CNY)
    ```json
    {
      "ID": "...",
      "NumCode": "156",
      "CharCode": "CNY",
      "Nominal": 1,
      "Name": "Китайский юань",
      "Value": 12.3456,
      "Previous": 12.2345
    }
    ```

    ## Sample (Valute.USD)
    ...

    ## Sample (Valute.EUR)
    ...

    ## Date field
    PreviousURL: "..."
    Timestamp: "..."
    Date: "..." (ISO 8601)
    PreviousDate: "..."

    ## Recommendations
    - Use field `Date` (root) для date в CurrencyRate.date — parse YYYY-MM-DD
    - Use Valute.{CODE}.Nominal + Value для rateToRub = Value / Nominal
    - CharCode совпадает с CONTEXT.md D-09 code (CNY/USD/EUR/...)
    ```

    Если HTTP != 200 или JSON parse fail — записать ошибку и поднять blocker.
  </action>
  <verify>
    <automated>test -f .planning/phases/20-procurement/20-W0-NOTES.md && grep -q "CharCode" .planning/phases/20-procurement/20-W0-NOTES.md && grep -q "Valute" .planning/phases/20-procurement/20-W0-NOTES.md</automated>
  </verify>
  <done>20-W0-NOTES.md создан с HTTP 200, shape зафиксирован, CNY/USD/EUR values вытащены</done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task W0-2: User review smoke check</name>
  <files>.planning/phases/20-procurement/20-W0-NOTES.md</files>
  <action>HUMAN-ONLY: пользователь читает результаты в 20-W0-NOTES.md и подтверждает или указывает alternative источник</action>
  <what-built>20-W0-NOTES.md содержит результаты пробы CBR JSON endpoint</what-built>
  <how-to-verify>
    1. Открыть .planning/phases/20-procurement/20-W0-NOTES.md
    2. Подтвердить:
       - Status 200 OK (а не 404/403/blocked)
       - Latency < 5s
       - CNY/USD/EUR имеют валидные значения Value
       - Date field present
    3. Если всё ок → ввести "approved", Plan 20-02 продолжит работу с подтверждённым контрактом
    4. Если endpoint deprecated/блокируется/изменился shape → описать issue, обсудить альтернативу:
       - https://www.cbr.ru/scripts/XML_daily.asp?date_req=DD/MM/YYYY (raw XML)
       - https://api.openexchangerates.org/* (paid)
       - Manual upload через UI
  </how-to-verify>
  <resume-signal>Type "approved" или укажи alternative источник для CurrencyRate</resume-signal>
  <verify>
    <automated>test -f .planning/phases/20-procurement/20-W0-NOTES.md</automated>
  </verify>
  <done>User signed off (typed approved) или предложил alternative</done>
</task>

</tasks>

<verification>
- 20-W0-NOTES.md существует, заполнен
- User дал approve или указал alternative
- Решение зафиксировано в STATE.md для Plan 20-02
</verification>

<success_criteria>
- CBR endpoint shape подтверждён ИЛИ user указал alternative
- Никакого guesswork в Plan 20-02 (lib/cbr-rates.ts) — implementation против реального contract
</success_criteria>

<output>
After completion, create `.planning/phases/20-procurement/20-W0-SUMMARY.md`
</output>
