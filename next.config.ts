import type { NextConfig } from "next"

const nextConfig: NextConfig = {
  output: "standalone",
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
