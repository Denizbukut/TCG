"use client"

import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { motion } from "framer-motion"
import { Heart } from "lucide-react"
// Removed Next.js Image import - using regular img tags

type BattleCardProps = {
  card: any
  isSelected?: boolean
  isTarget?: boolean
  isAnimating?: boolean
  animationType?: string
}

// Convert traditional rarity to new rank system
const rarityToRank = {
  common: "C",
  rare: "R",
  epic: "E",
  legendary: "L",
  wbc: "W",
}

const rankColors = {
  C: "from-gray-400 to-gray-600",
  R: "from-blue-400 to-blue-600",
  E: "from-purple-400 to-purple-600",
  L: "from-amber-400 to-amber-600",
  W: "from-red-600 to-red-800",
}

export default function BattleCard({ card, isSelected, isTarget, isAnimating, animationType }: BattleCardProps) {
  // Default HP values based on rarity since we no longer store them in the database
  const getDefaultHp = (rarity: string) => {
    switch (rarity) {
      // case "wbc":
      //   return 120 // Commented out
      case "legendary":
        return 100
      case "epic":
        return 80
      case "rare":
        return 60
      case "common":
      default:
        return 40
    }
  }

  const hp = card.hp || getDefaultHp(card.rarity)
  const currentHp = card.currentHp || hp
  const hpPercentage = (currentHp / hp) * 100

  const rank = rarityToRank[card.rarity as keyof typeof rarityToRank] || "C"
  const rankColor = rankColors[rank as keyof typeof rankColors]

  // Ensure we have a valid character string for the placeholder
  const characterQuery =
    card.character && typeof card.character === "string" && card.character.trim() !== ""
      ? encodeURIComponent(card.character)
      : "anime"

  // Create a guaranteed valid fallback image URL
  const fallbackImageUrl = `/placeholder.svg?height=400&width=300&query=${characterQuery}%20character`

  // Determine the image source - NEVER use empty strings
  const imageSrc = (() => {
    // First check if we have a valid image_url
    if (card.image_url && typeof card.image_url === "string" && card.image_url.trim() !== "") {
      return card.image_url
    }

    // If no valid image_url, use the fallback
    return fallbackImageUrl
  })()

  return (
    <motion.div
      animate={isSelected ? { scale: 1.05, y: -5 } : isTarget ? { scale: 0.95 } : { scale: 1 }}
      className={`relative ${isSelected ? "ring-2 ring-purple-500 rounded-xl" : isTarget ? "ring-2 ring-red-500 rounded-xl" : ""}`}
    >
      <Card className="overflow-hidden border-0 rounded-xl card-shine">
        <div className="relative aspect-[2/3]">
          <img
            src={imageSrc || "/placeholder.svg"}
            alt={card.name || "Card"}
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent"></div>

          {/* Rank badge */}
          <div className="absolute top-2 right-2 z-10">
            <Badge className={`bg-gradient-to-r ${rankColor} border-0 text-white font-bold px-2 py-1`}>{rank}</Badge>
          </div>

          {/* Level badge if present */}
          {card.level && (
            <div className="absolute top-2 left-2 z-10">
              <Badge variant="outline" className="bg-black/50 text-white border-purple-500/30">
                Lv.{card.level}
              </Badge>
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-2">
            <p className="text-white text-xs font-bold truncate">{card.name}</p>

            {/* HP Bar */}
            <div className="flex items-center gap-1 mt-1">
              <Heart className="h-3 w-3 text-red-500" />
              <Progress
                value={hpPercentage}
                className="h-2 bg-gray-800/50"
                indicatorClassName={
                  hpPercentage > 50
                    ? "bg-gradient-to-r from-green-400 to-green-600"
                    : hpPercentage > 25
                      ? "bg-gradient-to-r from-yellow-400 to-yellow-600"
                      : "bg-gradient-to-r from-red-400 to-red-600"
                }
              />
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
