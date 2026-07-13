// lib/analytics/snapshot.ts
// Phase 30 (analytics) — иммутабельный payload прогона ниши (NicheRun.payloadJson, ANL-05).
// Pure: ТОЛЬКО type-импорты (стираются компилятором → vitest не тянет Prisma).
// Version-guard по образцу lib/finance-weekly/snapshot.ts: при несовпадении version
// парсер возвращает null (страница уходит в fallback / показывает «снапшот устарел»).
// При изменении формы SkuPayload/NicheRunPayload — инкрементировать NICHE_RUN_SNAPSHOT_VERSION (types.ts).
import {
  NICHE_RUN_SNAPSHOT_VERSION,
  type NicheRunPayload,
  type SkuPayload,
} from "./types"

/**
 * Собирает иммутабельный payload прогона (1:1, без трансформаций/округлений —
 * display-форматирование делает UI). version проставляется из константы.
 */
export function buildNicheRunPayload(
  skus: SkuPayload[],
  dateFrom: string,
  dateTo: string,
): NicheRunPayload {
  return {
    version: NICHE_RUN_SNAPSHOT_VERSION,
    dateFrom,
    dateTo,
    skus,
  }
}

/**
 * Типизированный parse с version-guard: не объект / version !== текущей / skus не массив → null.
 * Никаких мутаций — снапшот иммутабелен.
 */
export function parseNicheRunPayload(json: unknown): NicheRunPayload | null {
  if (typeof json !== "object" || json === null || Array.isArray(json)) return null
  const obj = json as Record<string, unknown>
  if (obj.version !== NICHE_RUN_SNAPSHOT_VERSION) return null
  if (!Array.isArray(obj.skus)) return null
  return obj as unknown as NicheRunPayload
}
