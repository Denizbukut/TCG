"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ShoppingBag, Ticket, Crown, Sparkles, X, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toast } from "@/components/ui/use-toast"
import { getDailyDealsBatch, purchaseBatchDeal } from "@/app/actions/deals"
import { renderStars } from "@/utils/card-stars"
import { useI18n } from "@/contexts/i18n-context"
import { usePaymentCurrency } from "@/contexts/payment-currency-context"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { useAnixPrice } from "@/contexts/AnixPriceContext"
import { PaymentCurrencyToggle } from "@/components/payment-currency-toggle"
import { MiniKit } from "@worldcoin/minikit-js"
import { ERC20_TRANSFER_ABI, PAYMENT_RECIPIENT, getTransferDetails } from "@/lib/payment-utils"

interface BatchDeal {
  id: number
  batch_timestamp: string
  deal_index: number
  card_id: string
  card_level: number
  classic_tickets: number
  elite_tickets: number
  normal_tickets: number
  legendary_tickets: number
  price: number
  description: string
  discount_percentage: number
  card_name: string
  card_image_url: string
  card_rarity: string
  card_character: string
  creator_address?: string
}

interface DailyDealsBatchProps {
  walletAddress: string
  onPurchaseSuccess?: (newTickets: number, newEliteTickets: number) => void
}

const getCloudflareImageUrl = (imagePath?: string) => {
  if (!imagePath) {
    return "/placeholder.svg"
  }

  let cleaned = imagePath.replace(/^\/?(world[-_])?soccer\//i, "")

  if (cleaned.startsWith("http")) {
    return cleaned
  }

  const finalUrl = `https://ani-labs.xyz/${encodeURIComponent(cleaned)}`
  return finalUrl
}

export default function DailyDealsBatch({ walletAddress, onPurchaseSuccess }: DailyDealsBatchProps) {
  const { t } = useI18n()
  const { price: wldPrice } = useWldPrice()
  const { price: anixPrice } = useAnixPrice()
  const { currency: paymentCurrency } = usePaymentCurrency()
  const [deals, setDeals] = useState<BatchDeal[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [purchasingDealId, setPurchasingDealId] = useState<number | null>(null)
  const [timeUntilUpdate, setTimeUntilUpdate] = useState<string>("")
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false)
  const [selectedDeal, setSelectedDeal] = useState<BatchDeal | null>(null)
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(false)
  const [purchasedDeal, setPurchasedDeal] = useState<BatchDeal | null>(null)

  useEffect(() => {
    const fetchDeals = async () => {
      try {
        setLoading(true)
        const result = await getDailyDealsBatch()
        if (result.success && result.deals) {
          setDeals(result.deals as BatchDeal[])
        } else {
          console.log("No batch deals available")
        }
      } catch (error) {
        console.error("Error fetching batch deals:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchDeals()
  }, [])

  // Calculate time until next update (every 3 hours)
  useEffect(() => {
    if (deals.length === 0) return

    const updateTimer = () => {
      const batchTimestamp = deals[0]?.batch_timestamp
      if (!batchTimestamp) return

      const batchTime = new Date(batchTimestamp).getTime()
      const nextUpdateTime = batchTime + 3 * 60 * 60 * 1000 // Add 3 hours
      const now = Date.now()
      const timeLeft = nextUpdateTime - now

      if (timeLeft <= 0) {
        setTimeUntilUpdate("Updating soon...")
        return
      }

      const hours = Math.floor(timeLeft / (1000 * 60 * 60))
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)

      if (hours > 0) {
        setTimeUntilUpdate(`${hours}h ${minutes}m ${seconds}s`)
      } else if (minutes > 0) {
        setTimeUntilUpdate(`${minutes}m ${seconds}s`)
      } else {
        setTimeUntilUpdate(`${seconds}s`)
      }
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [deals])

  const formatPrice = (usdAmount: number) => {
    const details = getTransferDetails({
      usdAmount,
      currency: paymentCurrency,
      wldPrice,
      anixPrice,
    })
    if (paymentCurrency === "ANIX") {
      const formatted = details.numericAmount.toFixed(2)
      return `${formatted} ANIX`
    }
    return details.displayAmount
  }

  const getDisplayRarity = (rarity: string) => {
    const rarityMap: Record<string, string> = {
      common: t("rarity.common", "Common"),
      uncommon: t("rarity.uncommon", "Uncommon"),
      rare: t("rarity.rare", "Rare"),
      epic: t("rarity.epic", "Epic"),
      legendary: t("rarity.legendary", "Legendary"),
      mythic: t("rarity.mythic", "Mythic"),
      goat: t("rarity.goat", "GOAT"),
    }
    return rarityMap[rarity.toLowerCase()] || rarity
  }

  const rarityStyles = {
    common: {
      border: "border-gray-400",
      text: "text-gray-300",
      badge: "bg-gray-700 text-gray-200",
      glow: "shadow-[0_0_15px_rgba(156,163,175,0.5)]",
    },
    rare: {
      border: "border-blue-400",
      text: "text-blue-300",
      badge: "bg-blue-900 text-blue-200",
      glow: "shadow-[0_0_15px_rgba(59,130,246,0.5)]",
    },
    epic: {
      border: "border-purple-400",
      text: "text-purple-300",
      badge: "bg-purple-900 text-purple-200",
      glow: "shadow-[0_0_15px_rgba(147,51,234,0.5)]",
    },
    legendary: {
      border: "border-yellow-400",
      text: "text-yellow-300",
      badge: "bg-amber-900 text-amber-200",
      glow: "shadow-[0_0_20px_rgba(251,191,36,0.6)]",
    },
  }

  const handlePurchaseClick = (deal: BatchDeal) => {
    setSelectedDeal(deal)
    setConfirmDialogOpen(true)
  }

  const handlePurchase = async () => {
    if (!walletAddress || !selectedDeal) {
      toast({
        title: t("common.error", "Error"),
        description: t("deals.wallet_required", "Wallet address required"),
        variant: "destructive",
      })
      setConfirmDialogOpen(false)
      return
    }

    setConfirmDialogOpen(false)
    setPurchasingDealId(selectedDeal.id)

    try {
      const priceDetails = getTransferDetails({
        usdAmount: selectedDeal.price,
        currency: paymentCurrency,
        wldPrice,
        anixPrice,
      })

      if (!priceDetails) {
        toast({
          title: t("deals.payment_unavailable", "Payment unavailable"),
          description: t("deals.failed_process_payment", "Failed to process payment"),
          variant: "destructive",
        })
        setPurchasingDealId(null)
        return
      }

      // Handle creator payment if needed
      let transactions: any[] = []
      if (selectedDeal.creator_address && selectedDeal.card_rarity) {
        const { getDealRevenueSplit } = await import("@/lib/creator-revenue")
        const split = getDealRevenueSplit(selectedDeal.card_rarity as any)

        const devTransfer = getTransferDetails({
          usdAmount: selectedDeal.price * split.devShare,
          currency: paymentCurrency,
          wldPrice,
          anixPrice,
        })

        const creatorTransfer = getTransferDetails({
          usdAmount: selectedDeal.price * split.creatorShare,
          currency: paymentCurrency,
          wldPrice,
          anixPrice,
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
            args: [selectedDeal.creator_address, creatorTransfer.rawAmount],
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
        // Complete the purchase
        const result = await purchaseBatchDeal(walletAddress, selectedDeal.id)

        if (result.success) {
          // Close the main deals dialog and confirmation dialog
          setIsDialogOpen(false)
          setConfirmDialogOpen(false)
          
          // Show success overlay
          setPurchasedDeal(selectedDeal)
          setShowSuccessOverlay(true)
          
          // Also show toast
          toast({
            title: t("deals.purchase_successful", "Purchase Successful!"),
            description: t("deals.deal_purchased", "You've successfully purchased the deal"),
          })

          if (onPurchaseSuccess && typeof result.newTickets === "number" && typeof result.newEliteTickets === "number") {
            onPurchaseSuccess(result.newTickets, result.newEliteTickets)
          }
          
          // Auto-close success overlay after 3 seconds
          setTimeout(() => {
            setShowSuccessOverlay(false)
            setPurchasedDeal(null)
          }, 3000)
        } else {
          toast({
            title: t("deals.purchase_failed", "Purchase Failed"),
            description: result.error || t("deals.failed_purchase_deal", "Failed to purchase the deal"),
            variant: "destructive",
          })
        }
      } else {
        toast({
          title: t("deals.payment_failed", "Payment Failed"),
          description: t("deals.transaction_unsuccessful", "Transaction was not successful"),
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
      setPurchasingDealId(null)
    }
  }

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-[#232526] to-[#414345] rounded-xl shadow-lg p-4 border-2 border-violet-400/50 h-full flex items-center justify-center">
        <div className="h-6 w-6 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
      </div>
    )
  }

  if (deals.length === 0) {
    return null
  }

  return (
    <>
      {/* Preview Card */}
      <div className="relative h-full">
        <motion.div
          className="bg-gradient-to-br from-violet-900/30 via-purple-900/20 to-fuchsia-900/30 rounded-xl shadow-2xl border-2 border-violet-500/60 p-5 h-full cursor-pointer relative overflow-hidden group"
          onClick={() => setIsDialogOpen(true)}
          whileHover={{ scale: 1.02, borderColor: "rgba(167, 139, 250, 0.9)" }}
          whileTap={{ scale: 0.98 }}
        >
          {/* Animated background gradient */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-br from-violet-600/20 via-purple-600/10 to-fuchsia-600/20"
            animate={{
              backgroundPosition: ["0% 0%", "100% 100%"],
            }}
            transition={{
              duration: 5,
              repeat: Infinity,
              repeatType: "reverse",
            }}
          />
          
          {/* Glow effect on hover */}
          <div className="absolute inset-0 bg-gradient-to-br from-violet-500/0 to-fuchsia-500/0 group-hover:from-violet-500/20 group-hover:to-fuchsia-500/20 transition-all duration-300 rounded-xl blur-xl" />
          
          {/* Shine effect */}
          <motion.div
            className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -skew-x-12"
            initial={{ x: "-100%" }}
            animate={{ x: "200%" }}
            transition={{
              duration: 3,
              repeat: Infinity,
              repeatDelay: 2,
              ease: "easeInOut",
            }}
          />
          
          <div className="relative z-10 flex flex-col items-center justify-center h-full">
            {/* 4 Card Icons Grid with enhanced styling */}
            <div className="grid grid-cols-2 gap-3">
              {deals.slice(0, 4).map((deal, index) => {
                const rarityStyle = rarityStyles[deal.card_rarity as keyof typeof rarityStyles] || rarityStyles.common
                return (
                  <motion.div
                    key={deal.id}
                    initial={{ opacity: 0, scale: 0.8, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: index * 0.1, duration: 0.3 }}
                    whileHover={{ scale: 1.1, z: 10 }}
                    className={`relative w-18 h-24 rounded-lg border-2 ${rarityStyle.border} overflow-hidden bg-black/50 backdrop-blur-sm shadow-lg group/card`}
                  >
                    {/* Card glow effect */}
                    <div className={`absolute inset-0 ${rarityStyle.glow} opacity-0 group-hover/card:opacity-100 transition-opacity duration-300`} />
                    
                    <img
                      src={getCloudflareImageUrl(deal.card_image_url)}
                      alt={deal.card_name}
                      className="w-full h-full object-cover transition-transform duration-300 group-hover/card:scale-110"
                    />
                    
                    {/* Overlay gradient */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover/card:opacity-100 transition-opacity duration-300" />
                  </motion.div>
                )
              })}
            </div>
          </div>
          
          {/* Decorative corner elements */}
          <div className="absolute top-0 left-0 w-20 h-20 bg-gradient-to-br from-violet-500/20 to-transparent rounded-br-full opacity-50" />
          <div className="absolute bottom-0 right-0 w-20 h-20 bg-gradient-to-tl from-fuchsia-500/20 to-transparent rounded-tl-full opacity-50" />
        </motion.div>
        
        {/* Daily Deals Tag - Top Right Overlapping (outside the card) */}
        <motion.div
          className="absolute top-0 right-0 z-30"
          initial={{ scale: 0.9, opacity: 0.8 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Badge className="bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white px-3 py-1.5 text-xs font-bold shadow-lg shadow-violet-500/50 border border-violet-400/50 -translate-y-1/2 translate-x-1/2 -translate-x-2">
            <Sparkles className="h-3 w-3 mr-1 inline" />
            {t("deals.daily_deals", "Daily Deals")}
          </Badge>
        </motion.div>
      </div>

      {/* Dialog/Overlay */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden rounded-xl border-0 bg-gray-900 text-white max-h-[90vh] overflow-y-auto">
          <DialogTitle className="sr-only">{t("deals.daily_deals", "Daily Deals")}</DialogTitle>
          
          {/* Header */}
          <div className="sticky top-0 z-20 bg-gray-900/95 backdrop-blur-sm border-b border-gray-700 px-6 py-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-3">
                <Sparkles className="h-6 w-6 text-violet-400" />
                <h2 className="text-2xl font-bold text-white">{t("deals.daily_deals", "Daily Deals")}</h2>
                <Badge className="bg-violet-600 text-white px-3 py-1">{deals.length}</Badge>
              </div>
              <button
                onClick={() => setIsDialogOpen(false)}
                className="bg-gray-800/50 rounded-full p-2 hover:bg-gray-700/50 transition-colors"
              >
                <X className="h-5 w-5 text-gray-300" />
              </button>
            </div>
            {/* Timer */}
            {timeUntilUpdate && (
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <Clock className="h-4 w-4" />
                <span>
                  {t("deals.next_update", "Next update in")}: <span className="text-violet-400 font-semibold">{timeUntilUpdate}</span>
                </span>
              </div>
            )}
          </div>

          {/* Deals Grid */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {deals.map((deal, index) => {
                const rarityStyle = rarityStyles[deal.card_rarity as keyof typeof rarityStyles] || rarityStyles.common
                const priceDetails = getTransferDetails({
                  usdAmount: deal.price,
                  currency: paymentCurrency,
                  wldPrice,
                  anixPrice,
                })

                return (
                  <motion.div
                    key={deal.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                    className="bg-gray-800/80 rounded-xl p-5 border border-gray-700 hover:border-violet-500/50 transition-colors"
                  >
                    {/* Card Image and Info */}
                    <div className="flex gap-4 mb-4">
                      <div className={`relative w-24 h-32 ${rarityStyle.glow} flex-shrink-0`}>
                        <div className={`absolute inset-0 rounded-lg ${rarityStyle.border} border-2 overflow-hidden`}>
                          <img
                            src={getCloudflareImageUrl(deal.card_image_url)}
                            alt={deal.card_name}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        {/* Level stars are shown on the card image itself */}
                        <div className="absolute bottom-1 left-0 right-0 flex justify-center">
                          {renderStars(deal.card_level, "xs")}
                        </div>
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-2 mb-2">
                          <h4 className="text-lg font-bold text-white truncate">{deal.card_name}</h4>
                          <Badge className={`${rarityStyle.badge} flex-shrink-0`}>
                            {getDisplayRarity(deal.card_rarity)}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-400 mb-3 line-clamp-2">{deal.card_character}</p>

                        {/* Tickets - Only classic and elite */}
                        <div className="flex flex-wrap gap-2 mb-2">
                          {deal.classic_tickets > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-900/40 text-blue-200 text-xs font-medium border border-blue-700/50">
                              <Ticket className="h-3.5 w-3.5" />
                              {deal.classic_tickets} {t("deals.classic", "Classic")}
                            </span>
                          )}
                          {deal.elite_tickets > 0 && (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-900/40 text-purple-200 text-xs font-medium border border-purple-700/50">
                              <Crown className="h-3.5 w-3.5" />
                              {deal.elite_tickets} {t("deals.elite", "Elite")}
                            </span>
                          )}
                        </div>
                        {/* Card Level */}
                        <div className="text-xs text-gray-400">
                          {t("deals.card_level", "Card Level")}: <span className="text-white font-semibold">{deal.card_level}</span>
                        </div>
                      </div>
                    </div>

                        {/* Price and Buy Button */}
                        <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="text-xs text-gray-400">{t("common.price", "Price")}</p>
                              <PaymentCurrencyToggle size="sm" className="max-w-[100px]" currencies={["WLD", "USDC"]} />
                            </div>
                            <p className="text-xl font-bold text-violet-400">
                              {priceDetails ? formatPrice(deal.price) : `$${deal.price.toFixed(2)} USD`}
                            </p>
                          </div>
                      <Button
                        onClick={() => handlePurchaseClick(deal)}
                        disabled={purchasingDealId === deal.id || !priceDetails}
                        size="sm"
                        className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white rounded-full ml-4"
                      >
                        {purchasingDealId === deal.id ? (
                          <>
                            <div className="h-3 w-3 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
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
                  </motion.div>
                )
              })}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Purchase Confirmation Dialog */}
      <AlertDialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
        <AlertDialogContent className="bg-gray-900 text-white border-gray-700">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold text-white">
              {t("deals.confirm_purchase", "Confirm Purchase")}
            </AlertDialogTitle>
          </AlertDialogHeader>
          {selectedDeal && (() => {
            const confirmPriceDetails = getTransferDetails({
              usdAmount: selectedDeal.price,
              currency: paymentCurrency,
              wldPrice,
              anixPrice,
            })
            return (
              <div className="space-y-3 mt-2">
                <div className="flex items-center gap-3">
                  <div className={`relative w-16 h-20 rounded-lg border-2 ${
                    rarityStyles[selectedDeal.card_rarity as keyof typeof rarityStyles]?.border || "border-gray-400"
                  } overflow-hidden`}>
                    <img
                      src={getCloudflareImageUrl(selectedDeal.card_image_url)}
                      alt={selectedDeal.card_name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div>
                    <p className="font-semibold text-white">{selectedDeal.card_name}</p>
                    <p className="text-sm text-gray-400">{selectedDeal.card_character}</p>
                  </div>
                </div>
                
                <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{t("common.price", "Price")}:</span>
                    <span className="font-bold text-violet-400">
                      {confirmPriceDetails ? formatPrice(selectedDeal.price) : `$${selectedDeal.price.toFixed(2)} USD`}
                    </span>
                  </div>
                  {selectedDeal.classic_tickets > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Ticket className="h-3.5 w-3.5" />
                        {t("deals.classic", "Classic")} {t("deals.tickets", "Tickets")}:
                      </span>
                      <span className="font-semibold text-blue-300">+{selectedDeal.classic_tickets}</span>
                    </div>
                  )}
                  {selectedDeal.elite_tickets > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-gray-400 flex items-center gap-1">
                        <Crown className="h-3.5 w-3.5" />
                        {t("deals.elite", "Elite")} {t("deals.tickets", "Tickets")}:
                      </span>
                      <span className="font-semibold text-purple-300">+{selectedDeal.elite_tickets}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-400">{t("deals.card_level", "Card Level")}:</span>
                    <span className="font-semibold text-white">{selectedDeal.card_level}</span>
                  </div>
                </div>
                
                <p className="text-xs text-gray-500 pt-2">
                  {t("deals.purchase_confirmation_note", "You will receive the card and tickets after payment confirmation.")}
                </p>
              </div>
            )
          })()}
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-gray-800 text-gray-200 hover:bg-gray-700 border-gray-700">
              {t("common.cancel", "Cancel")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePurchase}
              className="bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:from-violet-700 hover:to-fuchsia-700 text-white"
            >
              {t("deals.confirm_and_pay", "Confirm & Pay")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Success Overlay */}
      <AnimatePresence>
        {showSuccessOverlay && purchasedDeal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm"
            onClick={() => {
              setShowSuccessOverlay(false)
              setPurchasedDeal(null)
            }}
          >
            <motion.div
              initial={{ scale: 0.8, y: 20, opacity: 0 }}
              animate={{ scale: 1, y: 0, opacity: 1 }}
              exit={{ scale: 0.8, y: 20, opacity: 0 }}
              transition={{ type: "spring", damping: 15, stiffness: 300 }}
              className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl p-8 max-w-md w-full mx-4 border-2 border-green-500/50 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                  transition={{ delay: 0.2, duration: 0.5 }}
                  className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mb-4 border-2 border-green-500"
                >
                  <ShoppingBag className="h-10 w-10 text-green-400" />
                </motion.div>

                <motion.h2
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-2xl font-bold mb-2 text-green-400"
                >
                  {t("deals.purchase_successful", "Purchase Successful!")}
                </motion.h2>

                <motion.p
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.4 }}
                  className="text-gray-300 mb-4"
                >
                  {t("deals.deal_purchased", "You've successfully purchased the deal")}
                </motion.p>

                {purchasedDeal && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5 }}
                    className="w-full space-y-3"
                  >
                    <div className="flex items-center gap-3 bg-gray-800/50 rounded-lg p-3">
                      <div className={`relative w-16 h-20 rounded-lg border-2 ${
                        rarityStyles[purchasedDeal.card_rarity as keyof typeof rarityStyles]?.border || "border-gray-400"
                      } overflow-hidden flex-shrink-0`}>
                        <img
                          src={getCloudflareImageUrl(purchasedDeal.card_image_url)}
                          alt={purchasedDeal.card_name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1 text-left">
                        <p className="font-semibold text-white">{purchasedDeal.card_name}</p>
                        <p className="text-sm text-gray-400">{purchasedDeal.card_character}</p>
                      </div>
                    </div>

                    <div className="bg-gray-800/50 rounded-lg p-3 space-y-2">
                      {purchasedDeal.classic_tickets > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 flex items-center gap-1">
                            <Ticket className="h-4 w-4 text-blue-400" />
                            {t("deals.classic", "Classic")} {t("deals.tickets", "Tickets")}:
                          </span>
                          <span className="font-bold text-blue-300">+{purchasedDeal.classic_tickets}</span>
                        </div>
                      )}
                      {purchasedDeal.elite_tickets > 0 && (
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-400 flex items-center gap-1">
                            <Crown className="h-4 w-4 text-purple-400" />
                            {t("deals.elite", "Elite")} {t("deals.tickets", "Tickets")}:
                          </span>
                          <span className="font-bold text-purple-300">+{purchasedDeal.elite_tickets}</span>
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}

                <motion.div
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="mt-6"
                >
                  <Button
                    onClick={() => {
                      setShowSuccessOverlay(false)
                      setPurchasedDeal(null)
                    }}
                    className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white rounded-full"
                  >
                    {t("common.ok", "OK")}
                  </Button>
                </motion.div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
