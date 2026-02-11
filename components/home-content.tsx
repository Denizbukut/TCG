"use client"

import { useState, useEffect, useRef, useMemo } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useAuth } from "@/contexts/auth-context"
import { useI18n } from "@/contexts/i18n-context"
import { claimDailyBonus } from "@/app/actions"
import { purchaseDeal } from "@/app/actions/deals" // Import purchaseDeal (markDealAsSeen moved to client-side in DealOfTheDayDialog)
// getActiveTimeDiscount moved to client-side
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import LanguageSwitcher from "@/components/language-switcher"
import CardCatalog from "@/components/card-catalog"
import { useRouter, usePathname } from "next/navigation"
import { getTimeUntilContestEnd, isContestActive } from "@/lib/weekly-contest-config"

// Add ChatOverlay component at the bottom of the file
import { MessageCircle, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { formatDistanceToNow } from "date-fns"
import Image from "next/image"
import {
  Ticket,
  Gift,
  CreditCard,
  Clock,
  ChevronRight,
  Crown,
  ShoppingCart,
  Trophy,
  Shield,
  Users,
  CheckCircle,
  ArrowRight,
  BookOpen,
  Repeat,
  Sparkles,
  ChevronLeft,
  ShoppingBag,
  Target,
  Star,
  Info,
  Home as HomeIcon,
  Globe,
  Send,
} from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import DealOfTheDayDialog from "@/components/deal-of-the-day-dialog"
import DailyDealsBatch from "@/components/daily-deals-batch"
import { Badge } from "@/components/ui/badge"
import { MiniKit } from "@worldcoin/minikit-js"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { claimReferralRewardForUser } from "@/app/actions/referrals"
import { Progress } from "@/components/ui/progress" // Import Progress component
import { renderStars } from "@/utils/card-stars"
import { PaymentCurrencyToggle } from "@/components/payment-currency-toggle"
import { AniAds } from 'ani-ads-sdk'
import { usePaymentCurrency } from "@/contexts/payment-currency-context"
import {
  type PaymentCurrency,
  ERC20_TRANSFER_ABI,
  PAYMENT_RECIPIENT,
  getTransferDetails,
} from "@/lib/payment-utils"
import { useAnixPrice } from "@/contexts/AnixPriceContext"

// Add the Cloudflare URL function
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

// XP Color definitions
const XP_COLORS = {
  red: { start: "#ef4444", end: "#dc2626" },
  blue: { start: "#3b82f6", end: "#1d4ed8" },
  green: { start: "#10b981", end: "#059669" },
  purple: { start: "#8b5cf6", end: "#7c3aed" },
  orange: { start: "#f97316", end: "#ea580c" },
  pink: { start: "#ec4899", end: "#db2777" }
}

interface LevelReward {
  level: number
  standardClaimed: boolean
  premiumClaimed: boolean
  isSpecialLevel?: boolean
}


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
}

// New interface for Special Deal
interface SpecialDeal {
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
  // icon_tickets: number // Removed - no longer used
}

interface DealInteraction {
  seen: boolean
  dismissed: boolean
  purchased: boolean
}

// Define the clan info interface
interface ClanInfo {
  id: string
  name: string
  level: number
  member_count: number
}

// Verschiebe dies nach oben, direkt vor passSlides:
const xpPassBenefits = [
  'Double XP for 1 hour',
  'Exclusive XP missions',
  'XP leaderboard access',
]


export default function Home() {
  const { user, updateUserTickets, refreshUserData } = useAuth()
  const { t } = useI18n()
  const pathname = usePathname()
  
  // Helper function to translate rarity
  const getDisplayRarity = (rarity: string) => {
    const rarityMap: Record<string, string> = {
      basic: t("rarity.basic", "Basic"),
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
  
  const [claimLoading, setClaimLoading] = useState(false)
  const [referralLoading, setReferralLoading] = useState(false)
  const [alreadyClaimed, setAlreadyClaimed] = useState(false)
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState<number | null>(null)
  const [eliteTickets, setEliteTickets] = useState(0)
  const [tickets, setTickets] = useState(0)
  const [showClaimAnimation, setShowClaimAnimation] = useState(false)
  const [hasPremium, setHasPremium] = useState(false)
  const [canClaimLegendary, setCanClaimLegendary] = useState(0) // Changed to number for unclaimed count
  const [unclaimedRewards, setUnclaimedRewards] = useState(0)
  const [levelRewards, setLevelRewards] = useState<LevelReward[]>([])
  const [lastLegendaryClaim, setLastLegendaryClaim] = useState<Date | null>(null)
  const lastFetchedRef = useRef<number>(0)
  const [contestCountdown, setContestCountdown] = useState(getTimeUntilContestEnd())
  const [userClanInfo, setUserClanInfo] = useState<ClanInfo | null>(null)
  const [specialDealCreatorPercentage, setSpecialDealCreatorPercentage] = useState<number | null>(null)
  const [referredUsers, setReferredUsers] = useState<
  {
    id: number
    username: string
    level: number
    reward_claimed: boolean
    wallet_address: string
  }[]
>([])
  
  const [currentXpColor, setCurrentXpColor] = useState("pink")
  // const [iconTickets, setIconTickets] = useState(0)
  
  // Referrals Slide system
  const [referralSbcIndex, setReferralSbcIndex] = useState<number>(0)
  
  const referralSbcSlides = [
    {
      key: 'referrals',
      title: t("referrals.title", "Referrals"),
      icon: <Gift className="h-8 w-8 text-yellow-600" />,
      bg: 'from-[#232526] to-[#414345]',
      border: 'border-yellow-400',
      text: "Invite Friends",
      action: () => setShowReferralDialog(true),
      color: 'text-yellow-100',
    },
    // {
    //   key: 'sbc',
    //   title: 'WBC',
    //   icon: <img src="/sbc-logo.svg" alt="WBC Logo" className="h-8 w-8" />,
    //   bg: 'from-purple-600 to-purple-800',
    //   border: 'border-purple-400',
    //   text: 'Complete squad challenges!',
    //   action: () => router.push('/sbc'),
    //   color: 'text-purple-100',
    //   dot: 'bg-purple-500',
    //   progress: sbcLoading ? 'Loading...' : `${sbcChallenges.filter(c => isChallengeCompleted(c.id)).length}/${sbcChallenges.length}`,
    // },
  ]
  const handleReferralSbcPrev = () => {
    if (referralSbcSlides.length > 1) {
      setReferralSbcIndex((prev) => (prev === 0 ? referralSbcSlides.length - 1 : prev - 1))
    }
  }
  const handleReferralSbcNext = () => {
    if (referralSbcSlides.length > 1) {
      setReferralSbcIndex((prev) => (prev === referralSbcSlides.length - 1 ? 0 : prev + 1))
    }
  }

  // Format contest countdown
  const formatContestCountdown = (ms: number) => {
    if (ms <= 0) return null
    const totalSeconds = Math.floor(ms / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    return { days, hours, minutes }
  }

  const [keyboardVisible, setKeyboardVisible] = useState(false)

  useEffect(() => {
    const detectKeyboard = () => {
      const viewportHeight = window.visualViewport?.height || window.innerHeight
      const fullHeight = window.innerHeight
      const keyboardIsVisible = viewportHeight < fullHeight * 0.85
      setKeyboardVisible(keyboardIsVisible)
    }
    window.visualViewport?.addEventListener("resize", detectKeyboard)
    return () => {
      window.visualViewport?.removeEventListener("resize", detectKeyboard)
    }
  }, [])


  

  const [clanBonusActive, setClanBonusActive] = useState(false)

  // Timer display state
  const [ticketTimerDisplay, setTicketTimerDisplay] = useState("00:00:00")
  const [tokenTimerDisplay, setTokenTimerDisplay] = useState("00:00:00")

  // Token minting state
  const [tokenAlreadyClaimed, setTokenAlreadyClaimed] = useState(false)
  const [timeUntilNextTokenClaim, setTimeUntilNextTokenClaim] = useState<number | null>(null)

  // Deal of the Day state
  const [dailyDeal, setDailyDeal] = useState<DailyDeal | null>(null)
  const [dailyDealInteraction, setDailyDealInteraction] = useState<DealInteraction | null>(null) // Renamed for clarity
  const [showDailyDealDialog, setShowDailyDealDialog] = useState(false) // Renamed for clarity
  const [dailyDealLoading, setDailyDealLoading] = useState(false) // Renamed for clarity
  const [hasShownDailyDeal, setHasShownDailyDeal] = useState(false) // Track if deal has been shown

  // Special Deal state - NEW
  const [specialDeal, setSpecialDeal] = useState<SpecialDeal | null>(null)
  const [specialDealInteraction, setSpecialDealInteraction] = useState<DealInteraction | null>(null) // New state for special deal interaction
  const [showSpecialDealDialog, setShowSpecialDealDialog] = useState(false) // New state for special deal dialog
  const [specialDealLoading, setSpecialDealLoading] = useState(false)
  const hasCheckedSpecialDeal = useRef(false) // New ref for special deal

  const [showReferralDialog, setShowReferralDialog] = useState(false)
  const [currentSlide, setCurrentSlide] = useState(0) // State for slide navigation
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})
  const [buyingBigPack, setBuyingBigPack] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [hasClaimableMission, setHasClaimableMission] = useState(false)

  // Refs to track if effects have run
  const hasCheckedClaims = useRef(false)
  const hasCheckedRewards = useRef(false)
  const hasCheckedTokens = useRef(false)
  const hasCheckedClan = useRef(false)
  const dailyDealCheckedRef = useRef<string | null>(null)
  const referralsCheckedRef = useRef<string | null>(null)
  const checkDiscountStatusRef = useRef(false)
  const [copied, setCopied] = useState(false)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  // Discount timer state
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(
    null,
  )
  const [hasActiveDiscount, setHasActiveDiscount] = useState(false)
  const [discountValue, setDiscountValue] = useState(0)

  const handleCopy = () => {
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }
  // Interval refs
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const tokenTimerIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const rewardsIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const [transactionId, setTransactionId] = useState<string>("")
  const [walletAddress, setWalletAddress] = useState<string>("")
  const [isChatOpen, setIsChatOpen] = useState(false)
  const { price } = useWldPrice()
  const { price: anixPrice } = useAnixPrice()
  const { currency: paymentCurrency, setCurrency: setPaymentCurrency } = usePaymentCurrency()

  const formatPrice = (usdAmount: number) => {
    const details = getTransferDetails({
      usdAmount,
      currency: paymentCurrency,
      wldPrice: price,
      anixPrice,
    })
    // For ANIX, format with 2 decimal places for deals
    if (paymentCurrency === "ANIX") {
      const formatted = details.numericAmount.toFixed(2)
      return `${formatted} ANIX`
    }
    return details.displayAmount
  }

  const specialDealHasDiscount = Boolean(
    specialDeal?.discount_percentage && specialDeal.discount_percentage > 0,
  )

  const specialDealDiscountedPrice = specialDealHasDiscount && specialDeal
    ? specialDeal.price * (1 - specialDeal.discount_percentage / 100)
    : specialDeal?.price ?? null

  const ticketClaimAmount = 3

  // Add the router constant inside the component:
  const router = useRouter()
  useEffect(() => {
    if (user?.username === "llegaraa2kwdd" || user?.username === "nadapersonal" || user?.username === "regresosss") {
      router.push("/login")
    }
  }, [user?.username, router])

  useEffect(() => {
    if (!user?.wallet_address) return

    let isActive = true

    const checkMissions = async () => {
      try {
        // Use client-side function instead of API call
        const { checkClaimableMissions } = await import("@/lib/client-mission-utils")
        const claimable = await checkClaimableMissions(user.wallet_address)
        
        if (!isActive) return
        setHasClaimableMission(claimable)
      } catch (error) {
        if (isActive) {
          if (process.env.NODE_ENV === 'development') {
            console.error("Failed to check claimable missions:", error)
          }
          setHasClaimableMission(false)
        }
      }
    }

    checkMissions()

    return () => {
      isActive = false
    }
  }, [user?.wallet_address])

  const sendPayment = async () => {
    const dollarPrice = 17
    const ticketAmount = 500
    const ticketType = "regular"

    try {
      const res = await fetch("/api/initiate-payment", { method: "POST" })
      const { id } = await res.json()

      const transferDetails = getTransferDetails({
        usdAmount: dollarPrice,
        currency: paymentCurrency,
        wldPrice: price,
        anixPrice,
      })

      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: transferDetails.tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [PAYMENT_RECIPIENT, transferDetails.rawAmount],
          },
        ],
      })

      if (finalPayload.status === "success") {
        await handleBuyTickets(ticketAmount, ticketType)
      } else {
        toast({
          title: "Payment Failed",
          description: "Payment could not be processed",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Payment error:", error)
      toast({
        title: "Payment Error",
        description: "An error occurred during payment",
        variant: "destructive",
      })
    }
  }
  // Handle buying tickets
  const handleBuyTickets = async (ticketAmount: number, ticketType: "regular" | "legendary") => {
      if (!user?.username) {
        toast({
        title: "Error",
        description: "Please log in to continue",
          variant: "destructive",
        })
        return
      }
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) {
          throw new Error("Database connection failed")
        }
        // Get current ticket counts
        const { data: userData, error: fetchError } = await (supabase
          .from("users")
        .select("tickets, legendary_tickets")
          .eq("wallet_address", user.wallet_address)
          .single() as any)
        if (fetchError) {
          throw new Error('Failed to fetch user data')
        }
        // Calculate new ticket counts - ensure we're working with numbers
        let newTicketCount = typeof userData.tickets === "number" ? userData.tickets : Number(userData.tickets) || 0
        let newLegendaryTicketCount =
          typeof userData.legendary_tickets === "number"
            ? userData.legendary_tickets
            : Number(userData.legendary_tickets) || 0
        if (ticketType === "regular") {
          newTicketCount += ticketAmount
      } else {
          newLegendaryTicketCount += ticketAmount
        }
        // Update tickets in database
        const { error: updateError } = await (supabase
          .from("users") as any)
          .update({
            tickets: newTicketCount,
            legendary_tickets: newLegendaryTicketCount,
          })
          .eq("wallet_address", user.wallet_address)
        if (updateError) {
          throw new Error("Failed to update tickets")
        }
        // Update local state with explicit number types
        setTickets(newTicketCount)
        setEliteTickets(newLegendaryTicketCount)
        // Update auth context
        await updateUserTickets?.(newTicketCount, newLegendaryTicketCount)

        // Weekly Contest: Ticket Shop Punkte vergeben (2 Punkte pro Kauf)
        try {
          const { incrementTicketShopPoints } = await import("@/app/actions/weekly-contest")
          const ticketShopPointsResult = await incrementTicketShopPoints(
            user.wallet_address,
            2
          )
          if (!ticketShopPointsResult.success) {
            console.warn(`⚠️ [handleBuyTickets] Ticket shop points not awarded: ${ticketShopPointsResult.error}`)
          } else {
            console.log(`✅ [handleBuyTickets] Ticket shop points successfully awarded!`)
          }
        } catch (ticketShopPointsError) {
          // Non-fatal: Kauf ist trotzdem erfolgreich, auch wenn Punkte-Vergabe fehlschlägt
          console.error("❌ [handleBuyTickets] Error awarding ticket shop points (non-fatal):", ticketShopPointsError)
        }

        toast({
          title: "Purchase Successful!",
          description: `You've purchased ${ticketAmount} ${ticketType === "legendary" ? "legendary" : "regular"} tickets!`,
        })
      } catch (error) {
        console.error("Error buying tickets:", error)
        toast({
          title: "Error",
          description: error instanceof Error ? error.message : "An unexpected error occurred",
          variant: "destructive",
        })
      } 
    }
  const tokenAbi = [
    {
      inputs: [
        { internalType: "address", name: "to", type: "address" },
        { internalType: "uint256", name: "amount", type: "uint250" },
      ],
      name: "mintToken",
      outputs: [],
      stateMutability: "nonpayable",
      type: "function",
    },
  ]
 
  useEffect(() => {
    if (!user?.username || !user?.wallet_address) return
    if (referralsCheckedRef.current === user.wallet_address) return
    
    referralsCheckedRef.current = user.wallet_address
    
    const loadReferrals = async () => {
        try {
          const supabase = getSupabaseBrowserClient()
          if (!supabase) {
            setReferredUsers([])
            return
          }

          // Get referrals for this user
          type ReferralRow = {
            id: number
            referred_wallet_address: string
            rewards_claimed: boolean
            created_at: string
          }
          
          const { data: referralsData, error: referralsError } = await supabase
            .from("referrals")
            .select("id, referred_wallet_address, rewards_claimed, created_at")
            .eq("referrer_wallet_address", user.wallet_address) as { data: ReferralRow[] | null; error: any }

          if (referralsError || !referralsData || referralsData.length === 0) {
            setReferredUsers([])
            return
          }

          // Get user levels in a single query for better performance
          const referredWalletAddresses = referralsData
            .map((ref) => ref.referred_wallet_address)
            .filter((addr): addr is string => !!addr)
          
          const { data: userLevels, error: userLevelsError } = await supabase
            .from("users")
            .select("wallet_address, username, level")
            .in("wallet_address", referredWalletAddresses)

          // Create maps for quick lookup
          const levelMap = new Map<string, number>()
          const usernameMap = new Map<string, string>()
          if (userLevels) {
            userLevels.forEach((user: any) => {
              const walletAddress = String(user.wallet_address || "")
              const level = Number(user.level || 1)
              const username = String(user.username || "")
              levelMap.set(walletAddress, level)
              usernameMap.set(walletAddress, username)
            })
          }

          // Create detailed referrals array
          const detailed = referralsData.map((ref: { id: number; referred_wallet_address: string; rewards_claimed: boolean }) => {
            const level = levelMap.get(ref.referred_wallet_address) || 1
            const username = usernameMap.get(ref.referred_wallet_address)
            
            return {
              id: Number(ref.id),
              wallet_address: String(ref.referred_wallet_address),
              username: username || "",
              level: Number(level),
              reward_claimed: Boolean(ref.rewards_claimed ?? false)
            }
          })

          setReferredUsers(detailed)
        } catch (error) {
          console.error("Error loading referrals:", error)
          setReferredUsers([])
        }
      }
      loadReferrals()
  }, [user?.username, user?.wallet_address])


  const updateTicketTimerDisplay = (duration: number | null) => {
    if (duration === null) {
      setTicketTimerDisplay("00:00:00")
      return
    }
    const hours = Math.floor(duration / (1000 * 60 * 60))
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((duration % (1000 * 60)) / 1000)

    const formattedHours = String(hours).padStart(2, "0")
    const formattedMinutes = String(minutes).padStart(2, "0")
    const formattedSeconds = String(seconds).padStart(2, "0")

    setTicketTimerDisplay(`${formattedHours}:${formattedMinutes}:${formattedSeconds}`)
  }

  const updateTokenTimerDisplay = (duration: number | null) => {
    if (duration === null) {
      setTokenTimerDisplay("00:00:00")
      return
    }
    const hours = Math.floor(duration / (1000 * 60 * 60))
    const minutes = Math.floor((duration % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((duration % (1000 * 60)) / 1000)

    const formattedHours = String(hours).padStart(2, "0")
    const formattedMinutes = String(minutes).padStart(2, "0")
    const formattedSeconds = String(seconds).padStart(2, "0")

    setTokenTimerDisplay(`${formattedHours}:${formattedMinutes}:${formattedSeconds}`)
  }

  // Lade die Wallet-Adresse des Benutzers (kept for potential future use, even if ANI balance display is removed)
  useEffect(() => {
    if (user?.username) {
      const fetchWalletAddress = async () => {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        try {
          const { data, error } = await (supabase.from("users") as any).select("world_id").eq("wallet_address", user.wallet_address).single()

          if (error) {
            console.error("Error fetching wallet address:", error)
            return
          }

          if (data && data.world_id && typeof data.world_id === "string") {
            setWalletAddress(data.world_id)
          } else {
            // Fallback auf einen leeren String, wenn keine gültige Adresse gefunden wurde
            setWalletAddress("")
          }
        } catch (error) {
          console.error("Error in fetchWalletAddress:", error)
        }
      }

      fetchWalletAddress()
    }
  }, [user?.username])

  // Check for daily deal when user is available - only once per user session
  useEffect(() => {
    if (!user?.username || !user?.wallet_address) return
    if (dailyDealLoading) return

    // Create a unique key for this user session
    const userSessionKey = `${user.username}_${user.wallet_address}`
    
    // Check if we've already checked the daily deal for this user session
    if (dailyDealCheckedRef.current === userSessionKey) {
      return
    }

    dailyDealCheckedRef.current = userSessionKey
    setDailyDealLoading(true)

    const checkDailyDeal = async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) {
          setDailyDealLoading(false)
          return
        }

        const today = new Date().toISOString().split("T")[0]

        // Get today's deal
        const { data: deal, error: dealError } = await (supabase
          .from("daily_deals") as any)
          .select("*")
          .eq("date", today)
          .single()

        if (dealError || !deal) {
          console.log("No deal available for today:", dealError)
          setDailyDeal(null)
          setDailyDealInteraction(null)
          setHasShownDailyDeal(true)
          setDailyDealLoading(false)
          return
        }

        // Get card information
        // Validate card_id before querying
        const cardId = deal.card_id ? String(deal.card_id).trim() : null
        if (!cardId || cardId === "null" || cardId === "undefined" || cardId === "NaN") {
          console.error("Invalid card_id in deal:", deal.card_id)
          setDailyDeal(null)
          setDailyDealInteraction(null)
          setHasShownDailyDeal(true)
          setDailyDealLoading(false)
          return
        }

        const { data: card, error: cardError } = await (supabase
          .from("cards") as any)
          .select("*")
          .eq("id", cardId)
          .single()

        if (cardError || !card) {
          console.error("Error fetching card details:", cardError)
          setDailyDeal(null)
          setDailyDealInteraction(null)
          setHasShownDailyDeal(true)
          setDailyDealLoading(false)
          return
        }

        // Format the deal data to include card information
        const formattedDeal: DailyDeal = {
          id: Number(deal.id),
          card_id: String(deal.card_id),
          card_level: Number(deal.card_level),
          classic_tickets: Number(deal.classic_tickets),
          elite_tickets: Number(deal.elite_tickets),
          price: Number(deal.price),
          description: String(deal.description || ""),
          discount_percentage: Number(deal.discount_percentage),
          card_name: String(card.name),
          card_image_url: String(card.image_url),
          card_rarity: String(card.rarity),
          card_character: String(card.character),
          creator_address: card.creator_address ? String(card.creator_address) : undefined,
        }

        // Check if user has already interacted with this deal
        const { data: interactions, error: interactionError } = await (supabase
          .from("deal_interactions") as any)
          .select("*")
          .eq("wallet_address", user.wallet_address)
          .eq("deal_id", Number(deal.id))
          .order("purchased", { ascending: false })
          .order("interaction_date", { ascending: false })
          .limit(1)

        let interaction: DealInteraction | null = null
        if (interactions?.[0]) {
          const rawInteraction = interactions[0]
          interaction = {
            seen: Boolean(rawInteraction.seen),
            dismissed: Boolean(rawInteraction.dismissed),
            purchased: Boolean(rawInteraction.purchased),
          }
        }

        // If no interaction record exists, create one
        if (interactionError || !interaction) {
          const { error: insertError } = await (supabase.from("deal_interactions") as any).insert({
            wallet_address: user.wallet_address,
            deal_id: Number(deal.id),
            seen: false,
            dismissed: false,
            purchased: false,
          })

          if (insertError) {
            console.error("Error creating deal interaction:", insertError)
            setDailyDealLoading(false)
            return
          }

          interaction = {
            seen: false,
            dismissed: false,
            purchased: false,
          }
        }

        console.log("Setting daily deal:", formattedDeal)
        setDailyDeal(formattedDeal)
        setDailyDealInteraction(interaction)

        // Check if deal should be shown
        if (interaction && !interaction.seen && !interaction.dismissed && !interaction.purchased) {
          console.log("Opening daily deal dialog")
          setShowDailyDealDialog(true)
          setHasShownDailyDeal(true)
        } else {
          console.log("Not opening daily deal dialog:", {
            hasInteraction: !!interaction,
            seen: interaction?.seen,
            dismissed: interaction?.dismissed,
            purchased: interaction?.purchased
          })
          setHasShownDailyDeal(true)
        }
      } catch (error) {
        console.error("Error checking daily deal:", error)
        setDailyDeal(null)
        setDailyDealInteraction(null)
        setHasShownDailyDeal(true)
      } finally {
        setDailyDealLoading(false)
      }
    }

    checkDailyDeal()
  }, [user?.username, user?.wallet_address]) // Dependencies bleiben, aber mit verbessertem Ref-Check


  // Check discount status on page load - client-side
  useEffect(() => {
    if (checkDiscountStatusRef.current) return
    checkDiscountStatusRef.current = true
    checkDiscountStatus()
  }, [])

  // Check discount status - client-side implementation
  const checkDiscountStatus = async () => {
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { data, error } = await (supabase
        .from("discount_configs") as any)
        .select("*")
        .eq("name", "time_based_15_percent_4h")
        .eq("is_active", true)
        .single()

      if (error || !data) {
        setHasActiveDiscount(false)
        return
      }

      // Check if discount is still valid (within time window)
      if (data.end_time) {
        const now = new Date()
        const endTime = new Date(String(data.end_time))
        
        if (now > endTime) {
          // Discount has expired, deactivate it
          await (supabase
            .from("discount_configs") as any)
            .update({ is_active: false })
            .eq("name", "time_based_15_percent_4h")
          
          setHasActiveDiscount(false)
          return
        }
      }

      setHasActiveDiscount(true)
      setDiscountValue(Math.round((Number(data.value) || 0) * 100))
    } catch (error) {
      console.error("Error checking discount status:", error)
      setHasActiveDiscount(false)
    }
  }


  // Check if user can claim tickets and tokens and update countdown timers
  useEffect(() => {
    if (!user?.wallet_address || hasCheckedClaims.current) return

    hasCheckedClaims.current = true

    const checkClaimStatus = async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      try {
        // Get user data including ticket_last_claimed, token_last_claimed, tickets, elite_tickets, icon_tickets, tokens, has_premium
        const { data, error } = await (supabase
          .from("users") as any)
          .select("ticket_last_claimed, token_last_claimed, tickets, elite_tickets, icon_tickets, tokens, has_premium")
          .eq("wallet_address", user.wallet_address)
          .single()

        if (error) {
          console.error("Error fetching user data:", error)
          return
        }

        // Update tickets, elite tickets, icon tickets
        if (data && typeof data.tickets === "number") {
          setTickets(data.tickets)
        }
        if (data && typeof data.elite_tickets === "number") {
          setEliteTickets(data.elite_tickets)
        }
        // if (data && typeof data.icon_tickets === "number") {
        //   setIconTickets(data.icon_tickets)
        // }

        // Update premium status
        if (data && typeof data.has_premium === "boolean") {
          setHasPremium(data.has_premium)
        }

        // Update tickets and legendary tickets with proper type checking
        if (data && typeof data.tickets === "number") {
          setTickets(data.tickets)
        }

        if (data && typeof data.elite_tickets === "number") {
          setEliteTickets(data.elite_tickets)
        }



        // Check if user has claimed tickets in the last 12 hours
        if (data?.ticket_last_claimed && typeof data.ticket_last_claimed === "string") {
          const lastClaimedDate = new Date(data.ticket_last_claimed)
          const now = new Date()
          const twelveHoursInMs = 24 * 60 * 60 * 1000
          const timeSinceClaim = now.getTime() - lastClaimedDate.getTime()

          if (timeSinceClaim < twelveHoursInMs) {
            setAlreadyClaimed(true)
            const newTimeUntilNextClaim = twelveHoursInMs - timeSinceClaim
            setTimeUntilNextClaim(newTimeUntilNextClaim)
            updateTicketTimerDisplay(newTimeUntilNextClaim)
          } else {
            setAlreadyClaimed(false)
            setTimeUntilNextClaim(null)
            updateTicketTimerDisplay(null)
          }
        }

        // Check if user has claimed token in the last 24 hours
        if (data?.token_last_claimed && typeof data.token_last_claimed === "string") {
          const lastTokenClaimedDate = new Date(data.token_last_claimed)
          const now = new Date()
          const twentyFourHoursInMs = 24 * 60 * 60 * 1000
          const timeSinceTokenClaim = now.getTime() - lastTokenClaimedDate.getTime()

          if (timeSinceTokenClaim < twentyFourHoursInMs) {
            setTokenAlreadyClaimed(true)
            const newTimeUntilNextTokenClaim = twentyFourHoursInMs - timeSinceTokenClaim
            setTimeUntilNextTokenClaim(newTimeUntilNextTokenClaim)
            updateTokenTimerDisplay(newTimeUntilNextTokenClaim)
          } else {
            setTokenAlreadyClaimed(false)
            setTimeUntilNextTokenClaim(null)
            updateTokenTimerDisplay(null)
          }
        }

        // Check premium status and legendary ticket claim
        if (data.has_premium) {
          const { data: premiumData, error: premiumError } = await (supabase
            .from("premium_passes") as any)
            .select("*")
            .eq("wallet_address", user.wallet_address)
            .eq("active", true)
            .single()

          if (!premiumError && premiumData) {
            if (premiumData.last_legendary_claim) {
              const lastClaim = new Date(premiumData.last_legendary_claim as string)
              setLastLegendaryClaim(lastClaim)

              // Check if 24 hours have passed since last claim
              const now = new Date()
              const timeSinceClaim = now.getTime() - lastClaim.getTime()
              const twentyFourHoursInMs = 24 * 60 * 60 * 1000

              if (timeSinceClaim >= twentyFourHoursInMs) {
                setCanClaimLegendary(1) // Can claim
              } else {
                setCanClaimLegendary(0) // Cannot claim
              }
            } else {
              // No previous claim, can claim immediately
              setCanClaimLegendary(1)
            }
          }
        }
      } catch (error) {
        console.error("Error checking claim status:", error)
      }
    }

    checkClaimStatus()
  }, [user?.username, user])

  // Set up timer countdown
  useEffect(() => {
  if (timerIntervalRef.current) clearInterval(timerIntervalRef.current)

  const interval = setInterval(() => {
    if (timeUntilNextClaim && timeUntilNextClaim > 0) {
      const newTime = timeUntilNextClaim - 1000
      if (newTime <= 0) {
        setAlreadyClaimed(false)
        setTimeUntilNextClaim(null)
        updateTicketTimerDisplay(null)
      } else {
        setTimeUntilNextClaim(newTime)
        updateTicketTimerDisplay(newTime)
      }
    }

    if (timeUntilNextTokenClaim && timeUntilNextTokenClaim > 0) {
      const newTime = timeUntilNextTokenClaim - 1000
      if (newTime <= 0) {
        setTokenAlreadyClaimed(false)
        setTimeUntilNextTokenClaim(null)
        updateTokenTimerDisplay(null)
      } else {
        setTimeUntilNextTokenClaim(newTime)
        updateTokenTimerDisplay(newTime)
      }
    }
  }, 1000)

  timerIntervalRef.current = interval

  return () => clearInterval(interval)
}, [timeUntilNextClaim, timeUntilNextTokenClaim]) // ✅ Dependencies hinzugefügt

  // Contest countdown timer
  useEffect(() => {
    const interval = setInterval(() => {
      setContestCountdown(getTimeUntilContestEnd())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  // Check for unclaimed rewards
  useEffect(() => {
    if (!user?.username || hasCheckedRewards.current) return

    hasCheckedRewards.current = true

    const checkUnclaimedRewards = async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      try {
        // Fetch claimed rewards
        const { data: claimedRewardsData, error: claimedRewardsError } = await (supabase
          .from("claimed_rewards") as any)
          .select("*")
          .eq("wallet_address", user.wallet_address)

        if (claimedRewardsError) {
          console.error("Error fetching claimed rewards:", claimedRewardsError)
          return
        }

        // Create rewards array for all levels up to current level
        const userLevel = user.level || 1
        const rewards: LevelReward[] = []

        for (let i = 1; i <= userLevel; i++) {
          const claimedReward = claimedRewardsData?.find((reward: any) => reward.level === i)

          // Double rewards for every 5 levels
          const isSpecialLevel = i % 5 === 0

          rewards.push({
            level: i,
            standardClaimed: Boolean(claimedReward?.standard_claimed),
            premiumClaimed: Boolean(claimedReward?.premium_claimed),
            isSpecialLevel: isSpecialLevel,
          })
        }

        setLevelRewards(rewards)

        // Calculate unclaimed rewards
        let unclaimed = 0
        rewards.forEach((reward) => {
          if (!reward.standardClaimed) unclaimed++
          if (hasPremium && !reward.premiumClaimed) unclaimed++
        })

        setUnclaimedRewards(unclaimed)
      } catch (error) {
        console.error("Error checking unclaimed rewards:", error)
      }
    }

    checkUnclaimedRewards()

    // Check for new rewards much less frequently (every 5 minutes)
    // This is a background task that doesn't need to run constantly
    rewardsIntervalRef.current = setInterval(checkUnclaimedRewards, 5 * 60 * 1000)

    return () => {
      if (rewardsIntervalRef.current) clearInterval(rewardsIntervalRef.current)
    }
  }, [user?.username, user?.level, hasPremium])

  // Auto-advance slide effect
  useEffect(() => {
    const slideInterval = setInterval(() => {
      setCurrentSlide((prev) => (prev === 0 ? 1 : 0))
    }, 5000) // Change slide every 5 seconds

    return () => clearInterval(slideInterval)
  }, [])

  


  const handleClaimBonus = async () => {
    if (!user) return

    setClaimLoading(true)
    try {
      const result = await claimDailyBonus(user.wallet_address)

      if (result.success) {
        // Show claim animation
        setShowClaimAnimation(true)

        // Update tickets after a short delay to allow animation to play
        setTimeout(async () => {
          if (typeof result.newTicketCount === "number") {
            await updateUserTickets?.(result.newTicketCount)
            setTickets(result.newTicketCount)
          }

          toast({
            title: "Success!",
            description: "You've claimed 3 tickets as your daily bonus!",
          })

          setAlreadyClaimed(true)
          if (result.nextClaimTime) {
            const nextClaimDate = new Date(result.nextClaimTime)
            const now = new Date()
            const newTimeUntilNextClaim = nextClaimDate.getTime() - now.getTime()
            setTimeUntilNextClaim(newTimeUntilNextClaim)
            updateTicketTimerDisplay(newTimeUntilNextClaim)
          } else {
            const newTimeUntilNextClaim = 24 * 60 * 60 * 1000 // 12 hours in milliseconds
            setTimeUntilNextClaim(newTimeUntilNextClaim)
            updateTicketTimerDisplay(newTimeUntilNextClaim)
          }

          // Hide animation after it completes
          setTimeout(() => {
            setShowClaimAnimation(false)
          }, 1000)
        }, 0)
      } else if (result.alreadyClaimed) {
        setAlreadyClaimed(true)
        if (result.timeUntilNextClaim) {
          setTimeUntilNextClaim(result.timeUntilNextClaim)
          updateTicketTimerDisplay(result.timeUntilNextClaim)
        }
        toast({
          title: "Already Claimed",
          description: "You have already claimed your daily bonus",
        })
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error claiming bonus:", error)
      toast({
        title: "Error",
        description: "Failed to claim tickets",
        variant: "destructive",
      })
    } finally {
      if (!showClaimAnimation) {
        setClaimLoading(false)
      }
    }
  }

  // Handle daily deal purchase success
  const handleDailyDealPurchaseSuccess = (newTickets: number, newEliteTickets: number) => {
    setTickets(newTickets)
    setEliteTickets(newEliteTickets)

    // Update deal interaction state
    if (dailyDealInteraction) {
      setDailyDealInteraction({
        ...dailyDealInteraction,
        purchased: true,
      })
    }

    // Close the dialog and mark as shown
    setShowDailyDealDialog(false)
    setHasShownDailyDeal(true)

    // Show success toast
    toast({
      title: "Deal Purchased!",
      description: `You received ${newTickets - tickets} tickets and ${newEliteTickets - eliteTickets} elite tickets!`,
      variant: "default",
    })
    refreshUserData?.();
  }

  // Handle special deal purchase success
  const handleSpecialDealPurchaseSuccess = (newTickets: number, newLegendaryTickets: number) => {
    setTickets(newTickets)
    setEliteTickets(newLegendaryTickets)

    // Update special deal interaction state
    if (specialDealInteraction) {
      setSpecialDealInteraction({
        ...specialDealInteraction,
        purchased: true,
      })
    }

    toast({
      title: "Purchase Successful!",
      description: "You've claimed today's special deal",
    })
  }

  const [passIndex, setPassIndex] = useState<number>(0)
  const passSlides = [
    {
      key: 'gamepass',
      title: t("game_pass.title", "Game Pass"),
      icon: <Crown className="h-8 w-8 text-amber-800" />, 
      bg: 'from-amber-400 to-amber-600',
      border: 'border-yellow-100',
      text: t("game_pass.claim_text", "Claim rewards"),
      href: '/pass',
      color: 'text-yellow-700',
      dot: 'bg-yellow-500',
    },
    {
      key: 'xppass',
      title: t("xp_pass.title", "XP Pass"),
      icon: <Sparkles className="h-8 w-8 text-blue-800" />, 
      bg: 'from-blue-400 to-blue-600',
      border: 'border-blue-100',
      text: t("xp_pass.boost_text", "Boost your XP gain"), // Nur kurzer Text, keine Benefits und kein Kaufen-Button
      href: '/xp-booster',
      color: 'text-blue-700',
      dot: 'bg-blue-500',
    },
    // {
    //   key: 'iconpass',
    //   title: 'Icon Pass',
    //   icon: <Crown className="h-8 w-8 text-yellow-600" />, 
    //   bg: 'from-white to-yellow-200',
    //   border: 'border-yellow-100',
    //   text: 'Unlock exclusive ICON rewards!',
    //   href: '/icon-pass',
    //   color: 'text-yellow-700',
    //   dot: 'bg-yellow-500',
    // },
  ]
  const handlePrev = () => setPassIndex((prev) => (prev === 0 ? passSlides.length - 1 : prev - 1))
  const handleNext = () => setPassIndex((prev) => (prev === passSlides.length - 1 ? 0 : prev + 1))

  useEffect(() => {
    if (!user?.username) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return; // Ensure supabase is not null
    // XP Pass expiry check
    supabase
      .from("xp_passes")
      .select("*")
      .eq("wallet_address", user.wallet_address)
      .eq("active", true)
      .single()
      .then(async ({ data }: { data: any }) => {
        if (
          data &&
          data.expires_at &&
          (typeof data.expires_at === "string" || typeof data.expires_at === "number" || data.expires_at instanceof Date) &&
          new Date() > new Date(data.expires_at)
        ) {
          await (supabase.from("xp_passes") as any).update({ active: false }).eq("wallet_address", user.wallet_address).eq("id", data.id);
          refreshUserData?.();
        }
      });
    // Premium Pass expiry check
    supabase
      .from("premium_passes")
      .select("*")
      .eq("wallet_address", user.wallet_address)
      .eq("active", true)
      .single()
      .then(async ({ data }: { data: any }) => {
        if (
          data &&
          data.expires_at &&
          (typeof data.expires_at === "string" || typeof data.expires_at === "number" || data.expires_at instanceof Date) &&
          new Date() > new Date(data.expires_at)
        ) {
          await (supabase.from("premium_passes") as any).update({ active: false }).eq("wallet_address", user.wallet_address).eq("id", data.id);
          await (supabase.from("users") as any).update({ has_premium: false }).eq("username", user.username);
          refreshUserData?.();
        }
      });
  }, [user?.username]);

  useEffect(() => {
    if (user) {
      if (typeof user.tickets === "number") setTickets(user.tickets)
      if (typeof user.elite_tickets === "number") setEliteTickets(user.elite_tickets)
      // if (typeof user.icon_tickets === "number") setIconTickets(user.icon_tickets)
    }
  }, [user])








  const [showBuyXpPassDialog, setShowBuyXpPassDialog] = useState(false)
  const [buyingXpPass, setBuyingXpPass] = useState(false)

  const handleBuyXpPass = async () => {
    setBuyingXpPass(true)
    // Hier echtes Payment einbauen, Demo: Timeout
    await new Promise((resolve) => setTimeout(resolve, 1500))
    setBuyingXpPass(false)
    setShowBuyXpPassDialog(false)
    toast({ title: "XP Pass Purchased", description: "XP Pass activated successfully" })
    // Optional: In DB speichern, dass XP Pass aktiv ist
  }

  // useEffect für Special Deal
  useEffect(() => {
    if (!user?.username || !user?.wallet_address) return
    if (hasCheckedSpecialDeal.current) return
    
    hasCheckedSpecialDeal.current = true;
    (async () => {
      setSpecialDealLoading(true);
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) {
          setSpecialDealLoading(false)
          return
        }

        const today = new Date().toISOString().split("T")[0]

        // Get today's special deal
        const { data: deal, error: dealError } = await (supabase
          .from("special_offer") as any)
          .select("*")
          .eq("date", today)
          .single()

        if (dealError || !deal) {
          setSpecialDeal(null)
          setSpecialDealInteraction(null)
          setSpecialDealLoading(false)
          return
        }

        // Get card information including creator_address
        // Validate card_id before querying
        const cardId = deal.card_id ? String(deal.card_id).trim() : null
        if (!cardId || cardId === "null" || cardId === "undefined" || cardId === "NaN") {
          console.error("Invalid card_id in special deal:", deal.card_id)
          setSpecialDeal(null)
          setSpecialDealLoading(false)
          return
        }

        const { data: card } = await (supabase
          .from("cards") as any)
          .select("*, creator_address")
          .eq("id", cardId)
          .single()

        const cardData = card as any

        const formattedDeal: SpecialDeal = {
          id: Number(deal.id),
          card_id: String(deal.card_id),
          card_level: Number(deal.card_level),
          classic_tickets: Number(deal.classic_tickets),
          elite_tickets: Number(deal.elite_tickets),
          // icon_tickets: Number(deal.icon_tickets || 0), // Removed - no longer used
          price: Number(deal.price),
          description: String(deal.description || ""),
          discount_percentage: Number(deal.discount_percentage),
          card_name: String(cardData?.name || ""),
          card_image_url: String(cardData?.image_url || ""),
          card_rarity: String(cardData?.rarity || ""),
          card_character: String(cardData?.character || ""),
          creator_address: cardData?.creator_address ? String(cardData.creator_address) : undefined,
        }

        setSpecialDeal(formattedDeal)
        setSpecialDealInteraction({ seen: false, dismissed: false, purchased: false })
      } catch (e) {
        console.error("Error fetching special deal:", e)
      } finally {
        setSpecialDealLoading(false);
      }
    })();
  }, [user?.username, user?.wallet_address]);

  // Calculate creator percentage for Special Deal
  useEffect(() => {
    if (specialDeal?.card_rarity) {
      import("@/lib/creator-revenue").then((module) => {
        const split = module.getDealRevenueSplit(specialDeal.card_rarity.toLowerCase() as Parameters<typeof module.getDealRevenueSplit>[0])
        setSpecialDealCreatorPercentage(Math.round(split.creatorShare * 100))
      })
    } else {
      setSpecialDealCreatorPercentage(null)
    }
  }, [specialDeal?.card_rarity])

  // Test-URL (Cloudflare)
  const testUrl = 'https://fda1523f9dc7558ddc4fcf148e01a03a.r2.cloudflarestorage.com/world-soccer/Za%C3%AFre-Emery-removebg-preview.png';
  // Test-URL (Wikipedia)
  const wikiUrl = 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';


  // State for purchase loading status
  const [buyingDailyDeal, setBuyingDailyDeal] = useState(false);
  const [buyingSpecialDeal, setBuyingSpecialDeal] = useState(false)
  const [showSpecialDealSuccess, setShowSpecialDealSuccess] = useState(false);
  const [showInfoDialog, setShowInfoDialog] = useState(false);

  // Direct purchase handler for Daily Deal
  const handleBuyDailyDeal = async () => {
    if (!user?.wallet_address || !dailyDeal) return;
    setBuyingDailyDeal(true);
    try {
      // Call the purchase logic for dailyDeal
      const result = await purchaseDeal(user.wallet_address, dailyDeal.id);
      
      if (result.success) {
        toast({ title: t("common.success", "Success"), description: t("deals.deal_purchased", "Your deal was successfully purchased.") });
        // Close the dialog
        setShowDailyDealDialog(false);
        setHasShownDailyDeal(true);
        // Update tickets display
        if (result.newTickets !== undefined && result.newEliteTickets !== undefined) {
          await updateUserTickets?.(result.newTickets, result.newEliteTickets);
        }
        // Refresh user data
        await refreshUserData?.();
      } else {
        toast({ title: t("common.error", "Error"), description: result.error || t("deals.purchase_failed", "Purchase failed"), variant: 'destructive' });
      }
    } catch (e) {
      console.error('Error purchasing daily deal:', e);
      toast({ title: t("common.error", "Error"), description: t("deals.purchase_failed", "Purchase failed"), variant: 'destructive' });
    } finally {
      setBuyingDailyDeal(false);
    }
  };
  const erc20TransferAbi = [{
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" }
    ],
    outputs: [{ type: "bool" }]
  }]

  const WLD_TOKEN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003" // WLD (World Chain)
  // Payment function for Special Deal
  const sendSpecialDealPayment = async () => {
    if (!specialDeal) return false

    try {
      const discountedPrice =
        specialDeal.discount_percentage && specialDeal.discount_percentage > 0
          ? specialDeal.price * (1 - specialDeal.discount_percentage / 100)
          : specialDeal.price

      const hasCreator = specialDeal.creator_address && specialDeal.creator_address.trim() !== ""

      let transactions: any[] = []

      if (hasCreator && specialDeal.card_rarity) {
        const { getDealRevenueSplit } = await import("@/lib/creator-revenue")
        const split = getDealRevenueSplit(specialDeal.card_rarity as any)

        const devTransfer = getTransferDetails({
          usdAmount: discountedPrice * split.devShare,
          currency: paymentCurrency,
          wldPrice: price,
        anixPrice,
        })

        const creatorTransfer = getTransferDetails({
          usdAmount: discountedPrice * split.creatorShare,
          currency: paymentCurrency,
          wldPrice: price,
        anixPrice,
        })

        console.log("Special Deal Split payment:", {
          totalUsd: discountedPrice,
          currency: paymentCurrency,
          devShare: `${(split.devShare * 100).toFixed(1)}% = ${devTransfer.displayAmount}`,
          creatorShare: `${(split.creatorShare * 100).toFixed(1)}% = ${creatorTransfer.displayAmount}`,
          creatorAddress: specialDeal.creator_address,
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
            args: [specialDeal.creator_address, creatorTransfer.rawAmount],
          },
        ]
      } else {
        const transferDetails = getTransferDetails({
          usdAmount: discountedPrice,
          currency: paymentCurrency,
          wldPrice: price,
      anixPrice,
        })

        transactions = [
          {
            address: transferDetails.tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [PAYMENT_RECIPIENT, transferDetails.rawAmount],
          },
        ]
      }

      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: transactions,
      })

      if (finalPayload.status === "success") {
        console.log("success sending special deal payment")
        return true
      } else {
        console.log("payment failed:", finalPayload)
        return false
      }
    } catch (error) {
      console.error("Error sending special deal payment:", error)
      return false
    }
  }

  // Direct purchase handler for Special Deal
  const handleBuySpecialDeal = async () => {
    if (!user?.username || !specialDeal) return;
    setBuyingSpecialDeal(true);
    try {
      // Execute payment
      const paymentSuccess = await sendSpecialDealPayment();
      
      if (paymentSuccess) {
        // Ticket update and card addition for Special Deal
        try {
          const supabase = getSupabaseBrowserClient();
          if (!supabase) {
            toast({ title: 'Fehler', description: 'Datenbankverbindung fehlgeschlagen', variant: 'destructive' });
            return;
          }

          // 1. Special Deal Kauf in Tabelle eintragen
          const { error: purchaseRecordError } = await (supabase
            .from("special_deal_purchases") as any)
            .insert({
              wallet_address: user.wallet_address,
              special_deal_id: specialDeal.id,
              purchased_at: new Date().toISOString(),
            });

          if (purchaseRecordError) {
            console.error("Error recording special deal purchase:", purchaseRecordError);
            // Trotz Fehler fortfahren, da der Kauf bereits bezahlt wurde
          }

          // 2. Weekly Contest: Punkte für Special Deal Kauf vergeben
          try {
            const { incrementSpecialDealPoints } = await import("@/app/actions/weekly-contest");
            const contestPointsResult = await incrementSpecialDealPoints(user.wallet_address, 100);
            if (contestPointsResult.success) {
              console.log("✅ [Special Deal] Weekly contest points awarded successfully");
            } else {
              console.warn("⚠️ [Special Deal] Failed to award contest points:", contestPointsResult.error);
            }
          } catch (error) {
            console.error("❌ [Special Deal] Error awarding contest points:", error);
            // Nicht kritisch, Kauf kann trotzdem fortgesetzt werden
          }

          // 3. Get card information including creator_address and contract_address for revenue calculation
          const { data: cardData } = await (supabase
            .from("cards")
            .select("creator_address, rarity, contract_address")
            .eq("id", specialDeal.card_id)
            .single() as any);
          
          console.log(`📋 [Special Deal] Card data for special deal:`, cardData);
          
          // Calculate and distribute creator revenue if card has creator
          if (cardData?.creator_address) {
            const { calculateCreatorDealRevenue } = await import("@/lib/creator-revenue");
            const creatorRevenue = calculateCreatorDealRevenue(Number(specialDeal.price || 0), cardData.rarity as any);
            
            // Update creator's coins
            const { data: creatorData } = await (supabase
              .from("users")
              .select("coins")
              .eq("wallet_address", cardData.creator_address.toLowerCase())
              .single() as any);
            
            if (creatorData) {
              const newCreatorCoins = (creatorData.coins || 0) + creatorRevenue;
              await (supabase
                .from("users") as any)
                .update({ coins: newCreatorCoins })
                .eq("wallet_address", cardData.creator_address.toLowerCase());

              // Update card_creations.earned_amount if contract_address exists
              if (cardData.contract_address) {
                console.log(`🔍 [Special Deal] Attempting to update earned_amount for card with contract_address: ${cardData.contract_address.toLowerCase()}`)
                try {
                  const { data: existingCreation, error: fetchError } = await (supabase
                    .from("card_creations")
                    .select("earned_amount")
                    .eq("token_address", cardData.contract_address.toLowerCase())
                    .single() as any);
                  
                  console.log(`📊 [Special Deal] Fetch result:`, { existingCreation, fetchError })
                  
                  if (fetchError && (fetchError as any).code !== "PGRST116") {
                    console.error("Error fetching card_creation:", fetchError);
                  } else if (existingCreation) {
                    const currentEarned = typeof existingCreation.earned_amount === 'number' 
                      ? existingCreation.earned_amount 
                      : parseFloat(existingCreation.earned_amount || '0') || 0;
                    const newEarnedAmount = Number((currentEarned + creatorRevenue).toFixed(5));
                    
                    console.log(`💰 [Special Deal] Earned amount calculation:`, {
                      currentEarned,
                      creatorRevenue,
                      newEarnedAmount
                    })
                    
                    const { error: earnedUpdateError } = await (supabase
                      .from("card_creations") as any)
                      .update({ earned_amount: newEarnedAmount })
                      .eq("token_address", cardData.contract_address.toLowerCase());
                    
                    if (earnedUpdateError) {
                      console.error("Error updating earned_amount:", earnedUpdateError);
                    } else {
                      console.log(`✅ [Special Deal] Successfully updated earned_amount to ${newEarnedAmount} for card ${cardData.contract_address}`);
                    }
                  } else {
                    console.log(`⚠️ [Special Deal] No card_creation found for token_address ${cardData.contract_address}`);
                  }
                } catch (earnedError) {
                  console.error("Error updating earned_amount (non-fatal):", earnedError);
                }
              } else {
                console.log(`⚠️ [Special Deal] Card has no contract_address, skipping earned_amount update`)
              }
            }
          }
          
          // 3. Karte zur Sammlung hinzufügen (using user_card_instances)
          const { error: insertCardError } = await (supabase.from("user_card_instances") as any).insert({
            wallet_address: user.wallet_address, // ✅ FIXED: Use wallet_address instead of user_id
            card_id: specialDeal.card_id,
            level: specialDeal.card_level || 1,
            favorite: false,
            obtained_at: new Date().toISOString().split('T')[0], // Use date only format YYYY-MM-DD
          });

          if (insertCardError) {
            console.error("Error adding card to collection:", insertCardError);
            toast({ 
              title: 'Error', 
              description: 'Failed to add card to your collection: ' + insertCardError.message, 
              variant: 'destructive' 
            });
            setBuyingSpecialDeal(false);
            return;
          }

          // 4. Tickets hinzufügen
          const { data: userData, error: userError } = await (supabase
            .from("users")
            .select("tickets, elite_tickets, icon_tickets")
            .eq("wallet_address", user.wallet_address)
            .single() as any);

          if (!userError && userData) {
            const currentTickets = Number(userData.tickets) || 0;
            const currentEliteTickets = Number(userData.elite_tickets) || 0;
            // const currentIconTickets = Number(userData.icon_tickets) || 0;
            
            const newTickets = currentTickets + specialDeal.classic_tickets;
            const newEliteTickets = currentEliteTickets + specialDeal.elite_tickets;
            // const newIconTickets = currentIconTickets + (specialDeal.icon_tickets || 0);

            const { error: updateError } = await (supabase
              .from("users") as any)
              .update({
                tickets: newTickets,
                elite_tickets: newEliteTickets,
                // icon_tickets: newIconTickets,
              })
              .eq("wallet_address", user.wallet_address);

            if (!updateError) {
              // Lokale Ticket-Zähler aktualisieren
              setTickets(newTickets);
              setEliteTickets(newEliteTickets);
              // setIconTickets(newIconTickets);

              // Success Animation anzeigen
              setShowSpecialDealSuccess(true);
              
              // Nach 2 Sekunden Dialog schließen
              setTimeout(() => {
                setShowSpecialDealSuccess(false);
                setShowSpecialDealDialog?.(false);
              }, 2000);
            } else {
              console.error("Error updating tickets:", updateError);
              toast({ title: 'Fehler', description: 'Tickets konnten nicht hinzugefügt werden', variant: 'destructive' });
            }
          }
        } catch (error) {
          console.error("Error processing special deal purchase:", error);
          toast({ title: 'Fehler', description: 'Deal konnte nicht verarbeitet werden', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Zahlung fehlgeschlagen', description: 'Bitte versuche es erneut.', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Fehler', description: 'Kauf fehlgeschlagen', variant: 'destructive' });
    } finally {
      setBuyingSpecialDeal(false);
    }
  };

  return (
    <ProtectedRoute>
      <div 
        className="flex flex-col min-h-screen text-white relative bg-[#0a0a0a] overflow-y-auto"
      >
        {/* Premium Header - Coinbase Style */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-[#1a1a1a]">
          <div className="w-full px-4 py-2.5 flex items-center justify-between max-w-2xl mx-auto">
            {/* Left: Logo + Social Buttons */}
            <div className="flex items-center gap-4">
              <h1 className="text-base font-semibold tracking-tight text-white">
                CRYPTO TCG
              </h1>
              
              {/* Social Buttons - close to logo */}
              <div className="flex items-center gap-2">
                <a
                  href="https://twitter.com/cryptotcg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                  aria-label="X (Twitter)"
                >
                  <X className="h-4 w-4 text-white/70" />
                </a>
                <a
                  href="https://t.me/cryptotcg"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                  aria-label="Telegram"
                >
                  <Send className="h-4 w-4 text-white/70" />
                </a>
                <button
                  onClick={() => setShowInfoDialog(true)}
                  className="w-8 h-8 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 flex items-center justify-center hover:bg-white/10 transition-colors"
                  aria-label="Info"
                >
                  <Info className="h-4 w-4 text-white/70" />
                </button>
              </div>
            </div>
            
            {/* Right: Tickets - with more spacing from buttons */}
            <div className="flex items-center gap-2 ml-6">
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10">
                <Ticket className="h-3.5 w-3.5 text-[#d4af37]" />
                <span className="text-xs font-medium text-white">{tickets}</span>
              </div>
              <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10">
                <Crown className="h-3.5 w-3.5 text-[#d4af37]" />
                <span className="text-xs font-medium text-white">{eliteTickets}</span>
              </div>
            </div>
          </div>
        </header>

        <main className="w-full px-4 pb-32 flex-1 max-w-2xl mx-auto"> {/* Coinbase-style centered max-width */}
          {user?.wallet_address && (
            <div className="mt-4 mb-4">
              <AniAds
                creator_wallet="0x4bb270ef6dcb052a083bd5cff518e2e019c0f4ee" 
                app_name="Crypto TCG"
                user_wallet_address={user.wallet_address}
              />
            </div>
          )}
         
          <div className="space-y-3 mt-4">
            {/* User Status Card - Glassmorphism - Kompakter */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10 overflow-visible"
            >
              {/* Subtle gold accent line */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent"></div>
              
              <div className="flex items-center justify-between mb-3">
                <div className="flex-1 min-w-0">
                  <p className="text-base font-semibold text-white mb-1 truncate">
                    {user?.username || 'User'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#d4af37] font-medium">Level {user?.level || 1}</span>
                    <span className="text-xs text-white/40">•</span>
                    <span className="text-xs text-white/60">{user?.experience || 0} XP</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <div 
                    className="w-10 h-10 rounded-full bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/10 border border-[#d4af37]/30 flex items-center justify-center flex-shrink-0 cursor-pointer hover:bg-[#d4af37]/30 transition-colors"
                    onClick={() => setShowReferralDialog(true)}
                  >
                    <Users className="h-5 w-5 text-[#d4af37]" />
                  </div>
                  <div className="flex-shrink-0 relative z-[100]">
                    <LanguageSwitcher />
                  </div>
                </div>
              </div>

              {/* XP Progress Bar - Minimal */}
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-white/50">
                  <span>Progress to Level {(user?.level || 1) + 1}</span>
                  <span>{user?.experience || 0}/{user?.nextLevelExp || 500}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ 
                      width: `${Math.min(((user?.experience || 0) / (user?.nextLevelExp || 500)) * 100, 100)}%`
                    }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-[#d4af37] to-[#f4d03f] rounded-full"
                  />
                </div>
              </div>
            </motion.div>

            {/* Weekly Contest - Kompakt, nach oben verschoben */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative rounded-2xl p-4 backdrop-blur-xl bg-gradient-to-br from-white/8 to-white/5 border border-white/10 overflow-hidden cursor-pointer group"
              onClick={() => router.push('/weekly-contest')}
            >
              {/* Gold accent line */}
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
              
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/10 border border-[#d4af37]/30 flex items-center justify-center flex-shrink-0">
                    <Trophy className="h-5 w-5 text-[#d4af37]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-base font-semibold text-white mb-0.5 truncate">{t("contest.title", "Weekly Contest")}</h3>
                    <p className="text-xs text-white/60 truncate">{t("contest.prize_home", "Win 200 WLD")}</p>
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-white/40 group-hover:text-[#d4af37] transition-colors flex-shrink-0 ml-2" />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {/* 2x Bonus Badge */}
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#10b981]/10 border border-[#10b981]/20">
                  <span className="text-[10px] font-medium text-[#10b981]">Epic & Legendary: 2x Bonus</span>
                </div>

                {/* Countdown */}
                {isContestActive() && (() => {
                  const timeLeft = formatContestCountdown(contestCountdown)
                  return timeLeft ? (
                    <div className="flex items-center gap-1.5 text-xs">
                      <Clock className="h-3 w-3 text-[#d4af37]" style={{ filter: 'drop-shadow(0 0 4px #d4af37)' }} />
                      <span className="text-[#d4af37] font-semibold" style={{ textShadow: '0 0 8px #d4af37, 0 0 12px #d4af37' }}>
                        {timeLeft.days}d {timeLeft.hours}h {timeLeft.minutes}m
                      </span>
                    </div>
                  ) : null
                })()}
              </div>
            </motion.div>

            {/* Game Pass + XP Pass + Shop Card - Grid 3 Spalten */}
            <div className="grid grid-cols-3 gap-3">
              {/* Game Pass Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.15 }}
                className="relative rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 overflow-hidden cursor-pointer group"
                onClick={() => router.push('/pass')}
              >
                {/* Subtle gold accent */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent"></div>
                
                <div className="relative p-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/10 border border-[#d4af37]/30 flex items-center justify-center flex-shrink-0">
                      <Crown className="h-5 w-5 text-amber-800" />
                    </div>
                    <h3 className="text-xs font-semibold text-white text-center">{t("game_pass.title", "Game Pass")}</h3>
                  </div>
                </div>
              </motion.div>

              {/* Shop Card */}
              <Link href="/shop" className="block">
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.17 }}
                  className="relative rounded-2xl p-3 backdrop-blur-xl bg-white/5 border border-white/10 overflow-hidden cursor-pointer group h-full"
                >
                  {/* Subtle gold accent */}
                  <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent"></div>
                  
                  <div className="flex flex-col items-center gap-2 h-full justify-center">
                    <div className="relative">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/10 border border-[#d4af37]/30 flex items-center justify-center flex-shrink-0">
                        <ShoppingCart className="h-5 w-5 text-[#d4af37]" />
                      </div>
                      {hasActiveDiscount && (
                        <span className="absolute -top-1 -right-1 text-[8px] font-bold text-[#10b981] bg-[#10b981]/20 px-1 py-0.5 rounded border border-[#10b981]/30">
                          -{discountValue}%
                        </span>
                      )}
                    </div>
                    <h3 className="text-xs font-semibold text-white text-center">{t("shop.title", "Shop")}</h3>
                  </div>
                </motion.div>
              </Link>

              {/* XP Pass Card */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="relative rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 overflow-hidden cursor-pointer group"
                onClick={() => router.push('/xp-booster')}
              >
                {/* Subtle gold accent */}
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37]/50 to-transparent"></div>
                
                <div className="relative p-3">
                  <div className="flex flex-col items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#d4af37]/20 to-[#d4af37]/10 border border-[#d4af37]/30 flex items-center justify-center flex-shrink-0">
                      <Sparkles className="h-5 w-5 text-blue-800" />
                    </div>
                    <h3 className="text-xs font-semibold text-white text-center">{t("xp_pass.title", "XP Pass")}</h3>
                  </div>
                </div>
              </motion.div>
            </div>
            {/* $ANI Card (replaces Chat) - COMMENTED OUT */}
            {/* <div className="col-span-2">
              <div
                className="bg-gradient-to-br from-[#232526] to-[#414345] rounded-xl p-2 shadow-lg flex flex-col items-center justify-center min-h-[70px] h-full text-center cursor-pointer transition border-2 border-yellow-400"
                onClick={() => router.push('/ani_forreal')}
                role="button"
                tabIndex={0}
                aria-label="Go to $ANI page"
              >
                <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center mb-1 border border-yellow-300">
                  <img src="https://ani-labs.xyz/ani-labs-logo-white.png" alt="$ANI Logo" className="w-8 h-8" />
                </div>
                <div className="text-sm font-bold text-yellow-100">$ANI</div>
              </div>
            </div> */}

            {/* Daily Deals - Kompakter (zuerst) */}
            {user?.wallet_address && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.22 }}
                className="rounded-2xl backdrop-blur-xl bg-white/5 border border-white/10 p-2"
              >
                <DailyDealsBatch
                  walletAddress={user.wallet_address}
                  onPurchaseSuccess={handleDailyDealPurchaseSuccess}
                />
              </motion.div>
            )}

            {/* Special Deal Card - Kompakt (nach Daily Deals) */}
            {specialDeal && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.25 }}
                className="relative rounded-2xl p-4 backdrop-blur-xl bg-gradient-to-br from-white/8 to-white/5 border border-white/10 overflow-visible cursor-pointer group"
                onClick={() => setShowSpecialDealDialog(true)}
              >
                {/* Special Deal Badge - Top Right Overlapping (outside the card) */}
                <div className="absolute top-0 right-0 z-30">
                  <Badge className="bg-gradient-to-r from-[#d4af37] to-[#f4d03f] text-black px-2 py-1 text-[10px] font-bold shadow-lg shadow-[#d4af37]/50 border border-[#d4af37]/50 -translate-y-1/2 translate-x-1/2 -translate-x-2">
                    {t("deals.special_deal", "Special Deal")}
                  </Badge>
                </div>
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
                
                <div className="flex items-center gap-3 mb-3">
                  <div className="relative w-16 h-24 rounded-lg overflow-hidden border border-white/20 flex-shrink-0">
                    <img
                      src={getCloudflareImageUrl(specialDeal.card_image_url)}
                      alt={specialDeal.card_name}
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2">
                      {renderStars(specialDeal.card_level, "xs")}
                    </div>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#d4af37]/20 text-[#d4af37] font-medium border border-[#d4af37]/30">
                        {getDisplayRarity(specialDeal.card_rarity)}
                      </span>
                      {specialDeal.discount_percentage != null && Number(specialDeal.discount_percentage) > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#10b981]/20 text-[#10b981] font-medium border border-[#10b981]/30">
                          -{specialDeal.discount_percentage}%
                        </span>
                      )}
                    </div>
                    <h3 className="text-sm font-semibold text-white mb-1 truncate">{specialDeal.card_name}</h3>
                    <div className="flex items-center gap-2 flex-wrap">
                      {Number(specialDeal.classic_tickets) > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-white/60">
                          <Ticket className="h-3 w-3 text-blue-400" />
                          <span>+{specialDeal.classic_tickets}</span>
                        </div>
                      )}
                      {Number(specialDeal.elite_tickets) > 0 && (
                        <div className="flex items-center gap-1 text-[10px] text-white/60">
                          <Crown className="h-3 w-3 text-purple-400" />
                          <span>+{specialDeal.elite_tickets}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/40 group-hover:text-[#d4af37] transition-colors flex-shrink-0" />
                </div>
                
                <div className="flex items-center justify-between pt-3 border-t border-white/10">
                  <div>
                    <p className="text-[10px] text-white/50 mb-0.5">{t("common.price", "Price")}</p>
                    {specialDealHasDiscount && specialDealDiscountedPrice !== null ? (
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs line-through text-white/40">{formatPrice(specialDeal.price)}</span>
                        <span className="text-base font-semibold text-white">{formatPrice(specialDealDiscountedPrice)}</span>
                      </div>
                    ) : (
                      <p className="text-base font-semibold text-white">{formatPrice(specialDeal.price)}</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    className="bg-[#d4af37] hover:bg-[#c9a030] text-black font-medium rounded-lg px-3 text-xs h-8"
                  >
                    {t("deals.buy", "View Deal")}
                  </Button>
                </div>
              </motion.div>
            )}

            {/* Quick Actions - Icon Based (ohne Shop, da Shop jetzt oben) */}
            <div className="grid grid-cols-3 gap-3">
              <Link href="/missions" className="block">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                  className="relative rounded-xl p-3 backdrop-blur-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center cursor-pointer group hover:bg-white/10 transition-colors"
                >
                  {hasClaimableMission && (
                    <span className="absolute -top-1 -right-1 flex h-3 w-3">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#10b981] opacity-75"></span>
                      <span className="relative inline-flex h-3 w-3 rounded-full bg-[#10b981]"></span>
                    </span>
                  )}
                  <Target className="h-4 w-4 text-white/70 group-hover:text-[#d4af37] transition-colors mb-1.5" />
                  <span className="text-[10px] font-medium text-white/70 group-hover:text-white transition-colors">{t("daily_missions.header.title", "Missions")}</span>
                </motion.div>
              </Link>

              <Link href="/catalog" className="block">
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 }}
                  className="rounded-xl p-3 backdrop-blur-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center cursor-pointer group hover:bg-white/10 transition-colors"
                >
                  <BookOpen className="h-4 w-4 text-white/70 group-hover:text-[#d4af37] transition-colors mb-1.5" />
                  <span className="text-[10px] font-medium text-white/70 group-hover:text-white transition-colors">{t("collection.gallery_btn", "Gallery")}</span>
                </motion.div>
              </Link>

              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                onClick={handleClaimBonus}
                className="rounded-xl p-3 backdrop-blur-xl bg-white/5 border border-white/10 flex flex-col items-center justify-center cursor-pointer group hover:bg-white/10 transition-colors"
              >
                <span className="text-[10px] font-medium text-white/70 group-hover:text-white transition-colors">
                  {alreadyClaimed ? ticketTimerDisplay : t("home.ticket_claim_title", "Ticket Claim")}
                </span>
              </motion.div>
            </div>

            <Dialog open={showSpecialDealDialog} onOpenChange={(open) => {
              if (!open && !buyingSpecialDeal && !showSpecialDealSuccess) {
                setShowSpecialDealDialog(false);
              }
            }}>
                {specialDeal && (
                  <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl border-0 bg-gray-900 text-white">
                    <DialogTitle className="sr-only">{t("deals.special_deal", "Special Deal")}</DialogTitle>
                    <AnimatePresence>
                      {showSpecialDealSuccess ? (
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
                            onClick={() => setShowSpecialDealDialog(false)}
                            className="absolute top-4 right-4 bg-gray-800/50 rounded-full p-1.5 backdrop-blur-sm hover:bg-gray-700/50 transition-colors z-10"
                          >
                            <X className="h-4 w-4 text-gray-300" />
                          </button>
                    {/* Card Showcase */}
                    <div className="relative pt-8 pb-12 flex justify-center items-center">
                      <div className="absolute inset-0 overflow-hidden">
                        <div className="absolute w-full h-full bg-gradient-to-b from-blue-900/30 to-transparent"></div>
                        <div className="absolute -top-24 left-1/2 transform -translate-x-1/2 w-96 h-96 rounded-full bg-blue-500/10 blur-3xl"></div>
                      </div>
                      <div className={`relative w-40 h-56 ${
                        specialDeal.card_rarity === 'basic' ? 'shadow-[0_0_12px_rgba(107,114,128,0.4)]' :
                        specialDeal.card_rarity === 'common' ? 'shadow-[0_0_15px_rgba(156,163,175,0.5)]' :
                        specialDeal.card_rarity === 'uncommon' ? 'shadow-[0_0_15px_rgba(34,197,94,0.5)]' :
                        specialDeal.card_rarity === 'rare' ? 'shadow-[0_0_15px_rgba(59,130,246,0.5)]' :
                        specialDeal.card_rarity === 'epic' ? 'shadow-[0_0_15px_rgba(147,51,234,0.5)]' :
                        specialDeal.card_rarity === 'legendary' ? 'shadow-[0_0_20px_rgba(251,191,36,0.6)]' :
                        specialDeal.card_rarity === 'mythic' ? 'shadow-[0_0_20px_rgba(239,68,68,0.6)]' :
                        'shadow-[0_0_15px_rgba(61,174,245,0.5)]'
                      }`}>
                        <div className={`absolute inset-0 rounded-lg border-2 overflow-hidden ${
                          specialDeal.card_rarity === 'basic' ? 'border-0' :
                          specialDeal.card_rarity === 'common' ? 'border-gray-400' :
                          specialDeal.card_rarity === 'uncommon' ? 'border-green-400' :
                          specialDeal.card_rarity === 'rare' ? 'border-blue-400' :
                          specialDeal.card_rarity === 'epic' ? 'border-purple-400' :
                          specialDeal.card_rarity === 'legendary' ? 'border-yellow-400' :
                          specialDeal.card_rarity === 'mythic' ? 'border-red-400' :
                          'border-[#3DAEF5]'
                        }`}>
                          <img
                            src={getCloudflareImageUrl(specialDeal.card_image_url || '')}
                            alt={specialDeal.card_name || 'Card'}
                            className="object-cover w-full h-full"
                            onError={e => (e.currentTarget.src = '/placeholder.svg')}
                          />
                          <div className="absolute bottom-2 left-1/2 transform -translate-x-1/2 z-10">
                            {renderStars(specialDeal.card_level || 1, 'sm')}
                          </div>
                        </div>
                        <div className="absolute -top-4 -right-4 bg-[#3DAEF5] text-white text-xs font-bold py-1 px-3 rounded-full flex items-center gap-1 shadow-lg">
                          <Sparkles className="h-3 w-3" />
                          <span>{t("deals.special_deal", "Special Deal")}</span>
                        </div>
                      </div>
                    </div>
                    {/* Card Details */}
                    <div className="bg-gray-800 rounded-t-3xl px-6 pt-6 pb-8 -mt-6 relative z-10">
                      <div className="mb-5">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-xl font-bold text-white">{specialDeal.card_name}</h3>
                          <span className="bg-blue-900 text-blue-200 px-3 py-1 rounded-full text-xs font-bold">{getDisplayRarity(specialDeal.card_rarity)}</span>
                        </div>
                        <p className="text-sm text-[#3DAEF5]">{specialDeal.card_character}</p>
                        <p className="text-sm text-gray-400 mt-3">{specialDeal.description}</p>
                      </div>
                      {/* What's Included */}
                      <div className="bg-gray-900/50 rounded-xl p-4 mb-5 border border-gray-700/50">
                        <h4 className="text-sm font-medium text-gray-300 mb-3">
                          {t("deals.whats_included", "What's Included")}
                        </h4>
                        <div className="space-y-3">
                          <div className="flex items-center">
                            <div className="w-9 h-9 rounded-md border-2 border-violet-500 flex items-center justify-center mr-3 bg-gray-800">
                              <span className="text-xs font-bold text-violet-400">★{specialDeal.card_level}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{specialDeal.card_name}</p>
                              <p className="text-xs text-gray-400">{t("common.level", "Level")} {specialDeal.card_level} {getDisplayRarity(specialDeal.card_rarity)}</p>
                            </div>
                          </div>
                          {/* Classic Tickets */}
                          {specialDeal.classic_tickets > 0 && (
                            <div className="flex items-center"> 
                              <div className="w-9 h-9 rounded-md bg-blue-900/30 border border-blue-700/50 flex items-center justify-center mr-3">
                                <Ticket className="h-4 w-4 text-blue-400" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-white">{specialDeal.classic_tickets} {t("deals.regular_tickets", "Regular Tickets")}</p>
                                <p className="text-xs text-gray-400">{t("deals.for_regular_packs", "For regular card packs")}</p>
                              </div>
                            </div>
                          )}
                          {/* Legendary Tickets (elite_tickets) - only show if > 0 */}
                          {specialDeal.elite_tickets != null && Number(specialDeal.elite_tickets) > 0 && (
                            <div className="flex items-center"> 
                              <div className="w-9 h-9 rounded-md bg-purple-900/30 border border-purple-700/50 flex items-center justify-center mr-3">
                                <Crown className="h-4 w-4 text-purple-400" />
                              </div>
                              <div>
                                <p className="text-sm font-medium text-white">{specialDeal.elite_tickets} {t("deals.legendary_tickets", "Legendary Tickets")}</p>
                                <p className="text-xs text-gray-400">{t("deals.for_legendary_packs", "For legendary card packs")}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                      {/* Creator Info */}
                      {specialDeal.creator_address && specialDealCreatorPercentage !== null && (
                        <div className="bg-green-900/20 rounded-lg p-3 mb-5 border border-green-700/30">
                          <div className="flex items-center gap-2">
                            <Users className="h-4 w-4 text-green-400" />
                            <div>
                              <p className="text-xs text-green-300 font-medium">
                                {t("deals.creator_receives_percent", "Card Creator receives {percent}% of purchase", { percent: specialDealCreatorPercentage })}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                      {/* Price and Action */}
                      <div className="flex items-center justify-between">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                          <p className="text-sm text-gray-400">{t("common.price", "Price")}</p>
                            <PaymentCurrencyToggle size="sm" className="max-w-[160px]" />
                          </div>
                          {specialDealHasDiscount && specialDealDiscountedPrice !== null ? (
                            <div>
                              <p className="text-lg line-through text-gray-500">{formatPrice(specialDeal.price)}</p>
                              <p className="text-2xl font-bold text-[#3DAEF5]">{formatPrice(specialDealDiscountedPrice)}</p>
                              <p className="text-sm text-red-400 font-bold">-{specialDeal.discount_percentage}% off</p>
                            </div>
                          ) : (
                            <p className="text-2xl font-bold text-[#3DAEF5]">{specialDeal ? formatPrice(specialDeal.price) : "—"}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <Button
                            onClick={handleBuySpecialDeal}
                            disabled={buyingSpecialDeal}
                            size="lg"
                            className="bg-gradient-to-r from-[#3DAEF5] to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-full shadow-lg shadow-blue-900/30"
                          >
                            {buyingSpecialDeal ? (
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
                        </div>
                      )}
                    </AnimatePresence>
                  </DialogContent>
                )}
              </Dialog>

          </div>
        </main>

        

        {showClaimAnimation && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
          >
    <div className="relative">
      {[...Array(3)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute"
          initial={{ x: 0, y: 0, scale: 0 }}
          animate={{
            x: [0, (i - 1) * 30],
            y: [0, -60],
            scale: [0, 1.2, 1],
            opacity: [1, 0],
          }}
          transition={{ duration: 1.5, delay: i * 0.2 }}
        >
          <div className="bg-white rounded-lg p-2 shadow-lg flex items-center gap-2 border-2 border-blue-300">
            <Ticket className="h-5 w-5 text-blue-500" />
            <span className="font-bold text-blue-600">+1</span>
          </div>
        </motion.div>
      ))}
    </div>
  </motion.div>
)}

        {/* Deal of the Day Dialog */}
        {dailyDeal && dailyDeal.card_name && (
          <DealOfTheDayDialog
            isOpen={showDailyDealDialog}
            onClose={() => {
              setShowDailyDealDialog(false)
              setHasShownDailyDeal(true) // Mark as shown when closed
              // Note: markDealAsSeen is already called in DealOfTheDayDialog when it opens
            }}
            deal={dailyDeal}
            username={user?.wallet_address || ""}
            onPurchaseSuccess={handleDailyDealPurchaseSuccess}
          />
        )}


        {/* Referrals Dialog */}
<Dialog open={showReferralDialog} onOpenChange={setShowReferralDialog}>
  <DialogContent className="bg-gradient-to-br from-[#232526] to-[#414345] border-2 border-yellow-400 text-white">
    <DialogTitle className="text-xl font-bold text-yellow-100 flex items-center gap-2">
      <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center border border-yellow-300">
        <Gift className="h-5 w-5 text-white" />
      </div>
      {t("referrals.invite_friends", "Invite Friends")}
    </DialogTitle>
    <DialogDescription className="text-sm text-yellow-200">
      {t("referrals.share_code", "Share your referral code with friends to earn rewards!")}<br />
      <span className="text-xs text-red-400 font-semibold">{t("referrals.username_note", "Note: Only username works as referral code")}</span><br />
      <span className="text-xs text-red-400 font-semibold">⚠️ {t("referrals.abuse_warning", "Abuse will result in account suspension")}</span>
    </DialogDescription>
    {/* Your referral link */}
    <div className="mt-6">
      <div className="text-sm font-semibold text-yellow-100 mb-2">{t("referrals.your_code", "Your Referral Code")}</div>
      <div className="flex items-center justify-between bg-gradient-to-r from-[#232526] to-[#414345] border-2 border-yellow-400 rounded-lg px-4 py-3 shadow-lg">
        <span className="truncate text-sm font-mono text-yellow-200 font-bold">{user?.username}</span>
        <Button
          size="sm"
          className="bg-yellow-400 hover:bg-yellow-500 text-white font-bold border-2 border-yellow-300 shadow-lg"
          onClick={() => {
            const link = `https://world.org/mini-app?app_id=app_b4a7aaa5da2b8df0fa0e5b0f48b27cea&path=${user?.username}`
            navigator.clipboard.writeText(link)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
{copied ? t("referrals.copied", "Copied!") : t("referrals.copy_code", "Copy Code")}
        </Button>
      </div>
    </div>
    {/* Rewards overview */}
    <div className="mt-6 bg-gradient-to-br from-yellow-400/20 to-yellow-600/20 border-2 border-yellow-400 rounded-lg p-4 shadow-lg">
      <h4 className="text-sm font-bold text-yellow-100 mb-3 flex items-center gap-2">
        <span className="text-yellow-400">🎁</span>
        {t("referrals.what_you_get", "What You Get")}
      </h4>
      <ul className="text-sm text-yellow-200 space-y-2">
        <li className="flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
          <strong className="text-yellow-100">+5</strong> {t("referrals.regular_tickets", "Regular Tickets")}
        </li>
        <li className="flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
          <strong className="text-yellow-100">+3</strong> {t("referrals.legendary_tickets", "Legendary Tickets")}
        </li>
        <li className="flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
          {t("referrals.level_requirement", "Once friend reaches Level 3")}
        </li>
      </ul>
    </div>
    {/* Referred users list */}
    <div className="mt-6">
      <h4 className="text-sm font-bold text-yellow-100 mb-3 flex items-center gap-2">
        <span className="text-yellow-400">👥</span>
        {t("referrals.your_referrals", "Your Referrals")}
      </h4>
      {referredUsers.length === 0 ? (
        <div className="bg-gradient-to-r from-[#232526]/50 to-[#414345]/50 border border-yellow-400/30 rounded-lg p-4 text-center">
          <p className="text-sm text-yellow-200/70">{t("referrals.no_referrals", "No referrals yet")}</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto bg-gradient-to-r from-[#232526]/30 to-[#414345]/30 border border-yellow-400/30 rounded-lg p-3">
          {referredUsers.map((ref) => (
            <div key={ref.username} className="flex justify-between items-center border-b border-yellow-400/20 pb-2 last:border-b-0">
              <span className="text-sm text-yellow-200">
                @{ref.username.length > 10 ? ref.username.slice(0, 10) + "…" : ref.username} 
                <span className="text-yellow-400/70 text-xs ml-1">(Level {ref.level})</span>
              </span>
              {ref.reward_claimed ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : ref.level >= 3 ? (
                <Button
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white font-bold text-xs border border-green-400"
                  onClick={async () => {
                    if (!user?.username) return
                    try {
                      const res = await claimReferralRewardForUser(user.wallet_address, ref.wallet_address)
                      if (res.success) {
                        setShowClaimAnimation(true)
                        if (
                          typeof res.newTicketCount === "number" ||
                          typeof (res as any).newEliteTicketCount === "number"
                        ) {
                          await updateUserTickets(res.newTicketCount, (res as any).newEliteTicketCount)
                          setTickets(res.newTicketCount)
                          setEliteTickets((res as any).newEliteTicketCount)
                        }
                        setReferredUsers((prev) =>
                          prev.map((r) => (r.username === ref.username ? { ...r, reward_claimed: true } : r))
                        )
                        setTimeout(() => setShowClaimAnimation(false), 1500)
                        toast({
                        title: t("referrals.success", "Success!"),
                        description: t("referrals.reward_claimed", "Referral reward claimed!"),
                        })
                      } else {
                        toast({ title: t("referrals.error", "Error"), description: res.error, variant: "destructive" })
                      }
                    } catch (error) {
                      console.error("Error claiming referral reward:", error)
                      toast({ 
                        title: t("referrals.error", "Error"), 
                        description: t("referrals.failed_to_claim", "Failed to claim referral reward"), 
                        variant: "destructive" 
                      })
                    }
                  }}
                >
                  {t("referrals.claim_reward", "Claim Reward")}
                </Button>
              ) : (
                <span className="text-xs text-yellow-400/50">{t("referrals.level_up_to", "Level up to 5")}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </DialogContent>
</Dialog>

      

      
      {/* Card Bonus Dialog */}
      <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
        <DialogContent className="bg-gradient-to-br from-[#1a1a1a] via-[#2d2d2d] to-[#1a1a1a] border-2 border-yellow-400 text-white max-w-sm mx-auto max-h-[90vh] overflow-y-auto shadow-2xl backdrop-blur-sm">
          <DialogTitle className="text-lg font-bold text-white mb-1 text-center bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            {t("home.card_bonus_title", "Card Bonus")}
          </DialogTitle>

          {/* Description Box */}
          <div className="bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] p-2 rounded-xl mb-2 border border-gray-700 shadow-lg">
            <p className="text-sm font-semibold text-white mb-2 leading-relaxed text-center">{t("home.card_bonus_desc", "Use your cards to get bonus tokens when buying on ANI wallet")}</p>
            <Button 
              className="w-full bg-gradient-to-r from-yellow-400 to-yellow-500 hover:from-yellow-500 hover:to-yellow-600 text-black font-bold py-1.5 px-2 rounded-lg text-xs shadow-lg transition-all duration-200 hover:shadow-xl transform hover:scale-105"
              onClick={() => {
                window.open('https://world.org/mini-app?app_id=app_4593f73390a9843503ec096086b43612&path=', '_blank')
              }}
            >
              {t("home.open_ani_wallet", "Open ANI Wallet")}
            </Button>
          </div>

          <h3 className="text-base font-bold text-white mb-1 text-center">All Levels</h3>

          {/* Levels Grid */}
          <div className="grid grid-cols-3 gap-1 mb-2">
            {[
              { level: 1, bonus: "0.05%" },
              { level: 2, bonus: "0.1%" },
              { level: 3, bonus: "0.15%" },
              { level: 4, bonus: "0.2%" },
              { level: 5, bonus: "0.25%" },
              { level: 6, bonus: "0.3%" },
              { level: 7, bonus: "0.35%" },
              { level: 8, bonus: "0.4%" },
              { level: 9, bonus: "0.5%" },
              { level: 10, bonus: "0.55%" },
              { level: 11, bonus: "0.6%" },
              { level: 12, bonus: "0.7%" },
              { level: 13, bonus: "0.8%" },
              { level: 14, bonus: "0.9%" },
              { level: 15, bonus: "1%" },
            ].map((item) => (
              <div key={item.level} className="bg-gradient-to-br from-[#2a2a2a] to-[#1a1a1a] p-1 rounded-lg text-center border border-gray-700 shadow-md hover:shadow-lg transition-all duration-200 hover:scale-105">
                <p className="text-xs font-semibold text-white">Level {item.level}</p>
                <p className="text-xs text-green-400 font-bold">+{item.bonus}</p>
              </div>
            ))}
          </div>

          {/* Bottom Highlight */}
          <div className="bg-gradient-to-r from-green-600 to-green-500 p-1.5 rounded-xl text-center font-bold text-white text-xs shadow-lg border border-green-500">
            Level 15 = +1.0% bonus
          </div>
        </DialogContent>
      </Dialog>
    </div>
    </ProtectedRoute>
  )
}

