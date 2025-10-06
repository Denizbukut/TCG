"use client"

import { useState, useEffect } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Tag, X, AlertCircle, AlertTriangle } from "lucide-react"
// Removed Next.js Image import - using regular img tags
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { createListing } from "@/app/actions/marketplace"
import { renderStars } from "@/utils/card-stars"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import { getSupabaseBrowserClient } from "@/lib/supabase"

// Definiere den Typ für eine Karte
type UserCard = {
  id: number // Die eindeutige ID aus der user_cards-Tabelle
  card_id: string
  name: string
  character: string
  image_url?: string
  rarity: "common" | "rare" | "epic" | "elite" | "legendary" | "ultimate" | "goat" | "wbc"
  overall_rating?: number
  level: number
  quantity: number
}

interface SellCardDialogProps {
  isOpen: boolean
  onClose: () => void
  card: UserCard
  walletAddress: string
  onSuccess?: () => void
}

export default function SellCardDialog({ isOpen, onClose, card, walletAddress, onSuccess }: SellCardDialogProps) {
  const [price, setPrice] = useState<string>("")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showSuccess, setShowSuccess] = useState(false)
  const [priceUsdPerWLD, setPriceUsdPerWLD] = useState<number | null>(null)
  const router = useRouter()
  const [activeListings, setActiveListings] = useState<number | null>(null)
  const [cardsSoldCount, setCardsSoldCount] = useState<number | null>(null)

  const getCloudflareImageUrl = (imagePath?: string) => {
    if (!imagePath) {
      return "/placeholder.svg"
    }
    
    
    // Remove leading slash and any world_soccer/world-soccer prefix
    let cleaned = imagePath.replace(/^\/?(world[-_])?soccer\//i, "")
    
    // Wenn schon http, dann direkt zurückgeben
    if (cleaned.startsWith("http")) {
      return cleaned
    }
    
    
    // Pub-URL verwenden, KEIN world-soccer/ mehr anhängen!
    const finalUrl = `https://ani-labs.xyz/${encodeURIComponent(cleaned)}`
    
    return finalUrl
  }

  useEffect(() => {
    const fetchSellLimits = async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        throw new Error("Could not connect to database")
      }

      if (!walletAddress) return

      // Aktive Listings zählen
      const { count: activeCount } = await supabase
        .from("market_listings")
        .select("*", { count: "exact", head: true })
        .eq("seller_wallet_address", walletAddress)
        .eq("status", "active")

      // Verkauft-Zähler abfragen
      const { data: userData, error } = await supabase
        .from("users")
        .select("cards_sold_since_last_purchase")
        .eq("wallet_address", walletAddress)
        .single<{ cards_sold_since_last_purchase: number }>()

      if (!error && userData) {
        setActiveListings(activeCount ?? 0)
        setCardsSoldCount(userData.cards_sold_since_last_purchase ?? 0)
      }
    }

    if (isOpen) {
      fetchSellLimits()
    }
  }, [isOpen, walletAddress])

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch("/api/wld-price")
        const json = await res.json()

        if (json.price) {
          setPriceUsdPerWLD(json.price)
        }
      } catch (err) {
        console.error("Failed to fetch WLD price", err)
      }
    }

    fetchPrice()
  }, [])

  // Setze den Preis korrekt, wenn sich die Karte ändert oder der Dialog geöffnet wird
  useEffect(() => {
    if (isOpen && card) {
      const defaultPrice = getDefaultPrice(card.rarity, card.level, card.overall_rating)
      setPrice(defaultPrice.toString())
    }
  }, [isOpen, card])
  // Standardpreise basierend auf Seltenheit und Level
  function getDefaultPrice(rarity: string, level: number, overallRating?: number): number {

    // Für WBC-Karten direkt 5.0 USD als Starting Price (umgerechnet zu WLD)
    if (rarity === "wbc") {
      const baseWbcPrice = priceUsdPerWLD ? 5.0 / priceUsdPerWLD : 5.0
      // Preis verdoppelt sich pro Level
      return Math.round(baseWbcPrice * level)
    }

    // Für Ultimate-Karten direkt 1.5 USD als Starting Price (umgerechnet zu WLD)
    if (rarity === "ultimate") {
      const baseUltimatePrice = priceUsdPerWLD ? 1.5 / priceUsdPerWLD : 1.5
      // Preis verdoppelt sich pro Level
      return Math.round(baseUltimatePrice * level)
    }

    // Für Elite-Karten direkt 0.5 USD als Starting Price (umgerechnet zu WLD)
    if (rarity === "elite") {
      const baseElitePrice = priceUsdPerWLD ? 0.5 / priceUsdPerWLD : 0.5
      // Preis verdoppelt sich pro Level
      return Math.round(baseElitePrice * level)
    }

    const basePrice =
      {
        common: 50,
        rare: 150,
        epic: 500,
        legendary: 2000,
        godlike: 10000,
        wbc: 15000,
      }[rarity] || 50

    // Preis verdoppelt sich pro Level (Level 1 = basePrice, Level 2 = basePrice * 2, etc.)
    const calculatedPrice = Math.round(basePrice * level)

    // Stelle sicher, dass der Preis nicht über 500 liegt
    return Math.min(calculatedPrice, 500)
  }

  // Debug: Log card details
  console.log("SellCardDialog - Card details:", {
    name: card.name,
    rarity: card.rarity,
    overall_rating: card.overall_rating,
    price: price
  })

  // Validiere den Preis
  const parsedPrice = Number.parseFloat(price.replace(",", "."))
  
  // Mindestpreise in USD, umgerechnet zu WLD (basierend auf Rarity und Level)
  let minUsdPrice = 0.15 // Standard-Mindestpreis
  
  // Rarity-basierte Preise
  if (card.rarity === "wbc") {
    minUsdPrice = 5.0
    console.log("WBC rarity detected, setting min price to $5.00")
  } else if (card.rarity === "ultimate") {
    minUsdPrice = 1.5
    console.log("Ultimate rarity detected, setting min price to $1.50")
  } else if (card.rarity === "legendary") {
    minUsdPrice = 1.5
    console.log("Legendary rarity detected, setting min price to $1.50")
  } else if (card.rarity === "epic") {
    minUsdPrice = 1.0
    console.log("Epic rarity detected, setting min price to $1.00")
  } else if (card.rarity === "rare") {
    minUsdPrice = 0.5
    console.log("Rare rarity detected, setting min price to $0.50")
  } else if (card.rarity === "elite") {
    minUsdPrice = 0.5
    console.log("Elite rarity detected, setting min price to $0.50")
  }
  
  // Mindestpreis wird mit dem Level multipliziert
  minUsdPrice = minUsdPrice * card.level
  console.log("Min price adjusted for level:", { level: card.level, minUsdPrice })
  
  const minWldPrice = priceUsdPerWLD ? minUsdPrice / priceUsdPerWLD : minUsdPrice
  console.log("Final min price:", { minUsdPrice, minWldPrice, priceUsdPerWLD })



  const isValidPrice = !isNaN(parsedPrice) && parsedPrice >= minWldPrice

  // Formatiere den Preis für die Anzeige
  const formatPrice = (value: string) => {
    const num = Number.parseFloat(value.replace(",", "."))
    return !isNaN(num) ? num.toFixed(3) : "0.000"
  }

  // Karte zum Verkauf anbieten
  const handleSell = async () => {
    if (!isValidPrice || !walletAddress || !card) return

    setIsSubmitting(true)
    setError(null)

    try {
      const finalPrice = Number.parseFloat(parsedPrice.toFixed(2))
      console.log("Selling card:", {
        walletAddress,
        cardId: card.id,
        cardUuid: card.card_id,
        originalPrice: price,
        parsedPrice: parsedPrice,
        finalPrice: finalPrice,
        level: card.level,
      })

      // Verwende die ID aus der user_cards-Tabelle
      const result = await createListing(
        walletAddress,
        card.id,
        card.card_id,
        finalPrice,
        card.level,
      )

      if (result.success) {
        setShowSuccess(true)

        // Zeige die Erfolgsmeldung für 1.5 Sekunden an, dann schließe Dialog
        setTimeout(() => {
          onSuccess?.()
          onClose()
          // Keine Weiterleitung - Collection wird über onSuccess aktualisiert
        }, 1500)
      } else {
        console.error("Error from createListing:", result.error)
        setError(result.error || "Failed to list your card")
        toast({
          title: "Error",
          description: result.error || "Failed to list your card",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Exception in handleSell:", error)
      setError("An unexpected error occurred")
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Map rarity to color styles
  const rarityStyles = {
    common: {
      border: "border-gray-400",
      text: "text-gray-600",
      badge: "bg-gray-500 text-white font-semibold",
    },
    rare: {
      border: "border-blue-500",
      text: "text-blue-600",
      badge: "bg-blue-500 text-white font-semibold",
    },
    epic: {
      border: "border-purple-500",
      text: "text-purple-600",
      badge: "bg-purple-500 text-white font-semibold",
    },
    legendary: {
      border: "border-yellow-500",
      text: "text-yellow-600",
      badge: "bg-amber-500 text-white font-semibold",
    },
    ultimate: {
      border: "border-red-500",
      text: "text-red-600",
      badge: "bg-red-500 text-white font-semibold",
    },
  }

  const rarityStyle = rarityStyles[card?.rarity as keyof typeof rarityStyles] || rarityStyles.common

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!isSubmitting && !showSuccess) {
          onClose()
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Sell Card</DialogTitle>
        </DialogHeader>

        <AnimatePresence>
          {showSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center justify-center p-6 text-center"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mb-4"
              >
                <Tag className="h-10 w-10 text-green-500" />
              </motion.div>
              <motion.h3
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-bold mb-2"
              >
                Card Listed!
              </motion.h3>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-gray-500"
              >
                Your card has been listed for {formatPrice(price)} WLD
              </motion.p>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="mt-2 text-sm text-blue-500"
              >
                Redirecting to marketplace...
              </motion.div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {/* Card Preview */}
              <div className="flex gap-4 items-center">
                <div className={`relative w-20 h-28 overflow-hidden rounded-lg border-2 ${rarityStyle.border}`}>
                  {card.image_url?.endsWith(".mp4") ? (
                    <video
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                            src={getCloudflareImageUrl(card?.image_url)}
                          />
                  ) : ( <img
                    src={
                      getCloudflareImageUrl(card?.image_url) ||
                      `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(card?.character || "anime character")}`
                    }
                    alt={card?.name || "Card"}
                    className="absolute inset-0 w-full h-full object-cover"
                  />)}
                 
                  <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                    {renderStars(card?.level || 1, "xs")}
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="font-medium">{card?.name}</h3>
                  <p className="text-sm text-gray-500">{card?.character}</p>
                  <div className="flex items-center mt-1">
                    <Badge className={rarityStyle.badge}>{card?.rarity}</Badge>
                    <span className="ml-2 text-sm text-gray-500">
                      Level {card?.level} • {card?.quantity > 1 ? `${card?.quantity} copies` : "1 copy"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Price Input */}
              <div className="space-y-2">
                <Label htmlFor="price">Set Price (WLD)</Label>
                <div className="relative">
                  <Input id="price" type="text" value={price} onChange={(e) => setPrice(e.target.value)} className="" />
                </div>


                {!isValidPrice && (
                  <p className="text-red-500 text-sm">
                    {card.rarity.charAt(0).toUpperCase() + card.rarity.slice(1)} Level {card.level} cards must be listed for at least {minWldPrice.toFixed(3)} WLD (${minUsdPrice.toFixed(2)})
                  </p>
                )}
              </div>
              {/* Selling Limit Warnings */}
              {activeListings !== null && activeListings >= 3 && (
                <div className="bg-red-50 border border-red-200 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-red-700">
                    <AlertCircle className="w-4 h-4" />
                    <span className="font-medium">Listing limit reached</span>
                  </div>
                  <p className="text-sm text-red-600 mt-1">
                    You already have 3 active listings. Cancel some listings to add more.
                  </p>
                </div>
              )}

              {cardsSoldCount !== null && cardsSoldCount >= 3 && (
                <div className="bg-orange-50 border border-orange-200 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-700">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">Selling limit reached</span>
                  </div>
                  <p className="text-sm text-orange-600 mt-1">
                    You've sold 3 cards since your last purchase. Buy a card from the marketplace to continue selling.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2 text-orange-600 border-orange-300 hover:bg-orange-50"
                    onClick={() => {
                      onClose()
                      // Navigate to marketplace
                      window.location.href = "/trade"
                    }}
                  >
                    Browse Marketplace
                  </Button>
                </div>
              )}

              {cardsSoldCount !== null && cardsSoldCount === 2 && (
                <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg">
                  <div className="flex items-center gap-2 text-amber-700">
                    <AlertTriangle className="w-4 h-4" />
                    <span className="font-medium">Last sale before limit</span>
                  </div>
                  <p className="text-sm text-amber-600 mt-1">
                    This will be your 3rd sale. You'll need to buy a card before selling more.
                  </p>
                </div>
              )}

              {/* Error Message */}
              {error && (
                <div className="bg-red-50 p-3 rounded-lg text-sm">
                  <p className="text-red-600 font-medium">Error: {error}</p>
                </div>
              )}

              {/* Market Fee Info */}
              <div className="bg-gray-50 p-3 rounded-lg text-sm">
                <p className="text-gray-700">
                  <span className="font-medium">Market Fee:</span> {(parsedPrice * 0.1).toFixed(3)} WLD (10%)
                </p>
                <p className="text-gray-700 mt-1">
                  <span className="font-medium">You'll Receive:</span> {(parsedPrice * 0.9).toFixed(3)} WLD
                </p>
              </div>

              {/* Warning for last copy */}
              {card?.quantity === 1 && (
                <div className="bg-amber-50 p-3 rounded-lg text-sm">
                  <p className="text-amber-800 font-medium">This is your last copy of this card!</p>
                  <p className="text-amber-700 mt-1">
                    If you sell it, you won't have this card in your collection until you get it again.
                  </p>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
                  <X className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  onClick={handleSell}
                  disabled={!isValidPrice || isSubmitting || (activeListings ?? 0) >= 3 || (cardsSoldCount ?? 0) >= 3}
                  className={
                    (cardsSoldCount ?? 0) >= 3
                      ? "bg-gray-400 cursor-not-allowed"
                      : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  }
                >
                  {isSubmitting ? (
                    <>
                      <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                      Processing...
                    </>
                  ) : (cardsSoldCount ?? 0) >= 3 ? (
                    <>
                      <X className="h-4 w-4 mr-2" />
                      Cannot Sell
                    </>
                  ) : (
                    <>
                      <Tag className="h-4 w-4 mr-2" />
                      List for Sale
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
