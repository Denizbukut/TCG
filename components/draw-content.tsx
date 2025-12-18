"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback, useMemo } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { updateScoreForCards, updateScoreForLevelUp } from "@/app/actions/update-score"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import { Ticket, Crown, Star, Sword, Zap, X, ArrowUp, Award } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { motion, AnimatePresence, useAnimation, useMotionValue, useTransform } from "framer-motion"
// Removed Next.js Image import - using regular img tags
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { WEEKLY_CONTEST_CONFIG, getContestEndDate, getContestStartDate } from "@/lib/weekly-contest-config"
import { MiniKit, Tokens } from "@worldcoin/minikit-js"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { useAnixPrice } from "@/contexts/AnixPriceContext"
import { ethers } from "ethers"
import { USDC_TOKEN_ADDRESS, WLD_TOKEN_ADDRESS } from "@/lib/payment-utils"
import { Info } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
import { useI18n } from "@/contexts/i18n-context"
import { usePaymentCurrency } from "@/contexts/payment-currency-context"
import { PaymentCurrencyToggle } from "@/components/payment-currency-toggle"
import {
  type PaymentCurrency,
  ERC20_TRANSFER_ABI,
  PAYMENT_RECIPIENT,
  getTransferDetails,
} from "@/lib/payment-utils"
import { checkDropRateBoost, purchaseDropRateBoost, getBoostConfig } from "@/app/actions/drop-rate-boost"
// import { isUserBanned } from "@/lib/banned-users" // Lokale Version verwendet

// Gebannte Benutzernamen - diese können keine Packs ziehen
const BANNED_USERNAMES = [
  "kielcoraggio",
  "kielcoraggio1", 
  "jesus24win1",
  "ytph999",
  "kielcoraggio2",
  "leonandino",
  // Füge hier weitere gebannte Benutzernamen hinzu
]

// Hilfsfunktion um zu prüfen ob ein Benutzer gebannt ist
const isUserBanned = (username: string): boolean => {
  return BANNED_USERNAMES.includes(username)
}

// Rarität definieren - UPDATED: Changed rarity names
type CardRarity = "common" | "rare" | "epic" | "legendary" | "godlike"

const FALLBACK_CARDS = [
  {
    id: "fallback-1",
    name: "Placeholder",
    character: "Unknown",
    image_url: "/placeholder.png",
    rarity: "common" as CardRarity,
    type: "normal",
  },
  {
    id: "fallback-2",
    name: "Placeholder",
    character: "Unknown",
    image_url: "/placeholder.png",
    rarity: "rare" as CardRarity,
    type: "normal",
  },
  {
    id: "fallback-3",
    name: "Placeholder",
    character: "Unknown",
    image_url: "/placeholder.png",
    rarity: "epic" as CardRarity,
    type: "normal",
  },
  // UPDATED: Changed godlike fallback to red theme
  {
    id: "fallback-4",
    name: "Godlike Placeholder",
    character: "Divine",
    image_url: "/placeholder.png",
    rarity: "godlike" as CardRarity,
    type: "special",
  },
]

// Rarity color mapping - UPDATED: Changed godlike to red colors
const RARITY_COLORS = {
  common: {
    border: "card-border-common",
    glow: "shadow-gray-300",
    text: "text-gray-600",
    gradient: "from-gray-300/30 to-gray-100/30",
    bg: "bg-gray-100",
  },
  basic: {
    border: "card-border-common",
    glow: "shadow-gray-300",
    text: "text-gray-600",
    gradient: "from-gray-300/30 to-gray-100/30",
    bg: "bg-gray-100",
  },
  rare: {
    border: "card-border-rare",
    glow: "shadow-blue-300",
    text: "text-blue-600",
    gradient: "from-blue-300/30 to-blue-100/30",
    bg: "bg-blue-100",
  },
  epic: {
    border: "card-border-epic",
    glow: "shadow-purple-300",
    text: "text-purple-600",
    gradient: "from-purple-300/30 to-purple-100/30",
    bg: "bg-purple-100",
  },
  elite: {
    border: "card-border-epic",
    glow: "shadow-purple-300",
    text: "text-purple-600",
    gradient: "from-purple-300/30 to-purple-100/30",
    bg: "bg-purple-100",
  },
  legendary: {
    border: "card-border-legendary",
    glow: "shadow-yellow-300",
    text: "text-yellow-600",
    gradient: "from-yellow-300/30 to-yellow-100/30",
    bg: "bg-yellow-100",
  },
  ultimate: {
    border: "card-border-legendary",
    glow: "shadow-yellow-300",
    text: "text-yellow-600",
    gradient: "from-yellow-300/30 to-yellow-100/30",
    bg: "bg-yellow-100",
  },
  // UPDATED: Changed godlike to red colors
  godlike: {
    border: "card-border-godlike",
    glow: "shadow-red-300",
    text: "text-red-600",
    gradient: "from-red-300/30 to-red-100/30",
    bg: "bg-red-100",
  },
  goat: {
    border: "card-border-godlike",
    glow: "shadow-red-300",
    text: "text-red-600",
    gradient: "from-red-300/30 to-red-100/30",
    bg: "bg-red-100",
  },

}

// Add the Cloudflare URL function
const getCloudflareImageUrl = (imagePath?: string) => {
  if (!imagePath) return "/placeholder.svg";
  if (imagePath.startsWith("http")) return imagePath;
  let cleaned = imagePath.replace(/^\/?(world[-_])?soccer\//i, "");
  return `https://ani-labs.xyz/${encodeURIComponent(cleaned)}`;
};

export default function DrawPage() {
  const router = useRouter()
  const { user, updateUserTickets, updateUserExp, refreshUserData, updateUserScore } = useAuth()
  const { t } = useI18n()
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawnCards, setDrawnCards] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<"regular" | "legendary" | "god" | "icon" | "wheel">("regular")
  
  // Check URL parameter for tab on mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search)
      const tabParam = urlParams.get("tab")
      if (tabParam === "wheel") {
        setActiveTab("wheel")
        // Check if premium wheel is requested
        const wheelType = urlParams.get("wheelType")
        if (wheelType === "premium") {
          setActiveWheelType("premium")
        }
      }
    }
  }, [])
  const [legendaryTickets, setLegendaryTickets] = useState(2)
  const [eliteTickets, setEliteTickets] = useState(0)
  const [tickets, setTickets] = useState(0)
  const [hasPremiumPass, setHasPremiumPass] = useState(false)
  const [hasXpPass, setHasXpPass] = useState(false)
  const [userClanRole, setUserClanRole] = useState<string | null>(null)
  const [hasDropRateBoost, setHasDropRateBoost] = useState(false)
  const [boostExpiresAt, setBoostExpiresAt] = useState<string | null>(null)
  const [boostType, setBoostType] = useState<"regular" | "premium" | null>(null)
  const [legendaryBonus, setLegendaryBonus] = useState(0)
  const [showBoostDialog, setShowBoostDialog] = useState(false)
  const [isCheckingBoost, setIsCheckingBoost] = useState(true)
  const [selectedBoostType, setSelectedBoostType] = useState<"regular" | "premium">("regular")
  const [selectedDuration, setSelectedDuration] = useState<"1week" | "1month">("1week")
  const [boostPaymentCurrency, setBoostPaymentCurrency] = useState<"WLD" | "USDC">("WLD")
  const [wldBalance, setWldBalance] = useState<string>("0")
  const [usdcBalance, setUsdcBalance] = useState<string>("0")
  const [isLoadingBalance, setIsLoadingBalance] = useState(false)
  const [isUpdatingScore, setIsUpdatingScore] = useState(false)
  const [isMultiDraw, setIsMultiDraw] = useState(false)
  const [isBulkDraw, setIsBulkDraw] = useState(false)
  const [showBulkLoading, setShowBulkLoading] = useState(false)
  const { currency: paymentCurrency, setCurrency: setPaymentCurrency } = usePaymentCurrency()
  const [activeWheelType, setActiveWheelType] = useState<"premium" | "standard">("standard")

  // Animation states
  const [showPackSelection, setShowPackSelection] = useState(true)
  const [showPackAnimation, setShowPackAnimation] = useState(false)
  const [packOpened, setPackOpened] = useState(false)
  const [showRarityText, setShowRarityText] = useState(false)
  const [showCards, setShowCards] = useState(false)
  const [showBulkResults, setShowBulkResults] = useState(false)
  const [cardRevealed, setCardRevealed] = useState(false)
  const [showXpAnimation, setShowXpAnimation] = useState(false)
  const [xpGained, setXpGained] = useState(0)
  const [showLevelUpAnimation, setShowLevelUpAnimation] = useState(false)
  const [newLevel, setNewLevel] = useState(1)
  const [scoreGained, setScoreGained] = useState(0)
  const [selectedCardIndex, setSelectedCardIndex] = useState<number | null>(null)
  const [selectedEpoch, setSelectedEpoch] = useState<number>(1)
  const [availableEpochs, setAvailableEpochs] = useState<number[]>([1])
  const [godPacksLeft, setGodPacksLeft] = useState<number | null>(null)
  const max_godpacks_daily = 100;
  // God Pack Discount state
  const [godPackDiscount, setGodPackDiscount] = useState<{
    isActive: boolean
    value: number
    endTime?: string
  } | null>(null)
  const [godPackDiscountTimeLeft, setGodPackDiscountTimeLeft] = useState<string>("")
const [godPackChances, setGodPackChances] = useState<{ godlike: number; epic: number }>({ godlike: 1, epic: 49 })
const [showInfo, setShowInfo] = useState(false)
  // const [iconTickets, setIconTickets] = useState(0)
  const [hasIconPass, setHasIconPass] = useState(false)
  const { price } = useWldPrice()
  const { price: anixPrice } = useAnixPrice()
  
  // Premium Wheel Segments (original)
  const premiumWheelSegments = useMemo(
    () => [
      // Mix tickets and other rewards for better color distribution
      { label: t("draw.lucky_wheel_reward_epic", "Epic Card"), color: "#8B5CF6", dropRate: 19, reward: { type: "card", rarity: "epic" as const } },
      { label: t("draw.lucky_wheel_reward_regular_5", "+5 Regular Tickets"), color: "#3B82F6", dropRate: 17, reward: { type: "tickets", ticketType: "regular" as const, amount: 5 } },
      { label: t("draw.lucky_wheel_reward_legendary_5", "+5 Legendary Tickets"), color: "#A855F7", dropRate: 17, reward: { type: "tickets", ticketType: "legendary" as const, amount: 5 } },
      { label: t("draw.lucky_wheel_reward_deal_day", "Deal of the Day Bundle"), color: "#FBBF24", dropRate: 7, reward: { type: "deal", deal: "daily" as const } },
      { label: t("draw.lucky_wheel_reward_regular_15", "+15 Regular Tickets"), color: "#3B82F6", dropRate: 9, reward: { type: "tickets", ticketType: "regular" as const, amount: 15 } },
      { label: t("draw.lucky_wheel_reward_legendary_15", "+15 Legendary Tickets"), color: "#A855F7", dropRate: 9, reward: { type: "tickets", ticketType: "legendary" as const, amount: 15 } },
      { label: t("draw.lucky_wheel_reward_legendary", "Legendary Card"), color: "#F59E0B", dropRate: 6, reward: { type: "card", rarity: "legendary" as const } },
      { label: t("draw.lucky_wheel_reward_regular_25", "+25 Regular Tickets"), color: "#3B82F6", dropRate: 6, reward: { type: "tickets", ticketType: "regular" as const, amount: 25 } },
      { label: t("draw.lucky_wheel_reward_legendary_25", "+25 Legendary Tickets"), color: "#A855F7", dropRate: 6, reward: { type: "tickets", ticketType: "legendary" as const, amount: 25 } },
      { label: t("draw.lucky_wheel_reward_game_pass", "Game Pass Unlock +7 days"), color: "#10B981", dropRate: 1, reward: { type: "pass", pass: "premium" as const } },
      { label: t("draw.lucky_wheel_reward_regular_50", "+50 Regular Tickets"), color: "#3B82F6", dropRate: 0.5, reward: { type: "tickets", ticketType: "regular" as const, amount: 50 } },
      { label: t("draw.lucky_wheel_reward_legendary_50", "+50 Legendary Tickets"), color: "#A855F7", dropRate: 0.5, reward: { type: "tickets", ticketType: "legendary" as const, amount: 50 } },
      { label: t("draw.lucky_wheel_reward_xp_pass", "XP Pass Unlock +7 days"), color: "#F87171", dropRate: 1, reward: { type: "pass", pass: "xp" as const } },
      { label: t("draw.lucky_wheel_reward_special_deal", "Special Deal Bundle"), color: "#EC4899", dropRate: 1, reward: { type: "deal", deal: "special" as const } },
    ],
    [t],
  )

  // Standard Wheel Segments (new - with tickets 1-3 and all card rarities)
  // Most common: Tickets 1 (Regular + Legendary) and Common Cards
  // Maximum tickets: 3 (Tickets 4 and 5 removed)
  const standardWheelSegments = useMemo(
    () => [
      // Tickets 1 (most common - 30% each = 60% total)
      { label: t("draw.lucky_wheel_reward_regular_1", "+1 Regular Ticket"), color: "#3B82F6", dropRate: 30, reward: { type: "tickets", ticketType: "regular" as const, amount: 1 } },
      { label: t("draw.lucky_wheel_reward_legendary_1", "+1 Legendary Ticket"), color: "#A855F7", dropRate: 30, reward: { type: "tickets", ticketType: "legendary" as const, amount: 1 } },
      // Common Cards (26%)
      { label: t("draw.lucky_wheel_reward_common", "Common Card"), color: "#9CA3AF", dropRate: 26, reward: { type: "card", rarity: "common" as const } },
      // Tickets 2 (2.5% each = 5% total)
      { label: t("draw.lucky_wheel_reward_regular_2", "+2 Regular Tickets"), color: "#3B82F6", dropRate: 2.5, reward: { type: "tickets", ticketType: "regular" as const, amount: 2 } },
      { label: t("draw.lucky_wheel_reward_legendary_2", "+2 Legendary Tickets"), color: "#A855F7", dropRate: 2.5, reward: { type: "tickets", ticketType: "legendary" as const, amount: 2 } },
      // Tickets 3 (2% each = 4% total)
      { label: t("draw.lucky_wheel_reward_regular_3", "+3 Regular Tickets"), color: "#3B82F6", dropRate: 2, reward: { type: "tickets", ticketType: "regular" as const, amount: 3 } },
      { label: t("draw.lucky_wheel_reward_legendary_3", "+3 Legendary Tickets"), color: "#A855F7", dropRate: 2, reward: { type: "tickets", ticketType: "legendary" as const, amount: 3 } },
      // Rare Cards (2.5%)
      { label: t("draw.lucky_wheel_reward_rare", "Rare Card"), color: "#3B82F6", dropRate: 2.5, reward: { type: "card", rarity: "rare" as const } },
      // Epic Cards (1.5%)
      { label: t("draw.lucky_wheel_reward_epic_standard", "Epic Card"), color: "#8B5CF6", dropRate: 1.5, reward: { type: "card", rarity: "epic" as const } },
      // Legendary Cards (0.5%)
      { label: t("draw.lucky_wheel_reward_legendary_standard", "Legendary Card"), color: "#F59E0B", dropRate: 0.5, reward: { type: "card", rarity: "legendary" as const } },
      // Deal of the Day (0.5%)
      { label: t("draw.lucky_wheel_reward_deal_day_standard", "Deal of the Day Bundle"), color: "#FBBF24", dropRate: 0.5, reward: { type: "deal", deal: "daily" as const } },
    ],
    [t],
  )

  // Select active wheel segments based on wheel type
  const luckyWheelSegments = useMemo(
    () => activeWheelType === "premium" ? premiumWheelSegments : standardWheelSegments,
    [activeWheelType, premiumWheelSegments, standardWheelSegments]
  )
  const segmentAngle = useMemo(() => 360 / luckyWheelSegments.length, [luckyWheelSegments.length])
  
  // Memoize the conic-gradient CSS string to avoid recalculating on every render
  const wheelGradientStyle = useMemo(() => {
    const gradient = luckyWheelSegments
      .map((segment, index) => {
        const start = (index / luckyWheelSegments.length) * 100
        const end = ((index + 1) / luckyWheelSegments.length) * 100
        return `${segment.color} ${start}%, ${segment.color} ${end}%`
      })
      .join(",")
    return `conic-gradient(${gradient})`
  }, [luckyWheelSegments])
  const [wheelRotation, setWheelRotation] = useState(0)
  const [wheelSpinning, setWheelSpinning] = useState(false)
  const [selectedWheelSegment, setSelectedWheelSegment] = useState<string | null>(null)
  const [lastWheelCard, setLastWheelCard] = useState<string | null>(null)
  const [showRewardOverlay, setShowRewardOverlay] = useState(false)
  const [wheelReward, setWheelReward] = useState<{
    type: string
    label: string
    amount?: number
    cardName?: string
  } | null>(null)
  const [wheelSpinDuration, setWheelSpinDuration] = useState<string>("0s")
  const [wheelLimit, setWheelLimit] = useState<{
    canSpin: boolean
    globalSpinsUsed: number
    globalSpinsRemaining: number
    globalDailyLimit: number
    userSpinsCount?: number
    hasPendingSpin?: boolean
  } | null>(null)
  const spinCostDetails = useMemo(() => {
    if (paymentCurrency === "WLD" && (!price || price <= 0)) return null
    if (paymentCurrency === "ANIX" && (!anixPrice || anixPrice <= 0)) return null
    try {
      // Different prices for Premium (1.65 USD) and Standard (0.18 USD) wheels
      const usdAmount = activeWheelType === "premium" ? 1.65 : 0.18
      
      const details = getTransferDetails({
        usdAmount,
        currency: paymentCurrency,
        wldPrice: price,
        anixPrice,
      })
      
      // Format ANIX price to 2 decimal places for lucky wheel
      if (paymentCurrency === "ANIX" && details) {
        const formattedAmount = details.numericAmount.toFixed(2)
        return {
          ...details,
          displayAmount: `${formattedAmount} ANIX`,
        }
      }
      
      return details
    } catch (error) {
      console.error("Failed to compute lucky wheel cost", error)
      return null
    }
  }, [price, anixPrice, paymentCurrency, activeWheelType])

  // Helper function to refresh wheel limit
  const refreshWheelLimit = useCallback(async () => {
    if (!user?.wallet_address) return

    try {
      const response = await fetch("/api/lucky-wheel/check-limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ walletAddress: user.wallet_address }),
      })

      if (response.ok) {
        const result = await response.json()
        if (result.success) {
          console.log("Refreshed wheel limit:", result)
          setWheelLimit({
            canSpin: result.canSpin,
            globalSpinsUsed: result.globalSpinsUsed || 0,
            globalSpinsRemaining: result.globalSpinsRemaining || 0,
            globalDailyLimit: result.globalDailyLimit || 25,
            userSpinsCount: result.userSpinsCount || 0,
            hasPendingSpin: result.hasPendingSpin || false,
          })
          return true
        }
      }
    } catch (error) {
      console.error("Error refreshing wheel limit:", error)
    }
    return false
  }, [user?.wallet_address])

  // Check Lucky Wheel daily limit (load immediately when user is available, not waiting for tab switch)
  useEffect(() => {
    // Skip if no user
    if (!user?.wallet_address) {
      return
    }

    let cancelled = false

    // Fetch limit data immediately (no delay, no waiting for tab switch)
    const checkWheelLimit = async () => {
      try {
        const response = await fetch("/api/lucky-wheel/check-limit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ walletAddress: user.wallet_address }),
        })

        if (cancelled) return

        if (response.ok) {
          const result = await response.json()
          if (result.success && !cancelled) {
            console.log("Wheel limit check result:", result)
            setWheelLimit({
              canSpin: result.canSpin,
              globalSpinsUsed: result.globalSpinsUsed || 0,
              globalSpinsRemaining: result.globalSpinsRemaining || 0,
              globalDailyLimit: result.globalDailyLimit || 25,
              userSpinsCount: result.userSpinsCount || 0,
              hasPendingSpin: result.hasPendingSpin || false,
            })
          }
        }
      } catch (error) {
        if (!cancelled) {
          console.error("Error checking wheel limit:", error)
        }
      }
    }

    // Start the request immediately without delay
    checkWheelLimit()

    return () => {
      cancelled = true
    }
  }, [user?.wallet_address])

  // Check if user has active Icon Pass
  useEffect(() => {
    const checkIconPass = async () => {
      if (!user?.wallet_address) return
      
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) {
          console.log('❌ Supabase client not available')
          return
        }

        // Add timeout to prevent hanging requests
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Database request timeout')), 5000)
        })

        const dataPromise = supabase
          .from('icon_passes')
          .select('*')
          .eq('user_id', user.wallet_address)
          .eq('active', true)
          .single()

        const { data, error } = await Promise.race([dataPromise, timeoutPromise]) as any

        console.log('Icon Pass check in draw-content:', { data, error, username: user.username })
        
        // Handle table not found error gracefully
        if (error) {
          if (error.code === 'PGRST116' || error.message?.includes('Could not find the table')) {
            console.log('No active Icon Pass found in draw-content: Icon Pass table does not exist or is not accessible')
            setHasIconPass(false)
            return
          }
          console.error('Icon Pass check error:', error)
          setHasIconPass(false)
          return
        }
        
        if (data) {
          setHasIconPass(true)
          console.log('✅ Icon Pass is active in draw-content!')
        } else {
          setHasIconPass(false)
          if (error?.code === 'PGRST116') {
            console.log('ℹ️ No Icon Pass record found (user never purchased)')
          } else {
            console.log('❌ No active Icon Pass found in draw-content:', error?.message || 'Unknown error')
          }
        }
      } catch (error) {
        console.error('❌ Error checking Icon Pass in draw-content:', error)
        setHasIconPass(false)
      }
    }

    if (user?.wallet_address) {
      checkIconPass()
    }
  }, [user?.wallet_address])

  const fetchGodPacksLeft = async () => {
    const supabase = getSupabaseBrowserClient()
    const today = new Date().toISOString().split("T")[0]
    if (!supabase) return
    
    try {
      // God pack daily usage table doesn't exist, so we'll use default values
      console.log("God pack usage check: Table does not exist, using default")
      setGodPacksLeft(2) // Default to 2 since table doesn't exist
      setGodPackChances({ godlike: 1, epic: 49 }) // Default chances
    } catch (error) {
      console.log("Table god_pack_daily_usage does not exist, using default values")
      setGodPacksLeft(max_godpacks_daily)
      setGodPackChances(calculateDynamicGodPackChances(0))
    }
  }

  // Fetch God Pack Discount (client-side)
  const fetchGodPackDiscount = async () => {
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        setGodPackDiscount(null)
        return
      }

      // Query god_pack_discounts table directly
      const { data, error } = await (supabase
        .from("god_pack_discounts")
        .select("*")
        .eq("is_active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single() as any)

      if (error || !data || typeof data !== 'object' || !('end_time' in data)) {
        console.log("No active god pack discount found")
        setGodPackDiscount(null)
        return
      }

      // Check if discount is still valid (not expired)
      const now = new Date()
      const endTime = data.end_time && typeof data.end_time === 'string' ? new Date(data.end_time) : null
      
      if (endTime && now > endTime) {
        console.log("God pack discount expired")
        setGodPackDiscount(null)
        return
      }

      // Convert discount_percent to decimal value
      const discountPercent = typeof data.discount_percent === 'number' ? data.discount_percent : 0
      const discountValue = discountPercent / 100

      setGodPackDiscount({
        isActive: true,
        value: discountValue,
        endTime: typeof data.end_time === 'string' ? data.end_time : undefined
      })
    } catch (error) {
      console.error("Error fetching god pack discount:", error)
      setGodPackDiscount(null)
    }
  }

  // Bulk opening states
  const [selectedBulkCard, setSelectedBulkCard] = useState<any | null>(null)

  // Hydration safety
  const [isClient, setIsClient] = useState(false)

  // Card states
  const [currentCardIndex, setCurrentCardIndex] = useState(0)
  const controls = useAnimation()

  // Card tilt effect
  const cardRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const rotateX = useTransform(y, [-100, 100], [15, -15])
  const rotateY = useTransform(x, [-100, 100], [-15, 15])
  const reflectionX = useTransform(x, [-100, 100], ["30%", "70%"])
  const reflectionY = useTransform(y, [-100, 100], ["30%", "70%"])
  const reflectionOpacity = useTransform(x, [-100, 0, 100], [0.7, 0.3, 0.7])

  const preventNavigation = useRef(false)

  const calculateBaseDollarAmount = (count: number) => {
    let amount = 0.91 * count
    if (count === 5) {
      amount *= 0.9
    }
    return amount
  }

  const calculateDiscountedDollarAmount = (count: number) => {
    const base = calculateBaseDollarAmount(count)
    if (godPackDiscount?.isActive && activeTab === "god") {
      return base * (1 - godPackDiscount.value)
    }
    return base
  }

  useEffect(() => {
    fetchGodPacksLeft()
    fetchGodPackDiscount()
  }, [])

  // God Pack Discount countdown
  useEffect(() => {
    if (!godPackDiscount?.endTime) return

    const updateCountdown = () => {
      const now = new Date().getTime()
      const endTime = new Date(godPackDiscount.endTime!).getTime()
      const timeLeft = endTime - now

      if (timeLeft <= 0) {
        setGodPackDiscountTimeLeft("")
        setGodPackDiscount(null)
        return
      }

      const hours = Math.floor(timeLeft / (1000 * 60 * 60))
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)

      setGodPackDiscountTimeLeft(`${hours}h ${minutes}m ${seconds}s`)
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)

    return () => clearInterval(interval)
  }, [godPackDiscount?.endTime])

  // Payment function for God Pack
  const sendPayment = async (count = 1, currency: PaymentCurrency = paymentCurrency) => {
    // Check if user is banned before allowing payment
    if (!user) {
      toast({ title: "Error", description: "You must be logged in.", variant: "destructive" })
      return
    }

    // Check if user is banned
    if (isUserBanned(user.username)) {
      toast({
        title: "Access Denied",
        description: "You are banned from drawing packs.",
        variant: "destructive",
      })
      return
    }

    const dollarAmount = calculateDiscountedDollarAmount(count)
    const transferDetails = getTransferDetails({
      usdAmount: dollarAmount,
      currency,
      wldPrice: price,
      anixPrice,
    })

    try {
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

      const isGoatPack = activeTab === "god"

      if (finalPayload.status == "success") {
        console.log("success sending payment")
        handleSelectPack(isGoatPack ? "god" : "god", count)
      } else {
        toast({
          title: "Payment Failed",
          description: "Payment was not completed successfully.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Payment error:", error)
      toast({
        title: "Payment Error",
        description: "An error occurred during payment.",
        variant: "destructive",
      })
    }
  }

  const getSelectedCard = () => {
    if (selectedCardIndex === null) return null
    return drawnCards[selectedCardIndex]
  }

  // Fetch available epochs
  useEffect(() => {
    const fetchAvailableEpochs = async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      try {
        const { data: epochs, error } = await (supabase.from("cards").select("epoch").not("epoch", "is", null) as any)

        if (!error && epochs) {
          const uniqueEpochs = (([...new Set(epochs.map((e: any) => e.epoch as number))] as number[]).sort((a, b) => b - a))
          setAvailableEpochs(uniqueEpochs)
        }
      } catch (error) {
        console.error("Error fetching epochs:", error)
      }
    }

    fetchAvailableEpochs()
  }, [])

 

  useEffect(() => {
    setIsClient(true)
    refreshUserData?.()

    const fetchXpPass = async () => {
      if (!user?.wallet_address) return

      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { data, error } = await (supabase
        .from("xp_passes")
        .select("active")
        .eq("wallet_address", user.wallet_address)
        .eq("active", true)
        .single() as any)

      if (data?.active) {
        setHasXpPass(true)
      } else {
        setHasXpPass(false)
      }
    }

    fetchXpPass()
  }, [refreshUserData, user?.wallet_address])

  // Check Premium Pass status
  useEffect(() => {
    const fetchPremiumPass = async () => {
      if (!user?.wallet_address) return
      
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        const { data, error } = await (supabase
          .from('premium_passes')
          .select('active, expires_at')
          .eq('wallet_address', user.wallet_address)
          .eq('active', true)
          .single() as any)

        if (!error && data) {
          // Check if premium pass has expired
          const now = new Date()
          const expiresAt = new Date(data.expires_at as string)
          const isActive = expiresAt > now
          setHasPremiumPass(isActive)
          console.log('🎫 Premium Pass Status:', { 
            user: user.wallet_address, 
            active: isActive, 
            expiresAt: expiresAt.toISOString(),
            now: now.toISOString()
          })
        } else {
          setHasPremiumPass(false)
          console.log('🎫 No Premium Pass found for user:', user.wallet_address)
        }
      } catch (error) {
        console.error('Error checking Premium Pass:', error)
        setHasPremiumPass(false)
      }
    }

    fetchPremiumPass()
  }, [user?.wallet_address])

  // Check drop rate boost status
  useEffect(() => {
    const fetchDropRateBoost = async () => {
      setIsCheckingBoost(true)
      
      if (!user?.wallet_address) {
        setHasDropRateBoost(false)
        setBoostExpiresAt(null)
        setBoostType(null)
        setLegendaryBonus(0)
        setIsCheckingBoost(false)
        return
      }

      try {
        const packType = activeTab === "legendary" ? "legendary" : "regular"
        const result = await checkDropRateBoost(user.wallet_address, packType)
        
        if (result.success && result.hasBoost) {
          setHasDropRateBoost(true)
          setBoostExpiresAt(result.expiresAt || null)
          setBoostType(result.boostType)
          setLegendaryBonus(result.legendaryBonus || 0)
        } else {
          setHasDropRateBoost(false)
          setBoostExpiresAt(null)
          setBoostType(null)
          setLegendaryBonus(0)
        }
      } catch (error) {
        console.error("Error checking drop rate boost:", error)
        setHasDropRateBoost(false)
        setBoostExpiresAt(null)
        setBoostType(null)
      } finally {
        setIsCheckingBoost(false)
      }
    }

    fetchDropRateBoost()
  }, [user?.wallet_address, activeTab])

  // Load token balances
  useEffect(() => {
    const loadTokenBalances = async () => {
      if (!user?.wallet_address || !showBoostDialog) return
      
      setIsLoadingBalance(true)
      try {
        const provider = new ethers.JsonRpcProvider('https://worldchain-mainnet.g.alchemy.com/public')
        const ERC20_ABI = [
          'function balanceOf(address) view returns (uint256)',
          'function decimals() view returns (uint8)'
        ]

        // Load WLD balance
        try {
          const wldContract = new ethers.Contract(WLD_TOKEN_ADDRESS, ERC20_ABI, provider)
          const [wldRawBalance, wldDecimals] = await Promise.all([
            wldContract.balanceOf(user.wallet_address),
            wldContract.decimals(),
          ])
          setWldBalance(ethers.formatUnits(wldRawBalance, wldDecimals))
        } catch (error) {
          console.error("Error loading WLD balance:", error)
          setWldBalance("0")
        }

        // Load USDC balance
        try {
          const usdcContract = new ethers.Contract(USDC_TOKEN_ADDRESS, ERC20_ABI, provider)
          const [usdcRawBalance, usdcDecimals] = await Promise.all([
            usdcContract.balanceOf(user.wallet_address),
            usdcContract.decimals(),
          ])
          setUsdcBalance(ethers.formatUnits(usdcRawBalance, usdcDecimals))
        } catch (error) {
          console.error("Error loading USDC balance:", error)
          setUsdcBalance("0")
        }
      } catch (error) {
        console.error("Error loading token balances:", error)
      } finally {
        setIsLoadingBalance(false)
      }
    }

    if (showBoostDialog && user?.wallet_address) {
      loadTokenBalances()
    }
  }, [showBoostDialog, user?.wallet_address])

  // Update tickets and legendary tickets when user changes
  useEffect(() => {
    if (user) {
      if (typeof user.tickets === "number") {
        setTickets(user.tickets)
      }
      if (typeof user.elite_tickets === "number") {
        setEliteTickets(user.elite_tickets)
      }
      // if (typeof user.icon_tickets === "number") {
      //   setIconTickets(user.icon_tickets)
      // }
    }
  }, [user])

  // Handle card tilt effect
  const handleCardMove = (event: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
    if (!cardRef.current || !cardRevealed) return

    event.preventDefault()

    const rect = cardRef.current.getBoundingClientRect()
    let clientX, clientY

    if ("touches" in event) {
      clientX = event.touches[0].clientX
      clientY = event.touches[0].clientY
    } else {
      clientX = event.clientX
      clientY = event.clientY
    }

    const xPos = ((clientX - rect.left) / rect.width - 0.5) * 200
    const yPos = ((clientY - rect.top) / rect.height - 0.5) * 200

    x.set(xPos)
    y.set(yPos)
  }

  const handleCardLeave = () => {
    x.set(0)
    y.set(0)
  }

  const handleSelectPack = useCallback(
    async (cardType: string, count = 1) => {
      if (isDrawing) {
        return
      }

      if (!user) {
        toast({ title: "Error", description: "You must be logged in.", variant: "destructive" })
        return
      }

      // Check if user is banned
      if (isUserBanned(user.username)) {
        toast({ 
          title: "Access Denied", 
          description: "You are banned from drawing packs.", 
          variant: "destructive" 
        })
        return
      }

      // God pack doesn't require tickets, only payment
      if (cardType !== "god") {
        const requiredTickets = count
        const availableTickets = cardType === "legendary" ? eliteTickets : tickets

        // Für Elite Packs (legendary) eliteTickets verwenden
        const fixedAvailableTickets = cardType === "legendary" ? eliteTickets : availableTickets;

        if (fixedAvailableTickets < requiredTickets) {
          toast({
            title: "Not enough tickets",
            description: `You need ${requiredTickets} ${cardType === "legendary" ? "elite " : cardType === "icon" ? "icon " : ""}tickets but only have ${fixedAvailableTickets}.`,
            variant: "destructive",
          })
          return
        }
      }

      preventNavigation.current = true
      setIsDrawing(true)
      setIsMultiDraw(count > 1 && count <= 5)
      setIsBulkDraw(count > 5)
      setShowPackSelection(false)

      if (count > 5) {
        setShowBulkResults(false)
        setShowBulkLoading(true)
      } else {
        setShowPackAnimation(true)
      }

      setCurrentCardIndex(0)
      setCardRevealed(false)

      try {
        const response = await fetch("/api/draw", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            walletAddress: user.username,
            cardType,
            count,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()

        // Weekly Contest: Punkte für Rare, Epic und Legendary Cards - client-side
        if (result.success && result.cards && Array.isArray(result.cards) && result.cards.length > 0 && user?.wallet_address) {
          try {
            const supabase = getSupabaseBrowserClient()
            if (supabase) {
              // Calculate points: Common = 2, Rare = 2, Epic = 5, Legendary = 40
              const commonCards = result.cards.filter((card: any) => card.rarity === "common")
              const rareCards = result.cards.filter((card: any) => card.rarity === "rare")
              const epicCards = result.cards.filter((card: any) => card.rarity === "epic")
              const legendaryCards = result.cards.filter((card: any) => card.rarity === "legendary")
              
              let totalPoints = 0
              totalPoints += commonCards.length * 2
              totalPoints += rareCards.length * 2
              totalPoints += epicCards.length * 5
              totalPoints += legendaryCards.length * 40
              
              console.log(`[Weekly Contest] Cards drawn - Common: ${commonCards.length}, Rare: ${rareCards.length}, Epic: ${epicCards.length}, Legendary: ${legendaryCards.length}, Total Points: ${totalPoints}`)
              
              if (totalPoints > 0) {
                // Check if contest is active
                const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
                const contestStart = getContestStartDate()
                const contestEnd = getContestEndDate()
                const now = new Date()

                if (now >= contestStart && now <= contestEnd) {
                  // Normalize wallet address for consistency
                  const normalizedWalletAddress = user.wallet_address.toLowerCase()
                  
                  // Check if entry exists
                  const { data: existingEntry, error: fetchError } = await (supabase
                    .from("weekly_contest_entries")
                    .select("legendary_count")
                    .eq("wallet_address", normalizedWalletAddress)
                    .eq("week_start_date", weekStart)
                    .maybeSingle() as any)

                  if (!existingEntry || (fetchError && (fetchError as any).code === "PGRST116")) {
                    // No entry exists - create new one
                    await (supabase.from("weekly_contest_entries") as any).insert({
                      wallet_address: normalizedWalletAddress,
                      week_start_date: weekStart,
                      legendary_count: totalPoints,
                    })
                  } else {
                    // Entry exists - add points to existing count
                    const currentCount = Number(existingEntry.legendary_count) || 0
                    const newCount = currentCount + totalPoints
                    console.log(`[Weekly Contest] Adding ${totalPoints} points. Current: ${currentCount}, New: ${newCount}`)
                    await (supabase
                      .from("weekly_contest_entries") as any)
                      .update({ legendary_count: newCount })
                      .eq("wallet_address", normalizedWalletAddress)
                      .eq("week_start_date", weekStart)
                  }
                }
              }
            }
          } catch (error) {
            // Silently fail - contest update is not critical
            console.error("Error updating weekly contest:", error)
          }
        }

        if (result.success && result.cards?.length > 0) {
          setDrawnCards(result.cards)

          // Show Epic Avatar Bonus notification for Classic Packs
          // if (cardType === "regular" && result.epicAvatarBonus) {
          //   toast({ 
          //     title: "🎭 Epic Avatar Bonus!", 
          //     description: "Your Epic Avatar gave you +1% Ultimate drop rate (Rating 88-91)!", 
          //     variant: "default" 
          //   })
          // }

          // God pack doesn't affect ticket counts
          if (cardType !== "god") {
            // Use the actual returned values from the server
            const newTicketCount = result.newTicketCount ?? tickets
            const newEliteTicketCount = result.newEliteTicketCount ?? eliteTickets
            // const newIconTicketCount = result.newIconTicketCount ?? iconTickets
            
            console.log("Ticket update:", {
              cardType,
              oldTickets: tickets,
              oldEliteTickets: eliteTickets,
              newTicketCount,
              newEliteTicketCount,
              result
            })
            
            setTickets(newTicketCount)
            setEliteTickets(newEliteTicketCount)
            // setIconTickets(newIconTicketCount)
            // Immer alle drei Werte an updateUserTickets übergeben, damit elite_tickets garantiert aktualisiert werden
            await updateUserTickets?.(newTicketCount, newEliteTicketCount)
          } else{
            fetchGodPacksLeft()
          }

          // God pack gives more XP
          let xpAmount = cardType === "god" ? 200 * count : cardType === "legendary" ? 100 * count : cardType === "icon" ? 150 * count : 50 * count

          if (userClanRole === "xp_hunter") {
            xpAmount = Math.floor(xpAmount * 1.05)
          }

          if (userClanRole === "leader") {
            xpAmount = Math.floor(xpAmount * 1.05)
          }

          if (hasXpPass) {
            xpAmount = Math.floor(xpAmount * 1.2)
          }

          setXpGained(xpAmount)

          const { leveledUp, newLevel: updatedLevel } = (await updateUserExp?.(xpAmount)) || {}

          if (leveledUp && updatedLevel) {
            setNewLevel(updatedLevel)
          }

          if (count > 5) {
            setShowBulkLoading(false)
            setShowBulkResults(true)
          }
        } else {
          console.error("Draw failed:", result.error)
          console.error("Full result:", result)
          toast({ title: "Error", description: result.error || "Draw failed", variant: "destructive" })
          setDrawnCards(FALLBACK_CARDS.slice(0, count))
        }
      } catch (err) {
        console.error("Draw error:", err)
        toast({ title: "Error", description: "Something went wrong.", variant: "destructive" })
        setDrawnCards(FALLBACK_CARDS.slice(0, count))
      } finally {
        setTimeout(() => {
          setIsDrawing(false)
        }, 100)
      }
    },
    [
      isDrawing,
      user,
      legendaryTickets,
      tickets,
      // iconTickets,
      updateUserTickets,
      updateUserExp,
      userClanRole,
      hasXpPass,
      selectedEpoch,
    ],
  )

  const handleOpenPack = () => {
    setPackOpened(true)
    if (isMultiDraw) {
      setTimeout(() => {
        setShowRarityText(true)
        setTimeout(() => {
          setShowRarityText(false)
          setShowCards(true)
          setCardRevealed(true)
          setShowPackAnimation(false)
        }, 2500)
      }, 2500)
    } else {
      setTimeout(() => {
        setShowRarityText(true)
        setTimeout(() => {
          setShowRarityText(false)
          setShowCards(true)
          setCardRevealed(false)
          setTimeout(() => {
            setShowPackAnimation(false)
          }, 50)
          setTimeout(() => {
            setCardRevealed(true)
          }, 300)
        }, 2000)
      }, 2500)
    }
  }

  const finishCardReview = async () => {
    if (!user || drawnCards.length === 0 || isUpdatingScore) return

    setIsUpdatingScore(true)
    fetchGodPacksLeft()

    try {
      const scoreResult = await updateScoreForCards(user?.username || user?.wallet_address, drawnCards || [])
      if (scoreResult.success) {
        setScoreGained(scoreResult.addedScore)
        if (updateUserScore) {
          updateUserScore(scoreResult.addedScore)
        }
      } else {
        console.error("Failed to update score:", scoreResult.error)
        toast({
          title: "Error",
          description: "Failed to update score. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error updating score:", error)
    } finally {
      setIsUpdatingScore(false)
    }

    if (isBulkDraw) {
      setShowBulkResults(false)
    } else {
      setShowCards(false)
    }

    if (isMultiDraw || isBulkDraw) {
      setShowXpAnimation(true)
      setTimeout(() => {
        setShowXpAnimation(false)
        if (newLevel > 1) {
          setShowLevelUpAnimation(true)
          if (user) {
            updateScoreForLevelUp(user?.username || user?.wallet_address)
              .then((result) => {
                if (result.success && updateUserScore) {
                  updateUserScore(result.addedScore || 0)
                }
              })
              .catch(console.error)
          }
        } else {
          resetStates()
        }
      }, 1000)
    } else {
      setShowXpAnimation(true)
      setTimeout(() => {
        setShowXpAnimation(false)
        if (newLevel > 1) {
          setShowLevelUpAnimation(true)
          if (user) {
            updateScoreForLevelUp(user?.username || user?.wallet_address)
              .then((result) => {
                if (result.success && updateUserScore) {
                  updateUserScore(result.addedScore || 0)
                } else {
                  console.error("Failed to update level-up score:", result.error)
                }
              })
              .catch((error) => {
                console.error("Error updating level-up score:", error)
              })
          }
        } else {
          resetStates()
        }
      }, 1000)
    }
  }

  const applyWheelReward = useCallback(
    async (segment: (typeof luckyWheelSegments)[number]) => {
      console.log("=== APPLY WHEEL REWARD CALLED ===")
      console.log("Segment:", segment)
      console.log("Segment reward:", segment.reward)
      console.log("User wallet_address:", user?.wallet_address)
      
      if (!user?.wallet_address) {
        console.error("No user wallet_address found in applyWheelReward")
        toast({
          title: t("draw.wheel_reward_error_title", "Unable to award reward"),
          description: t("draw.wheel_reward_error_login", "You must be logged in to receive rewards."),
          variant: "destructive",
        })
        return
      }

      const reward = segment.reward
      console.log("Processing reward type:", reward.type)
      console.log("Reward data:", reward)
      
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        console.error("No Supabase client found in applyWheelReward")
        toast({
          title: t("draw.wheel_reward_error_title", "Unable to award reward"),
          description: t("draw.wheel_reward_error_connection", "Database connection failed. Please try again."),
          variant: "destructive",
        })
        return
      }

      switch (reward.type) {
        case "tickets": {
          setLastWheelCard(null)
          let ticketRewardSuccessful = false
          
          console.log("Processing ticket reward:", reward)
          
          if (typeof reward.amount !== "number") {
            console.warn("Invalid ticket reward amount", reward)
            toast({
              title: t("draw.wheel_reward_error_title", "Unable to award reward"),
              description: t("draw.wheel_reward_error_generic", "Something went wrong while saving your reward."),
              variant: "destructive",
            })
          } else {
            const isRegular = reward.ticketType === "regular"
            const newRegular = isRegular ? tickets + reward.amount : tickets
            const newLegendary = !isRegular ? eliteTickets + reward.amount : eliteTickets

            console.log("Updating tickets:", {
              isRegular,
              rewardAmount: reward.amount,
              currentTickets: tickets,
              currentEliteTickets: eliteTickets,
              newRegular,
              newLegendary,
              wallet_address: user.wallet_address,
            })

            const { error } = await supabase
              .from("users")
              .update({
                tickets: newRegular,
                elite_tickets: newLegendary,
              })
              .eq("wallet_address", user.wallet_address.toLowerCase()) // Normalize wallet address

            if (error) {
              console.error("Failed to update tickets from wheel:", error)
              console.error("Error details:", {
                message: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint,
              })
              toast({
                title: t("draw.wheel_reward_error_title", "Unable to award reward"),
                description: t("draw.wheel_reward_error_generic", "Something went wrong while saving your reward."),
                variant: "destructive",
              })
            } else {
              console.log("Tickets updated successfully")
              setTickets(newRegular)
              setEliteTickets(newLegendary)
              await updateUserTickets?.(newRegular, newLegendary)
              ticketRewardSuccessful = true
              toast({
                title: t("draw.wheel_reward_ticket_title", "Tickets received!"),
                description: isRegular
                  ? t("draw.wheel_reward_ticket_desc_regular", "You received {amount} Regular Tickets.", {
                      amount: reward.amount,
                    })
                  : t("draw.wheel_reward_ticket_desc_legendary", "You received {amount} Legendary Tickets.", {
                      amount: reward.amount,
                    }),
              })
            }
          }

          // ALWAYS mark spin as completed (reward received) - even if ticket update failed
          // This ensures the button is unlocked and the user can try again
          try {
            console.log("Completing spin after ticket reward (success:", ticketRewardSuccessful, ")")
            const completeResponse = await fetch("/api/lucky-wheel/complete-spin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ walletAddress: user?.wallet_address }),
            })

            console.log("Complete spin response status:", completeResponse.status)

            if (completeResponse.ok) {
              const completeResult = await completeResponse.json()
              console.log("Complete spin result after ticket reward:", completeResult)
              if (completeResult.success) {
                const newHasPendingSpin = completeResult.hasPendingSpin === true
                setWheelLimit((prev) => {
                  if (!prev) {
                    const newCanSpin = 25 > 0 && !newHasPendingSpin
                    console.log("Creating new wheel limit state after ticket reward:", {
                      newCanSpin,
                      newHasPendingSpin,
                      userSpinsCount: completeResult.userSpinsCount,
                    })
                    return {
                      canSpin: newCanSpin,
                      globalSpinsUsed: 0,
                      globalSpinsRemaining: 25,
                      globalDailyLimit: 25,
                      userSpinsCount: completeResult.userSpinsCount || 0,
                      hasPendingSpin: newHasPendingSpin,
                    }
                  }
                  const newCanSpin = (prev.globalSpinsRemaining || 0) > 0 && !newHasPendingSpin
                  console.log("Updating wheel limit after ticket reward:", {
                    prevCanSpin: prev.canSpin,
                    prevHasPendingSpin: prev.hasPendingSpin,
                    prevUserSpinsCount: prev.userSpinsCount,
                    completeResultUserSpinsCount: completeResult.userSpinsCount,
                    completeResultHasPendingSpin: completeResult.hasPendingSpin,
                    newHasPendingSpin,
                    newCanSpin,
                    globalSpinsRemaining: prev.globalSpinsRemaining,
                  })
                  const updatedLimit = {
                    ...prev,
                    userSpinsCount: completeResult.userSpinsCount || prev.userSpinsCount || 0,
                    hasPendingSpin: newHasPendingSpin,
                    canSpin: newCanSpin,
                  }
                  console.log("Updated wheel limit state after ticket reward:", updatedLimit)
                  return updatedLimit
                })
                
                // Also refresh the limit check to ensure state is synchronized
                // Wait a bit for database consistency, then refresh
                setTimeout(() => {
                  console.log("Refreshing wheel limit after ticket reward...")
                  refreshWheelLimit().then((success) => {
                    if (success) {
                      console.log("Wheel limit refreshed successfully after ticket reward")
                    } else {
                      console.error("Failed to refresh wheel limit after ticket reward")
                    }
                  })
                }, 1000) // Increased delay to ensure database consistency
              } else {
                console.error("Complete spin failed for tickets:", completeResult.error)
                // Fallback: refresh limit anyway
                setTimeout(() => {
                  console.log("Fallback: refreshing wheel limit after ticket reward failure...")
                  refreshWheelLimit()
                }, 1000)
              }
            } else {
              const errorData = await completeResponse.json().catch(() => ({}))
              console.error("Complete spin API error for tickets:", {
                status: completeResponse.status,
                statusText: completeResponse.statusText,
                error: errorData,
              })
              
              // Show error to user if it's a critical error (not just a warning)
              if (completeResponse.status >= 500) {
                toast({
                  title: t("draw.wheel_complete_spin_error_title", "Error completing spin"),
                  description: errorData.error || errorData.details || t("draw.wheel_complete_spin_error_desc", "Failed to mark spin as complete. Please refresh the page."),
                  variant: "destructive",
                })
              }
              
              // Fallback: refresh limit anyway
              setTimeout(() => {
                console.log("Fallback: refreshing wheel limit after ticket reward API error...")
                refreshWheelLimit()
              }, 1000)
            }
          } catch (error) {
            console.error("Error completing spin after ticket reward:", error)
            console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace")
            // Even if the API call fails, try to refresh the limit
            setTimeout(() => {
              console.log("Fallback: refreshing wheel limit after ticket reward exception...")
              refreshWheelLimit()
            }, 1000)
          }
          break
        }
        case "pass": {
          try {
            const passReward = reward as { type: "pass"; pass: "premium" | "xp" }
            const response = await fetch("/api/lucky-wheel/pass", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                walletAddress: user.wallet_address,
                passType: passReward.pass,
              }),
            })

            if (!response.ok) {
              const data = await response.json().catch(() => ({}))
              throw new Error(data.error || "Failed to activate pass.")
            }

            const data = await response.json()
            const passTypeDisplay = passReward.pass === "premium" 
              ? t("draw.wheel_reward_pass_premium", "Premium Pass")
              : t("draw.wheel_reward_pass_xp", "XP Pass")

            // Update elite tickets in frontend (7 Legendary Tickets bonus)
            if (data.legendaryTicketsAdded === 7) {
              const newEliteTickets = eliteTickets + 7
              setEliteTickets(newEliteTickets)
              await updateUserTickets?.(tickets, newEliteTickets)
            }

            setLastWheelCard(null)
            toast({
              title: t("draw.wheel_reward_pass_success_title", "Pass Activated!"),
              description: t("draw.wheel_reward_pass_success_desc", "You have unlocked the {passType}! It expires in 7 days. You also received 7 Legendary Tickets!", {
                passType: passTypeDisplay,
              }),
            })

            // Refresh user data to update pass status
            await refreshUserData?.()

            // Mark spin as completed (reward received) - for passes
            try {
              console.log("Completing spin after pass reward")
              const completeResponse = await fetch("/api/lucky-wheel/complete-spin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddress: user?.wallet_address }),
              })

              if (completeResponse.ok) {
                const completeResult = await completeResponse.json()
                console.log("Complete spin result after pass reward:", completeResult)
                if (completeResult.success) {
                  const newHasPendingSpin = completeResult.hasPendingSpin === true
                  setWheelLimit((prev) => {
                    if (!prev) {
                      const newCanSpin = 25 > 0 && !newHasPendingSpin
                      return {
                        canSpin: newCanSpin,
                        globalSpinsUsed: 0,
                        globalSpinsRemaining: 25,
                        globalDailyLimit: 25,
                        userSpinsCount: completeResult.userSpinsCount || 0,
                        hasPendingSpin: newHasPendingSpin,
                      }
                    }
                    const newCanSpin = (prev.globalSpinsRemaining || 0) > 0 && !newHasPendingSpin
                    return {
                      ...prev,
                      userSpinsCount: completeResult.userSpinsCount || prev.userSpinsCount || 0,
                      hasPendingSpin: newHasPendingSpin,
                      canSpin: newCanSpin,
                    }
                  })
                  // Refresh limit after a delay to ensure consistency
                  setTimeout(() => {
                    refreshWheelLimit()
                  }, 1000)
                }
              } else {
                const errorData = await completeResponse.json().catch(() => ({}))
                console.error("Complete spin API error for passes:", {
                  status: completeResponse.status,
                  statusText: completeResponse.statusText,
                  error: errorData,
                })
                
                // Show error to user if it's a critical error
                if (completeResponse.status >= 500) {
                  toast({
                    title: t("draw.wheel_complete_spin_error_title", "Error completing spin"),
                    description: errorData.error || errorData.details || t("draw.wheel_complete_spin_error_desc", "Failed to mark spin as complete. Please refresh the page."),
                    variant: "destructive",
                  })
                }
                
                setTimeout(() => {
                  refreshWheelLimit()
                }, 1000)
              }
            } catch (error) {
              console.error("Error completing spin after pass reward:", error)
              setTimeout(() => {
                refreshWheelLimit()
              }, 1000)
            }
          } catch (error) {
            console.error("Lucky wheel pass reward error:", error)
            toast({
              title: t("draw.wheel_reward_error_title", "Unable to award reward"),
              description: t(
                "draw.wheel_reward_error_generic",
                "Something went wrong while saving your reward.",
              ),
              variant: "destructive",
            })
            setLastWheelCard(null)
          }
          break
        }
        case "deal": {
          try {
            const response = await fetch("/api/lucky-wheel/deal", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                walletAddress: user.wallet_address,
                dealType: reward.deal,
              }),
            })

            if (!response.ok) {
              const data = await response.json().catch(() => ({}))
              throw new Error(data.error || "Failed to award deal reward.")
            }

            const data = await response.json()
            const dealData = data.deal

            // Display card name if available
            setLastWheelCard(dealData?.card?.name ?? null)

            // Build description with all rewards
            const rewards = []
            if (dealData?.card?.name) {
              rewards.push(
                t("draw.wheel_reward_deal_card", "{cardName} (Level {level})", {
                  cardName: dealData.card.name,
                  level: dealData.cardLevel || 1,
                }),
              )
            }
            if (dealData?.classicTickets > 0) {
              rewards.push(
                t("draw.wheel_reward_deal_tickets_regular", "{amount} Regular Tickets", {
                  amount: dealData.classicTickets,
                }),
              )
            }
            if (dealData?.eliteTickets > 0) {
              rewards.push(
                t("draw.wheel_reward_deal_tickets_legendary", "{amount} Legendary Tickets", {
                  amount: dealData.eliteTickets,
                }),
              )
            }

            toast({
              title: t("draw.wheel_reward_deal_success_title", "Deal Bundle received!"),
              description: rewards.length > 0 ? rewards.join(", ") : t("draw.wheel_reward_deal_success_desc", "You received the deal bundle contents."),
            })

            // Update tickets locally if available
            if (typeof data.newTickets === "number" && typeof data.newEliteTickets === "number") {
              updateUserTickets?.(data.newTickets, data.newEliteTickets)
            }

            await refreshUserData?.()

            // Trigger collection refresh by dispatching a storage event
            // This will cause the collection page to refresh if it's open
            if (typeof window !== "undefined") {
              window.localStorage.setItem("collection_refresh", Date.now().toString())
              window.dispatchEvent(new Event("storage"))
              // Also trigger a custom event for better cross-tab communication
              window.dispatchEvent(new CustomEvent("collectionUpdated", { detail: { cardAdded: true } }))
            }

            // Mark spin as completed (reward received) - for deals
            try {
              console.log("Completing spin after deal reward")
              const completeResponse = await fetch("/api/lucky-wheel/complete-spin", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ walletAddress: user?.wallet_address }),
              })

              if (completeResponse.ok) {
                const completeResult = await completeResponse.json()
                console.log("Complete spin result after deal reward:", completeResult)
                if (completeResult.success) {
                  const newHasPendingSpin = completeResult.hasPendingSpin === true
                  setWheelLimit((prev) => {
                    if (!prev) {
                      const newCanSpin = 25 > 0 && !newHasPendingSpin
                      return {
                        canSpin: newCanSpin,
                        globalSpinsUsed: 0,
                        globalSpinsRemaining: 25,
                        globalDailyLimit: 25,
                        userSpinsCount: completeResult.userSpinsCount || 0,
                        hasPendingSpin: newHasPendingSpin,
                      }
                    }
                    const newCanSpin = (prev.globalSpinsRemaining || 0) > 0 && !newHasPendingSpin
                    return {
                      ...prev,
                      userSpinsCount: completeResult.userSpinsCount || prev.userSpinsCount || 0,
                      hasPendingSpin: newHasPendingSpin,
                      canSpin: newCanSpin,
                    }
                  })
                  // Refresh limit after a delay to ensure consistency
                  setTimeout(() => {
                    refreshWheelLimit()
                  }, 1000)
                }
              } else {
                const errorData = await completeResponse.json().catch(() => ({}))
                console.error("Complete spin API error for deals:", {
                  status: completeResponse.status,
                  statusText: completeResponse.statusText,
                  error: errorData,
                })
                
                // Show error to user if it's a critical error
                if (completeResponse.status >= 500) {
                  toast({
                    title: t("draw.wheel_complete_spin_error_title", "Error completing spin"),
                    description: errorData.error || errorData.details || t("draw.wheel_complete_spin_error_desc", "Failed to mark spin as complete. Please refresh the page."),
                    variant: "destructive",
                  })
                }
                
                setTimeout(() => {
                  refreshWheelLimit()
                }, 1000)
              }
            } catch (error) {
              console.error("Error completing spin after deal reward:", error)
              setTimeout(() => {
                refreshWheelLimit()
              }, 1000)
            }
          } catch (error) {
            console.error("Lucky wheel deal reward error:", error)
            toast({
              title: t("draw.wheel_reward_error_title", "Unable to award reward"),
              description: t(
                "draw.wheel_reward_error_generic",
                "Something went wrong while saving your reward.",
              ),
              variant: "destructive",
            })
            setLastWheelCard(null)
          }
          break
        }
        case "card": {
          let cardRewardSuccessful = false
          try {
            const response = await fetch("/api/lucky-wheel/card", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                walletAddress: user.wallet_address,
                rarity: reward.rarity,
              }),
            })

            if (!response.ok) {
              const data = await response.json().catch(() => ({}))
              throw new Error(data.error || "Failed to award card reward.")
            }

            const data = await response.json()
            const card = data.card

            setLastWheelCard(card?.name ?? null)
            toast({
              title: t("draw.wheel_reward_card_success_title", "Card added to collection!"),
              description: t("draw.wheel_reward_card_success_desc", "You received {cardName}.", {
                cardName: card?.name || t("draw.wheel_reward_card_unknown", "an unknown card"),
              }),
            })

            await refreshUserData?.()
            cardRewardSuccessful = true

            // Trigger collection refresh by dispatching a storage event
            // This will cause the collection page to refresh if it's open
            if (typeof window !== "undefined") {
              window.localStorage.setItem("collection_refresh", Date.now().toString())
              window.dispatchEvent(new Event("storage"))
            }
          } catch (error) {
            console.error("Lucky wheel card reward error:", error)
            toast({
              title: t("draw.wheel_reward_error_title", "Unable to award reward"),
              description: t(
                "draw.wheel_reward_error_generic",
                "Something went wrong while saving your reward.",
              ),
              variant: "destructive",
            })
            setLastWheelCard(null)
          }

          // ALWAYS mark spin as completed (reward received) - even if card reward failed
          // This ensures the button is unlocked and the user can try again
          try {
            console.log("Completing spin after card reward (success:", cardRewardSuccessful, ")")
            const completeResponse = await fetch("/api/lucky-wheel/complete-spin", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ walletAddress: user?.wallet_address }),
            })

            if (completeResponse.ok) {
              const completeResult = await completeResponse.json()
              console.log("Complete spin result after card reward:", completeResult)
              if (completeResult.success) {
                setWheelLimit((prev) => {
                  if (!prev) {
                    // If no previous state, create a default one
                    return {
                      canSpin: true,
                      globalSpinsUsed: 0,
                      globalSpinsRemaining: 25,
                      globalDailyLimit: 25,
                      userSpinsCount: completeResult.userSpinsCount || 0,
                      hasPendingSpin: completeResult.hasPendingSpin === true,
                    }
                  }
                  const newHasPendingSpin = completeResult.hasPendingSpin === true // Explicitly check for true
                  const newCanSpin = prev.globalSpinsRemaining > 0 && !newHasPendingSpin
                  console.log("Updating wheel limit after card reward:", {
                    prevCanSpin: prev.canSpin,
                    prevHasPendingSpin: prev.hasPendingSpin,
                    prevUserSpinsCount: prev.userSpinsCount,
                    completeResultUserSpinsCount: completeResult.userSpinsCount,
                    completeResultHasPendingSpin: completeResult.hasPendingSpin,
                    newHasPendingSpin,
                    newCanSpin,
                    globalSpinsRemaining: prev.globalSpinsRemaining,
                  })
                  const updatedLimit = {
                    ...prev,
                    userSpinsCount: completeResult.userSpinsCount || prev.userSpinsCount || 0,
                    hasPendingSpin: newHasPendingSpin,
                    canSpin: newCanSpin,
                  }
                  console.log("Updated wheel limit state:", updatedLimit)
                  return updatedLimit
                })
                
                // Also refresh the limit check to ensure state is synchronized
                // Wait a bit for database consistency, then refresh
                setTimeout(() => {
                  console.log("Refreshing wheel limit after card reward...")
                  refreshWheelLimit().then((success) => {
                    if (success) {
                      console.log("Wheel limit refreshed successfully after card reward")
                    } else {
                      console.error("Failed to refresh wheel limit after card reward")
                    }
                  })
                }, 1000) // Increased delay to ensure database consistency
              } else {
                console.error("Complete spin failed:", completeResult.error)
                // Fallback: refresh limit anyway
                setTimeout(() => {
                  refreshWheelLimit()
                }, 1000)
              }
            } else {
              const errorData = await completeResponse.json().catch(() => ({}))
              console.error("Complete spin API error:", {
                status: completeResponse.status,
                statusText: completeResponse.statusText,
                error: errorData,
              })
              
              // Show error to user if it's a critical error
              if (completeResponse.status >= 500) {
                toast({
                  title: t("draw.wheel_complete_spin_error_title", "Error completing spin"),
                  description: errorData.error || errorData.details || t("draw.wheel_complete_spin_error_desc", "Failed to mark spin as complete. Please refresh the page."),
                  variant: "destructive",
                })
              }
              
              // Fallback: refresh limit anyway
              setTimeout(() => {
                refreshWheelLimit()
              }, 1000)
            }
          } catch (error) {
            console.error("Error completing spin after card reward:", error)
            // Even if the API call fails, try to refresh the limit
            setTimeout(() => {
              refreshWheelLimit()
            }, 1000)
          }
          break
        }
        default:
          setLastWheelCard(null)
          break
      }
    },
    [eliteTickets, luckyWheelSegments, refreshUserData, refreshWheelLimit, tickets, t, updateUserTickets, user?.wallet_address],
  )

  const handleSpinWheel = useCallback(async () => {
    if (wheelSpinning) return

    if (!user?.wallet_address) {
      toast({
        title: t("draw.wheel_spin_login_title", "Sign in required"),
        description: t("draw.wheel_spin_login_desc", "You must be logged in to spin the wheel."),
        variant: "destructive",
      })
      return
    }

    if (!spinCostDetails) {
      toast({
        title: t("draw.wheel_spin_price_title", "Price unavailable"),
        description: t("draw.wheel_spin_price_desc", "Wheel spin cost could not be calculated."),
        variant: "destructive",
      })
      return
    }

    // Check global daily limit before spinning (only for Premium Wheel)
    if (activeWheelType === "premium" && wheelLimit && !wheelLimit.canSpin) {
      toast({
        title: t("draw.wheel_spin_limit_reached_title", "Daily limit reached"),
        description: t(
          "draw.wheel_spin_global_limit_reached_desc",
          "The global daily limit of {limit} spins has been reached. Come back tomorrow!",
          { limit: wheelLimit.globalDailyLimit },
        ),
        variant: "destructive",
      })
      return
    }

    try {
      setWheelSpinning(true)

      // Step 1: Process payment first
      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: spinCostDetails.tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [PAYMENT_RECIPIENT, spinCostDetails.rawAmount],
          },
        ],
      })

      if (finalPayload.status !== "success") {
        console.error("Lucky wheel payment failed:", finalPayload)
        toast({
          title: t("draw.wheel_spin_payment_failed_title", "Payment failed"),
          description: t(
            "draw.wheel_spin_payment_failed_desc",
            "Your payment could not be processed. Please try again.",
          ),
          variant: "destructive",
        })
        setWheelSpinning(false)
        return
      }

      // Step 2: Spin after successful payment (check limit and get reward)
      // Calculate USD price for database tracking
      const usdPrice = activeWheelType === "premium" ? 1.65 : 0.18
      const spinResponse = await fetch("/api/lucky-wheel/spin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          walletAddress: user.wallet_address,
          wheelType: activeWheelType,
          pricePaid: usdPrice,
        }),
      })

      if (!spinResponse.ok) {
        let errorData: any = {}
        try {
          errorData = await spinResponse.json()
        } catch (parseError) {
          console.error("Failed to parse error response:", parseError)
          errorData = { 
            error: `Server error (${spinResponse.status}): ${spinResponse.statusText}` 
          }
        }
        
        console.error("Lucky wheel spin failed:", {
          status: spinResponse.status,
          statusText: spinResponse.statusText,
          errorData,
        })
        
        if (spinResponse.status === 429) {
          // Global limit reached
          setWheelLimit({
            canSpin: false,
            globalSpinsUsed: errorData.globalSpinsUsed || 0,
            globalSpinsRemaining: errorData.globalSpinsRemaining || 0,
            globalDailyLimit: errorData.globalDailyLimit || 25,
          })
          toast({
            title: t("draw.wheel_spin_limit_reached_title", "Daily limit reached"),
            description: t(
              "draw.wheel_spin_global_limit_reached_desc",
              "The global daily limit of {limit} spins has been reached. Come back tomorrow!",
              { limit: errorData.globalDailyLimit || 25 },
            ),
            variant: "destructive",
          })
        } else {
          toast({
            title: t("draw.wheel_spin_error_title", "Unexpected error"),
            description: errorData.error || errorData.details || t("draw.wheel_spin_error_desc", "Something went wrong while spinning the wheel."),
            variant: "destructive",
          })
        }
        setWheelSpinning(false)
        return
      }

      let spinData: any = {}
      try {
        spinData = await spinResponse.json()
      } catch (parseError) {
        console.error("Failed to parse spin response:", parseError)
        toast({
          title: t("draw.wheel_spin_error_title", "Unexpected error"),
          description: t("draw.wheel_spin_error_desc", "Something went wrong while spinning the wheel."),
          variant: "destructive",
        })
        setWheelSpinning(false)
        return
      }
      
      if (!spinData.success) {
        console.error("Lucky wheel spin failed:", {
          spinData,
          error: spinData.error,
          details: spinData.details,
        })
        toast({
          title: t("draw.wheel_spin_error_title", "Unexpected error"),
          description: spinData.error || spinData.details || t("draw.wheel_spin_error_desc", "Something went wrong while spinning the wheel."),
          variant: "destructive",
        })
        setWheelSpinning(false)
        return
      }

      // Update limit from server response
      if (spinData.globalSpinsUsed !== undefined) {
        setWheelLimit({
          canSpin: false, // Disable button until reward is received (hasPendingSpin = true)
          globalSpinsUsed: spinData.globalSpinsUsed || 0,
          globalSpinsRemaining: spinData.globalSpinsRemaining || 0,
          globalDailyLimit: spinData.globalDailyLimit || 25,
          userSpinsCount: spinData.userSpinsCount || 0,
          hasPendingSpin: false, // No longer tracking pending spins
        })
      }

      // Use server-determined segment index (based on drop rates)
      const segmentIndex = spinData.segmentIndex
      const segment = luckyWheelSegments[segmentIndex]
      
      if (!segment) {
        console.error("Invalid segment index from server:", segmentIndex)
        toast({
          title: t("draw.wheel_spin_error_title", "Unexpected error"),
          description: t("draw.wheel_spin_error_desc", "Something went wrong while spinning the wheel."),
          variant: "destructive",
        })
        setWheelSpinning(false)
        return
      }

      // Calculate spin rotation to land on the selected segment
      // Increased to 40+ full rotations for a much more dramatic and longer spin
      const fullRotations = 40 + Math.floor(Math.random() * 15) // 40-54 rotations for variation and excitement
      
      // Pointer is at top (0° position, pointing down)
      // When wheel rotates clockwise by X degrees (transform: rotate(Xdeg) in CSS):
      // - CSS rotate() moves content clockwise: newPosition = (oldPosition + X) mod 360
      // - To bring segment center (at segmentCenterAngle) to top (0°):
      //   We need: (segmentCenterAngle + X) mod 360 = 0
      //   Therefore: X = (360 - segmentCenterAngle) mod 360
      
      // Calculate center angle of target segment
      // Segments start at 0° and go clockwise: Segment 0 at 0°, Segment 1 at segmentAngle°, etc.
      // Segment centers: segmentAngle/2, segmentAngle + segmentAngle/2, 2*segmentAngle + segmentAngle/2, ...
      const segmentCenterAngle = segmentIndex * segmentAngle + segmentAngle / 2
      
      // Normalize current rotation to 0-360 range to avoid cumulative errors
      // Get current normalized rotation (where the wheel currently is, modulo 360)
      const currentNormalizedRotation = wheelRotation % 360
      
      // Calculate the absolute target angle for the segment center
      // We want the segment center to be at 0° (top, where pointer is)
      // So we need: (segmentCenterAngle + rotation) mod 360 = 0
      // Therefore: rotation = (360 - segmentCenterAngle) mod 360
      const targetFinalAngle = (360 - segmentCenterAngle) % 360
      
      // Calculate how much we need to rotate from current position to target
      // We want to end at targetFinalAngle after full rotations
      let rotationNeeded = targetFinalAngle - currentNormalizedRotation
      
      // If rotation is negative, add 360 to ensure clockwise rotation
      if (rotationNeeded < 0) {
        rotationNeeded += 360
      }
      
      // Add full rotations for dramatic effect
      // Total rotation = full rotations + rotation needed to reach target
      const spinRotation = 360 * fullRotations + rotationNeeded
      
      // Calculate animation duration based on rotations (approximately 180ms per rotation)
      const animationDurationMs = Math.max(10000, fullRotations * 180) // Minimum 10s, scales with rotations (10-12s)
      const animationDurationSeconds = animationDurationMs / 1000
      
      setSelectedWheelSegment(null)
      setLastWheelCard(null)
      setWheelSpinDuration(`${animationDurationSeconds}s`)
      setWheelRotation((prev) => {
        const newRotation = prev + spinRotation
        // Ensure we end up exactly at the target (with full rotations)
        // After animation, the normalized rotation should be targetFinalAngle
        return newRotation
      })

      console.log("Starting wheel animation:", {
        animationDurationMs,
        animationDurationSeconds,
        spinRotation,
        currentNormalizedRotation,
        targetFinalAngle,
        rotationNeeded,
        segmentIndex: spinData.segmentIndex,
        segmentLabel: segment.label,
        rewardType: segment.reward?.type,
      })

      // After animation, apply the reward (timeout matches animation duration)
      setTimeout(async () => {
        console.log("=== ANIMATION COMPLETE, APPLYING REWARD ===")
        console.log("Segment:", segment)
        console.log("Segment label:", segment.label)
        console.log("Segment reward:", segment.reward)
        setSelectedWheelSegment(segment.label)
        
        // Set reward for overlay
        const reward = segment.reward
        if (reward.type === "tickets") {
          setWheelReward({
            type: "tickets",
            label: segment.label,
            amount: reward.amount,
          })
        } else if (reward.type === "card") {
          setWheelReward({
            type: "card",
            label: segment.label,
          })
        } else if (reward.type === "pass") {
          setWheelReward({
            type: "pass",
            label: segment.label,
          })
        } else if (reward.type === "deal") {
          setWheelReward({
            type: "deal",
            label: segment.label,
          })
        }
        
        // Show overlay
        setShowRewardOverlay(true)
        
        // Apply reward from the segment (server already validated the index)
        try {
          await applyWheelReward(segment)
          console.log("applyWheelReward completed successfully")
        } catch (error) {
          console.error("Error in applyWheelReward:", error)
          console.error("Error stack:", error instanceof Error ? error.stack : "No stack trace")
        } finally {
          setWheelSpinning(false)
          setWheelSpinDuration("0s")
          console.log("Wheel spinning state set to false")
        }
      }, animationDurationMs)
    } catch (error) {
      console.error("Lucky wheel spin error:", error)
      toast({
        title: t("draw.wheel_spin_error_title", "Unexpected error"),
        description: t("draw.wheel_spin_error_desc", "Something went wrong while spinning the wheel."),
        variant: "destructive",
      })
      setWheelSpinning(false)
    }
  }, [applyWheelReward, luckyWheelSegments, segmentAngle, spinCostDetails, t, user?.wallet_address, wheelSpinning, wheelLimit, activeWheelType])

  const resetStates = () => {
    setPackOpened(false)
    setShowPackSelection(true)
    setDrawnCards([])
    setCardRevealed(false)
    setXpGained(0)
    setScoreGained(0)
    setNewLevel(1)
    setIsMultiDraw(false)
    refreshUserData?.()
    setIsBulkDraw(false)
    setShowBulkResults(false)
    setShowBulkLoading(false)
    setSelectedBulkCard(null)
    preventNavigation.current = false

    toast({
      title: "Cards Added",
      description: `${isBulkDraw ? "All cards have" : isMultiDraw ? "The cards have" : "The card has"} been added to your collection!`,
      variant: "default",
    })
  }

  const getCurrentCard = () => {
    return drawnCards[currentCardIndex] || null
  }

  const RARITY_ALIAS: Record<string, keyof typeof RARITY_COLORS> = {
    common: 'common',
    rare: 'rare',
    epic: 'epic',
    legendary: 'legendary',
    goat: 'goat',
    godlike: 'goat',
  };
  const getRarityStyles = (rarity: string) => {
    const mapped = RARITY_ALIAS[rarity] || rarity;
    return RARITY_COLORS[mapped as keyof typeof RARITY_COLORS] || RARITY_COLORS.basic;
  }

  const calculateXpWithBonuses = (baseXp: number) => {
    let finalXp = baseXp

    if (userClanRole === "xp_hunter") {
      finalXp = Math.floor(finalXp * 1.05)
    }

    if (userClanRole === "leader") {
      finalXp = Math.floor(finalXp * 1.05)
    }

    if (hasXpPass) {
      finalXp = Math.floor(finalXp * 1.2)
    }

    return finalXp
  }

  // Boost price configuration (matching server-side config)
  const BOOST_PRICES = {
    regular: {
      regular: { "1week": 0.2, "1month": 0.6 },
      premium: { "1week": 0.4, "1month": 1.2 },
    },
    legendary: {
      regular: { "1week": 0.3, "1month": 1.0 },
      premium: { "1week": 1.0, "1month": 3.0 },
    },
  }

  // Calculate rarity percentages with boost
  const getRarityPercentages = (packType: "regular" | "legendary") => {
    if (packType === "legendary") {
      // Base: 3% legendary, 30% epic, 50% rare, 17% common
      let legendary = 3
      let epic = 30
      let rare = 50
      let common = 17

      if (hasDropRateBoost && legendaryBonus > 0) {
        // Add absolute percentage points to legendary, subtract from common
        legendary = 3 + legendaryBonus
        common = 17 - legendaryBonus
        if (common < 0) common = 0
      }

      return {
        legendary: Math.round(legendary * 10) / 10,
        epic: Math.round(epic * 10) / 10,
        rare: Math.round(rare * 10) / 10,
        common: Math.round(common * 10) / 10,
      }
    } else {
      // Regular pack
      if (hasPremiumPass) {
        // Base: 1% legendary, 15% epic, 34% rare, 50% common
        let legendary = 1
        let epic = 15
        let rare = 34
        let common = 50

        if (hasDropRateBoost && legendaryBonus > 0) {
          // Add absolute percentage points to legendary, subtract from common
          legendary = 1 + legendaryBonus
          common = 50 - legendaryBonus
          if (common < 0) common = 0
        }

        return {
          legendary: Math.round(legendary * 10) / 10,
          epic: Math.round(epic * 10) / 10,
          rare: Math.round(rare * 10) / 10,
          common: Math.round(common * 10) / 10,
        }
      } else {
        // Base: 0% legendary, 6% epic, 34% rare, 60% common
        let legendary = 0
        let epic = 6
        let rare = 34
        let common = 60

        if (hasDropRateBoost && legendaryBonus > 0) {
          // Add absolute percentage points to legendary, subtract from common
          legendary = 0 + legendaryBonus
          common = 60 - legendaryBonus
          if (common < 0) common = 0
        }

        return {
          legendary: Math.round(legendary * 10) / 10,
          epic: Math.round(epic * 10) / 10,
          rare: Math.round(rare * 10) / 10,
          common: Math.round(common * 10) / 10,
        }
      }
    }
  }
  const calculateDynamicGodPackChances = (opened: number) => {
  const baseGodlike = 1
  const baseEpic = 49

  const bonusSteps = Math.floor(opened / 10)
  const bonusGodlike = bonusSteps * 0.25
  const newGodlike = Math.min(baseGodlike + bonusGodlike, 5) // Optional: max 5%
  const newEpic = Math.max(baseEpic - bonusGodlike, 40)      // Optional: min 40%

  return {
    godlike: Number(newGodlike.toFixed(2)),
    epic: Number(newEpic.toFixed(2)),
  }
}


  const getRarityStats = () => {
    // Nur die gewünschten Rarities für die Anzeige
    const stats: Record<string, number> = {
      common: 0,
      rare: 0,
      epic: 0,
      legendary: 0,
    }
    drawnCards.forEach((card) => {
      // Mappe alte Namen auf neue
      let key = card.rarity
      if (key === 'basic') key = 'common'
      if (key === 'elite') key = 'legendary'
      if (key === 'ultima') key = 'legendary'
      if (stats.hasOwnProperty(key)) {
        stats[key]++
      }
    })
    return stats
  }

  // Hilfsfunktion für die Anzeige der Rarity-Namen
  const getDisplayRarity = (rarity: string) => {
    if (rarity === 'common' || rarity === 'basic') return t('rarity.common', 'Common');
    if (rarity === 'rare') return t('rarity.rare', 'Rare');
    if (rarity === 'epic') return t('rarity.epic', 'Epic');
    if (rarity === 'legendary' || rarity === 'ultima') return t('rarity.legendary', 'Legendary');
    if (rarity === 'godlike' || rarity === 'goat') return t('rarity.goat', 'GOAT');
    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  };

  if (!isClient) {
    return (
      <ProtectedRoute>
        <div 
          className="min-h-screen pb-20"
          style={{
            backgroundImage: 'url(/hintergrund.webp.webp)',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
            backgroundAttachment: 'fixed'
          }}
        >
          <header className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-yellow-400">
            <div className="max-w-lg mx-auto px-4 py-3">
              <div className="flex justify-between items-center">
                <h1 className="text-lg font-medium text-yellow-200">Card Packs</h1>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-black/80 px-3 py-1.5 rounded-full shadow-sm border border-yellow-400">
                    <Ticket className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="font-medium text-sm text-yellow-200">0</span>
                  </div>
                  <div className="flex items-center gap-1 bg-black/80 px-3 py-1.5 rounded-full shadow-sm border border-yellow-400">
                    <Crown className="h-3.5 w-3.5 text-yellow-400" />
                    <span className="font-medium text-sm text-yellow-200">0</span>
                  </div>
                </div>
              </div>
            </div>
          </header>
          <div className="p-4 max-w-lg mx-auto">
            <div className="animate-pulse space-y-4">
              <div className="h-10 bg-gray-200 rounded-xl w-full"></div>
              <div className="h-64 bg-gray-200 rounded-xl w-full"></div>
              <div className="h-12 bg-gray-200 rounded-xl w-1/2 mx-auto"></div>
            </div>
          </div>
          {!wheelSpinning && <MobileNav />}
        </div>
      </ProtectedRoute>
    )
  }

  const showGodDiscount = godPackDiscount?.isActive && activeTab === "god"

  const singlePackBaseDetails = getTransferDetails({
    usdAmount: calculateBaseDollarAmount(1),
    currency: paymentCurrency,
    wldPrice: price,
    anixPrice,
  })

  const singlePackDiscountDetails = getTransferDetails({
    usdAmount: calculateDiscountedDollarAmount(1),
    currency: paymentCurrency,
    wldPrice: price,
    anixPrice,
  })

  const fivePackDiscountDetails = getTransferDetails({
    usdAmount: calculateDiscountedDollarAmount(5),
    currency: paymentCurrency,
    wldPrice: price,
    anixPrice,
  })

  return (
    <ProtectedRoute>
      <div 
        className="min-h-screen pb-20"
        style={{
          backgroundImage: 'url(/hintergrund.webp.webp)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
          overscrollBehavior: 'none'
        }}
      >
        {/* Header with tickets */}
        <header className="sticky top-0 z-10 backdrop-blur-md bg-black/70 border-b border-yellow-400">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex justify-between items-center">
              <h1 className="text-lg font-medium text-yellow-200">Card Packs</h1>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-black/80 px-3 py-1.5 rounded-full shadow-sm border border-blue-400">
                  <Ticket className="h-3.5 w-3.5 text-blue-400" />
                  <span className="font-medium text-sm text-blue-200">{tickets}</span>
                </div>
                <div className="flex items-center gap-1 bg-black/80 px-3 py-1.5 rounded-full shadow-sm border border-purple-400">
                  <Ticket className="h-3.5 w-3.5 text-purple-400" />
                  <span className="font-medium text-sm text-purple-200">{eliteTickets}</span>
                </div>
                {/* <div className="flex items-center gap-1 bg-black/80 px-3 py-1.5 rounded-full shadow-sm border border-yellow-400">
                  <Crown className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="font-medium text-sm text-yellow-200">{iconTickets}</span>
                </div> */}
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 max-w-lg mx-auto" style={{ overscrollBehavior: 'none' }}>

          {/* Pack Selection Screen */}
          <AnimatePresence>
            {showPackSelection && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >

                {/* Tabs */}
                <div className="grid grid-cols-3 rounded-xl overflow-hidden mb-6 border border-yellow-400 bg-black/70">
                  <button
                    onClick={() => !wheelSpinning && setActiveTab("regular")}
                    disabled={wheelSpinning}
                    className={`py-3 px-2 text-center font-medium transition-all text-xs ${
                      wheelSpinning
                        ? "bg-black/30 text-gray-500 cursor-not-allowed opacity-50"
                        : activeTab === "regular"
                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                        : "bg-black/50 text-yellow-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Ticket className="h-3 w-3" />
                      <span>{t("draw.regular_pack", "Regular")}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => !wheelSpinning && setActiveTab("legendary")}
                    disabled={wheelSpinning}
                    className={`py-3 px-2 text-center font-medium transition-all text-xs ${
                      wheelSpinning
                        ? "bg-black/30 text-gray-500 cursor-not-allowed opacity-50"
                        : activeTab === "legendary"
                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                        : "bg-black/50 text-yellow-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Ticket className="h-3 w-3" />
                      <span>{t("draw.legendary_pack", "Legendary")}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("wheel")}
                    className={`py-3 px-2 text-center font-medium transition-all text-xs ${
                      activeTab === "wheel"
                        ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black"
                        : "bg-black/50 text-yellow-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Star className="h-3 w-3" />
                      <span>{t("draw.lucky_wheel_tab", "Lucky Wheel")}</span>
                    </div>
                  </button>
                  {/* <button
                    onClick={() => setActiveTab("god")}
                    className={`py-3 px-2 text-center font-medium transition-all text-xs ${
                      activeTab === "god"
                        ? "bg-gradient-to-r from-red-500 to-red-600 text-white"
                        : "bg-black/50 text-yellow-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Zap className="h-3 w-3" />
                      <span>GOAT</span>
                    </div>
                  </button> */}
                  {/* <button
                    onClick={() => setActiveTab("icon")}
                    className={`py-3 px-2 text-center font-medium transition-all text-xs ${
                      activeTab === "icon"
                        ? "bg-gradient-to-r from-indigo-500 to-indigo-600 text-white"
                        : "bg-black/50 text-yellow-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Crown className="h-3 w-3" />
                      <span>ICON</span>
                    </div>
                  </button> */}

                </div>
                
                {/* God Pack Discount Banner */}
                {showGodDiscount && (
                  <div className="mb-4 text-center text-sm font-medium px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white border border-red-400 animate-pulse">
                    🔥 {Math.round(godPackDiscount.value * 100)}% OFF GOAT PACKS!
                    <div className="flex items-center justify-center gap-2 mt-1 text-xs">
                      <span className="line-through text-gray-300">{singlePackBaseDetails.displayAmount}</span>
                      <span className="text-green-300 font-bold">{singlePackDiscountDetails.displayAmount}</span>
                    </div>
                    {godPackDiscountTimeLeft && (
                      <span className="block text-xs mt-1">
                        Limited time: {godPackDiscountTimeLeft}
                      </span>
                    )}
                  </div>
                )}
                
                {activeTab === "wheel" && (
                  <div className="space-y-6">
                    {/* Wheel Type Switcher */}
                    <div className="flex items-center justify-center gap-2 mb-4">
                      <button
                        onClick={() => !wheelSpinning && setActiveWheelType("standard")}
                        disabled={wheelSpinning}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          wheelSpinning
                            ? "opacity-50 cursor-not-allowed bg-black/30 text-gray-500 border border-gray-600"
                            : activeWheelType === "standard"
                            ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black"
                            : "bg-black/50 text-yellow-200 border border-yellow-400/30"
                        }`}
                      >
                        {t("draw.lucky_wheel_standard", "Standard")}
                      </button>
                      <button
                        onClick={() => !wheelSpinning && setActiveWheelType("premium")}
                        disabled={wheelSpinning}
                        className={`px-4 py-2 rounded-lg font-medium transition-all ${
                          wheelSpinning
                            ? "opacity-50 cursor-not-allowed bg-black/30 text-gray-500 border border-gray-600"
                            : activeWheelType === "premium"
                            ? "bg-gradient-to-r from-yellow-400 to-yellow-500 text-black"
                            : "bg-black/50 text-yellow-200 border border-yellow-400/30"
                        }`}
                      >
                        {t("draw.lucky_wheel_premium", "Premium")}
                      </button>
                    </div>

                    {/* Lucky Wheel Global Daily Limit Display (only for Premium Wheel) */}
                    {activeWheelType === "premium" && wheelLimit && (
                      <div className="mb-4 space-y-2">
                        {/* Global Limit */}
                        <div
                          className={`text-center text-sm font-medium px-4 py-2 rounded-xl ${
                            wheelLimit.globalSpinsRemaining === 0
                              ? "bg-black/70 text-red-200 border border-red-400"
                              : "bg-black/70 text-yellow-300 border border-yellow-400"
                          }`}
                        >
                          🎰 {t("draw.lucky_wheel_spins_today", "Lucky Wheel spins today:")}{" "}
                          <span className="font-bold">{wheelLimit.globalSpinsUsed}</span> / {wheelLimit.globalDailyLimit}
                          {wheelLimit.globalSpinsRemaining === 0 && (
                            <span className="text-red-400 ml-2 block mt-1">
                              {t("draw.lucky_wheel_global_limit_reached", "Global limit reached for all users!")}
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                    {/* Standard Wheel - No Limit Info */}
                    {activeWheelType === "standard" && (
                      <div className="mb-4 space-y-2">
                        <div className="text-center text-sm font-medium px-4 py-2 rounded-xl bg-black/70 text-green-300 border border-green-400">
                          ✨ {t("draw.lucky_wheel_no_limit", "Standard Wheel - No Daily Limit!")}
                        </div>
                      </div>
                    )}

                    <div className="flex flex-col items-center gap-6">
                      <div className="relative">
                        <div className="absolute z-10 top-[-20px] left-1/2 -translate-x-1/2 rotate-180 w-0 h-0 border-l-[14px] border-r-[14px] border-l-transparent border-r-transparent border-b-[20px] border-b-amber-400 drop-shadow-lg" />
                        <div
                          className="w-64 h-64 rounded-full border-4 border-yellow-400 shadow-2xl flex items-center justify-center transition-transform ease-out"
                          style={{
                            transform: `rotate(${wheelRotation}deg)`,
                            transitionDuration: wheelSpinDuration,
                            background: wheelGradientStyle,
                          }}
                        />
                      </div>

                      <Button
                        size="lg"
                        className="bg-gradient-to-r from-yellow-400 via-yellow-500 to-yellow-600 text-black font-bold px-10 shadow-lg hover:from-yellow-300 hover:to-yellow-500 disabled:opacity-70"
                        onClick={handleSpinWheel}
                        disabled={
                          wheelSpinning || 
                          !spinCostDetails || 
                          (activeWheelType === "premium" && wheelLimit !== null && (!wheelLimit.canSpin || wheelLimit.hasPendingSpin === true))
                        }
                        title={
                          wheelLimit !== null
                            ? `canSpin: ${wheelLimit.canSpin}, hasPendingSpin: ${wheelLimit.hasPendingSpin}, globalSpinsRemaining: ${wheelLimit.globalSpinsRemaining}, userSpinsCount: ${wheelLimit.userSpinsCount}`
                            : "Loading..."
                        }
                      >
                        {wheelSpinning
                          ? t("draw.lucky_wheel_spinning", "Spinning...")
                          : wheelLimit !== null && wheelLimit.hasPendingSpin === true
                            ? t("draw.lucky_wheel_waiting_reward", "Waiting for reward...")
                            : spinCostDetails
                              ? t("draw.lucky_wheel_spin_button_with_price", "Spin Now ({amount})", {
                                  amount: spinCostDetails.displayAmount,
                                })
                              : t("draw.lucky_wheel_spin_button", "Spin Now")}
                      </Button>

                      {/* Payment Currency Toggle */}
                      <div className="flex justify-center">
                        <PaymentCurrencyToggle size="sm" className="max-w-[200px]" />
                      </div>

                    </div>

                    <div className="bg-black/80 border border-yellow-400 rounded-2xl p-4">
                      <h3 className="text-lg font-semibold text-yellow-200 mb-3 flex items-center gap-2 justify-center">
                        <Award className="h-4 w-4 text-yellow-300" />
                        {t("draw.lucky_wheel_possible_rewards", "Possible Rewards")}
                      </h3>
                      <div className="grid grid-cols-1 gap-2">
                        {(() => {
                          // Group ticket rewards for compact display
                          const regularTicketSegments = luckyWheelSegments.filter(
                            s => s.reward.type === "tickets" && s.reward.ticketType === "regular"
                          )
                          const legendaryTicketSegments = luckyWheelSegments.filter(
                            s => s.reward.type === "tickets" && s.reward.ticketType === "legendary"
                          )
                          const otherSegments = luckyWheelSegments.filter(
                            s => s.reward.type !== "tickets"
                          )
                          
                          // Get min and max amounts for tickets
                          const regularAmounts = regularTicketSegments.map(s => s.reward.amount || 0)
                          const legendaryAmounts = legendaryTicketSegments.map(s => s.reward.amount || 0)
                          const minRegular = Math.min(...regularAmounts)
                          const maxRegular = Math.max(...regularAmounts)
                          const minLegendary = Math.min(...legendaryAmounts)
                          const maxLegendary = Math.max(...legendaryAmounts)
                          
                          // Get average color for grouped tickets (use first segment's color)
                          const regularColor = regularTicketSegments[0]?.color || "#3B82F6"
                          const legendaryColor = legendaryTicketSegments[0]?.color || "#A855F7"
                          
                          // Calculate total drop rate for grouped tickets
                          const regularTicketDropRate = regularTicketSegments.reduce((sum, seg) => sum + (seg.dropRate || 0), 0)
                          const legendaryTicketDropRate = legendaryTicketSegments.reduce((sum, seg) => sum + (seg.dropRate || 0), 0)
                          
                          // Create grouped reward items
                          const groupedRewards: Array<{
                            type: string
                            label: string
                            color: string
                            dropRate: number
                            key: string
                          }> = [
                            // Regular Tickets - grouped
                            ...(regularTicketSegments.length > 0 ? [{
                              type: 'regular_tickets',
                              label: minRegular === maxRegular 
                                ? t("draw.lucky_wheel_reward_regular_grouped_single", "+{amount} Regular Tickets", { amount: minRegular })
                                : t("draw.lucky_wheel_reward_regular_grouped_range", "+{min}-{max} Regular Tickets", { min: minRegular, max: maxRegular }),
                              color: regularColor,
                              dropRate: regularTicketDropRate,
                              key: 'regular_tickets',
                            }] : []),
                            // Legendary Tickets - grouped
                            ...(legendaryTicketSegments.length > 0 ? [{
                              type: 'legendary_tickets',
                              label: minLegendary === maxLegendary
                                ? t("draw.lucky_wheel_reward_legendary_grouped_single", "+{amount} Legendary Tickets", { amount: minLegendary })
                                : t("draw.lucky_wheel_reward_legendary_grouped_range", "+{min}-{max} Legendary Tickets", { min: minLegendary, max: maxLegendary }),
                              color: legendaryColor,
                              dropRate: legendaryTicketDropRate,
                              key: 'legendary_tickets',
                            }] : []),
                            // Other rewards (cards, passes, deals)
                            ...otherSegments.map(segment => ({
                              type: 'other',
                              label: segment.label,
                              color: segment.color,
                              dropRate: segment.dropRate || 0,
                              key: segment.label,
                            })),
                          ]
                          
                          // Sort by drop rate (highest first)
                          groupedRewards.sort((a, b) => b.dropRate - a.dropRate)
                          
                          return (
                            <>
                              {groupedRewards.map((reward) => (
                                <div
                                  key={reward.key}
                                  className="flex items-center justify-between gap-3 bg-black/60 border border-yellow-300/30 rounded-xl px-3 py-2"
                                >
                                  <div className="flex items-center gap-3">
                                    <span
                                      className="inline-block w-3 h-3 rounded-full border border-yellow-200 shadow flex-shrink-0"
                                      style={{ backgroundColor: reward.color }}
                                    />
                                    <span className="text-sm text-yellow-100 font-medium">{reward.label}</span>
                                  </div>
                                  <span className="text-xs text-yellow-300 font-semibold">
                                    {reward.dropRate}%
                                  </span>
                                </div>
                              ))}
                            </>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )}

                {/* Reward Overlay */}
                <AnimatePresence>
                  {showRewardOverlay && wheelReward && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
                      onClick={() => {
                        setShowRewardOverlay(false)
                        setWheelReward(null)
                      }}
                    >
                      <motion.div
                        initial={{ scale: 0.8, y: 20, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.8, y: 20, opacity: 0 }}
                        transition={{ type: "spring", damping: 20, stiffness: 300 }}
                        className="bg-gradient-to-br from-yellow-900/95 to-black/95 border-2 border-yellow-400 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="text-center space-y-4">
                          <motion.div
                            initial={{ scale: 0 }}
                            animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                            transition={{ delay: 0.2, duration: 0.5 }}
                            className="w-20 h-20 bg-yellow-400/20 rounded-full flex items-center justify-center mx-auto mb-4"
                          >
                            <Award className="h-10 w-10 text-yellow-400" />
                          </motion.div>

                          <motion.h2
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="text-2xl font-bold text-yellow-300 mb-2"
                          >
                            {t("draw.lucky_wheel_reward_title", "Congratulations!")}
                          </motion.h2>

                          <motion.div
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="space-y-2"
                          >
                            {wheelReward.type === "tickets" && (
                              <div className="flex items-center justify-center gap-3">
                                <Ticket className="h-8 w-8 text-yellow-400" />
                                <span className="text-xl font-bold text-yellow-200">
                                  {wheelReward.label}
                                </span>
                              </div>
                            )}
                            {wheelReward.type === "card" && (
                              <div className="flex items-center justify-center gap-3">
                                <Crown className="h-8 w-8 text-yellow-400" />
                                <span className="text-xl font-bold text-yellow-200">
                                  {wheelReward.label}
                                </span>
                              </div>
                            )}
                            {wheelReward.type === "pass" && (
                              <div className="flex flex-col items-center justify-center gap-2">
                                <div className="flex items-center justify-center gap-3">
                                  <Star className="h-8 w-8 text-yellow-400" />
                                  <span className="text-xl font-bold text-yellow-200">
                                    {wheelReward.label}
                                  </span>
                                </div>
                                <div className="flex items-center justify-center gap-2 mt-2">
                                  <Crown className="h-6 w-6 text-purple-400" />
                                  <span className="text-lg font-semibold text-purple-300">
                                    +7 {t("draw.legendary_tickets", "Legendary Tickets")}
                                  </span>
                                </div>
                              </div>
                            )}
                            {wheelReward.type === "deal" && (
                              <div className="flex items-center justify-center gap-3">
                                <Award className="h-8 w-8 text-yellow-400" />
                                <span className="text-xl font-bold text-yellow-200">
                                  {wheelReward.label}
                                </span>
                              </div>
                            )}
                            {lastWheelCard && (
                              <p className="text-sm text-yellow-300 mt-2">
                                {t("draw.lucky_wheel_card_awarded", "Card awarded: {cardName}", {
                                  cardName: lastWheelCard,
                                })}
                              </p>
                            )}
                          </motion.div>

                          <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.6 }}
                          >
                            <Button
                              onClick={() => {
                                setShowRewardOverlay(false)
                                setWheelReward(null)
                              }}
                              className="mt-6 bg-yellow-400 hover:bg-yellow-500 text-black font-bold px-8"
                            >
                              {t("draw.lucky_wheel_reward_close", "Close")}
                            </Button>
                          </motion.div>
                        </div>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {activeTab !== "wheel" && (
                <>

                {/* {godPacksLeft !== null && (
                  <div className={`mb-4 text-center text-sm font-medium px-4 py-2 rounded-xl ${
                    godPacksLeft === 0
                      ? "bg-black/70 text-yellow-200 border border-yellow-400"
                      : "bg-black/70 text-red-400 border border-red-500"
                  }`}>
                    ⚡ Goat Packs opened today:{" "}
                    <span className="font-bold">{godPacksLeft}</span> / {max_godpacks_daily}
                  </div>
                )} */}
                





                {/* Pack UI */}
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3 }}
                  className="bg-black/70 rounded-2xl overflow-hidden shadow-sm border border-yellow-400"
                >
                  <div className="p-4">
                    <div className="flex flex-col items-center">
                      <motion.div
                        className="relative w-48 h-64 mb-4"
                        animate={{
                          rotateY: [0, 5, 0, -5, 0],
                        }}
                        transition={{
                          duration: 5,
                          repeat: Number.POSITIVE_INFINITY,
                          repeatType: "loop",
                        }}
                      >
                        <img
                          src={
                            activeTab === "god"
                              ? "/godpack-removebg-preview.png"
                              : activeTab === "legendary"
                                ? "/legendarypack.png?v=2"
                                : activeTab === "icon"
                                  ? "/icon_pack_echt-removebg-preview.png"
                                  : "/regular pack.png?v=2"
                          }
                          alt="Card Pack"
                          className="absolute inset-0 w-full h-full object-contain"
                        />
                      </motion.div>

                      <div className="text-center mb-4">
                        <h3 className="text-lg font-medium text-white">
                          {activeTab === "god" ? t("draw.god_pack", "GOAT") : activeTab === "legendary" ? t("draw.legendary_pack", "Legendary") : activeTab === "icon" ? t("draw.icon_pack", "ICON") : t("draw.regular_pack", "Regular")} {t("draw.card_pack", "Card Pack")}
                        </h3>
                        <p className="text-sm text-gray-500">{t("draw.contains_one_card", "Contains 1 random card")}</p>
                        <div className="flex items-center justify-center gap-1 mt-1 text-xs text-violet-600">
                          <Star className="h-3 w-3" />
                          {userClanRole === "xp_hunter" || userClanRole === "leader" || hasXpPass ? (
                            <span className="flex items-center gap-1">
                              <span className="line-through text-gray-400">
                                +{activeTab === "god" ? "200" : activeTab === "legendary" ? "100" : activeTab === "icon" ? "150" : "50"} XP
                              </span>
                              <span className="text-violet-600 font-semibold">
                                +
                                {calculateXpWithBonuses(
                                  activeTab === "god" ? 200 : activeTab === "legendary" ? 100 : activeTab === "icon" ? 150 : 50,
                                )}{" "}
                                XP
                              </span>
                              {userClanRole === "xp_hunter" && <Sword className="h-3 w-3 text-orange-500" />}
                            </span>
                          ) : (
                            <span>+{activeTab === "god" ? "200" : activeTab === "legendary" ? "100" : activeTab === "icon" ? "150" : "50"} XP</span>
                          )}
                        </div>
                      </div>

                      {/* Boost Drop Rate Button */}
                      {(activeTab === "regular" || activeTab === "legendary") && !isCheckingBoost && (
                        <div className="w-full mb-4">
                          {hasDropRateBoost && boostExpiresAt ? (
                            <div className="border border-red-400/50 rounded-lg p-3 bg-gradient-to-br from-red-500/20 via-pink-500/10 to-red-600/20 relative overflow-visible">
                              {/* Glitter effect */}
                              <motion.div
                                className="absolute inset-0 pointer-events-none rounded-lg"
                                style={{
                                  background: "linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.3) 50%, transparent 70%)",
                                  backgroundSize: "200% 200%",
                                }}
                                animate={{
                                  backgroundPosition: ["0% 0%", "200% 200%"],
                                }}
                                transition={{
                                  duration: 3,
                                  repeat: Number.POSITIVE_INFINITY,
                                  repeatType: "loop",
                                  ease: "linear",
                                }}
                              />
                              <div className="absolute -top-4 -right-3 bg-gradient-to-r from-red-400 via-pink-500 to-red-600 text-white text-xs px-2.5 py-1.5 rounded-full font-bold shadow-lg shadow-red-500/50 z-50">
                                BOOST ACTIVE
                              </div>
                              <div className="flex flex-col gap-2 relative z-10">
                                <div className="flex items-center gap-2">
                                  <Zap className="h-4 w-4 text-red-400 animate-pulse" />
                                  <span className="text-sm text-red-300 font-medium">
                                    +{legendaryBonus}% Legendary Drop Rate Boost
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-red-200">
                                    {boostType === "premium" ? "Premium" : "Regular"} Boost
                                  </span>
                                  <span className="text-red-200">
                                    {new Date(boostExpiresAt) > new Date()
                                      ? `Expires: ${new Date(boostExpiresAt).toLocaleDateString()}`
                                      : "Expired"}
                                  </span>
                                </div>
                              </div>
                            </div>
                          ) : (
                            <Button
                              onClick={() => {
                                if (!user?.wallet_address) {
                                  toast({
                                    title: "Error",
                                    description: "You must be logged in.",
                                    variant: "destructive",
                                  })
                                  return
                                }
                                setShowBoostDialog(true)
                              }}
                              className="w-full bg-gradient-to-r from-red-500 via-pink-500 to-red-600 hover:from-red-600 hover:via-pink-600 hover:to-red-700 text-white rounded-lg py-2.5 shadow-lg shadow-red-500/50 hover:shadow-xl hover:shadow-red-500/70 transition-all duration-200 relative overflow-hidden"
                            >
                              {/* Glitter effect on button */}
                              <motion.div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  background: "linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)",
                                  backgroundSize: "200% 200%",
                                }}
                                animate={{
                                  backgroundPosition: ["0% 0%", "200% 200%"],
                                }}
                                transition={{
                                  duration: 2.5,
                                  repeat: Number.POSITIVE_INFINITY,
                                  repeatType: "loop",
                                  ease: "linear",
                                }}
                              />
                              <div className="flex items-center justify-center gap-2 relative z-10">
                                <Zap className="h-4 w-4" />
                                <span className="font-semibold">Boost Your Drop Rate</span>
                              </div>
                            </Button>
                          )}
                        </div>
                      )}

                      {/* Boost Purchase Dialog */}
                      {showBoostDialog && (
                        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                          <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-2xl border-2 border-red-500/50 shadow-2xl shadow-red-500/20 p-6 max-w-md w-full relative overflow-hidden"
                          >
                            {/* Glitter background effect */}
                            <motion.div
                              className="absolute inset-0 pointer-events-none opacity-20"
                              style={{
                                background: "radial-gradient(circle at 20% 50%, rgba(255,0,100,0.3) 0%, transparent 50%), radial-gradient(circle at 80% 50%, rgba(255,50,150,0.3) 0%, transparent 50%)",
                              }}
                              animate={{
                                opacity: [0.2, 0.3, 0.2],
                              }}
                              transition={{
                                duration: 3,
                                repeat: Number.POSITIVE_INFINITY,
                                repeatType: "loop",
                              }}
                            />
                            <div className="flex justify-between items-center mb-6 relative z-10">
                              <div className="flex items-center gap-2">
                                <Zap className="h-6 w-6 text-red-400" />
                                <h3 className="text-2xl font-bold bg-gradient-to-r from-red-400 via-pink-400 to-red-500 bg-clip-text text-transparent">
                                  Boost Your Drop Rate
                                </h3>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setShowBoostDialog(false)}
                                className="text-gray-400 hover:text-white hover:bg-red-500/20 rounded-full"
                              >
                                <X className="h-5 w-5" />
                              </Button>
                            </div>

                            <div className="space-y-5 relative z-10">
                              {/* Boost Type Selection */}
                              <div>
                                <label className="text-sm font-semibold text-gray-200 mb-3 block">Boost Type</label>
                                <div className="grid grid-cols-2 gap-3">
                                  <Button
                                    variant={selectedBoostType === "regular" ? "default" : "outline"}
                                    onClick={() => setSelectedBoostType("regular")}
                                    className={`${selectedBoostType === "regular" ? "bg-gradient-to-br from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white shadow-lg shadow-red-500/30 border-red-400/50" : "text-gray-300 border-gray-600 hover:border-red-500/50"} flex flex-col items-center justify-center py-4 h-auto min-h-[80px] rounded-xl transition-all duration-200 relative overflow-hidden`}
                                  >
                                    {selectedBoostType === "regular" && (
                                      <motion.div
                                        className="absolute inset-0 pointer-events-none"
                                        style={{
                                          background: "linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.15) 50%, transparent 70%)",
                                          backgroundSize: "200% 200%",
                                        }}
                                        animate={{
                                          backgroundPosition: ["0% 0%", "200% 200%"],
                                        }}
                                        transition={{
                                          duration: 2,
                                          repeat: Number.POSITIVE_INFINITY,
                                          repeatType: "loop",
                                          ease: "linear",
                                        }}
                                      />
                                    )}
                                    <span className="font-bold text-base relative z-10">Regular</span>
                                    <span className="text-xs mt-1.5 opacity-90 relative z-10">
                                      +{activeTab === "legendary" ? "2%" : "1%"} Legendary
                                    </span>
                                  </Button>
                                  <Button
                                    variant={selectedBoostType === "premium" ? "default" : "outline"}
                                    onClick={() => setSelectedBoostType("premium")}
                                    className={`${selectedBoostType === "premium" ? "bg-gradient-to-br from-red-600 via-pink-600 to-red-700 hover:from-red-700 hover:via-pink-700 hover:to-red-800 text-white shadow-lg shadow-red-500/40 border-red-400/50" : "text-gray-300 border-gray-600 hover:border-red-500/50"} flex flex-col items-center justify-center py-4 h-auto min-h-[80px] rounded-xl transition-all duration-200 relative overflow-hidden`}
                                  >
                                    {selectedBoostType === "premium" && (
                                      <>
                                        <motion.div
                                          className="absolute inset-0 pointer-events-none"
                                          style={{
                                            background: "linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)",
                                            backgroundSize: "200% 200%",
                                          }}
                                          animate={{
                                            backgroundPosition: ["0% 0%", "200% 200%"],
                                          }}
                                          transition={{
                                            duration: 2,
                                            repeat: Number.POSITIVE_INFINITY,
                                            repeatType: "loop",
                                            ease: "linear",
                                          }}
                                        />
                                        <div className="absolute top-1 right-1">
                                          <Crown className="h-3 w-3 text-yellow-300" />
                                        </div>
                                      </>
                                    )}
                                    <span className="font-bold text-base relative z-10">Premium</span>
                                    <span className="text-xs mt-1.5 opacity-90 relative z-10">
                                      +{activeTab === "legendary" ? "5%" : "2%"} Legendary
                                    </span>
                                  </Button>
                                </div>
                              </div>

                              {/* Duration Selection */}
                              <div>
                                <label className="text-sm font-semibold text-gray-200 mb-3 block">Duration</label>
                                <div className="grid grid-cols-2 gap-3">
                                  <Button
                                    variant={selectedDuration === "1week" ? "default" : "outline"}
                                    onClick={() => setSelectedDuration("1week")}
                                    className={`${selectedDuration === "1week" ? "bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white shadow-md shadow-red-500/30 border-red-400/50" : "text-gray-300 border-gray-600 hover:border-red-500/50"} py-3 rounded-xl transition-all duration-200`}
                                  >
                                    1 Week
                                  </Button>
                                  <Button
                                    variant={selectedDuration === "1month" ? "default" : "outline"}
                                    onClick={() => setSelectedDuration("1month")}
                                    className={`${selectedDuration === "1month" ? "bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white shadow-md shadow-red-500/30 border-red-400/50" : "text-gray-300 border-gray-600 hover:border-red-500/50"} py-3 rounded-xl transition-all duration-200`}
                                  >
                                    1 Month
                                  </Button>
                                </div>
                              </div>

                              {/* Payment Currency */}
                              <div>
                                <label className="text-sm font-semibold text-gray-200 mb-3 block">Payment Method</label>
                                <div className="flex gap-3">
                                  <Button
                                    variant={boostPaymentCurrency === "WLD" ? "default" : "outline"}
                                    onClick={() => setBoostPaymentCurrency("WLD")}
                                    className={`${boostPaymentCurrency === "WLD" ? "bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white shadow-md shadow-red-500/30 border-red-400/50" : "text-gray-300 border-gray-600 hover:border-red-500/50"} flex-1 py-3 rounded-xl transition-all duration-200`}
                                  >
                                    <div className="flex flex-col items-center">
                                      <span>WLD</span>
                                      {!isLoadingBalance && (
                                        <span className="text-xs opacity-75 mt-0.5">
                                          {isNaN(parseFloat(wldBalance)) ? "0.00" : parseFloat(wldBalance).toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  </Button>
                                  <Button
                                    variant={boostPaymentCurrency === "USDC" ? "default" : "outline"}
                                    onClick={() => setBoostPaymentCurrency("USDC")}
                                    className={`${boostPaymentCurrency === "USDC" ? "bg-gradient-to-r from-red-500 to-pink-600 hover:from-red-600 hover:to-pink-700 text-white shadow-md shadow-red-500/30 border-red-400/50" : "text-gray-300 border-gray-600 hover:border-red-500/50"} flex-1 py-3 rounded-xl transition-all duration-200`}
                                  >
                                    <div className="flex flex-col items-center">
                                      <span>USDC</span>
                                      {!isLoadingBalance && (
                                        <span className="text-xs opacity-75 mt-0.5">
                                          {isNaN(parseFloat(usdcBalance)) ? "0.00" : parseFloat(usdcBalance).toFixed(2)}
                                        </span>
                                      )}
                                    </div>
                                  </Button>
                                </div>
                              </div>

                              {/* Price Display */}
                              {(() => {
                                const packType = activeTab === "legendary" ? "legendary" : "regular"
                                const priceUsd = BOOST_PRICES[packType][selectedBoostType][selectedDuration]
                                const transferDetails = getTransferDetails({
                                  usdAmount: priceUsd,
                                  currency: boostPaymentCurrency,
                                  wldPrice: price,
                                  anixPrice,
                                })
                                
                                return (
                                  <div className="bg-gradient-to-br from-gray-800/80 to-gray-900/80 rounded-xl p-4 border border-red-500/30 shadow-lg">
                                    <div className="flex justify-between items-center">
                                      <span className="text-gray-300 font-medium">Price:</span>
                                      <span className="text-white font-bold text-lg">
                                        {transferDetails.displayAmount}
                                      </span>
                                    </div>
                                    <div className="text-xs text-gray-400 mt-2">
                                      ≈ ${priceUsd.toFixed(2)} USD
                                    </div>
                                  </div>
                                )
                              })()}

                              {/* Purchase Button */}
                              <Button
                                onClick={async () => {
                                  try {
                                    const packType = activeTab === "legendary" ? "legendary" : "regular"
                                    const config = await getBoostConfig(packType, selectedBoostType, selectedDuration)
                                    const priceUsd = config.priceUsd[selectedDuration]

                                    // Get transfer details
                                    const transferDetails = getTransferDetails({
                                      usdAmount: priceUsd,
                                      currency: boostPaymentCurrency,
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
                                      // Purchase boost on backend with payment information
                                      const result = await purchaseDropRateBoost(
                                        user!.wallet_address,
                                        packType,
                                        selectedBoostType,
                                        selectedDuration,
                                        priceUsd,
                                        boostPaymentCurrency,
                                        transferDetails.numericAmount
                                      )

                                      if (result.success) {
                                        toast({
                                          title: "Success",
                                          description: `Drop rate boost activated! +${config.legendaryBonus}% legendary drop rate for ${selectedDuration === "1week" ? "1 week" : "1 month"}.`,
                                        })
                                        setShowBoostDialog(false)
                                        // Refresh boost status
                                        const boostResult = await checkDropRateBoost(user!.wallet_address, packType)
                                        if (boostResult.success && boostResult.hasBoost) {
                                          setHasDropRateBoost(true)
                                          setBoostExpiresAt(boostResult.expiresAt || null)
                                          setBoostType(boostResult.boostType)
                                          setLegendaryBonus(boostResult.legendaryBonus || 0)
                                        }
                                      } else {
                                        toast({
                                          title: "Error",
                                          description: result.error || "Failed to activate boost",
                                          variant: "destructive",
                                        })
                                      }
                                    } else {
                                      toast({
                                        title: "Payment Failed",
                                        description: "Your payment could not be processed.",
                                        variant: "destructive",
                                      })
                                    }
                                  } catch (error: any) {
                                    console.error("Error purchasing boost:", error)
                                    toast({
                                      title: "Error",
                                      description: error.message || "An error occurred. Please try again.",
                                      variant: "destructive",
                                    })
                                  }
                                }}
                                className="w-full bg-gradient-to-r from-red-500 via-pink-500 to-red-600 hover:from-red-600 hover:via-pink-600 hover:to-red-700 text-white font-bold py-3 rounded-xl shadow-lg shadow-red-500/50 hover:shadow-xl hover:shadow-red-500/70 transition-all duration-200 relative overflow-hidden"
                              >
                                <motion.div
                                  className="absolute inset-0 pointer-events-none"
                                  style={{
                                    background: "linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.2) 50%, transparent 70%)",
                                    backgroundSize: "200% 200%",
                                  }}
                                  animate={{
                                    backgroundPosition: ["0% 0%", "200% 200%"],
                                  }}
                                  transition={{
                                    duration: 2,
                                    repeat: Number.POSITIVE_INFINITY,
                                    repeatType: "loop",
                                    ease: "linear",
                                  }}
                                />
                                <span className="relative z-10 flex items-center justify-center gap-2">
                                  <Zap className="h-5 w-5" />
                                  Purchase Boost
                                </span>
                              </Button>
                            </div>
                          </motion.div>
                        </div>
                      )}


                      <div className="w-full space-y-2 mb-4">
                        {/* God Pack Rarity Display - UPDATED: Changed godlike text to red */}
                        {activeTab === "god" ? (
                          <div className="border border-gray-200 rounded-lg p-3 relative">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-purple-500">Epic</span>
                                <span className="text-purple-500">{godPackChances.epic}%</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-amber-500">Legendary</span>
                                <div className="flex items-center gap-1">
                                  <span className="text-amber-500">
                                    {userClanRole === "lucky_star" || userClanRole === "leader" ? "52%" : "50%"}
                                  </span>
                                  {(userClanRole === "lucky_star" || userClanRole === "leader") && (
                                    <Star className="h-3 w-3 text-yellow-500" />
                                  )}
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="font-bold text-red-600">GOAT</span>
                                <span className="text-red-500 font-bold">{godPackChances.godlike}%</span>
                              </div>
                            </div>
                            <div className="mt-2 text-sm text-blue-600 font-medium flex items-center justify-center gap-1">
                              <Ticket className="h-4 w-4 text-blue-500" />
                              Get +3 free ICON Tickets
                            </div>
                          </div>
                        ) : activeTab === "regular" ? (
                          <div className="border border-gray-200 rounded-lg p-3 relative">
                            {hasPremiumPass && (
                              <div className="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white text-xs px-2 py-1 rounded-full font-bold">
                                PASS ACTIVE
                              </div>
                            )}
                            {(() => {
                              const percentages = getRarityPercentages("regular")
                              const baseCommon = hasPremiumPass ? 50 : 60
                              const baseLegendary = hasPremiumPass ? 1 : 0
                              return (
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">{t("rarity.common", "Common")}</span>
                                    <span className="text-gray-500">{percentages.common}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-blue-500">{t("rarity.rare", "Rare")}</span>
                                    <span className="text-blue-500">{percentages.rare}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-purple-500">{t("rarity.epic", "Epic")}</span>
                                    <span className="text-purple-500">{percentages.epic}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-amber-500">{t("rarity.legendary", "Legendary")}</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-amber-500">{percentages.legendary}%</span>
                                      {hasDropRateBoost && legendaryBonus > 0 && (
                                        <span className="text-xs text-red-400">(+{legendaryBonus}%)</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        ) : activeTab === "legendary" ? (
                          <div className="border border-gray-200 rounded-lg p-3 relative">
                            {(() => {
                              const percentages = getRarityPercentages("legendary")
                              return (
                                <div className="space-y-2">
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-gray-500">{t("rarity.common", "Common")}</span>
                                    <span className="text-gray-500">{percentages.common}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-blue-500">{t("rarity.rare", "Rare")}</span>
                                    <span className="text-blue-500">{percentages.rare}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-purple-500">{t("rarity.epic", "Epic")}</span>
                                    <span className="text-purple-500">{percentages.epic}%</span>
                                  </div>
                                  <div className="flex justify-between items-center text-sm">
                                    <span className="text-amber-500">{t("rarity.legendary", "Legendary")}</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-amber-500">{percentages.legendary}%</span>
                                      {hasDropRateBoost && legendaryBonus > 0 && (
                                        <span className="text-xs text-red-400">(+{legendaryBonus}%)</span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              )
                            })()}
                          </div>
                        ) : (
                          <div className="border border-gray-200 rounded-lg p-3 relative">
                            {hasPremiumPass && (
                              <div className="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white text-xs px-2 py-1 rounded-full font-bold">
                                PASS ACTIVE
                              </div>
                            )}
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">{t("rarity.common", "Common")}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500">{hasPremiumPass ? "50%" : "60%"}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-blue-500">{t("rarity.rare", "Rare")}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-500">{hasPremiumPass ? "34%" : "34%"}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-purple-500">{t("rarity.epic", "Epic")}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-purple-500">{hasPremiumPass ? "14%" : "5%"}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-amber-500">{t("rarity.legendary", "Legendary")}</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-amber-500">{hasPremiumPass ? "2%" : "1%"}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Pack Buttons - UPDATED: God pack buttons to red gradient */}
                      <div className="w-full space-y-3">
                        {activeTab === "god" ? (
                          <>
                            {/* God Pack Buttons */}
                            <div className="space-y-3">
                              <div className="flex items-center justify-center gap-2 rounded-xl border border-red-400/40 bg-black/40 p-1 text-xs font-semibold uppercase">
                                <PaymentCurrencyToggle size="sm" className="w-full mb-2" />
                                <Button
                                  onClick={() => sendPayment(1, paymentCurrency)}
                                  disabled={godPacksLeft === null || godPacksLeft >= max_godpacks_daily}
                                  className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  {isDrawing ? (
                                    <div className="flex items-center justify-center">
                                      <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                                      <span className="text-sm font-medium">{t("draw.opening_pack", "Opening...")}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Zap className="h-5 w-5" />
                                      <span className="font-bold text-base">{t("draw.one_pack", "1 Pack")}</span>
                                      <span className="block text-sm">
                                        {showGodDiscount ? (
                                          <>
                                            <span className="line-through text-gray-300">{singlePackBaseDetails.displayAmount}</span>
                                            <span className="text-green-300 ml-2">{singlePackDiscountDetails.displayAmount}</span>
                                          </>
                                        ) : (
                                          <span>{singlePackDiscountDetails.displayAmount}</span>
                                        )}
                                      </span>
                                    </div>
                                  )}
                                </Button>

                                <div className="relative">
                                  <Button
                                    onClick={() => sendPayment(5, paymentCurrency)}
                                    disabled={godPacksLeft === null || godPacksLeft >= max_godpacks_daily || (godPacksLeft !== null && godPacksLeft + 5 > max_godpacks_daily)}
                                    className={
                                      godPacksLeft === null || godPacksLeft >= max_godpacks_daily || (godPacksLeft !== null && godPacksLeft + 5 > max_godpacks_daily)
                                        ? "w-full bg-gray-300 text-gray-500 rounded-xl py-4 shadow-sm cursor-not-allowed opacity-60"
                                        : "w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-red-400 relative overflow-hidden"
                                    }
                                  >
                                    {/* Shine effect */}
                                    <motion.div
                                      className="absolute inset-0 pointer-events-none"
                                      style={{
                                        background: "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)",
                                        backgroundSize: "200% 100%",
                                      }}
                                      animate={{
                                        backgroundPosition: ["-200% 0%", "200% 0%"],
                                      }}
                                      transition={{
                                        duration: 3,
                                        repeat: Number.POSITIVE_INFINITY,
                                        repeatType: "loop",
                                        ease: "linear",
                                      }}
                                    />
                                  {isDrawing ? (
                                    <div className="flex items-center justify-center">
                                      <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                                      <span className="text-sm font-medium">{t("draw.opening_pack", "Opening...")}</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2">
                                      <Zap className="h-5 w-5" />
                                      <span className="font-bold text-base text-white">{t("draw.five_packs", "5 Packs")}</span>
                                      <span className="block text-sm text-white">
                                        {fivePackDiscountDetails.displayAmount}
                                      </span>
                                    </div>
                                  )}
                                  </Button>
                                  <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                                    DISCOUNT (-10%)
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        ) : (
                          <>
                            {/* Regular/Legendary Pack Buttons */}
                            <div className="flex gap-4">
                              <Button
                                onClick={() =>
                                  !isDrawing && handleSelectPack(activeTab === "legendary" ? "legendary" : "regular")
                                }
                                disabled={isDrawing || (activeTab === "legendary" ? eliteTickets < 1 : tickets < 1)}
                                className={
                                  activeTab === "legendary"
                                    ? "flex-1 bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                    : "flex-1 bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                                }
                              >
                                {isDrawing ? (
                                  <div className="flex items-center justify-center">
                                    <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                                    <span className="text-sm font-medium">{t("draw.opening_pack", "Opening...")}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Ticket className="h-5 w-5" />
                                    <span className="font-bold text-base">{t("draw.one_pack", "1 Pack")}</span>
                                  </div>
                                )}
                              </Button>

                              <Button
                                onClick={() =>
                                  !isDrawing && handleSelectPack(activeTab === "legendary" ? "legendary" : "regular", 5)
                                }
                                disabled={isDrawing || (activeTab === "legendary" ? eliteTickets < 5 : tickets < 5)}
                                className={
                                  isDrawing || (activeTab === "legendary" ? eliteTickets < 5 : tickets < 5)
                                    ? "flex-1 bg-gray-300 text-gray-500 rounded-xl py-4 shadow-sm cursor-not-allowed opacity-60"
                                    : activeTab === "legendary"
                                      ? "flex-1 bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-blue-400"
                                      : "flex-1 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-orange-400"
                                }
                              >
                                {isDrawing ? (
                                  <div className="flex items-center justify-center">
                                    <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                                    <span className="text-sm font-medium">{t("draw.opening_pack", "Opening...")}</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Ticket className="h-5 w-5" />
                                    <span className="font-bold text-base">{t("draw.five_packs", "5 Packs")}</span>
                                  </div>
                                )}
                              </Button>
                            </div>

                            <Button
                              onClick={() =>
                                !isDrawing && handleSelectPack(activeTab === "legendary" ? "legendary" : "regular", 20)
                              }
                              disabled={isDrawing || (activeTab === "legendary" ? eliteTickets < 20 : tickets < 20)}
                              className={
                                isDrawing || (activeTab === "legendary" ? eliteTickets < 20 : tickets < 20)
                                  ? "w-full bg-gray-300 text-gray-500 rounded-xl py-4 shadow-sm cursor-not-allowed opacity-60"
                                  : activeTab === "legendary"
                                    ? "w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-purple-400"
                                    : "w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-red-400"
                              }
                            >
                              {isDrawing ? (
                                <div className="flex items-center justify-center">
                                  <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                                  <span className="text-sm font-medium">Opening...</span>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <Ticket className="h-5 w-5" />
                                  <span className="font-bold text-base">{t("draw.twenty_packs_bulk", "20 Packs (Bulk)")}</span>
                                </div>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
                </>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {showPackSelection && activeTab !== "god" && activeTab !== "wheel" && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="mt-4 text-center"
            >
              <Button
                variant="outline"
                onClick={() => router.push("/shop")}
                className="w-full border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                <Ticket className="h-4 w-4 mr-2 text-orange-500" />
                {t("draw.need_more_tickets", "Need more tickets? Visit the Shop")}
              </Button>
            </motion.div>
          )}

          {/* Bulk Results Screen */}
          <AnimatePresence>
            {showBulkResults && drawnCards.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex flex-col z-50 bg-[#f8f9ff]"
              >
                <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-4 py-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">{t("draw.bulk_opening_results", "Bulk Opening Results")}</h2>
                    <div className="text-sm text-gray-600">{drawnCards.length} {t("draw.cards", "cards")}</div>
                  </div>
                </div>

                <div className="bg-white border-b border-gray-200 px-4 py-3">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {['common', 'rare', 'epic', 'legendary'].map((rarity) => (
                      <div key={rarity} className={`p-2 rounded-lg ${getRarityStyles(rarity as CardRarity).bg}`}>
                        <div className={`text-xs font-medium ${getRarityStyles(rarity as CardRarity).text}`}>
                          {getDisplayRarity(rarity)}
                        </div>
                        <div className="text-lg font-bold">{getRarityStats()[rarity]}</div>
                      </div>
                    ))}

                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-2">
                  <div className="px-4 py-4">
                    <Button
                      onClick={() => finishCardReview()}
                      disabled={isUpdatingScore}
                      className={
                        activeTab === "god"
                          ? "w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl py-3 font-semibold text-lg"
                          : activeTab === "legendary"
                            ? "w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl py-3 font-semibold text-lg"
                            : activeTab === "icon"
                              ? "w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl py-3 font-semibold text-lg"
                              : "w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl py-3 font-semibold text-lg"
                      }
                    >
                      {isUpdatingScore ? (
                        <div className="flex items-center justify-center">
                          <div className="h-5 w-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                          <span>{t("draw.adding_to_collection", "Adding to Collection...")}</span>
                        </div>
                      ) : (
                        t("draw.add_to_collection", "Add to Collection")
                      )}
                    </Button>
                  </div>

                  <div className="space-y-5">
                    {drawnCards.map((card, index) => (
                      <motion.div
                        key={`bulk-card-${index}`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.04, duration: 0.35 }}
                        onClick={() => setSelectedBulkCard(card)}
                        className={`group relative p-4 rounded-2xl border bg-white/10 backdrop-blur-md shadow-md hover:shadow-xl transition-all cursor-pointer flex items-center justify-between ${getRarityStyles(card.rarity).border}`}
                      >
                        <div className="absolute inset-0 rounded-2xl pointer-events-none border border-white/20 shadow-inner shadow-white/10" />

                        <div className="flex flex-col z-10">
                          <h3 className="text-base font-semibold drop-shadow-sm">{card.name}</h3>
                          <p className="text-sm">{card.character}</p>
                        </div>

                        <span
                          className={`z-10 px-3 py-1 rounded-full text-xs font-semibold uppercase shadow-sm backdrop-blur-sm ${getRarityStyles(card.rarity).bg} ${getRarityStyles(card.rarity).text}`}
                        >
                          {getDisplayRarity(card.rarity)}
                        </span>
                      </motion.div>
                    ))}
                  </div>
                </div>

                <div className="sticky bottom-0 bg-white border-t border-gray-200 px-4 py-3">
                  <Button
                    onClick={() => finishCardReview()}
                    disabled={isUpdatingScore}
                    className={
                      activeTab === "god"
                        ? "w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl py-4"
                        : activeTab === "legendary"
                          ? "w-full bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-xl py-4"
                          : activeTab === "icon"
                            ? "w-full bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white rounded-xl py-4"
                            : "w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white rounded-xl py-4"
                    }
                  >
                    {isUpdatingScore ? (
                      <div className="flex items-center justify-center">
                        <div className="h-5 w-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                        <span>{t("draw.adding_to_collection", "Adding to Collection...")}</span>
                      </div>
                    ) : (
                      t("draw.add_all_cards", "Add All {count} Cards to Collection", { count: drawnCards.length })
                    )}
                  </Button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bulk Loading Animation */}
          <AnimatePresence>
            {showBulkLoading && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex flex-col items-center justify-center z-50 bg-[#f8f9ff]"
              >
                {/* Animated Background */}
                <div className="absolute inset-0">
                  {Array.from({ length: 20 }).map((_, i) => (
                    <motion.div
                      key={`bg-particle-${i}`}
                                              className={`absolute w-2 h-2 rounded-full ${
                          activeTab === "god"
                            ? "bg-red-400/30"
                            : activeTab === "legendary"
                              ? "bg-blue-400/30"
                              : activeTab === "icon"
                                ? "bg-indigo-400/30"
                                : "bg-orange-400/30"
                        }`}
                      animate={{
                        x: [
                          Math.random() * window.innerWidth,
                          Math.random() * window.innerWidth,
                          Math.random() * window.innerWidth,
                        ],
                        y: [
                          Math.random() * window.innerHeight,
                          Math.random() * window.innerHeight,
                          Math.random() * window.innerHeight,
                        ],
                        scale: [0, 1, 0],
                        opacity: [0, 0.6, 0],
                      }}
                      transition={{
                        duration: 3,
                        repeat: Number.POSITIVE_INFINITY,
                        delay: i * 0.1,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>

                {/* Main Loading Content */}
                <div className="relative z-10 flex flex-col items-center">
                  {/* Animated Pack Icons */}
                  <div className="relative mb-16">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <motion.div
                        key={`pack-${i}`}
                        className="absolute w-24 h-32"
                        style={{
                          left: `${i * 28 - 56}px`,
                          top: `${Math.sin(i) * 14}px`,
                        }}
                        animate={{
                          y: [0, -28, 0],
                          rotateZ: [0, 5, -5, 0],
                          scale: [1, 1.1, 0.9, 1.05, 1],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Number.POSITIVE_INFINITY,
                          delay: i * 0.2,
                          ease: "easeInOut",
                        }}
                      >
                        <img
                          src={
                            activeTab === "god"
                              ? "/godpack-removebg-preview.png"
                              : activeTab === "legendary"
                                ? "/legendarypack.png?v=2"
                                : activeTab === "icon"
                                  ? "/icon_pack_echt-removebg-preview.png"
                                  : "/regular pack.png?v=2"
                          }
                          alt="Card Pack"
                          className="absolute inset-0 w-full h-full object-contain opacity-80"
                        />
                      </motion.div>
                    ))}
                  </div>

                  {/* Loading Text */}
                  <motion.div
                    className="text-center mb-6"
                    animate={{
                      scale: [1, 1.05, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Number.POSITIVE_INFINITY,
                      ease: "easeInOut",
                    }}
                  >
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">{t("draw.opening_20_packs", "Opening 20 Packs...")}</h2>
                    <p className="text-gray-600">{t("draw.preparing_cards", "Preparing your cards")}</p>
                  </motion.div>

                  {/* Animated Progress Indicator */}
                  <div className="w-64 h-2 bg-gray-200 rounded-full overflow-hidden mb-4">
                    <motion.div
                      className={`h-full rounded-full ${
                        activeTab === "god"
                          ? "bg-gradient-to-r from-red-500 to-red-600"
                          : activeTab === "legendary"
                            ? "bg-gradient-to-r from-blue-500 to-cyan-500"
                            : activeTab === "icon"
                              ? "bg-gradient-to-r from-indigo-500 to-indigo-600"
                              : "bg-gradient-to-r from-orange-500 to-amber-500"
                      }`}
                      animate={{
                        x: ["-100%", "100%"],
                      }}
                      transition={{
                        duration: 1.5,
                        repeat: Number.POSITIVE_INFINITY,
                        ease: "easeInOut",
                      }}
                    />
                  </div>

                  {/* Spinning Cards Animation */}
                  <div className="relative">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <motion.div
                        key={`spinning-card-${i}`}
                        className={`absolute w-8 h-12 rounded border-2 ${
                          getRarityStyles(["common", "rare", "legendary", "legendary", "godlike"][i % 5] as CardRarity)
                            .border
                        } ${getRarityStyles(["common", "rare", "legendary", "legendary", "godlike"][i % 5] as CardRarity).bg}`}
                        style={{
                          left: `${Math.cos((i * Math.PI * 2) / 8) * 40}px`,
                          top: `${Math.sin((i * Math.PI * 2) / 8) * 40}px`,
                        }}
                        animate={{
                          rotateY: [0, 360],
                          scale: [0.8, 1.2, 0.8],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Number.POSITIVE_INFINITY,
                          delay: i * 0.1,
                          ease: "linear",
                        }}
                      />
                    ))}
                  </div>
                </div>

                {/* Bottom Hint */}
                <motion.div
                  className="absolute bottom-8 text-center text-gray-500 text-sm"
                  animate={{
                    opacity: [0.5, 1, 0.5],
                  }}
                  transition={{
                    duration: 2,
                    repeat: Number.POSITIVE_INFINITY,
                    ease: "easeInOut",
                  }}
                >
                  <p>This may take a few moments...</p>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Bulk Card Detail Modal with Tilt Effect */}
          <AnimatePresence>
            {selectedBulkCard && (
              <motion.div
                className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedBulkCard(null)}
              >
                <div className="relative">
                  {/* Close Button */}
                  <button
                    onClick={() => setSelectedBulkCard(null)}
                    className="absolute -top-4 -right-4 z-20 bg-white/90 hover:bg-white text-gray-800 p-2 rounded-full shadow-lg transition-colors"
                  >
                    <X className="h-5 w-5" />
                  </button>

                  {/* Tiltable Card */}
                  <motion.div
                    className="w-80 h-[30rem] preserve-3d cursor-pointer touch-none"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 120 }}
                    onMouseMove={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      const xPos = ((event.clientX - rect.left) / rect.width - 0.5) * 200
                      const yPos = ((event.clientY - rect.top) / rect.height - 0.5) * 200
                      x.set(xPos)
                      y.set(yPos)
                    }}
                    onMouseLeave={() => {
                      x.set(0)
                      y.set(0)
                    }}
                    onTouchMove={(event) => {
                      const rect = event.currentTarget.getBoundingClientRect()
                      const touch = event.touches[0]
                      const xPos = ((touch.clientX - rect.left) / rect.width - 0.5) * 200
                      const yPos = ((touch.clientY - rect.top) / rect.height - 0.5) * 200
                      x.set(xPos)
                      y.set(yPos)
                    }}
                    onTouchEnd={() => {
                      x.set(0)
                      y.set(0)
                    }}
                    onClick={(e) => e.stopPropagation()}
                    style={{
                      transformStyle: "preserve-3d",
                    }}
                  >
                    <motion.div
                      className={`absolute w-full h-full rounded-xl overflow-hidden border-4 ${
                        getRarityStyles(selectedBulkCard.rarity).border
                      }`}
                      style={{
                        rotateX: rotateX,
                        rotateY: rotateY,
                        transformStyle: "preserve-3d",
                      }}
                    >
                      {/* Full art image takes up the entire card */}
                      <div className="absolute inset-0 w-full h-full">
                        {selectedBulkCard.image_url?.endsWith(".mp4") ? (
                          <video
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover rounded-xl"
                            src={getCloudflareImageUrl(selectedBulkCard.image_url)}
                          />
                        ) : (
                          <img
                            src={getCloudflareImageUrl(selectedBulkCard.image_url)}
                            alt={selectedBulkCard.name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        )}
                      </div>

                      {/* Dynamic light reflection effect */}
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

                      {/* Card Content Overlays */}
                      <div className="absolute inset-0 flex flex-col justify-between">
                        {/* Top section with name */}
                        <div className="pt-1 pl-1">
                          <div className="bg-gradient-to-r from-black/70 via-black/50 to-transparent px-2 py-1 rounded-lg max-w-[85%] backdrop-blur-sm inline-block">
                            <h3 className="font-bold text-white text-lg drop-shadow-md anime-text">
                              {selectedBulkCard.name}
                            </h3>
                          </div>
                        </div>

                        {/* Bottom section with rarity */}
                        <div className="pb-1 pr-1 flex justify-end">
                          <div className="bg-gradient-to-l from-black/70 via-black/50 to-transparent px-2 py-1 rounded-lg flex items-center gap-1 backdrop-blur-sm">
                            <span className="text-white text-sm font-semibold anime-text">
                              {getDisplayRarity(selectedBulkCard.rarity || '').toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Special effects für legendary und godlike cards */}
                      {(selectedBulkCard.rarity === "legendary" ||
                        selectedBulkCard.rarity === "epic" ||
                        selectedBulkCard.rarity === "godlike") && (
                        <motion.div
                          className={`absolute inset-0 pointer-events-none mix-blend-overlay rounded-xl ${
                            selectedBulkCard.rarity === "legendary"
                              ? "bg-yellow-300"
                              : selectedBulkCard.rarity === "godlike"
                                ? "bg-red-300"
                                : "bg-purple-300"
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

                      {/* Shine effect - für legendary und godlike cards */}
                      {(selectedBulkCard.rarity === "legendary" || selectedBulkCard.rarity === "godlike") && (
                        <motion.div
                          className="absolute inset-0 pointer-events-none"
                          style={{
                            background:
                              "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)",
                            backgroundSize: "200% 100%",
                            backgroundPosition: `${reflectionX.get()}% 0%`,
                            opacity: reflectionOpacity,
                          }}
                        />
                      )}
                    </motion.div>
                  </motion.div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Pack Animation Screen */}
          <AnimatePresence>
            {showPackAnimation && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex flex-col items-center justify-center z-50"
              >
                <div className="absolute inset-0 bg-black opacity-80" />
                <div className="relative z-10 flex flex-col items-center">
                  <motion.div
                    className="relative w-80 h-[28rem] mb-8"
                    animate={{
                      y: [0, -15, 0, -15, 0],
                      rotateZ: packOpened ? [0, -5, 5, -3, 0] : 0,
                      scale: packOpened ? [1, 1.1, 0.9, 1.05, 0] : 1,
                    }}
                    transition={{
                      y: {
                        duration: 3,
                        repeat: Number.POSITIVE_INFINITY,
                        repeatType: "reverse",
                      },
                      rotateZ: {
                        duration: 1.2,
                      },
                      scale: {
                        duration: 2,
                      },
                    }}
                  >
                    <img
                      src={
                        activeTab === "god"
                          ? "/godpack-removebg-preview.png"
                          : activeTab === "legendary"
                            ? "/legendarypack.png?v=2"
                            : activeTab === "icon"
                              ? "/icon_pack_echt-removebg-preview.png"
                              : "/regular pack.png?v=2"
                      }
                      alt="Card Pack"
                      className="absolute inset-0 w-full h-full object-contain"
                    />

                    {!packOpened && (
                      <motion.div
                        className="absolute inset-0 bg-white opacity-0 rounded-lg"
                        animate={{
                          opacity: [0, 0.2, 0],
                        }}
                        transition={{
                          duration: 2,
                          repeat: Number.POSITIVE_INFINITY,
                        }}
                      />
                    )}
                  </motion.div>

                  {!packOpened && (
                    <Button
                      onClick={handleOpenPack}
                      className={
                        activeTab === "god"
                          ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-full w-40"
                          : activeTab === "legendary"
                            ? "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 rounded-full w-40"
                            : activeTab === "icon"
                              ? "bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 rounded-full w-40"
                              : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 rounded-full w-40"
                      }
                    >
                      {t("draw.open", "Open")}
                    </Button>
                  )}
                </div>

                {packOpened && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="absolute inset-0 pointer-events-none"
                  >
                    {Array.from({ length: 50 }).map((_, i) => (
                      <motion.div
                        key={i}
                        className={`absolute w-2 h-2 rounded-full ${
                          activeTab === "god"
                            ? "bg-red-400"
                            : activeTab === "legendary"
                              ? "bg-blue-400"
                              : activeTab === "icon"
                                ? "bg-indigo-400"
                                : "bg-orange-400"
                        }`}
                        initial={{
                          x: "50vw",
                          y: "50vh",
                          scale: 0,
                        }}
                        animate={{
                          x: `${Math.random() * 100}vw`,
                          y: `${Math.random() * 100}vh`,
                          scale: [0, 1, 0],
                        }}
                        transition={{
                          duration: 2.5,
                          delay: Math.random() * 0.5,
                        }}
                      />
                    ))}
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Rarity Text Animation */}
          <AnimatePresence>
            {showRarityText && drawnCards.length > 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex flex-col items-center justify-center z-50"
              >
                <div className="absolute inset-0 bg-black opacity-80" />
                {isMultiDraw ? (
                  <div className="relative z-20 flex flex-col items-center justify-center gap-4 h-[60vh]">
                    {drawnCards.map((card, index) => {
                      const slideFromLeft = index % 2 === 0
                      return (
                        <motion.div
                          key={`rarity-${index}`}
                          className="pointer-events-none"
                          initial={{
                            x: slideFromLeft ? "-100vw" : "100vw",
                            opacity: 0,
                          }}
                          animate={{
                            x: 0,
                            opacity: 1,
                          }}
                          transition={{
                            type: "spring",
                            stiffness: 260,
                            damping: 20,
                            mass: 0.8,
                            delay: index * 0.15,
                          }}
                        >
                          <div
                            className={`text-4xl font-bold anime-text ${
                              card?.rarity === "legendary"
                                ? "text-yellow-400"
                                : card?.rarity === "godlike"
                                  ? "text-red-400"
                                  : card?.rarity === "epic"
                                    ? "text-purple-400"
                                    : card?.rarity === "rare"
                                      ? "text-blue-400"
                                      : "text-gray-400"
                            }`}
                          >
                            {getDisplayRarity(card?.rarity)}
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                ) : (
                  <motion.div
                    className="relative z-20 pointer-events-none"
                    initial={{
                      scale: 0,
                      opacity: 0,
                    }}
                    animate={{
                      scale: [0, 3, 2, 1],
                      opacity: [0, 1, 1, 0],
                      y: [0, 0, -50, -100],
                    }}
                    transition={{
                      duration: 2,
                      times: [0, 0.3, 0.7, 1],
                    }}
                  >
                    <div
                      className={`text-5xl font-bold anime-text ${
                        drawnCards[0]?.rarity === "legendary"
                          ? "text-yellow-400"
                          : drawnCards[0]?.rarity === "godlike"
                            ? "text-red-400"
                            : drawnCards[0]?.rarity === "epic"
                              ? "text-purple-400"
                              : drawnCards[0]?.rarity === "rare"
                                ? "text-blue-400"
                                : "text-gray-400"
                      }`}
                    >
                      {getDisplayRarity(drawnCards[0]?.rarity)}
                    </div>
                  </motion.div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Card Display Screen - Only for single and 5-pack draws */}
          <AnimatePresence>
            {showCards && drawnCards.length > 0 && !isBulkDraw && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 flex flex-col items-center justify-center z-50"
              >
                <div className="absolute inset-0 bg-black opacity-80" />
                <div className="relative z-10 flex flex-col items-center">
                  {isMultiDraw ? (
                    <div className="flex gap-1 mb-8 overflow-x-auto max-w-full px-2 h-[60vh]">
                      {drawnCards.map((card, index) => {
                        const rarityStyles = getRarityStyles(card?.rarity)
                        return (
                          <motion.div
                            key={`multi-card-${index}`}
                            onClick={() => setSelectedCardIndex(index)}
                            className={`flex-shrink-0 w-16 h-full rounded-xl overflow-hidden border-4 relative ${rarityStyles.border}`}
                            initial={{ opacity: 0, y: -100 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{
                              delay: index * 0.2,
                              duration: 0.5,
                              type: "spring",
                              stiffness: 260,
                              damping: 20,
                            }}
                          >
                            <div className="absolute inset-0 w-full h-full">
                              {card?.image_url.endsWith(".mp4") ? (
                                <video
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  className="absolute inset-0 w-full h-full object-cover rounded-xl"
                                  src={getCloudflareImageUrl(card.image_url)}
                                />
                              ) : (
                                <img
                                  src={getCloudflareImageUrl(card?.image_url) || "/placeholder.svg?height=400&width=80"}
                                  alt={card?.name || "Card"}
                                  className="absolute inset-0 w-full h-full object-cover object-center"
                                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                    ;(e.target as HTMLImageElement).src = "/placeholder.svg?height=400&width=80"
                                  }}
                                />
                              )}
                            </div>

                            <div className={`absolute inset-0 bg-gradient-to-t ${rarityStyles.gradient} opacity-60`} />

                            <div className="absolute inset-0 flex flex-col justify-end p-1">
                              <div className="bg-black/70 backdrop-blur-sm rounded px-1 py-0.5 flex items-center justify-center">
                                <span className={`text-xs font-bold anime-text ${rarityStyles.text}`}>
                                  {getDisplayRarity(card?.rarity || '').charAt(0).toUpperCase()}
                                </span>
                              </div>
                            </div>

                            {(card?.rarity === "legendary" ||
                              card?.rarity === "epic" ||
                              card?.rarity === "godlike") && (
                              <motion.div
                                className={`absolute inset-0 pointer-events-none mix-blend-overlay rounded-xl ${
                                  card?.rarity === "legendary"
                                    ? "bg-yellow-300"
                                    : card?.rarity === "godlike"
                                      ? "bg-red-300"
                                      : "bg-purple-300"
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

                            {(card?.rarity === "legendary" || card?.rarity === "godlike") && (
                              <motion.div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  background:
                                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.6) 50%, transparent 100%)",
                                  backgroundSize: "200% 100%",
                                }}
                                animate={{
                                  backgroundPosition: ["-200% 0%", "200% 0%"],
                                }}
                                transition={{
                                  duration: 3,
                                  repeat: Number.POSITIVE_INFINITY,
                                  repeatType: "loop",
                                  delay: index * 0.2,
                                }}
                              />
                            )}
                          </motion.div>
                        )
                      })}
                    </div>
                  ) : (
                    getCurrentCard() && (
                      <div className="perspective-1000 mb-8">
                        <motion.div
                          ref={cardRef}
                          className="w-80 h-[30rem] preserve-3d cursor-pointer touch-none"
                          initial={{ rotateY: 0 }}
                          animate={{ rotateY: cardRevealed ? 0 : 180 }}
                          transition={{
                            type: "spring",
                            stiffness: 70,
                            damping: 15,
                            duration: 1.5,
                          }}
                          onMouseMove={handleCardMove}
                          onMouseLeave={handleCardLeave}
                          onTouchMove={handleCardMove}
                          onTouchEnd={handleCardLeave}
                          style={{
                            transformStyle: "preserve-3d",
                          }}
                        >
                          <motion.div
                            className={`absolute w-full h-full backface-hidden rounded-xl overflow-hidden ${
                              getRarityStyles(getCurrentCard()?.rarity).border
                            }`}
                            style={{
                              rotateX: rotateX,
                              rotateY: rotateY,
                              transformStyle: "preserve-3d",
                            }}
                          >
                            <div className="absolute inset-0 w-full h-full">
                              {getCurrentCard()?.image_url.endsWith(".mp4") ? (
                                <video
                                  autoPlay
                                  muted
                                  loop
                                  playsInline
                                  className="absolute inset-0 w-full h-full object-cover rounded-xl"
                                  src={getCloudflareImageUrl(getCurrentCard()?.image_url)}
                                />
                              ) : (
                                <img
                                  src={getCloudflareImageUrl(getCurrentCard()?.image_url) || "/placeholder.svg?height=300&width=200"}
                                  alt={getCurrentCard()?.name}
                                  className="absolute inset-0 w-full h-full object-cover"
                                  onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                    ;(e.target as HTMLImageElement).src = "/placeholder.svg?height=300&width=200"
                                  }}
                                />
                              )}
                            </div>

                            <motion.div
                              className="absolute inset-0 mix-blend-overlay"
                              style={{
                                background:
                                  "radial-gradient(circle at 50% 50%, rgba(255,255,255,0.8) 0%, transparent 50%)",
                                backgroundPosition: `${reflectionX}% ${reflectionY}%`,
                                opacity: Math.max(
                                  0.1,
                                  reflectionOpacity.get() *
                                    (Math.abs(rotateX.get() / 15) + Math.abs(rotateY.get() / 15)),
                                ),
                              }}
                            />

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

                            <div className="absolute inset-0 flex flex-col justify-between">
                              <div className="pt-1 pl-1">
                                <div className="bg-gradient-to-r from-black/70 via-black/50 to-transparent px-2 py-1 rounded-lg max-w-[85%] backdrop-blur-sm inline-block">
                                  <h3 className="font-bold text-white text-lg drop-shadow-md anime-text">
                                    {getCurrentCard()?.name}
                                  </h3>
                                </div>
                              </div>

                              <div className="pb-1 pr-1 flex justify-end">
                                <div className="bg-gradient-to-l from-black/70 via-black/50 to-transparent px-2 py-1 rounded-lg flex items-center gap-1 backdrop-blur-sm">
                                  <span className="text-white text-sm font-semibold anime-text">
                                    {getDisplayRarity(getCurrentCard()?.rarity || '').toUpperCase()}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {(getCurrentCard()?.rarity === "legendary" ||
                              getCurrentCard()?.rarity === "epic" ||
                              getCurrentCard()?.rarity === "godlike") && (
                              <motion.div
                                className={`absolute inset-0 pointer-events-none mix-blend-overlay rounded-xl ${
                                  getCurrentCard()?.rarity === "legendary"
                                    ? "bg-yellow-300"
                                    : getCurrentCard()?.rarity === "godlike"
                                      ? "bg-red-300"
                                      : "bg-purple-300"
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

                            {(getCurrentCard()?.rarity === "legendary" || getCurrentCard()?.rarity === "godlike") && (
                              <motion.div
                                className="absolute inset-0 pointer-events-none"
                                style={{
                                  background:
                                    "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.8) 50%, transparent 100%)",
                                  backgroundSize: "200% 100%",
                                  backgroundPosition: `${reflectionX.get()}% 0%`,
                                  opacity: reflectionOpacity,
                                }}
                              />
                            )}
                          </motion.div>

                          <div className="absolute w-full h-full backface-hidden rotateY-180 rounded-xl bg-gradient-to-b from-blue-800 to-purple-900 border-4 border-yellow-500 flex items-center justify-center">
                            <div className="text-white text-center">
                              <h3 className="font-bold text-2xl anime-text">ANIME WORLD</h3>
                            </div>
                          </div>
                        </motion.div>
                      </div>
                    )
                  )}

                  <Button
                    onClick={() => finishCardReview()}
                    disabled={isUpdatingScore}
                    className={
                      activeTab === "god"
                        ? "bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 px-8 rounded-full"
                        : activeTab === "legendary"
                          ? "bg-gradient-to-r from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 px-8 rounded-full"
                          : activeTab === "icon"
                            ? "bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 px-8 rounded-full"
                            : "bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 px-8 rounded-full"
                    }
                    size="lg"
                  >
                    {isUpdatingScore ? (
                      <div className="flex items-center">
                        <div className="h-5 w-5 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                        <span>{t("common.updating", "Updating...")}</span>
                      </div>
                    ) : (
                      isMultiDraw ? t("draw.add_cards_to_collection", "Add Cards to Collection") : t("draw.add_card_to_collection", "Add Card to Collection")
                    )}
                  </Button>

                  {selectedCardIndex !== null && (
                    <motion.div
                      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className="relative w-full max-w-xs aspect-[9/16]">
                        <motion.div
                          className={`relative w-full h-full rounded-xl overflow-hidden border-4 ${
                            getRarityStyles(getSelectedCard()?.rarity).border
                          }`}
                          initial={{ scale: 0.9 }}
                          animate={{ scale: 1 }}
                          transition={{ type: "spring", stiffness: 120 }}
                        >
                          {getSelectedCard()?.image_url.endsWith(".mp4") ? (
                            <video
                              autoPlay
                              muted
                              loop
                              playsInline
                              className="absolute inset-0 w-full h-full object-cover rounded-xl"
                              src={getCloudflareImageUrl(getSelectedCard()?.image_url)}
                            />
                          ) : (
                            <img
                              src={getCloudflareImageUrl(getSelectedCard()?.image_url) || "/placeholder.svg?height=400&width=300"}
                              alt={getSelectedCard()?.name || "Card"}
                              className="absolute inset-0 w-full h-full object-cover object-center rounded-xl"
                            />
                          )}
                        </motion.div>

                        <button
                          onClick={() => setSelectedCardIndex(null)}
                          className="absolute top-2 right-2 bg-white/90 hover:bg-white text-gray-800 px-3 py-1 rounded-full text-sm font-medium shadow"
                        >
                          Close
                        </button>
                      </div>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* XP Gain Animation */}
          <AnimatePresence>
            {showXpAnimation && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
              >
                <motion.div
                  className="bg-white rounded-xl p-6 shadow-lg flex flex-col items-center gap-2 border-2 border-violet-300"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: [0, 1.2, 1],
                    opacity: [0, 1, 1, 0],
                  }}
                  transition={{
                    duration: 1,
                    times: [0, 0.3, 0.5, 1],
                  }}
                >
                  <div className="text-2xl font-bold text-violet-600">+{xpGained} XP</div>
                  <div className="flex items-center gap-2">
                    <Star className="h-8 w-8 text-violet-500" />
                  </div>
                </motion.div>

                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div
                    key={`particle-${i}`}
                    className="absolute rounded-full bg-violet-500"
                    style={{
                      width: Math.random() * 6 + 2,
                      height: Math.random() * 6 + 2,
                    }}
                    initial={{
                      x: "50%",
                      y: "50%",
                      opacity: 0,
                    }}
                    animate={{
                      x: `${Math.random() * 100}%`,
                      y: `${Math.random() * 100}%`,
                      opacity: [0, 0.8, 0],
                    }}
                    transition={{
                      duration: 0.8,
                      delay: Math.random() * 0.2,
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Level Up Animation */}
          <AnimatePresence>
            {showLevelUpAnimation && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center"
              >
                <div className="absolute inset-0 bg-black/70" />
                <motion.div
                  className="relative z-10 bg-white rounded-xl p-6 shadow-lg flex flex-col items-center gap-4 border-2 border-amber-400"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{
                    scale: [0, 1.2, 1],
                    opacity: 1,
                  }}
                  transition={{
                    duration: 0.5,
                    times: [0, 0.7, 1],
                  }}
                >
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.3, duration: 0.5 }}
                  >
                    <div className="w-20 h-20 rounded-full bg-gradient-to-r from-amber-400 to-amber-600 flex items-center justify-center mb-2">
                      <Star className="h-10 w-10 text-white" />
                    </div>
                  </motion.div>

                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.5, duration: 0.5 }}
                  >
                    <h2 className="text-2xl font-bold text-center">{t("draw.level_up", "Level Up!")}</h2>
                    <p className="text-lg font-medium text-center text-amber-600">{t("draw.reached_level", "You reached Level {level}!", { level: newLevel })}</p>
                    <p className="text-sm text-center text-gray-600 mt-1">{t("draw.leaderboard_points", "+100 Leaderboard Points")}</p>
                  </motion.div>

                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.9, duration: 0.5 }}
                    className="mt-4"
                  >
                    <Button
                      onClick={() => {
                        setShowLevelUpAnimation(false)
                        resetStates()
                      }}
                      className="bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white px-8"
                    >
                      {t("common.continue", "Continue")}
                    </Button>
                  </motion.div>
                </motion.div>

                {Array.from({ length: 30 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="absolute w-2 h-2 rounded-full bg-amber-400"
                    initial={{
                      x: "50%",
                      y: "50%",
                      opacity: 0,
                    }}
                    animate={{
                      x: `${Math.random() * 100}%`,
                      y: `${Math.random() * 100}%`,
                      opacity: [0, 1, 0],
                    }}
                    transition={{
                      duration: 2,
                      delay: Math.random() * 0.5,
                      ease: "easeOut",
                    }}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {!wheelSpinning && <MobileNav />}
      </div>
      {/* Tailwind Safelist Dummy für alle Rarity-Farben
      // Damit Tailwind die Farben garantiert ins CSS aufnimmt */}
      <div className="hidden">
        bg-gray-100 text-gray-600
        bg-blue-100 text-blue-600
        bg-purple-100 text-purple-600
        bg-yellow-100 text-yellow-600
        bg-red-100 text-red-600
      </div>
    </ProtectedRoute>
  )
}
