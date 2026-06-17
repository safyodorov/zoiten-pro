import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
  // VPS 2 ГБ: type-check + lint внутри `next build` упирались в OOM
  // (FATAL heap out of memory на фазе «Linting and checking validity of types»).
  // Типы проверяются локально через `npx tsc --noEmit` ПЕРЕД каждым деплоем,
  // поэтому повторную проверку в сборке отключаем — убирает пик памяти.
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  // pdfkit/sharp — нативные/с data-файлами: не бандлим, тянем из node_modules в рантайме
  // (иначе pdfkit не находит свои .afm/шрифтовые данные в standalone).
  serverExternalPackages: ["pdfkit", "sharp"],
  async redirects() {
    return [
      {
        source: "/inventory/:path*",
        destination: "/stock/:path*",
        permanent: true, // 308 permanent redirect
      },
    ]
  },
}

export default nextConfig
