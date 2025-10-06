"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, Replace, Trash2, Star } from "lucide-react"
import { renderStars } from "@/utils/card-stars"

// Card image URL processing function
const getCardImageUrl = (imageUrl?: string) => {
  if (!imageUrl) return "/placeholder.svg";
  
  // Wenn schon http, dann direkt zurückgeben
  if (imageUrl.startsWith("http")) {
    return imageUrl
  }
  
  // Remove leading slash and any world_soccer/world-soccer prefix
  let cleaned = imageUrl.replace(/^\/?(world[-_]?soccer\/)/i, "")
  
  // Remove any leading slashes to avoid double slashes
  cleaned = cleaned.replace(/^\/+/, "")
  
  return `https://ani-labs.xyz/${encodeURIComponent(cleaned)}`;
};

interface SquadCardMenuProps {
  isOpen: boolean
  onClose: () => void
  card: any
  position: string
  onRemove: (position: string) => void
  onReplace: (position: string) => void
}

export default function SquadCardMenu({
  isOpen,
  onClose,
  card,
  position,
  onRemove,
  onReplace
}: SquadCardMenuProps) {
  const [isRemoving, setIsRemoving] = useState(false)
  const [isReplacing, setIsReplacing] = useState(false)

  const handleRemove = async () => {
    setIsRemoving(true)
    try {
      await onRemove(position)
      onClose()
    } catch (error) {
      console.error("Error removing card:", error)
    } finally {
      setIsRemoving(false)
    }
  }

  const handleReplace = async () => {
    setIsReplacing(true)
    try {
      await onReplace(position)
      onClose()
    } catch (error) {
      console.error("Error replacing card:", error)
    } finally {
      setIsReplacing(false)
    }
  }

  const getPositionName = (pos: string) => {
    switch (pos) {
      case 'GK': return 'Goalkeeper'
      case 'DF1':
      case 'DF2':
      case 'DF3':
      case 'DF4': return 'Defender'
      case 'MF1':
      case 'MF2':
      case 'MF3':
      case 'MF4': return 'Midfielder'
      case 'FW1':
      case 'FW2': return 'Forward'
      default: return pos
    }
  }

  const getPositionColor = (pos: string) => {
    switch (pos) {
      case 'GK': return 'border-yellow-400 bg-yellow-500/20'
      case 'DF1':
      case 'DF2':
      case 'DF3':
      case 'DF4': return 'border-blue-400 bg-blue-500/20'
      case 'MF1':
      case 'MF2':
      case 'MF3':
      case 'MF4': return 'border-green-400 bg-green-500/20'
      case 'FW1':
      case 'FW2': return 'border-red-400 bg-red-500/20'
      default: return 'border-gray-400 bg-gray-500/20'
    }
  }

  // Don't render if no card is provided
  if (!card) {
    return null;
  }

  // Debug logging
  console.log('SquadCardMenu card data:', {
    name: card.name,
    imageUrl: card.imageUrl,
    image_url: card.image_url,
    rarity: card.rarity,
    level: card.level,
    character: card.character
  });

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-black/90 border-yellow-500 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-yellow-300 flex items-center gap-2">
            <Badge className={getPositionColor(position)}>
              {getPositionName(position)}
            </Badge>
            Squad Management
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Card Display */}
          {card && (
            <div className="flex items-center gap-4 p-4 bg-black/50 rounded-xl border border-yellow-500/50">
              <div className="w-16 h-24 rounded-lg overflow-hidden border-2 border-yellow-400">
                <img
                  src={getCardImageUrl(card.imageUrl || card.image_url)}
                  alt={card.name || "Card"}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    console.log('SquadCardMenu image error:', card.imageUrl || card.image_url);
                    e.currentTarget.src = "/placeholder.svg";
                  }}
                  onLoad={() => {
                    console.log('SquadCardMenu image loaded successfully:', card.imageUrl || card.image_url);
                  }}
                />
              </div>
              <div className="flex-1">
                <h3 className="font-bold text-yellow-300">{card.name || "Unknown Card"}</h3>
                <p className="text-sm text-gray-300">{card.character || ""}</p>
                <div className="flex items-center gap-2 mt-1">
                  <Badge variant="outline" className="text-xs border-yellow-400 text-yellow-300">
                    {card.rarity || "Unknown"}
                  </Badge>
                  <div className="flex items-center">
                    {renderStars(card.level || 1, "xs")}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3">
            <Button
              onClick={handleReplace}
              disabled={isReplacing}
              className="bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white"
            >
              <Replace className="h-4 w-4 mr-2" />
              {isReplacing ? "Replacing..." : "Replace Card"}
            </Button>
            
            <Button
              onClick={handleRemove}
              disabled={isRemoving}
              variant="outline"
              className="border-red-500 text-red-400 hover:bg-red-500 hover:text-white"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {isRemoving ? "Removing..." : "Remove Card"}
            </Button>
          </div>

          {/* Close Button */}
          <Button
            onClick={onClose}
            variant="ghost"
            className="w-full text-gray-400 hover:text-white"
          >
            <X className="h-4 w-4 mr-2" />
            Cancel
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
} 