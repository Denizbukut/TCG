"use client"

import type React from "react"

import { useRef, useState } from "react"
import { motion, useMotionValue, useTransform } from "framer-motion"
// Removed Next.js Image import - using regular img tags
import { renderStars } from "@/utils/card-stars"

interface TiltableCardProps {
  id: string
  name: string
  character: string
  imageUrl?: string
  rarity: string
  level?: number
  owned?: boolean // Add this new prop
}

export default function TiltableCard({
  id,
  name,
  character,
  imageUrl,
  rarity,
  level = 1,
  owned = true,
}: TiltableCardProps) {
  const cardRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)

  // Motion values for tilt effect
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-100, 100], [15, -15])
  const rotateY = useTransform(x, [-100, 100], [-15, 15])
  const reflectionX = useTransform(x, [-100, 100], ["30%", "70%"])
  const reflectionY = useTransform(y, [-100, 100], ["30%", "70%"])
  const reflectionOpacity = useTransform(x, [-100, 0, 100], [0.7, 0.3, 0.7])

  // Map rarity to color and border styles
  const rarityStyles = {
    basic: {
      border: "border-0",
      glow: "shadow-gray-400",
      text: "text-gray-700",
      gradient: "from-gray-400/30 to-gray-200/30",
    },
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
      border: "border-4 border-transparent", // Changed to transparent to show the gradient border
      glow: "shadow-yellow-300",
      text: "text-yellow-600",
      gradient: "from-yellow-300/30 to-yellow-100/30",
    },
     godlike: {
      border: "border-4 border-transparent",
      glow: "shadow-red-300",
      text: "text-red-600",
      gradient: "from-red-400/30 to-red-100/30",
    },
  }
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
  }

  const rarityStyle = rarityStyles[rarity as keyof typeof rarityStyles] || rarityStyles.common

  // Generate a descriptive query for the character
  const query = `${character} from anime, high quality, detailed, vibrant colors`
  const placeholderUrl = `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(query)}`

  // Use the provided imageUrl, or generate a placeholder
  const cardImageUrl = getCardImageUrl(imageUrl) || placeholderUrl
  
  // Debug: Log image URL processing
  console.log('TiltableCard Debug:', { id, name, imageUrl, cardImageUrl })

  // Handle card tilt effect with improved sensitivity for reflections
  const handleCardMove = (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!cardRef.current) return

    // Prevent default scrolling behavior
    event.preventDefault()

    const rect = cardRef.current.getBoundingClientRect()

    // Get coordinates
    let clientX, clientY

    if ("touches" in event) {
      // Touch event
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    } else {
      // Mouse event
      clientX = event.clientX
      clientY = event.clientY
    }

    // Calculate position relative to card center with increased sensitivity
    const xPos = ((clientX - rect.left) / rect.width - 0.5) * 200
    const yPos = ((clientY - rect.top) / rect.height - 0.5) * 200

    // Update motion values with spring effect for smoother transitions
    x.set(xPos)
    y.set(yPos)
  }

  const handleCardLeave = () => {
    // Reset to center position with a smooth transition
    x.set(0, true)
    y.set(0, true)
    setIsHovered(false)
  }

  return (
    <div className="perspective-1000 w-full">
      <motion.div
        ref={cardRef}
        className="relative w-full aspect-[3/4] preserve-3d cursor-pointer touch-none"
        onMouseMove={handleCardMove}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={handleCardLeave}
        onTouchMove={handleCardMove}
        onTouchEnd={handleCardLeave}
        style={{
          rotateX,
          rotateY,
          transformStyle: "preserve-3d",
        }}
      >
        {/* Special border effect for legendary cards */}
        {rarity === "legendary" &&(
          <motion.div
            className="absolute -inset-[3px] rounded-xl pointer-events-none z-[-1] bg-[conic-gradient(at_top_right,_var(--tw-gradient-stops))] from-yellow-500 via-amber-300 to-yellow-600"
            animate={{
              boxShadow: [
                "0 0 10px 2px rgba(253,224,71,0.4)",
                "0 0 15px 5px rgba(253,224,71,0.6)",
                "0 0 10px 2px rgba(253,224,71,0.4)",
              ],
            }}
            transition={{
              duration: 2,
              repeat: Number.POSITIVE_INFINITY,
              repeatType: "reverse",
            }}
          />
        )}
        {rarity === "godlike" && (
  <motion.div
    className="absolute -inset-[3px] rounded-xl pointer-events-none z-[-1] bg-[conic-gradient(at_top_left,_var(--tw-gradient-stops))] from-red-500 via-red-400 to-red-600"
    animate={{
      boxShadow: [
        "0 0 10px 2px rgba(239,68,68,0.4)",
        "0 0 18px 6px rgba(239,68,68,0.6)",
        "0 0 10px 2px rgba(239,68,68,0.4)",
      ],
    }}
    transition={{
      duration: 2,
      repeat: Number.POSITIVE_INFINITY,
      repeatType: "reverse",
    }}
  />
)}

        {/* Card with rarity-based styling */}
        <div className={`w-full h-full relative rounded-xl overflow-hidden ${rarityStyle.border}`}>
          {/* Card image */}
          <img
            src={cardImageUrl || "/placeholder.svg"}
            alt="Card"
            className="w-full h-full object-cover"
            loading = "eager"
          />

          {/* Card name overlay - more compact */}
          <div className="absolute top-1 left-1">
            <div className="bg-gradient-to-r from-black/70 to-transparent px-2 py-1 rounded-lg backdrop-blur-sm inline-block">
              <h3 className="font-bold text-white text-sm sm:text-base drop-shadow-md anime-text truncate">{name}</h3>
            </div>
          </div>

          {/* Level stars - only show if owned */}
          {owned && (
            <div className="absolute bottom-1 left-0 right-0 flex justify-center">{renderStars(level, "md")}</div>
          )}

          {/* Dynamic light reflection effect - more responsive to tilt */}
          <motion.div
            className="absolute inset-0 mix-blend-overlay"
            style={{
              background: "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.8) 0%, transparent 50%)",
              backgroundPosition: `${reflectionX}% ${reflectionY}%`,
              opacity: Math.max(
                0.1,
                reflectionOpacity.get() * (Math.abs(rotateX.get() / 15) + Math.abs(rotateY.get() / 15)),
              ),
            }}
          />

          {/* Holographic overlay effect based on tilt */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "linear-gradient(45deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.3) 50%, rgba(255,255,255,0.1) 100%)",
              backgroundPosition: `${reflectionX.get()}% ${reflectionY.get()}%`,
              backgroundSize: "200% 200%",
              opacity: Math.abs(rotateX.get() / 30) + Math.abs(rotateY.get() / 30),
            }}
          />
          

          {/* Special effects for epic cards only (removed for legendary) */}
          {rarity === "epic" && (
            <motion.div
              className="absolute inset-0 pointer-events-none mix-blend-overlay rounded-xl bg-purple-300"
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

          {/* Shine effect based on tilt */}
          <motion.div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)",
              backgroundSize: "200% 100%",
              backgroundPosition: `${reflectionX.get()}% 0%`,
              opacity: reflectionOpacity,
            }}
          />
        </div>
      </motion.div>
    </div>
  )
}
