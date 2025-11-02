"use client"

import React, { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { ZoomIn, ZoomOut, RotateCw, X, Check, Wand2, Palette } from "lucide-react"
import { Slider } from "@/components/ui/slider"
import { toast } from "@/components/ui/use-toast"

interface ImageEditorProps {
  isOpen: boolean
  onClose: () => void
  onSave: (imageData: string) => void
  initialImage?: File | string | null
}

export default function ImageEditor({ isOpen, onClose, onSave, initialImage }: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })
  const [backgroundColor, setBackgroundColor] = useState<string | null>(null)
  const [originalImageSrc, setOriginalImageSrc] = useState<string | null>(null)
  const [imageScale, setImageScale] = useState<number | null>(null)
  const [showColorPicker, setShowColorPicker] = useState(false)
  const [originalImageDimensions, setOriginalImageDimensions] = useState<{ width: number; height: number } | null>(null)

  const CARD_ASPECT_RATIO = 3 / 4
  const CANVAS_WIDTH = 600
  const CANVAS_HEIGHT = CANVAS_WIDTH / CARD_ASPECT_RATIO

  // Calculate responsive canvas size
  useEffect(() => {
    const updateSize = () => {
      // Smaller size with 3:4 aspect ratio
      const maxWidth = Math.min(window.innerWidth - 48, 250) // Smaller max width for background
      const width = Math.max(180, maxWidth) // Min width for mobile
      const height = width / CARD_ASPECT_RATIO // Ensure 3:4 ratio
      setContainerSize({ width, height })
    }
    
    if (isOpen) {
      // Small delay to ensure dialog is rendered
      setTimeout(updateSize, 100)
      updateSize()
    }
    
    window.addEventListener('resize', updateSize)
    return () => window.removeEventListener('resize', updateSize)
  }, [isOpen])

  useEffect(() => {
    if (isOpen && initialImage) {
      // Only reset if it's a new image
      const imageKey = initialImage instanceof File ? initialImage.name + initialImage.size : initialImage
      if (originalImageSrc !== imageKey) {
        setBackgroundColor(null)
        setImageScale(null)
        setShowColorPicker(false)
      }
      loadImage(initialImage)
    } else if (!isOpen) {
      // Reset when closing
      setBackgroundColor(null)
      setShowColorPicker(false)
    }
  }, [isOpen, initialImage])

  const loadImage = async (source: File | string) => {
    const img = new Image()
    img.crossOrigin = "anonymous"

    if (source instanceof File) {
      img.src = URL.createObjectURL(source)
    } else {
      img.src = source
    }

    img.onload = () => {
      imageRef.current = img
      const imageKey = source instanceof File ? source.name + source.size : source
      
      // Store original dimensions if this is a new image
      const isNewImage = originalImageSrc !== imageKey
      
      // If this is a base64 data URL (already saved image), check if it's card-sized
      const isDataUrl = typeof source === 'string' && source.startsWith('data:')
      const isCardSized = img.width === CANVAS_WIDTH && img.height === CANVAS_HEIGHT
      
      if (isNewImage) {
        // If it's a card-sized saved image, don't store dimensions so we don't resize
        // Otherwise, store original dimensions
        if (!isDataUrl || !isCardSized) {
          setOriginalImageDimensions({ width: img.width, height: img.height })
        } else {
          // This is a previously saved card image, don't resize it
          setOriginalImageDimensions(null)
        }
      }
      
      setOriginalImageSrc(imageKey)
      setImageLoaded(true)
      // Wait for container size to be set
      setTimeout(() => {
        const width = containerSize.width || 250
        const height = containerSize.height || (250 / CARD_ASPECT_RATIO)
        
        // Only set initial scale if we don't have a saved scale or it's a new image
        if (imageScale === null || isNewImage) {
          // Calculate initial scale to fit image in canvas
          // Use Math.min to ensure image fits inside
          const scaleX = width / img.width
          const scaleY = height / img.height
          // Use the smaller scale to fit the image inside the canvas
          // Limit to 1.0 to prevent enlargement
          const initialScale = Math.min(Math.min(scaleX, scaleY), 1.0)
          setScale(initialScale)
          setImageScale(initialScale)
        } else {
          // Use saved scale
          setScale(imageScale)
        }
        setPosition({ x: width / 2, y: height / 2 })
        drawCanvas()
      }, 150)
    }

    img.onerror = () => {
      console.error("Failed to load image")
      setImageLoaded(false)
    }
  }

  const drawCanvas = () => {
    const canvas = canvasRef.current
    if (!canvas || !imageRef.current || !imageLoaded) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Use actual container size or fallback
    const width = containerSize.width || CANVAS_WIDTH
    const height = containerSize.height || CANVAS_HEIGHT
    
    // Set canvas size
    canvas.width = width
    canvas.height = height

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    // Draw background - either solid color or white
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    } else {
      // Draw white background by default
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, canvas.width, canvas.height)
    }

    // Draw image
    const img = imageRef.current
    const scaledWidth = img.width * scale
    const scaledHeight = img.height * scale
    const x = position.x - scaledWidth / 2
    const y = position.y - scaledHeight / 2

    ctx.save()
    ctx.globalCompositeOperation = "source-over"
    ctx.drawImage(img, x, y, scaledWidth, scaledHeight)
    ctx.restore()
  }

  useEffect(() => {
    drawCanvas()
  }, [scale, position, imageLoaded, containerSize, backgroundColor])

  const getPositionFromEvent = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return null
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!imageLoaded) return
    e.preventDefault()
    setIsDragging(true)
    const pos = getPositionFromEvent(e.clientX, e.clientY)
    if (!pos) return
    setDragStart({
      x: pos.x - position.x,
      y: pos.y - position.y,
    })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !imageLoaded) return
    e.preventDefault()
    const pos = getPositionFromEvent(e.clientX, e.clientY)
    if (!pos) return
    setPosition({
      x: pos.x - dragStart.x,
      y: pos.y - dragStart.y,
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  // Touch handlers for mobile
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!imageLoaded) return
    e.preventDefault()
    setIsDragging(true)
    const touch = e.touches[0]
    const pos = getPositionFromEvent(touch.clientX, touch.clientY)
    if (!pos) return
    setDragStart({
      x: pos.x - position.x,
      y: pos.y - position.y,
    })
  }

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDragging || !imageLoaded) return
    e.preventDefault()
    const touch = e.touches[0]
    const pos = getPositionFromEvent(touch.clientX, touch.clientY)
    if (!pos) return
    setPosition({
      x: pos.x - dragStart.x,
      y: pos.y - dragStart.y,
    })
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev * 1.2, 5))
  }

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev / 1.2, 0.1))
  }

  const removeBackground = async () => {
    if (!imageRef.current || !imageLoaded || !canvasRef.current) {
      toast({
        title: "Error",
        description: "Please wait for image to load",
        variant: "destructive",
      })
      return
    }

    try {
      toast({
        title: "Processing",
        description: "Removing background...",
      })

      // Use the current displayed canvas instead of creating a new one
      // This avoids CORS issues
      const canvas = canvasRef.current
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) {
        toast({
          title: "Error",
          description: "Canvas context not available",
          variant: "destructive",
        })
        return
      }

      // Get image data from current canvas
      let imageData: ImageData
      try {
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      } catch (e: any) {
        console.error('Error getting image data:', e)
        toast({
          title: "Error",
          description: "Cannot access image data. Try reloading the image.",
          variant: "destructive",
        })
        return
      }
      
      const data = imageData.data
      
      // Sample corner pixels to determine background color
      const sampleSize = Math.min(30, Math.floor(canvas.width * 0.08))
      const corners = [
        { x: 0, y: 0, size: sampleSize },
        { x: Math.max(0, canvas.width - sampleSize), y: 0, size: sampleSize },
        { x: 0, y: Math.max(0, canvas.height - sampleSize), size: sampleSize },
        { x: Math.max(0, canvas.width - sampleSize), y: Math.max(0, canvas.height - sampleSize), size: sampleSize },
      ]
      
      const backgroundColors: number[][] = []
      corners.forEach(corner => {
        for (let y = corner.y; y < corner.y + corner.size && y < canvas.height; y++) {
          for (let x = corner.x; x < corner.x + corner.size && x < canvas.width; x++) {
            const idx = (y * canvas.width + x) * 4
            if (idx >= 0 && idx < data.length - 3) {
              backgroundColors.push([data[idx], data[idx + 1], data[idx + 2]])
            }
          }
        }
      })
      
      if (backgroundColors.length === 0) {
        toast({
          title: "Error",
          description: "Could not analyze image",
          variant: "destructive",
        })
        return
      }
      
      // Calculate average background color
      const avgBg = [0, 0, 0]
      backgroundColors.forEach(color => {
        avgBg[0] += color[0]
        avgBg[1] += color[1]
        avgBg[2] += color[2]
      })
      avgBg[0] = Math.floor(avgBg[0] / backgroundColors.length)
      avgBg[1] = Math.floor(avgBg[1] / backgroundColors.length)
      avgBg[2] = Math.floor(avgBg[2] / backgroundColors.length)
      
      console.log('Average background color:', avgBg)
      
      // Threshold for color similarity (adjustable)
      const threshold = 50
      
      // Make background transparent
      let pixelsChanged = 0
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i]
        const g = data[i + 1]
        const b = data[i + 2]
        
        // Calculate color distance (Euclidean)
        const distance = Math.sqrt(
          Math.pow(r - avgBg[0], 2) +
          Math.pow(g - avgBg[1], 2) +
          Math.pow(b - avgBg[2], 2)
        )
        
        // If color is similar to background, make it transparent
        if (distance < threshold) {
          data[i + 3] = 0 // Set alpha to 0 (transparent)
          pixelsChanged++
        }
      }
      
      console.log('Pixels changed:', pixelsChanged)
      
      // Put modified image data back to canvas
      ctx.putImageData(imageData, 0, 0)
      
      // Update the image reference by creating a new image from the modified canvas
      // We need to work with the original image dimensions, not the display canvas size
      if (!imageRef.current) return
      
      const outputCanvas = document.createElement('canvas')
      outputCanvas.width = imageRef.current.width
      outputCanvas.height = imageRef.current.height
      const outputCtx = outputCanvas.getContext('2d', { willReadFrequently: true })
      if (!outputCtx) return
      
      // Create a temporary canvas with original dimensions to process the image
      const tempCanvas = document.createElement('canvas')
      tempCanvas.width = imageRef.current.width
      tempCanvas.height = imageRef.current.height
      const tempCtx = tempCanvas.getContext('2d', { willReadFrequently: true })
      if (!tempCtx) return
      
      // Draw the original image to temp canvas
      tempCtx.drawImage(imageRef.current, 0, 0)
      
      // Get image data from temp canvas
      const tempImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height)
      const tempData = tempImageData.data
      
      // Apply the same background removal logic to the full-resolution image
      const tempSampleSize = Math.min(30, Math.floor(tempCanvas.width * 0.08))
      const tempCorners = [
        { x: 0, y: 0, size: tempSampleSize },
        { x: Math.max(0, tempCanvas.width - tempSampleSize), y: 0, size: tempSampleSize },
        { x: 0, y: Math.max(0, tempCanvas.height - tempSampleSize), size: tempSampleSize },
        { x: Math.max(0, tempCanvas.width - tempSampleSize), y: Math.max(0, tempCanvas.height - tempSampleSize), size: tempSampleSize },
      ]
      
      const tempBackgroundColors: number[][] = []
      tempCorners.forEach(corner => {
        for (let y = corner.y; y < corner.y + corner.size && y < tempCanvas.height; y++) {
          for (let x = corner.x; x < corner.x + corner.size && x < tempCanvas.width; x++) {
            const idx = (y * tempCanvas.width + x) * 4
            if (idx >= 0 && idx < tempData.length - 3) {
              tempBackgroundColors.push([tempData[idx], tempData[idx + 1], tempData[idx + 2]])
            }
          }
        }
      })
      
      if (tempBackgroundColors.length > 0) {
        const tempAvgBg = [0, 0, 0]
        tempBackgroundColors.forEach(color => {
          tempAvgBg[0] += color[0]
          tempAvgBg[1] += color[1]
          tempAvgBg[2] += color[2]
        })
        tempAvgBg[0] = Math.floor(tempAvgBg[0] / tempBackgroundColors.length)
        tempAvgBg[1] = Math.floor(tempAvgBg[1] / tempBackgroundColors.length)
        tempAvgBg[2] = Math.floor(tempAvgBg[2] / tempBackgroundColors.length)
        
        const tempThreshold = 50
        for (let i = 0; i < tempData.length; i += 4) {
          const r = tempData[i]
          const g = tempData[i + 1]
          const b = tempData[i + 2]
          
          const distance = Math.sqrt(
            Math.pow(r - tempAvgBg[0], 2) +
            Math.pow(g - tempAvgBg[1], 2) +
            Math.pow(b - tempAvgBg[2], 2)
          )
          
          if (distance < tempThreshold) {
            tempData[i + 3] = 0
          }
        }
        
        tempCtx.putImageData(tempImageData, 0, 0)
      }
      
      const dataUrl = tempCanvas.toDataURL('image/png')
      const newImg = new Image()
      newImg.onload = () => {
        imageRef.current = newImg
        // Keep current scale and position
        drawCanvas()
        toast({
          title: "Success",
          description: `Background removed (${pixelsChanged} pixels changed)`,
        })
      }
      newImg.onerror = () => {
        toast({
          title: "Error",
          description: "Failed to process image",
          variant: "destructive",
        })
      }
      newImg.src = dataUrl
      
    } catch (error: any) {
      console.error('Error removing background:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to remove background",
        variant: "destructive",
      })
    }
  }

  const colorInputRef = useRef<HTMLInputElement>(null)

  // Removed addBackgroundColor - no longer needed since input is directly in button

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const color = e.target.value
    if (color) {
      setBackgroundColor(color)
      drawCanvas()
    }
  }

  const removeBackgroundColor = () => {
    setBackgroundColor(null)
    drawCanvas()
  }

  const handleSave = () => {
    const canvas = canvasRef.current
    if (!canvas || !imageRef.current) return

    const img = imageRef.current
    
    // Always use fixed card dimensions for output to ensure consistency
    const outputWidth = CANVAS_WIDTH
    const outputHeight = CANVAS_HEIGHT
    
    // Create a new canvas with fixed card dimensions
    const outputCanvas = document.createElement("canvas")
    outputCanvas.width = outputWidth
    outputCanvas.height = outputHeight
    const ctx = outputCanvas.getContext("2d")
    if (!ctx) return

    // Calculate scale factor from display to output
    const displayWidth = containerSize.width || 250
    const displayHeight = containerSize.height || (250 / CARD_ASPECT_RATIO)
    const scaleX = outputWidth / displayWidth
    const scaleY = outputHeight / displayHeight

    // Draw background if specified
    if (backgroundColor) {
      ctx.fillStyle = backgroundColor
      ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height)
    } else {
      // Draw white background by default
      ctx.fillStyle = "#ffffff"
      ctx.fillRect(0, 0, outputCanvas.width, outputCanvas.height)
    }

    // Draw image with scaled position and size
    // Use the original image dimensions (img.width/height) multiplied by the display scale
    // and then scaled to output dimensions
    const scaledWidth = img.width * scale * scaleX
    const scaledHeight = img.height * scale * scaleY
    const x = (position.x * scaleX) - scaledWidth / 2
    const y = (position.y * scaleY) - scaledHeight / 2

    ctx.drawImage(img, x, y, scaledWidth, scaledHeight)

    // Convert to blob
    outputCanvas.toBlob((blob) => {
      if (!blob) return
      const reader = new FileReader()
      reader.onloadend = () => {
        onSave(reader.result as string)
        onClose()
      }
      reader.readAsDataURL(blob)
    }, "image/png")
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] overflow-y-auto p-3 sm:p-4 flex flex-col">
        <DialogHeader className="pb-2 flex-shrink-0">
          <DialogTitle className="text-base sm:text-lg">Edit Card Image</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 flex-1 overflow-y-auto">
          {/* Canvas Container */}
          <div
            ref={containerRef}
            className="relative border-2 border-gray-300 rounded-lg overflow-hidden bg-white mx-auto touch-none flex-shrink-0"
            style={{
              width: containerSize.width || 250,
              height: containerSize.height || (250 / CARD_ASPECT_RATIO),
              maxWidth: '100%',
              aspectRatio: '3/4', // Ensure 3:4 ratio
            }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            <canvas
              ref={canvasRef}
              width={containerSize.width || 250}
              height={containerSize.height || (250 / CARD_ASPECT_RATIO)}
              className="w-full h-full block"
              style={{ cursor: isDragging ? "grabbing" : "grab", touchAction: "none", aspectRatio: '3/4' }}
            />
          </div>

          {/* Controls */}
          <div className="space-y-2 sm:space-y-3 flex-shrink-0">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-3">
              <span className="text-xs sm:text-sm font-medium w-14 sm:w-16">Zoom:</span>
              <div className="flex-1 w-full">
                <Slider
                  value={[scale]}
                  onValueChange={([value]) => setScale(value)}
                  min={0.1}
                  max={5}
                  step={0.1}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleZoomOut} className="h-8 w-8 p-0 sm:h-9 sm:w-9">
                  <ZoomOut className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={handleZoomIn} className="h-8 w-8 p-0 sm:h-9 sm:w-9">
                  <ZoomIn className="h-3 w-3 sm:h-4 sm:w-4" />
                </Button>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex gap-2 justify-end flex-wrap">
                
                <div className="relative">
                  <Button variant="outline" size="sm" className="text-xs sm:text-sm relative" disabled={!imageLoaded}>
                    {/* Color input overlay - clicking anywhere on the button triggers the color picker */}
                    <input
                      ref={colorInputRef}
                      type="color"
                      value={backgroundColor || "#ffffff"}
                      onChange={handleColorChange}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                      style={{ zIndex: 10 }}
                      disabled={!imageLoaded}
                    />
                    <span className="relative z-0 flex items-center">
                      <Palette className="h-3 w-3 sm:h-4 sm:w-4 mr-1 sm:mr-2" />
                      <span className="hidden sm:inline">Background Color</span>
                      <span className="sm:hidden">BG Color</span>
                    </span>
                  </Button>
                  {backgroundColor && (
                    <div 
                      className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 border-white shadow-md z-20"
                      style={{ backgroundColor }}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-2 sm:gap-0 flex-shrink-0 pt-2 border-t">
          <Button variant="outline" onClick={onClose} className="w-full sm:w-auto" size="sm">
            <X className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={!imageLoaded} className="w-full sm:w-auto" size="sm">
            <Check className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

