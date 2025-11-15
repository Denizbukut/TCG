"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { ShoppingBag, X, Ticket, Sparkles, Crown, Users } from "lucide-react"
// Removed Next.js Image import - using regular img tags
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { purchaseDeal } from "@/app/actions/deals"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { renderStars } from "@/utils/card-stars"
import { motion, AnimatePresence } from "framer-motion"
import { MiniKit } from "@worldcoin/minikit-js"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { useI18n } from "@/contexts/i18n-context"
import { PaymentCurrencyToggle } from "@/components/payment-currency-toggle"
import { usePaymentCurrency } from "@/contexts/payment-currency-context"
import { useAnixPrice } from "@/contexts/AnixPriceContext"
import { ERC20_TRANSFER_ABI, PAYMENT_RECIPIENT, getTransferDetails } from "@/lib/payment-utils"

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
  creator_address?: string
  obtainable?: boolean
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
  const { t } = useI18n()
  const { price: wldPrice } = useWldPrice()
  const { price: anixPrice } = useAnixPrice()
  const { currency: paymentCurrency } = usePaymentCurrency()
  const [isPurchasing, setIsPurchasing] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const hasMarkedAsSeen = useRef(false)
  const [hasOpened, setHasOpened] = useState(false)
  const [shouldMarkAsSeen, setShouldMarkAsSeen] = useState(false)
  const [creatorPercentage, setCreatorPercentage] = useState<number | null>(null)
  const priceDetails = useMemo(() => {
    if (paymentCurrency === "WLD" && (!wldPrice || wldPrice <= 0)) return null
    if (paymentCurrency === "ANIX" && (!anixPrice || anixPrice <= 0)) return null
    return getTransferDetails({
      usdAmount: deal.price,
      currency: paymentCurrency,
      wldPrice,
      anixPrice,
    })
  }, [deal.price, paymentCurrency, wldPrice, anixPrice])

  const formatPrice = (usdAmount: number) => {
    const details = getTransferDetails({
      usdAmount,
      currency: paymentCurrency,
      wldPrice,
      anixPrice,
    })
    // For ANIX, format with 2 decimal places for deals
    if (paymentCurrency === "ANIX") {
      const formatted = details.numericAmount.toFixed(2)
      return `${formatted} ANIX`
    }
    return details.displayAmount
  }
  
  // Calculate creator percentage when deal changes
  useEffect(() => {
    if (deal.card_rarity) {
      import("@/lib/creator-revenue").then((module) => {
        const split = module.getDealRevenueSplit(deal.card_rarity as any)
        setCreatorPercentage(Math.round(split.creatorShare * 100))
      })
    } else {
      setCreatorPercentage(null)
    }
  }, [deal.card_rarity])
  
  // Log when dialog opens (only once per open)
  useEffect(() => {
    if (isOpen) {
      console.log("=== DealOfTheDayDialog OPENED ===")
      console.log("isOpen:", isOpen)
      console.log("deal:", deal)
      console.log("username:", username)
    }
  }, [isOpen, deal, username])

  const [isDealValid, setIsDealValid] = useState(!!deal)

  useEffect(() => {
    setIsDealValid(!!deal)
  }, [deal])

  if (!isDealValid) return null
  const { price } = useWldPrice()

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

  // Helper function to translate rarity
  const getDisplayRarity = (rarity: string) => {
    const rarityMap: Record<string, string> = {
      common: t("rarity.common", "Common"),
      rare: t("rarity.rare", "Rare"),
      epic: t("rarity.epic", "Epic"),
      legendary: t("rarity.legendary", "Legendary"),
      goat: t("rarity.goat", "GOAT"),
    }
    return rarityMap[rarity.toLowerCase()] || rarity
  }

  const handleDismiss = async () => {
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        onClose()
        return
      }

      // Check if record exists
      const { data: interactions } = await (supabase
        .from("deal_interactions")
        .select("*")
        .eq("wallet_address", username)
        .eq("deal_id", deal.id)
        .order("purchased", { ascending: false })
        .order("interaction_date", { ascending: false })
        .limit(1) as any)

      const existingData = interactions?.[0] as any

      if (existingData) {
        // Update existing record
        await (supabase
          .from("deal_interactions") as any)
          .update({
            seen: false,
            dismissed: true,
            purchased: false,
          })
          .eq("wallet_address", username)
          .eq("deal_id", deal.id)
      } else {
        // Create new record
        await (supabase
          .from("deal_interactions") as any)
          .insert({
            wallet_address: username,
            deal_id: deal.id,
            seen: false,
            dismissed: true,
            purchased: false,
          })
      }
      
      onClose()
    } catch (error) {
      console.error("Error dismissing deal:", error)
      onClose()
    }
  }
  // Update the sendPayment function to reflect the promotional price
  
  const sendPayment = async () => {
    if (!priceDetails) {
      toast({
        title: t("deals.payment_unavailable", "Payment unavailable"),
        description: t("deals.failed_process_payment", "Failed to process payment"),
        variant: "destructive",
      })
      return
    }

    try {
      const hasCreator = deal.creator_address && deal.creator_address.trim() !== ""

      let transactions: any[] = []

      if (hasCreator && deal.card_rarity) {
        const { getDealRevenueSplit } = await import("@/lib/creator-revenue")
        const split = getDealRevenueSplit(deal.card_rarity as any)

        const devTransfer = getTransferDetails({
          usdAmount: deal.price * split.devShare,
          currency: paymentCurrency,
          wldPrice,
          anixPrice,
        })

        const creatorTransfer = getTransferDetails({
          usdAmount: deal.price * split.creatorShare,
          currency: paymentCurrency,
          wldPrice,
          anixPrice,
        })

        console.log("Split payment:", {
          totalUsd: deal.price,
          currency: paymentCurrency,
          devShare: `${(split.devShare * 100).toFixed(1)}% = ${devTransfer.displayAmount}`,
          creatorShare: `${(split.creatorShare * 100).toFixed(1)}% = ${creatorTransfer.displayAmount}`,
          creatorAddress: deal.creator_address,
        })

        transactions = [
          {
            address: devTransfer.tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [PAYMENT_RECIPIENT, devTransfer.rawAmount],
          },
          {
            address: creatorTransfer.tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [deal.creator_address, creatorTransfer.rawAmount],
          },
        ]
      } else {
        transactions = [
          {
            address: priceDetails.tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [PAYMENT_RECIPIENT, priceDetails.rawAmount],
          },
        ]
      }

      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: transactions,
      })

      if (finalPayload.status === "success") {
        handlePurchase()
      } else {
        console.error("Payment failed:", finalPayload)
        toast({
          title: t("deals.payment_failed", "Payment Failed"),
          description: t("deals.transaction_unsuccessful", "Transaction was not successful"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error in sendPayment:", error)
      toast({
        title: t("deals.payment_error", "Payment Error"),
        description: t("deals.failed_process_payment", "Failed to process payment"),
        variant: "destructive",
      })
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
          title: t("deals.purchase_failed", "Purchase Failed"),
          description: result.error || t("deals.failed_purchase_deal", "Failed to purchase the deal"),
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error purchasing deal:", error)
      toast({
        title: t("common.error", "Error"),
        description: t("common.unexpected_error", "An unexpected error occurred"),
        variant: "destructive",
      })
    } finally {
      if (!showSuccess) {
        setIsPurchasing(false)
      }
    }
  }
  
  // Mark deal as seen when dialog opens - client-side
  useEffect(() => {
    if (isOpen && deal && username && !hasMarkedAsSeen.current) {
      const markAsSeen = async () => {
        try {
          const supabase = getSupabaseBrowserClient()
          if (!supabase) return

          // Check if record already exists and is already seen
          const { data: interactions } = await (supabase
            .from("deal_interactions")
            .select("*")
            .eq("wallet_address", username)
            .eq("deal_id", deal.id)
            .order("purchased", { ascending: false })
            .order("interaction_date", { ascending: false })
            .limit(1) as any)

          const existingData = interactions?.[0] as any

          // If record exists and is already seen, don't do anything
          if (existingData && existingData.seen) {
            hasMarkedAsSeen.current = true
            return
          }

          if (existingData) {
            // Update existing record
            await (supabase
              .from("deal_interactions") as any)
              .update({
                seen: true,
                dismissed: false,
                purchased: false,
              })
              .eq("wallet_address", username)
              .eq("deal_id", deal.id)
          } else {
            // Create new record
            await (supabase
              .from("deal_interactions") as any)
              .insert({
                wallet_address: username,
                deal_id: deal.id,
                seen: true,
                dismissed: false,
                purchased: false,
              })
          }
          
          hasMarkedAsSeen.current = true
        } catch (error) {
          console.error("Error marking deal as seen:", error)
        }
      }

      markAsSeen()
    }
  }, [isOpen, deal, username])

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
        <DialogTitle className="sr-only">{t("deals.deal_of_the_day", "Deal of the Day")}</DialogTitle>
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
                {t("deals.purchase_successful", "Purchase Successful!")}
              </motion.h3>
              <motion.p
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className="text-gray-400"
              >
                {t("deals.claimed_special_deal", "You've claimed today's special deal")}
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
                      <img
                        src={
                          getCloudflareImageUrl(deal.card_image_url) ||
                          `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(deal.card_name || "anime character")}`
                        }
                        alt={deal.card_name || "Card"}
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute bottom-2 left-0 right-0 flex justify-center">
                      {renderStars(deal.card_level || 1, "sm")}
                    </div>
                  </div>

                  <div className="absolute -top-4 -right-4 bg-violet-600 text-white text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1 shadow-lg">
                    <Sparkles className="h-3 w-3" />
                    <span>{t("deals.daily_deal", "Daily Deal")}</span>
                  </div>
                </div>
              </div>

              {/* Card Details */}
              <div className="bg-gray-800 rounded-t-3xl px-6 pt-6 pb-8 -mt-6 relative z-10">
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="text-xl font-bold text-white">{deal.card_name}</h3>
                    <Badge className={rarityStyle.badge}>{getDisplayRarity(deal.card_rarity)}</Badge>
                  </div>
                  <p className={`text-sm ${rarityStyle.text}`}>{deal.card_character}</p>
                  <p className="text-sm text-gray-400 mt-3">{deal.description}</p>
                </div>

                {/* What's Included */}
                <div className="bg-gray-900/50 rounded-xl p-4 mb-5 border border-gray-700/50">
                  <h4 className="text-sm font-medium text-gray-300 mb-3">{t("deals.whats_included", "What's Included")}</h4>
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
                          {t("common.level", "Level")} {deal.card_level} {getDisplayRarity(deal.card_rarity)}
                        </p>
                      </div>
                    </div>

                    {deal.classic_tickets && deal.classic_tickets > 0 && (
                      <div className="flex items-center">
                        <div className="w-9 h-9 rounded-md bg-blue-900/30 border border-blue-700/50 flex items-center justify-center mr-3">
                          <Ticket className="h-4 w-4 text-blue-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{deal.classic_tickets} {t("deals.regular_tickets", "Regular Tickets")}</p>
                          <p className="text-xs text-gray-400">{t("deals.for_regular_packs", "For regular card packs")}</p>
                        </div>
                      </div>
                    )}

                    {deal.elite_tickets && deal.elite_tickets > 0 && (
                      <div className="flex items-center">
                        <div className="w-9 h-9 rounded-md bg-purple-900/30 border border-purple-700/50 flex items-center justify-center mr-3">
                          <Crown className="h-4 w-4 text-purple-400" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-white">{deal.elite_tickets} {t("deals.legendary_tickets", "Legendary Tickets")}</p>
                          <p className="text-xs text-gray-400">{t("deals.for_legendary_packs", "For legendary card packs")}</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Creator Info */}
                {deal.creator_address && creatorPercentage !== null && (
                  <div className="bg-green-900/20 rounded-lg p-3 mb-5 border border-green-700/30">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-green-400" />
                      <div>
                        <p className="text-xs text-green-300 font-medium">
                          {t("deals.creator_receives_percent", "Card Creator receives {percent}% of purchase", { percent: creatorPercentage })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Price and Action */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex flex-col items-start gap-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-400">{t("common.price", "Price")}</p>
                      <PaymentCurrencyToggle size="sm" className="max-w-[150px]" />
                    </div>
                    <p className="text-2xl font-bold text-violet-400">
                      {priceDetails ? formatPrice(deal.price) : `$${deal.price.toFixed(2)} USD`}
                    </p>
                  </div>

                  <Button
                    onClick={sendPayment}
                    disabled={isPurchasing || !priceDetails}
                    size="lg"
                    className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white rounded-full shadow-lg shadow-violet-900/30 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    {isPurchasing ? (
                      <>
                        <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                        {t("common.processing", "Processing...")}
                      </>
                    ) : (
                      <>
                        <ShoppingBag className="h-4 w-4 mr-2" />
                        {t("deals.buy_now", "Buy Now")}
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
