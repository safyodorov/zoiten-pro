// app/page.tsx
// Public landing page — no auth required.
// h-screen layout: header + 3D hero + module buttons at bottom
import { LandingHeader } from "@/components/landing/LandingHeader"
import { HeroSection } from "@/components/landing/HeroSection"
import { SectionCards } from "@/components/landing/SectionCards"

export default function LandingPage() {
  return (
    <div className="h-screen flex flex-col bg-background overflow-hidden">
      <LandingHeader />
      <HeroSection />
      <SectionCards />
    </div>
  )
}
