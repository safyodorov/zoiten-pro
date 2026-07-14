# Phase 30 — Plan 13 Summary (Wave 6: включение RBAC-раздела)

**Status:** ✅ executed (tsc чист; `next build` зелёный; grep-аудит гейтинга зелёный).

## Файлы (правки аппендом — минимум пересечений с параллельной контент-сессией)
- `lib/sections.ts` — `SECTION_PATHS += "/analytics": "ANALYTICS"` (edge-safe; middleware подхватывает по startsWith).
- `components/layout/nav-items.ts` — `NAV_ITEMS += { section:"ANALYTICS", href:"/analytics", label:"Аналитика", icon:"BarChart3" }` (BarChart3 уже в ICON_MAP).
- `lib/section-labels.ts` — `SECTION_OPTIONS += { value:"ANALYTICS", label:"Аналитика" }` (тумблер VIEW/MANAGE в /admin/users).

## Карта путь → минимальная роль (аудит зелёный)
| Путь | Роль |
|------|------|
| `/analytics`, `/analytics/upload`, `/analytics/runs/[id]` (RSC) | VIEW |
| `POST /api/analytics/upload` | VIEW |
| `GET /api/analytics/runs/[id]/status` | VIEW |
| `GET /api/analytics/runs/[id]/pdf` | VIEW |
| `startNicheRun`, `saveMpstatsToken`, `markNicheRunFailed` | **MANAGE** |

## Осталось (прод-смок при деплое)
- `ALTER TYPE "ERP_SECTION" ADD VALUE 'ANALYTICS'` + `CREATE TABLE "NicheRun"` — миграция `20260713_phase30_analytics` применяется на проде через `prisma migrate deploy`.
- Смок: curl `/analytics` без гранта → 307/403; SUPERADMIN + грант ANALYTICS → раздел виден; запуск без MANAGE → отказ.
- После выдачи прав получатель ОБЯЗАН перелогиниться (JWT не самообновляется).
