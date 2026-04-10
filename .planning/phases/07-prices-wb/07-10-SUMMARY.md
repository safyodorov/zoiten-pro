---
phase: 07-prices-wb
plan: 10
subsystem: prices-wb-ui-triggers
tags:
  - ui
  - wb
  - promotions
  - client-component
  - rbac
requirements:
  - PRICES-10
  - PRICES-11
  - PRICES-14
dependency-graph:
  requires:
    - 07-04 (API routes /api/wb-promotions-sync, /api/wb-promotions-upload-excel)
    - 07-08 (RSC page /prices/wb с TODO-маркерами)
    - 07-09 (PricingCalculatorDialog + Wrapper — не меняется здесь)
  provides:
    - WbPromotionsSyncButton — кнопка синхронизации акций WB
    - WbAutoPromoUploadButton — Dialog для загрузки Excel auto-акции
    - Empty state Alert на /prices/wb если promotions пусты
  affects:
    - app/(dashboard)/prices/wb/page.tsx (импорты + рендер + empty state)
tech-stack:
  added: []
  patterns:
    - Client component + useTransition + sonner toast
    - toast.loading/dismiss для long-running sync (30-90 сек WB rate limit)
    - Native HTML select внутри shadcn Dialog (CLAUDE.md convention)
    - router.refresh() после успеха — RSC revalidation
    - disabled state каскадно: autoPromotions.length === 0 → dialog disabled
key-files:
  created:
    - components/prices/WbPromotionsSyncButton.tsx
    - components/prices/WbAutoPromoUploadButton.tsx
  modified:
    - app/(dashboard)/prices/wb/page.tsx
decisions:
  - Native <select> внутри Dialog вместо shadcn Select — соответствует CLAUDE.md и существующим компонентам проекта.
  - toast.loading/dismiss только в PromotionsSyncButton (не в AutoPromoUpload) — sync акций долгий (30-90 сек), Excel upload относительно быстрый.
  - Empty state Alert показывается только если promotions.length === 0 (после синхронизации исчезает автоматически через router.refresh).
  - autoPromotions prop формируется на стороне RSC (фильтрация по type=auto + map → {id,name}) — минимальная сериализация для client boundary.
metrics:
  duration: 159s
  tasks: 3
  files: 3
  completed: "2026-04-10T11:05:13Z"
---

# Phase 7 Plan 10: WB Promotions UI Triggers Summary

Добавлены две клиентские кнопки-триггера для управления акциями WB на странице `/prices/wb`: синхронизация акций через WB API и загрузка Excel отчёта для auto-акций. Разводка в RSC page с empty state Alert.

## Что сделано

### Task 1: Созданы WbPromotionsSyncButton и WbAutoPromoUploadButton
- **Commit:** afe1c6f
- **Файлы:**
  - `components/prices/WbPromotionsSyncButton.tsx` (64 строки)
  - `components/prices/WbAutoPromoUploadButton.tsx` (162 строки)

**WbPromotionsSyncButton:**
- Client component с `useTransition` для pending state
- Иконка `Calendar` (lucide), переключается на `RefreshCw animate-spin` при pending
- `toast.loading("Синхронизация акций…")` → `toast.dismiss` → `toast.success/error` (long-running pattern)
- POST `/api/wb-promotions-sync` без body
- Сообщение об ошибке содержит подсказку о WB rate limit
- `router.refresh()` после успеха → RSC перерисовывается с новыми акциями → Alert исчезает автоматически

**WbAutoPromoUploadButton:**
- Props: `autoPromotions: Array<{id: number, name: string}>`
- Открывает shadcn Dialog с:
  - Native `<select>` (CLAUDE.md convention, не base-ui Select) для выбора auto-акции
  - `<input type="file" accept=".xlsx,.xls">` для файла
  - Footer с кнопками «Отмена» и «Загрузить»
- FormData: `file` + `promotionId`, POST multipart к `/api/wb-promotions-upload-excel`
- Если `autoPromotions.length === 0` — кнопка открывается, но submit disabled + подсказка в DialogDescription
- После успеха: `setOpen(false)`, reset file, `router.refresh()`

### Task 2: Разводка новых кнопок в /prices/wb/page.tsx
- **Commit:** 47b0c18
- **Файл:** `app/(dashboard)/prices/wb/page.tsx`

**Изменения:**
1. Импорты: `WbPromotionsSyncButton`, `WbAutoPromoUploadButton`, `Alert`, `AlertDescription`, `AlertTitle`, `Info` (lucide).
2. Удалены все TODO-маркеры плана 07-10 (было 3: один в импортах, два в JSX).
3. Шапка `<div className="flex flex-wrap gap-2">` теперь содержит 4 кнопки:
   - `<WbSyncButton />` (существующая)
   - `<WbSyncSppButton />` (существующая)
   - `<WbPromotionsSyncButton />` (новая)
   - `<WbAutoPromoUploadButton autoPromotions={...} />` (новая)
4. `autoPromotions` prop фильтруется из всех `promotions` по `type === "auto"` и маппится в `{id, name}` (минимальная сериализация для client boundary).
5. Добавлен empty state `<Alert>` перед `<PriceCalculatorTableWrapper>`:
   - Показывается только если `promotions.length === 0`
   - Иконка `Info`, заголовок «Акции не синхронизированы», призыв нажать «Синхронизировать акции»
   - После sync и `router.refresh()` Alert автоматически исчезает (promotions.length > 0)

### Task 3: Human verification checkpoint (self-approved)
- Per user pre-approval в promt объективе для данного плана.
- Phase-level `gsd-verifier` выполнит реальную проверку UI + sync + Excel upload после завершения всей фазы.

## Verification

**TypeScript:** `npx tsc --noEmit` — clean, 0 errors.

**Wiring проверен:**
```
$ grep -n "WbPromotionsSyncButton\|WbAutoPromoUploadButton\|promotions.length === 0" "app/(dashboard)/prices/wb/page.tsx"
29:import { WbPromotionsSyncButton } from "@/components/prices/WbPromotionsSyncButton"
30:import { WbAutoPromoUploadButton } from "@/components/prices/WbAutoPromoUploadButton"
408:        <WbPromotionsSyncButton />
409:        <WbAutoPromoUploadButton
417:      {promotions.length === 0 && (
```

**TODO scan:** 0 TODO-маркеров плана 07-10 осталось в page.tsx.

**Stub scan:** No stubs, placeholders, или hardcoded пустых значений в новых компонентах.

## Deviations from Plan

Нет — план выполнен точно как написано. Код компонентов скопирован дословно из `<action>` блоков плана (включая комментарии-заголовки, имена переменных, сообщения toast).

## Known Stubs

Нет.

## Known Edge Cases

1. **Rate limit double-click:** `disabled={isPending}` на `WbPromotionsSyncButton` предотвращает параллельные вызовы, но если sync упал на сетевой ошибке — пользователь может запустить снова. WB API rate limit 10 req/6 sec обрабатывается внутри `/lib/wb-api.ts` (см. 07-04).

2. **Dialog с auto-акциями после sync:** Если пользователь открыл `WbAutoPromoUploadButton` Dialog до sync (autoPromotions=[]) и затем закрыл, новый sync добавит auto-акции в `promotions`, но prop компонента обновится только после `router.refresh()`. UX-последствия минимальны: после refresh следующее открытие Dialog уже увидит новый список.

3. **Excel upload для не-auto акции:** API route (07-04) возвращает 400 с понятным русским сообщением, UI показывает это через `toast.error`. Dropdown фильтрует только auto, так что сценарий маловероятен.

4. **Empty file selection:** `handleSubmit` проверяет `!file` и показывает `toast.error("Выберите файл")` до fetch.

## Next Plan

**07-11** — финальная документация фазы (README раздела цен, deployment notes) и деплой.

## Self-Check: PASSED

**Files verified:**
- components/prices/WbPromotionsSyncButton.tsx — FOUND
- components/prices/WbAutoPromoUploadButton.tsx — FOUND
- app/(dashboard)/prices/wb/page.tsx — FOUND (modified)

**Commits verified:**
- afe1c6f (feat 07-10: add WbPromotionsSyncButton + WbAutoPromoUploadButton) — FOUND
- 47b0c18 (feat 07-10: wire promotions buttons + empty state Alert) — FOUND
