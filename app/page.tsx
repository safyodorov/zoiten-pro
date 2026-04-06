// app/page.tsx
// Public landing page — no auth required.
// Assembled from client components (motion animations require "use client" in sub-components).
import { LandingHeader } from "@/components/landing/LandingHeader"
import { HeroSection } from "@/components/landing/HeroSection"
import { SectionCards } from "@/components/landing/SectionCards"

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-white">
      <LandingHeader />
      <HeroSection />
      <section className="px-6 pb-24 max-w-6xl mx-auto">
        <SectionCards />
      </section>
    </div>
  )
}
