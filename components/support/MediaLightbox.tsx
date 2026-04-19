// components/support/MediaLightbox.tsx
// Fullscreen лента медиа (image/video) с prev/next навигацией.
// Клавиатура: ← → листать, Esc закрыть.
"use client"

import { useEffect, useCallback } from "react"
import { ChevronLeft, ChevronRight, X } from "lucide-react"

export interface LightboxItem {
  src: string
  type: "IMAGE" | "VIDEO" | "DOCUMENT"
  fileName?: string | null
}

interface MediaLightboxProps {
  items: LightboxItem[]
  index: number
  onClose: () => void
  onNavigate: (nextIndex: number) => void
}

export function MediaLightbox({
  items,
  index,
  onClose,
  onNavigate,
}: MediaLightboxProps) {
  const prev = useCallback(() => {
    if (index > 0) onNavigate(index - 1)
  }, [index, onNavigate])

  const next = useCallback(() => {
    if (index < items.length - 1) onNavigate(index + 1)
  }, [index, items.length, onNavigate])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose()
      else if (e.key === "ArrowLeft") prev()
      else if (e.key === "ArrowRight") next()
    }
    document.addEventListener("keydown", onKey)
    // Disable body scroll while lightbox is open
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose, prev, next])

  if (!items.length) return null
  const item = items[index]
  if (!item) return null

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      {/* Close */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClose()
        }}
        className="absolute top-4 right-4 z-10 text-white/80 hover:text-white p-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        aria-label="Закрыть"
      >
        <X className="w-6 h-6" />
      </button>

      {/* Counter */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 text-white/70 text-sm font-mono">
        {index + 1} / {items.length}
      </div>

      {/* Prev */}
      {index > 0 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            prev()
          }}
          className="absolute left-4 z-10 text-white/80 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="Предыдущее"
        >
          <ChevronLeft className="w-8 h-8" />
        </button>
      )}

      {/* Content */}
      <div
        className="max-w-[90vw] max-h-[90vh] flex items-center justify-center"
        onClick={(e) => e.stopPropagation()}
      >
        {item.type === "VIDEO" ? (
          <video
            src={item.src}
            controls
            autoPlay
            className="max-w-full max-h-[90vh] rounded"
          />
        ) : item.type === "DOCUMENT" ? (
          <a
            href={item.src}
            target="_blank"
            rel="noreferrer"
            className="px-6 py-4 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm"
          >
            {item.fileName ?? "Открыть документ"}
          </a>
        ) : (
          // IMAGE
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={item.src}
            alt=""
            className="max-w-full max-h-[90vh] object-contain rounded"
          />
        )}
      </div>

      {/* Next */}
      {index < items.length - 1 && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            next()
          }}
          className="absolute right-4 z-10 text-white/80 hover:text-white p-3 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
          aria-label="Следующее"
        >
          <ChevronRight className="w-8 h-8" />
        </button>
      )}
    </div>
  )
}
