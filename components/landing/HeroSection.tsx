"use client"

import { motion } from "motion/react"
import dynamic from "next/dynamic"

const Scene3D = dynamic(
  () => import("@/components/landing/Scene3D").then((m) => m.Scene3D),
  { ssr: false }
)

export function HeroSection() {
  return (
    <section className="relative flex-1 flex items-center justify-center overflow-hidden">
      {/* 3D Background */}
      <Scene3D />

      {/* Text Overlay */}
      <motion.div
        className="relative z-10 text-center px-6 pointer-events-none"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <h1 className="text-6xl md:text-8xl font-bold tracking-widest mb-4 text-foreground drop-shadow-lg">
          ZOITEN
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground italic">
          Время для жизни, свобода от рутины
        </p>
      </motion.div>
    </section>
  )
}
