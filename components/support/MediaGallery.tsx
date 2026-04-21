// components/support/MediaGallery.tsx
// Превью медиа (image/video thumbnails). Клик → открывает MediaLightbox.
// Quick Task 260420-oxd: VIDEO рендерится как <img> (thumbnail из ffmpeg),
// не <video> — быстрый первый paint, без декодирования MP4 браузером.
"use client"

import { useState } from "react"
import { Play } from "lucide-react"
import { MediaLightbox, type LightboxItem } from "./MediaLightbox"

export interface MediaGalleryItem {
  id: string
  src: string // полноразмерный для Lightbox
  thumbnailSrc?: string | null // для превью (fallback на src для IMAGE)
  type: "IMAGE" | "VIDEO" | "DOCUMENT"
  fileName?: string | null
}

interface MediaGalleryProps {
  items: MediaGalleryItem[]
  thumbClassName?: string
  limit?: number
}

export function MediaGallery({
  items,
  thumbClassName = "w-20 h-20",
  limit,
}: MediaGalleryProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  if (items.length === 0) {
    return <span className="text-xs text-muted-foreground">—</span>
  }

  const visible = limit ? items.slice(0, limit) : items
  const rest = limit ? items.length - limit : 0
  const lightboxItems: LightboxItem[] = items.map((i) => ({
    src: i.src,
    type: i.type,
    fileName: i.fileName,
  }))

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {visible.map((m, i) => (
          <button
            key={m.id}
            type="button"
            onClick={() => setOpenIndex(i)}
            className={`${thumbClassName} rounded border overflow-hidden bg-muted relative flex items-center justify-center hover:border-primary transition-colors`}
            title={
              m.type === "VIDEO"
                ? "Видео"
                : m.type === "DOCUMENT"
                  ? (m.fileName ?? "Документ")
                  : "Фото"
            }
          >
            {m.type === "IMAGE" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={m.thumbnailSrc ?? m.src}
                alt=""
                width={96}
                height={96}
                decoding="async"
                loading="lazy"
                className="w-full h-full object-cover"
              />
            ) : m.type === "VIDEO" ? (
              <>
                {m.thumbnailSrc ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={m.thumbnailSrc}
                    alt=""
                    width={96}
                    height={96}
                    decoding="async"
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  // Fallback: серый прямоугольник — НЕ <video>,
                  // чтобы не грузить оригинал видео ради превью.
                  <div className="w-full h-full bg-muted" />
                )}
                <Play className="absolute w-6 h-6 text-white drop-shadow-md fill-white/90" />
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground text-center px-1">
                {m.fileName ?? "PDF"}
              </span>
            )}
          </button>
        ))}
        {rest > 0 && (
          <button
            type="button"
            onClick={() => setOpenIndex(limit ?? 0)}
            className={`${thumbClassName} rounded border bg-muted hover:bg-accent text-xs font-medium flex items-center justify-center`}
          >
            +{rest}
          </button>
        )}
      </div>

      {openIndex !== null && (
        <MediaLightbox
          items={lightboxItems}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
        />
      )}
    </>
  )
}
