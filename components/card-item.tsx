"use client"

import type React from "react"

import Link from "next/link"
import type { Card } from "@/types/card"
import { cn } from "@/lib/utils"
import { motion } from "framer-motion"
import { renderStars } from "@/utils/card-stars"
import { useRouter } from "next/navigation"
import { useState } from "react";
import CardDetailModal from "@/components/CardDetailModal";

const getCloudflareImageUrl = (imageId?: string) => {
  if (!imageId) return "/placeholder.svg"

  // Entfernt führenden Slash und "anime-images/" Prefix
  const cleaned = imageId.replace(/^\/?world-soccer\//, "")
  console.log(cleaned)

  return `https://pub-e74caca70ffd49459342dd56ea2b67c9.r2.dev/${cleaned}`
}




interface CardItemProps {
  id: string
  name: string
  character: string
  imageUrl?: string
  rarity: string
  epoch: number
  type?: string
  owned?: boolean
  compact?: boolean
  card?: Card
  showDetails?: boolean
  level?: number
  quantity?: number
  selected?: boolean
  onClick?: () => void
  selectable?: boolean
  isCollection?: boolean
  isContest?: boolean
  hideOverlay?: boolean
  forceEager?: boolean
  // props
disableEffect?: boolean

}



export function CardItem({
  id,
  name,
  character,
  imageUrl,
  rarity,
  type,
  owned = false,
  compact = false,
  card,
  showDetails = true,
  level = 1,
  quantity = 1,
  selected = false,
  onClick,
  selectable = false,
  isCollection = false,
  isContest = false,
  hideOverlay = false,
  forceEager = false,
  // props
disableEffect = false

}: CardItemProps) {
  if (!id) return null

  const rarityStyles = {
  common: {
    border: "border-4 border-gray-400",
    glow: "shadow-gray-300",
    text: "text-gray-600",
    gradient: "from-gray-300/30 to-gray-100/30",
  },
  rare: {
    border: "border-4 border-blue-500",
    glow: "shadow-blue-300",
    text: "text-blue-600",
    gradient: "from-blue-300/30 to-blue-100/30",
  },
  epic: {
    border: "border-4 border-purple-500",
    glow: "shadow-purple-300",
    text: "text-purple-600",
    gradient: "from-purple-300/30 to-purple-100/30",
  },
  legendary: {
    border: "border-4 border-yellow-500",
    glow: "shadow-yellow-300",
    text: "text-yellow-600",
    gradient: "from-yellow-300/30 to-yellow-100/30",
  },
  godlike: {
    border: "border-4 border-red-600",
    glow: "shadow-red-400",
    text: "text-red-600",
    gradient: "from-red-500/30 to-red-100/30",
  },
}


  const rarityStyle = rarityStyles[rarity as keyof typeof rarityStyles] || rarityStyles.common
  const placeholderUrl = "/placeholder.svg"
  const cardImageUrl = getCloudflareImageUrl(imageUrl)

  const cardDetailUrl = isCollection ? `/cards/${id}-level-${level}` : `/cards/${id}`

  const router = useRouter()
  const [modalOpen, setModalOpen] = useState(false);

  console.log(cardImageUrl)


const handleCardClick = () => {
  const url = `/cards/${id}-level-${level}` +
    `?name=${encodeURIComponent(name)}` +
    `&character=${encodeURIComponent(character)}` +
    `&imageUrl=${encodeURIComponent(imageUrl || "")}` +
    `&rarity=${rarity}` +
    `&level=${level}` +
    `&quantity=${quantity}`;

  router.push(url);
};




  const CardWrapper = ({ children }: { children: React.ReactNode }) => {
    if (selectable) {
      return (
        <div
          onClick={onClick}
          className={cn(
            "cursor-pointer h-full transition-all duration-300",
            selected ? "ring-4 ring-blue-500 scale-105" : ""
          )}
        >
          {children}
        </div>
      )
    }

    if (onClick) {
      return (
        <div onClick={onClick} className="cursor-pointer h-full">
          {children}
        </div>
      )
    }

    return (
      <div onClick={handleCardClick} className="block h-full cursor-pointer">
        {children}
      </div>
    )

  }

  return (
  <>
    <CardWrapper>
      <div
        className={cn(
          "h-full rounded-xl overflow-hidden",
          "hover:shadow-lg transition-shadow duration-300",
          owned ? "" : "opacity-60 grayscale"
        )}
      >
        <div className="relative aspect-[3/4] w-full overflow-hidden">
          <div className={`w-full h-full relative rounded-xl ${isCollection || hideOverlay ? "" : rarityStyle.border}`}>
            {cardImageUrl?.match(/\.(mp4|webm|ogg)$/i) ? (
            <video
              src={cardImageUrl}
              className="w-full h-full object-cover"
              autoPlay
              muted
              loop
              playsInline
            />
          ) : (
            <img
              src={cardImageUrl}
              alt="Card"
              className="w-full h-full object-cover"
              loading={forceEager ? "eager" : "lazy"}
            />
          )}




            {(owned && quantity > 1) && (
              <div className="absolute top-1 right-1 bg-black/70 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                x{quantity}
              </div>
            )}

            {!isCollection && !hideOverlay && (
              <div className="absolute top-1 left-1 right-1">
                <div className="bg-gradient-to-r from-black/70 via-black/50 to-transparent px-2 py-1 rounded-lg backdrop-blur-sm inline-block">
                  <h3 className="font-bold text-white text-xs sm:text-sm drop-shadow-md anime-text truncate">{name}</h3>
                </div>
              </div>
            )}

            {isCollection || isContest && (
              <div className="absolute bottom-1 left-0 right-0 flex justify-center">{renderStars(level, "xs")}</div>
            )}

            {!disableEffect && (rarity === "legendary" || rarity === "epic" || rarity === "godlike") && (
              <motion.div
                className={`absolute inset-0 pointer-events-none mix-blend-overlay rounded-xl ${
                  rarity === "legendary" ? "bg-yellow-300" : "bg-purple-300"
                }`}
                animate={{
                  opacity: [0.1, 0.3, 0.1],
                }}
                transition={{
                  duration: 2,
                  repeat: Number.POSITIVE_INFINITY,
                  repeatType: "reverse",
                }}
              />
            )}
          </div>
        </div>
      </div>
    </CardWrapper>

    {isCollection && (
      <CardDetailModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        card={{
          id,
          name,
          character,
          imageUrl,
          rarity,
          level,
          quantity: quantity || 1,
        }}
      />
    )}
  </>
)

  
}

export default CardItem
