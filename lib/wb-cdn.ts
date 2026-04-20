// Заменяет WB CDN URL с full-size (big/, c246x328/, c516x688/) на thumbnail (tm/).
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
