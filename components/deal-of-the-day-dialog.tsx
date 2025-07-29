"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ShoppingBag, X, Ticket, Sparkles, Crown } from "lucide-react"
import Image from "next/image"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { markDealAsDismissed, markDealAsSeen, purchaseDeal } from "@/app/actions/deals"
import { renderStars } from "@/utils/card-stars"
import { motion, AnimatePresence } from "framer-motion"
import { MiniKit, tokenToDecimals, Tokens, type PayCommandInput } from "@worldcoin/minikit-js"
import { useWldPrice } from "@/contexts/WldPriceContext"

interface DailyDeal {
  id: number
  card_id: string
  card_level: number
  classic_tickets: number
  elite_tickets: number
  price: number
  description: string
  discount_percentage: number
  card_name: string
  card_image_url: string
  card_rarity: string
  card_character: string
  obtainable?: boolean // 👈 hinzufügen
}


interface DealInteraction {
  seen: boolean
  dismissed: boolean
  purchased: boolean
}

interface DealOfTheDayDialogProps {
  isOpen: boolean
  onClose: () => void
  deal: DailyDeal
  username: string
  onPurchaseSuccess?: (newTickets: number, newEliteTickets: number) => void
}

export default function DealOfTheDayDialog({
  isOpen,
  onClose,
  deal,
  username,
  onPurchaseSuccess,
}: DealOfTheDayDialogProps) {
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const hasMarkedAsSeen = useRef(false)
  const [hasOpened, setHasOpened] = useState(false)
  const [shouldMarkAsSeen, setShouldMarkAsSeen] = useState(false)

  const [isDealValid, setIsDealValid] = useState(!!deal)

  useEffect(() => {
    setIsDealValid(!!deal)
  }, [deal])

  if (!isDealValid) return null
  const { price } = useWldPrice()

  // Map rarity to color styles
  const rarityStyles = {
    common: {
      border: "border-gray-400",
      text: "text-gray-400",
      badge: "bg-gray-700 text-gray-200",
      gradient: "from-gray-400 to-gray-600",
      glow: "shadow-[0_0_15px_rgba(156,163,175,0.5)]",
    },
    rare: {
      border: "border-blue-400",
      text: "text-blue-400",
      badge: "bg-blue-900 text-blue-200",
      gradient: "from-blue-400 to-blue-600",
      glow: "shadow-[0_0_15px_rgba(59,130,246,0.5)]",
    },
    epic: {
      border: "border-purple-400",
      text: "text-purple-400",
      badge: "bg-purple-900 text-purple-200",
      gradient: "from-purple-400 to-purple-600",
      glow: "shadow-[0_0_15px_rgba(147,51,234,0.5)]",
    },
    legendary: {
      border: "border-yellow-400",
      text: "text-yellow-400",
      badge: "bg-amber-900 text-amber-200",
      gradient: "from-amber-400 to-amber-600",
      glow: "shadow-[0_0_20px_rgba(251,191,36,0.6)]",
    },
  }

  const rarityStyle = rarityStyles[deal.card_rarity as keyof typeof rarityStyles] || rarityStyles.common

  const handleDismiss = async () => {
    try {
      await markDealAsDismissed(username, deal.id)
      onClose()
    } catch (error) {
      console.error("Error dismissing deal:", error)
    }
  }

  // Update the sendPayment function to reflect the promotional price
  const sendPayment = async () => {
    const dollarAmount = deal.price
    const fallbackWldAmount = deal.price
    const wldAmount = price ? dollarAmount / price : fallbackWldAmount
    
    const res = await fetch("/api/initiate-payment", {
      method: "POST",
    })
    const { id } = await res.json()

    const payload: PayCommandInput = {
      reference: id,
      to: "0xf41442bf1d3e7c629678cbd9e50ea263a6befdc3", // unified wallet address
      tokens: [
        {
          symbol: Tokens.WLD,
          token_amount: tokenToDecimals(parseFloat(wldAmount.toFixed(2)), Tokens.WLD).toString(),
        },
      ],
      description: "Buy Daily Deal",
    }

    const { finalPayload } = await MiniKit.commandsAsync.pay(payload)

    if (finalPayload.status == "success") {
      console.log("success sending payment")
      handlePurchase()
    }
  }

  const handlePurchase = async () => {
    setIsPurchasing(true)
    try {
      const result = await purchaseDeal(username, deal.id)

      if (result.success) {
        setShowSuccess(true)

        // Show success state for a moment, then close the dialog
        setTimeout(() => {
          setShowSuccess(false)
          onClose() // Close the dialog after the success animation
          if (
            onPurchaseSuccess &&
            typeof result.newTickets === "number" &&
            typeof result.newEliteTickets === "number"
          ) {
            onPurchaseSuccess(result.newTickets, result.newEliteTickets)
          }
        }, 2000)
      } else {
        toast({
          title: "Purchase Failed",
          description: result.error || "Failed to purchase the deal",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error purchasing deal:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      if (!showSuccess) {
        setIsPurchasing(false)
      }
    }
  }

  // Mark deal as seen when dialog opens
  useEffect(() => {
    let isMounted = true
    let shouldMark = false

    if (isOpen && deal) {
      setHasOpened(true)
      shouldMark = !hasMarkedAsSeen.current
    }

    if (shouldMark) {
      setShouldMarkAsSeen(true)
    }

    return () => {
      isMounted = false
    }
  }, [isOpen, deal])

  useEffect(() => {
    if (shouldMarkAsSeen) {
      markDealAsSeen(username, deal.id).catch(console.error)
      hasMarkedAsSeen.current = true
      setShouldMarkAsSeen(false)
    }
  }, [shouldMarkAsSeen, username, deal?.id])

  useEffect(() => {
    // Reset the ref when dialog closes
    if (!isOpen) {
      hasMarkedAsSeen.current = false
      setHasOpened(false)
    }
  }, [isOpen])

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isPurchasing && !showSuccess) {
          handleDismiss()
        }
      }}
    >
      <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl border-0 bg-gray-900 text-white">
        <DialogTitle className="sr-only">Deal of the Day</DialogTitle>
        <AnimatePresence>
          {showSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="flex flex-col items-center justify-center p-8 text-center"
            >
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1, rotate: [0, 10, -10, 0] }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="w-20 h-20 bg-green-900/30 rounded-full flex items-center justify-center mb-4"
              >
                <ShoppingBag className="h-10 w-10 text-green-400" />
              </motion.div>
              <motion.h3
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="text-xl font-bold mb-2 text-green-400"
              >
                Purchase Successful!
              </motion.h3>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-gray-400"
              >
                You've claimed today's special deal
              </motion.p>
            </motion.div>
          ) : (
            <div>
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 bg-gray-800/50 rounded-full p-1.5 backdrop-blur-sm hover:bg-gray-700/50 transition-colors z-10"
              >
                <X className="h-4 w-4 text-gray-300" />
              </button>

              {/* Card Showcase */}
              <div className="relative pt-8 pb-12 flex justify-center items-center">
                <div className="absolute inset-0 overflow-hidden">
                  <div className="absolute w-full h-full bg-gradient-to-b from-violet-900/30 to-transparent"></div>
                  <div className="absolute -top-24 left-1/2 transform -translate-x-1/2 w-96 h-96 rounded-full bg-violet-600/10 blur-3xl"></div>
                </div>

                <div className="relative">
                  <div className={`relative w-40 h-56 ${rarityStyle.glow}`}>
                    <div
                      className={`absolute inset-0 rounded-lg ${rarityStyle.border} border-2 overflow-hidden transform transition-transform duration-500 hover:scale-105`}
                    >
                      <Image
                        src={
                          deal.card_image_url ||
                          `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(deal.card_name || "anime character")}`
                        }
                        alt={deal.card_name || "Card"}
                        fill
                        className="object-cover"
                      />
                    </div>
                    <div className="absolute -bottom-1 left-0 right-0 flex justify-center">
                      {renderStars(deal.card_level || 1, "sm")}
                    </div>
                  </div>

                  <div className="absolute -top-4 -right-4 bg-violet-600 text-white text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1 shadow-lg">
                    <Sparkles className="h-3 w-3" />
                    <span>Daily Deal</span>
                  </div>
                </div>
              </div>

              {/* Card Details */}
              <div className="bg-gray-800 rounded-t-3xl px-6 pt-6 pb-8 -mt-6 relative z-10">
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xl font-bold text-white">{deal.card_name}</h3>
                    <Badge className={rarityStyle.badge}>{deal.card_rarity}</Badge>
                  </div>
                  <p className={`text-sm ${rarityStyle.text}`}>{deal.card_character}</p>
                  <p className="text-sm text-gray-400 mt-3">{deal.description}</p>
                </div>

                {/* What's Included */}
                <div className="bg-gray-900/50 rounded-xl p-4 mb-5 border border-gray-700/50">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">What's Included:</h4>
                  <div className="space-y-3">
                    <div className="flex items-center">
                      <div
                        className={`w-9 h-9 rounded-md ${rarityStyle.border} border flex items-center justify-center mr-3 bg-gray-800`}
                      >
                        <span className={`text-xs font-bold ${rarityStyle.text}`}>★{deal.card_level}</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-white">{deal.card_name}</p>
                        <p className="text-xs text-gray-400">
                          Level {deal.card_level} {deal.card_rarity} Card
                        </p>
                      </div>
                    </div>

                    {deal.classic_tickets && deal.classic_tickets > 0 && (
                      <div className="flex items-center">
                        <div className="w-9 h-9 rounded-md bg-blue-900/30 border border-blue-700/50 flex items-center justify-center mr-3">
                          <Ticket className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{deal.classic_tickets} Classic Tickets</p>
                          <p className="text-xs text-gray-400">For classic card packs</p>
                        </div>
                      </div>
                    )}

                    {deal.elite_tickets && deal.elite_tickets > 0 && (
                      <div className="flex items-center">
                        <div className="w-9 h-9 rounded-md bg-purple-900/30 border border-purple-700/50 flex items-center justify-center mr-3">
                          <Crown className="h-4 w-4 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{deal.elite_tickets} Elite Tickets</p>
                          <p className="text-xs text-gray-400">For elite card packs</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Price and Action */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-400">Price:</p>
                    <p className="text-2xl font-bold text-violet-400">{price
    ? `${(deal.price / price).toFixed(2)} WLD`
    : `$${deal.price.toFixed(2)} USD`}</p>
                  </div>

                  <Button
                    onClick={sendPayment}
                    disabled={isPurchasing}
                    size="lg"
                    className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white rounded-full shadow-lg shadow-violet-900/30"
                  >
                    {isPurchasing ? (
                      <>
                        <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="h-4 w-4 mr-2" />
                        Buy Now
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
