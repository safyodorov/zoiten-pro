"use client"

import { motion } from "motion/react"

export function HeroSection() {
  return (
    <section className="min-h-screen bg-gradient-to-b from-gray-950 to-gray-900 flex items-center justify-center">
      <motion.div
        className="text-center px-6"
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      >
        <h1 className="text-6xl md:text-8xl font-bold text-white tracking-widest mb-6">
          ZOITEN
        </h1>
        <p className="text-xl md:text-2xl text-gray-400 italic">
          Время для жизни, свобода от рутины
        </p>
      </motion.div>
    </section>
  )
}
