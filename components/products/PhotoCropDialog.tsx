"use client"

import { useState, useRef, useCallback } from "react"
import ReactCrop, { type Crop, type PixelCrop, centerCrop, makeAspectCrop } from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"

const ASPECT = 3 / 4
const MAX_DIM = 2048

interface PhotoCropDialogProps {
  open: boolean
  imageSrc: string
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

function centerAspectCrop(mediaWidth: number, mediaHeight: number): Crop {
  return centerCrop(
    makeAspectCrop(
      { unit: "%", width: 90 },
      ASPECT,
      mediaWidth,
      mediaHeight
    ),
    mediaWidth,
    mediaHeight
  )
}

export function PhotoCropDialog({
  open,
  imageSrc,
  onConfirm,
  onCancel,
}: PhotoCropDialogProps) {
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<PixelCrop>()
  const imgRef = useRef<HTMLImageElement>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const onImageLoad = useCallback((e: React.SyntheticEvent<HTMLImageElement>) => {
    const { naturalWidth, naturalHeight } = e.currentTarget
    const initialCrop = centerAspectCrop(naturalWidth, naturalHeight)
    setCrop(initialCrop)
  }, [])

  async function handleConfirm() {
    const image = imgRef.current
    if (!image || !completedCrop) return

    setIsProcessing(true)

    const canvas = document.createElement("canvas")
    const scaleX = image.naturalWidth / image.width
    const scaleY = image.naturalHeight / image.height

    // Реальные пиксели области обрезки
    let cropW = completedCrop.width * scaleX
    let cropH = completedCrop.height * scaleY
    const cropX = completedCrop.x * scaleX
    const cropY = completedCrop.y * scaleY

    // Ограничиваем до MAX_DIM, сохраняя пропорции
    let outW = cropW
    let outH = cropH
    if (outW > MAX_DIM || outH > MAX_DIM) {
      const scale = Math.min(MAX_DIM / outW, MAX_DIM / outH)
      outW = Math.round(outW * scale)
      outH = Math.round(outH * scale)
    }

    canvas.width = outW
    canvas.height = outH

    const ctx = canvas.getContext("2d")
    if (!ctx) {
      setIsProcessing(false)
      return
    }

    ctx.drawImage(image, cropX, cropY, cropW, cropH, 0, 0, outW, outH)

    canvas.toBlob(
      (blob) => {
        setIsProcessing(false)
        if (blob) onConfirm(blob)
      },
      "image/jpeg",
      0.9
    )
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(isOpen) => {
        if (!isOpen) onCancel()
      }}
    >
      <DialogContent className="sm:max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Обрезка фото (3:4)</DialogTitle>
        </DialogHeader>

        <div className="flex justify-center max-h-[60vh] overflow-auto">
          <ReactCrop
            crop={crop}
            onChange={(c) => setCrop(c)}
            onComplete={(c) => setCompletedCrop(c)}
            aspect={ASPECT}
            minHeight={50}
          >
            <img
              ref={imgRef}
              src={imageSrc}
              alt="Обрезка"
              onLoad={onImageLoad}
              style={{ maxHeight: "60vh", maxWidth: "100%" }}
            />
          </ReactCrop>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={isProcessing}>
            Отмена
          </Button>
          <Button onClick={handleConfirm} disabled={isProcessing || !completedCrop}>
            {isProcessing ? "Обработка..." : "Сохранить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
