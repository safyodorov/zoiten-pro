// Phase 19 / Plan 19-05: /ads → redirect на /ads/wb (WB — единственный активный provider).
import { redirect } from "next/navigation"

export default function AdsRootPage() {
  redirect("/ads/wb")
}
