"use client"

import * as React from "react"
import { useState, useRef } from "react"
import { toast } from "sonner"
import { X, Upload } from "lucide-react"
import { PhotoCropDialog } from "@/components/products/PhotoCropDialog"

const ASPECT = 3 / 4
const ASPECT_TOLERANCE = 0.02
const MAX_DIM = 2048

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

  // Состояние кроппера
  const [cropSrc, setCropSrc] = useState<string | null>(null)
  const [cropOpen, setCropOpen] = useState(false)

  function handleFileSelected(file: File) {
    if (!["image/jpeg", "image/png"].includes(file.type)) {
      toast.error("Допустимы только JPEG и PNG изображения")
      return
    }

    const objectUrl = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      const w = img.naturalWidth
      const h = img.naturalHeight
      const ratio = w / h
      const needsCrop = Math.abs(ratio - ASPECT) > ASPECT_TOLERANCE
      const needsResize = w > MAX_DIM || h > MAX_DIM

      if (!needsCrop && !needsResize) {
        // Формат и размер ОК — загружаем напрямую
        URL.revokeObjectURL(objectUrl)
        uploadFile(file)
      } else {
        // Открываем кроппер
        setCropSrc(objectUrl)
        setCropOpen(true)
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      toast.error("Не удалось прочитать изображение")
    }
    img.src = objectUrl
  }

  function handleCropConfirm(blob: Blob) {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropOpen(false)
    setCropSrc(null)
    const file = new File([blob], "photo.jpg", { type: "image/jpeg" })
    uploadFile(file)
  }

  function handleCropCancel() {
    if (cropSrc) URL.revokeObjectURL(cropSrc)
    setCropOpen(false)
    setCropSrc(null)
  }

  async function uploadFile(file: File) {
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
    if (file) handleFileSelected(file)
  }

  function handleClick() {
    if (isUploading) return
    inputRef.current?.click()
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFileSelected(file)
    e.target.value = ""
  }

  function handleClear(e: React.MouseEvent) {
    e.stopPropagation()
    setPreviewUrl(null)
    onUploadComplete("")
  }

  return (
    <>
      <div style={{ aspectRatio: "3/4", maxWidth: "200px" }} className="relative">
        {previewUrl ? (
          <div className="relative w-full h-full">
            <img
              src={previewUrl}
              alt="Фото товара"
              className="w-full h-full object-cover rounded-md"
            />
            <button
              type="button"
              onClick={handleClear}
              className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 hover:bg-black/80 transition-colors"
              aria-label="Удалить фото"
            >
              <X className="h-4 w-4" />
            </button>
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

      {cropSrc && (
        <PhotoCropDialog
          open={cropOpen}
          imageSrc={cropSrc}
          onConfirm={handleCropConfirm}
          onCancel={handleCropCancel}
        />
      )}
    </>
  )
}
