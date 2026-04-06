"use client"

import * as React from "react"
import { useState, useRef } from "react"
import { toast } from "sonner"
import { X, Upload } from "lucide-react"

interface PhotoUploadFieldProps {
  productId?: string
  currentPhotoUrl?: string | null
  onUploadComplete: (url: string) => void
}

export function PhotoUploadField({
  productId,
  currentPhotoUrl,
  onUploadComplete,
}: PhotoUploadFieldProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentPhotoUrl ?? null)
  const [isUploading, setIsUploading] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function validateAndUpload(file: File) {
    // MIME type check
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Допустимы только JPEG и PNG изображения")
      return
    }

    // Dimension check via Image
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      if (img.width > 2048 || img.height > 2048) {
        toast.error("Фото должно быть не более 2048×2048 пикселей")
        return
      }
      handleUpload(file)
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      toast.error("Не удалось прочитать изображение")
    }
    img.src = objectUrl
  }

  async function handleUpload(file: File) {
    setIsUploading(true)
    const formData = new FormData()
    formData.append("productId", productId ?? "new")
    formData.append("file", file)
    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData })
      if (res.ok) {
        const { url } = await res.json()
        setPreviewUrl(url)
        onUploadComplete(url)
      } else {
        const data = await res.json().catch(() => ({}))
        toast.error(data.error ?? "Ошибка загрузки фото")
      }
    } catch {
      toast.error("Ошибка загрузки фото")
    }
    setIsUploading(false)
  }

  function handleDragOver(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    if (isUploading) return
    const file = e.dataTransfer.files?.[0]
    if (file) {
      validateAndUpload(file)
    }
  }

  function handleClick() {
    if (isUploading) return
    inputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) {
      validateAndUpload(file)
    }
    // Reset input so the same file can be re-selected
    e.target.value = ""
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    setPreviewUrl(null)
  }

  return (
    <div style={{ aspectRatio: "3/4", maxWidth: "200px" }} className="relative">
      {previewUrl ? (
        <div className="relative w-full h-full">
          <img
            src={previewUrl}
            alt="Фото товара"
            className="w-full h-full object-cover rounded-md"
          />
          {/* Overlay X button */}
          <button
            type="button"
            onClick={handleClear}
            className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 transition-colors"
            aria-label="Удалить фото"
          >
            <X className="h-4 w-4" />
          </button>
          {/* Uploading overlay */}
          {isUploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-md">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-white border-t-transparent" />
            </div>
          )}
        </div>
      ) : (
        <div
          onClick={handleClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={[
            "w-full h-full flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed cursor-pointer transition-colors",
            isDragOver
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/30 hover:border-primary/50",
            isUploading ? "opacity-50 cursor-not-allowed" : "",
          ].join(" ")}
        >
          {isUploading ? (
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          ) : (
            <>
              <Upload className="h-8 w-8 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center px-2 leading-tight">
                Перетащите фото или нажмите для выбора
              </p>
            </>
          )}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={handleFileChange}
      />
    </div>
  )
}
