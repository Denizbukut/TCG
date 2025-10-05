"use client"

import { useState, useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { useAuth } from "@/contexts/auth-context"
import { claimDailyBonus } from "@/app/actions"
import { getReferredUsers } from "@/app/actions/referrals"
import { getDailyDeal, getSpecialDeal } from "@/app/actions/deals" // Import getSpecialDeal
import { getActiveTimeDiscount } from "@/app/actions/time-discount" // Import time discount function
import { getSBCChallenges, getUserSBCProgress, type SBCChallenge, type SBCUserProgress } from "@/app/actions/sbc"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import CardCatalog from "@/components/card-catalog"
import { useRouter } from "next/navigation"
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
  Send,
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
} from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import DealOfTheDayDialog from "@/components/deal-of-the-day-dialog"
import { MiniKit, Tokens, tokenToDecimals, type PayCommandInput } from "@worldcoin/minikit-js"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { claimReferralRewardForUser } from "@/app/actions/referrals"
import { Progress } from "@/components/ui/progress" // Import Progress component
import { renderStars } from "@/utils/card-stars"

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
  icon_tickets: number
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
  const [referredUsers, setReferredUsers] = useState<
  {
    id: number
    username: string
    level: number
    reward_claimed: boolean
  }[]
>([])
  
  const [currentXpColor, setCurrentXpColor] = useState("pink")
  // const [iconTickets, setIconTickets] = useState(0)
  
  // SBC State variables
  const [sbcChallenges, setSbcChallenges] = useState<SBCChallenge[]>([])
  const [sbcUserProgress, setSbcUserProgress] = useState<SBCUserProgress[]>([])
  const [sbcLoading, setSbcLoading] = useState(false)
  
  // Referrals/SBC Slide system
  const [referralSbcIndex, setReferralSbcIndex] = useState<number>(0)
  
  // SBC Helper functions
  const isChallengeCompleted = (challengeId: number) => {
    return sbcUserProgress.some(progress => progress.challenge_id === challengeId && progress.is_completed)
  }

  const getDifficultyColor = (challenge: SBCChallenge) => {
    if (challenge.requirements_team_rating) {
      if (challenge.requirements_team_rating >= 90) return 'bg-red-500'
      if (challenge.requirements_team_rating >= 80) return 'bg-orange-500'
      if (challenge.requirements_team_rating >= 70) return 'bg-yellow-500'
      return 'bg-green-500'
    }
    return 'bg-blue-500'
  }

  const getDifficultyText = (challenge: SBCChallenge) => {
    if (challenge.requirements_team_rating) {
      if (challenge.requirements_team_rating >= 90) return 'Legendary'
      if (challenge.requirements_team_rating >= 80) return 'Hard'
      if (challenge.requirements_team_rating >= 70) return 'Medium'
      return 'Easy'
    }
    return 'Easy'
  }
  
  const referralSbcSlides = [
    {
      key: 'referrals',
      title: 'Referrals',
      icon: <Gift className="h-8 w-8 text-yellow-600" />,
      bg: 'from-[#232526] to-[#414345]',
      border: 'border-yellow-400',
      text: 'Invite friends & earn rewards!',
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

  useEffect(() => {
    if (user?.username) {
      loadUserXpColor()
    }
  }, [user?.username])

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


  const loadUserXpColor = async () => {
    if (!user?.username) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    const { data, error } = await supabase
      .from("users")
      .select("xp_color")
      .eq("wallet_address", user.wallet_address)
      .single()

    if (!error && data?.xp_color) {
      setCurrentXpColor(String(data.xp_color))
    }
  }

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

  // Refs to track if effects have run
  const hasCheckedDailyDeal = useRef(false) // Renamed for clarity
  const hasCheckedClaims = useRef(false)
  const hasCheckedRewards = useRef(false)
  const hasCheckedTokens = useRef(false)
  const hasCheckedClan = useRef(false)
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

  const ticketClaimAmount = 1

  // Add the router constant inside the component:
  const router = useRouter()
  useEffect(() => {
    if (user?.username === "llegaraa2kwdd" || user?.username === "nadapersonal" || user?.username === "regresosss") {
      router.push("/login")
    }
  }, [user?.username, router])

  const sendPayment = async () => {
    const dollarPrice = 17
    const ticketAmount = 500
    const ticketType = "regular"

    try {
      // WLD-Betrag berechnen (fallback = 1:1)
      const roundedWldAmount = Number.parseFloat((price ? dollarPrice / price : dollarPrice).toFixed(3))
  
      const res = await fetch("/api/initiate-payment", { method: "POST" })
      const { id } = await res.json()
  
      const payload: PayCommandInput = {
        reference: id,
        to: "0x9311788aa11127F325b76986f0031714082F016B",
        tokens: [
          {
            symbol: Tokens.WLD,
            token_amount: tokenToDecimals(roundedWldAmount, Tokens.WLD).toString(),
          },
        ],
        description: " ",
      }
      const { finalPayload } = await MiniKit.commandsAsync.pay(payload)
  
      if (finalPayload.status === "success") {
        // Payment successful
        await handleBuyTickets(ticketAmount, ticketType)
      } else {
        toast({
          title: "Payment Failed",
          description: "Your payment could not be processed. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Payment error:", error)
      toast({
        title: "Payment Error",
        description: "An error occurred during payment. Please try again.",
        variant: "destructive",
      })
    }
  }
  // Handle buying tickets
  const handleBuyTickets = async (ticketAmount: number, ticketType: "regular" | "legendary") => {
      if (!user?.username) {
        toast({
          title: "Error",
          description: "You must be logged in to purchase tickets",
          variant: "destructive",
        })
        return
      }
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) {
          throw new Error("Could not connect to database")
        }
        // Get current ticket counts
        const { data: userData, error: fetchError } = await supabase
          .from("users")
        .select("tickets, legendary_tickets")
          .eq("wallet_address", user.wallet_address)
          .single()
        if (fetchError) {
          throw new Error("Could not fetch user data")
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
        const { error: updateError } = await supabase
          .from("users")
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
  // Fetch user's clan info
  useEffect(() => {
    if (user?.username && !hasCheckedClan.current) {
      // User data loaded
      hasCheckedClan.current = true

      const fetchClanInfo = async () => {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        try {
          // First check if user has a clan_id
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("clan_id")
            .eq("wallet_address", user.wallet_address)
            .single()

          if (userError || !userData || !userData.clan_id) {
            // User is not in a clan
            setUserClanInfo(null)
            return
          }

          // Get clan details using the clan_id
          const { data: clanData, error: clanError } = await supabase
            .from("clans")
            .select("id, name, level, member_count")
            .eq("id", userData.clan_id)
            .single()

          if (clanError || !clanData) {
            console.error("Error fetching clan data:", clanError)
            setUserClanInfo(null)
            return
          }

          setUserClanInfo({
            id: String(clanData.id),
            name: String(clanData.name),
            level: typeof clanData.level === "number" ? clanData.level : 1,
            member_count: typeof clanData.member_count === "number" ? clanData.member_count : 1,
          })
        } catch (error) {
          console.error("Error in fetchClanInfo:", error)
          setUserClanInfo(null)
        }
      }

      fetchClanInfo()
    }
  }, [user?.username, user])

  useEffect(() => {
    if (user?.username) {
      const loadReferrals = async () => {
        try {
          const referrals = await getReferredUsers(user.wallet_address)
          setReferredUsers(referrals)
        } catch (error) {
          console.error("Error loading referrals:", error)
          setReferredUsers([])
        }
      }
      loadReferrals()
    }
  }, [user?.username])

  // Load SBC data
  useEffect(() => {
    if (user?.username) {
      const loadSBCData = async () => {
        setSbcLoading(true)
        try {
          const [challengesData, progressData] = await Promise.all([
            getSBCChallenges(),
            getUserSBCProgress(user.wallet_address)
          ])
          setSbcChallenges(challengesData)
          setSbcUserProgress(progressData)
        } catch (error) {
          console.error('Error loading SBC data:', error)
          setSbcChallenges([])
          setSbcUserProgress([])
        } finally {
          setSbcLoading(false)
        }
      }
      loadSBCData()
    }
  }, [user?.username])

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
          const { data, error } = await supabase.from("users").select("world_id").eq("wallet_address", user.wallet_address).single()

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

  // Check for daily deal - only once when user data is available
  useEffect(() => {
    if (user?.username && !hasCheckedDailyDeal.current) {
      hasCheckedDailyDeal.current = true
      checkDailyDeal()
    }
  }, [user?.username])

  // Check discount status on page load
  useEffect(() => {
    checkDiscountStatus()
  }, [])


  // Check for daily deal
  const checkDailyDeal = async () => {
    if (!user?.username) return

    setDailyDealLoading(true)
    try {
      const result = await getDailyDeal(user.wallet_address)

      if (result.success && result.deal) {
        setDailyDeal(result.deal)
        setDailyDealInteraction(result.interaction ?? null)

        // Show the deal dialog automatically if it hasn't been seen or dismissed
        if (!result.interaction.seen && !result.interaction.dismissed && !result.interaction.purchased) {
          setShowDailyDealDialog(true)
        }
      }
    } catch (error) {
    } finally {
      setDailyDealLoading(false)
    }
  }

  // Check discount status
  const checkDiscountStatus = async () => {
    try {
      const result = await getActiveTimeDiscount()
      setHasActiveDiscount(result.success && result.data !== null)
      if (result.success && result.data) {
        setDiscountValue(Math.round(result.data.value * 100))
      }
    } catch (error) {
      console.error("Error checking discount status:", error)
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
        const { data, error } = await supabase
          .from("users")
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
          const { data: premiumData, error: premiumError } = await supabase
            .from("premium_passes")
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
        const { data: claimedRewardsData, error: claimedRewardsError } = await supabase
          .from("claimed_rewards")
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
          const claimedReward = claimedRewardsData?.find((reward) => reward.level === i)

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
            description: "You've claimed 1 ticket as your daily bonus!",
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
          description: "You've already claimed your tickets. Check back later!",
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

    // Close the dialog
    setShowDailyDealDialog(false)

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
      title: 'Game Pass',
      icon: <Crown className="h-8 w-8 text-amber-800" />, 
      bg: 'from-amber-400 to-amber-600',
      border: 'border-yellow-100',
      text: 'Claim rewards!',
      href: '/pass',
      color: 'text-yellow-700',
      dot: 'bg-yellow-500',
    },
    {
      key: 'xppass',
      title: 'XP Pass',
      icon: <Sparkles className="h-8 w-8 text-blue-800" />, 
      bg: 'from-blue-400 to-blue-600',
      border: 'border-blue-100',
      text: 'Boost your XP gain!', // Nur kurzer Text, keine Benefits und kein Kaufen-Button
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
          await supabase.from("xp_passes").update({ active: false }).eq("wallet_address", user.wallet_address).eq("id", data.id);
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
          await supabase.from("premium_passes").update({ active: false }).eq("wallet_address", user.wallet_address).eq("id", data.id);
          await supabase.from("users").update({ has_premium: false }).eq("username", user.username);
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
    toast({ title: 'XP Pass gekauft!', description: 'Du hast jetzt den XP Pass aktiviert.' })
    // Optional: In DB speichern, dass XP Pass aktiv ist
  }

  // useEffect für Special Deal
  useEffect(() => {
    if (user?.username && !hasCheckedSpecialDeal.current) {
      hasCheckedSpecialDeal.current = true;
      (async () => {
        setSpecialDealLoading(true);
        try {
          const result = await getSpecialDeal(user.wallet_address);
          if (result.success && result.deal) {
            setSpecialDeal(result.deal);
            setSpecialDealInteraction(result.interaction ?? null);
          }
        } catch (e) {
          // Fehler ignorieren
        } finally {
          setSpecialDealLoading(false);
        }
      })();
    }
  }, [user?.username]);

  // Test-URL (Cloudflare)
  const testUrl = 'https://fda1523f9dc7558ddc4fcf148e01a03a.r2.cloudflarestorage.com/world-soccer/Za%C3%AFre-Emery-removebg-preview.png';
  // Test-URL (Wikipedia)
  const wikiUrl = 'https://upload.wikimedia.org/wikipedia/commons/4/47/PNG_transparency_demonstration_1.png';


  // State for purchase loading status
  const [buyingDailyDeal, setBuyingDailyDeal] = useState(false);
  const [buyingSpecialDeal, setBuyingSpecialDeal] = useState(false)
  const [showSpecialDealSuccess, setShowSpecialDealSuccess] = useState(false);

  // Direct purchase handler for Daily Deal
  const handleBuyDailyDeal = async () => {
    if (!user?.username || !dailyDeal) return;
    setBuyingDailyDeal(true);
    try {
      // Here call the purchase logic for dailyDeal (e.g. purchaseDeal API)
      // await purchaseDeal(dailyDeal.id, user.username);
      toast({ title: 'Deal purchased!', description: 'Your deal was successfully purchased.' });
      // Optional: Update tickets, close dialog etc.
    } catch (e) {
      toast({ title: 'Error', description: 'Purchase failed', variant: 'destructive' });
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
    if (!specialDeal) return false;
    
    try {
      // Calculate the discounted price
      const discountedPrice = specialDeal.discount_percentage && specialDeal.discount_percentage > 0 
        ? specialDeal.price * (1 - specialDeal.discount_percentage / 100)
        : specialDeal.price;
      
      const dollarAmount = discountedPrice;
      const fallbackWldAmount = discountedPrice;
      const wldAmount = price ? dollarAmount / price : fallbackWldAmount;
      
      
      const {commandPayload, finalPayload} = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: WLD_TOKEN,
            abi: erc20TransferAbi,
            functionName: "transfer",
            args: ["0x9311788aa11127F325b76986f0031714082F016B", tokenToDecimals(parseFloat(wldAmount.toFixed(2)), Tokens.WLD).toString()],
          },

        ],
      })
     

    

      if (finalPayload.status === "success") {
        console.log("success sending special deal payment");
        return true;
      } else {
        console.log("payment failed:", finalPayload);
        return false;
      }
    } catch (error) {
      console.error("Error sending special deal payment:", error);
      return false;
    }
  };

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
          const { error: purchaseRecordError } = await supabase
            .from("special_deal_purchases")
            .insert({
              user_id: user.username,
              special_deal_id: specialDeal.id,
              purchased_at: new Date().toISOString(),
            });

          if (purchaseRecordError) {
            console.error("Error recording special deal purchase:", purchaseRecordError);
            // Trotz Fehler fortfahren, da der Kauf bereits bezahlt wurde
          }

          // 2. Karte zur Sammlung hinzufügen (using user_card_instances)
          const { error: insertCardError } = await supabase.from("user_card_instances").insert({
            user_id: user.username,
            card_id: specialDeal.card_id,
            level: specialDeal.card_level,
            favorite: false,
            obtained_at: new Date().toISOString(),
          });

          if (insertCardError) {
            console.error("Error adding card to collection:", insertCardError);
          }

          // 2. Tickets hinzufügen
          const { data: userData, error: userError } = await supabase
            .from("users")
            .select("tickets, elite_tickets, icon_tickets")
            .eq("wallet_address", user.wallet_address)
            .single();

          if (!userError && userData) {
            const currentTickets = Number(userData.tickets) || 0;
            const currentEliteTickets = Number(userData.elite_tickets) || 0;
            // const currentIconTickets = Number(userData.icon_tickets) || 0;
            
            const newTickets = currentTickets + specialDeal.classic_tickets;
            const newEliteTickets = currentEliteTickets + specialDeal.elite_tickets;
            // const newIconTickets = currentIconTickets + (specialDeal.icon_tickets || 0);

            const { error: updateError } = await supabase
              .from("users")
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
        className="flex flex-col min-h-screen text-white relative overflow-y-auto"
        style={{
          backgroundImage: 'url("/hintergrung.png")',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          backgroundAttachment: 'fixed',
          overscrollBehavior: 'none'
        }}
      >
        {/* Header with glass effect */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-gradient-to-br from-[#232526]/90 to-[#414345]/90 border-b-2 border-yellow-400 shadow-sm">
          <div className="w-full px-4 py-3 flex items-center justify-between">
            <div className="flex items-center">
              <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent">
                CRYPTO TCG
              </h1>
              {/* Social Icon Buttons */}
              <div className="flex gap-2 ml-3 items-center">
                <a
                  href="https://x.com/ani_labs_world"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-black flex items-center justify-center transition-transform hover:scale-105 shadow border-2 border-white"
                  aria-label="Twitter"
                >
                  <span className="sr-only">Twitter</span>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white">
                    <path d="M17.53 3H21.5L14.36 10.66L22.75 21H16.28L11.22 14.73L5.52 21H1.54L9.04 12.76L1 3H7.6L12.18 8.67L17.53 3ZM16.4 19.13H18.18L7.45 4.76H5.54L16.4 19.13Z" fill="currentColor"/>
                  </svg>
                </a>
                <a
                  href="https://t.me/c/2551554609/13381"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center transition-transform hover:scale-105 shadow border-2 border-white"
                  aria-label="Telegram"
                >
                  <span className="sr-only">Telegram</span>
                  <Send className="w-4 h-4 text-white" />
      </a>
      
      {/* Tickets neben dem Telegram Icon */}
      <div className="flex items-center gap-2 ml-2">
        <div className="flex flex-col items-center justify-center bg-gradient-to-br from-[#232526] to-[#414345] px-2 py-1 rounded-full shadow-sm border-2 border-blue-400 min-w-[54px]">
          <Ticket className="h-4 w-4 text-blue-400 mx-auto" />
          <span className="font-medium text-xs text-center text-blue-100">{tickets}</span>
        </div>
        <div className="flex flex-col items-center justify-center bg-gradient-to-br from-[#232526] to-[#414345] px-2 py-1 rounded-full shadow-sm border-2 border-purple-400 min-w-[54px]">
          <Ticket className="h-4 w-4 text-purple-400 mx-auto" />
          <span className="font-medium text-xs text-center text-purple-100">{eliteTickets}</span>
        </div>
      </div>
    </div>
            </div>
  </div>
</header>

        <main className="w-full px-2 md:px-6 flex-1 overflow-y-auto overscroll-contain"> {/* Padding hinzugefügt */}
         
          <div className="grid grid-cols-6 gap-3 mt-2 pb-4">
            {/* Profile */}
            <div className="col-span-3">
              {/* ...Profile Card... */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
                className="bg-gradient-to-br from-[#232526] to-[#414345] rounded-xl shadow-lg p-2 flex flex-col items-center justify-center min-h-[80px] h-full border-2 border-yellow-400 relative"
              >
                {/* XP Progress Circle with Username and Level */}
                <div className="relative w-32 h-32 flex items-center justify-center">
                  {/* XP Progress Ring */}
                  <div className="absolute inset-0 rounded-full pointer-events-none">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 128 128">
                      {/* Background circle */}
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="rgb(156 163 175)"
                        strokeWidth="4"
                        fill="none"
                        opacity="0.8"
                      />
                      {/* Progress circle */}
                      <circle
                        cx="64"
                        cy="64"
                        r="56"
                        stroke="url(#gradient)"
                        strokeWidth="4"
                        fill="none"
                        strokeLinecap="round"
                        strokeDasharray={`${2 * Math.PI * 56}`}
                        strokeDashoffset={`${2 * Math.PI * 56 * (1 - ((user?.experience || 0) / (user?.nextLevelExp || 500)))}`}
                        className="transition-all duration-300"
                        style={{ filter: 'drop-shadow(0 0 3px rgba(239, 68, 68, 0.5))' }}
                      />
                      <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                          <stop offset="0%" stopColor={XP_COLORS[currentXpColor as keyof typeof XP_COLORS]?.start || XP_COLORS.pink.start} />
                          <stop offset="100%" stopColor={XP_COLORS[currentXpColor as keyof typeof XP_COLORS]?.end || XP_COLORS.pink.end} />
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>
                  
                  {/* Username und Level in der Mitte */}
                  <div className="flex flex-col items-center justify-center text-center">
                    <p className="text-sm font-semibold text-yellow-100 leading-tight">
                      {user?.username ? (user.username.length > 10 ? user.username.slice(0, 10) + '…' : user.username) : ''}
                    </p>
                    <span className="bg-yellow-400 text-white text-sm px-2 py-1 rounded-full whitespace-nowrap font-bold mt-1">
                      Lvl {user?.level || 1}
                    </span>
                  </div>
                </div>
              </motion.div>
</div>
            {/* Game Pass / XP Pass Carousel */}
            <div className="col-span-3">
              <div className="relative flex flex-col items-center">
                <div className="w-full relative">
                  {/* Left Arrow */}
                  <button
                    onClick={handlePrev}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-white/70 hover:bg-white shadow transition opacity-100"
                    style={{ pointerEvents: 'auto' }}
                    aria-label="Previous Pass"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-400" />
                  </button>
                  {/* Right Arrow */}
                  <button
                    onClick={handleNext}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 p-1.5 rounded-full bg-white/70 hover:bg-white shadow transition opacity-100"
                    style={{ pointerEvents: 'auto' }}
                    aria-label="Next Pass"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  </button>
                  <AnimatePresence initial={false} mode="wait">
                    <motion.div
                      key={passSlides[passIndex].key}
                      initial={{ x: 100, opacity: 0 }}
                      animate={{ x: 0, opacity: 1 }}
                      exit={{ x: -100, opacity: 0 }}
                      transition={{ duration: 0.5 }}
                      className={`relative flex flex-col items-center justify-center rounded-xl p-3 min-h-[90px] shadow-lg font-bold text-center bg-gradient-to-b ${passSlides[passIndex].bg} border ${passSlides[passIndex].border} cursor-pointer`}
                      onClick={() => router.push(passSlides[passIndex].href)}
                      tabIndex={0}
                      role="button"
                      aria-label={`Open ${passSlides[passIndex].title}`}
                    >
                      <div className="w-14 h-14 rounded-full flex items-center justify-center bg-white/90 text-2xl mb-2 relative shadow-lg">
                        {passSlides[passIndex].icon}
                      </div>
                      <div className={`text-lg font-bold ${passSlides[passIndex].color}`}>{passSlides[passIndex].title}</div>
                      <div className="text-xs text-gray-700 font-medium">{passSlides[passIndex].text}</div>
                      {/* Indicator dots in the card */}
                      <div className="flex gap-2 mt-3 justify-center w-full">
                        {passSlides.map((slide, idx) => (
                          <span key={slide.key} className={`w-2 h-2 rounded-full ${passIndex === idx ? slide.dot : 'bg-gray-300'}`}></span>
                        ))}
                      </div>
                    </motion.div>
                  </AnimatePresence>
                </div>
              </div>
            </div>
            {/* Weekly Contest (volle Breite) - COMMENTED OUT */}
            {/* <div className="col-span-6">
<motion.div
  initial={{ opacity: 0, y: 20, scale: 0.95 }}
  animate={{ opacity: 1, y: 0, scale: 1 }}
  transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
  whileHover={{ scale: 1.03, boxShadow: '0 0 32px 0 rgba(255, 215, 0, 0.25)' }}
  className="relative w-full bg-gradient-to-br from-[#232526] to-[#414345] text-white rounded-2xl p-6 shadow-2xl flex items-center justify-between border-4 border-yellow-400 min-h-[90px] mt-3 overflow-hidden cursor-pointer"
  onClick={() => router.push('/weekly-contest')}
>
  {/* Shine Effekt */}
  {/* <motion.div
    className="absolute inset-0 pointer-events-none"
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
  >
    <motion.div
      className="absolute left-[-40%] top-0 w-1/2 h-full bg-gradient-to-r from-transparent via-yellow-200/40 to-transparent skew-x-[-20deg]"
      animate={{ left: ['-40%', '120%'] }}
      transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  </motion.div>
  <div className="flex items-center gap-4 z-10">
    <motion.div
      animate={{ y: [0, -12, 0] }}
      transition={{ duration: 2, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut' }}
      className="flex flex-col items-center"
    >
      <Trophy className="w-10 h-10 text-yellow-400 drop-shadow-lg" />
    </motion.div>
    <div>
      <div className="text-lg font-bold text-yellow-300 mb-1" style={{ letterSpacing: 1 }}>
        Win $200 in WLD!
      </div>
      <h3 className="text-xl font-bold text-yellow-100 mb-1">Weekly Contest</h3>
      <p className="text-sm text-white/80 font-medium">Compete for the top spot!</p>
      {isContestActive() && (() => {
        const timeLeft = formatContestCountdown(contestCountdown)
        return timeLeft ? (
          <div className="mt-3">
            <div className="bg-gradient-to-r from-yellow-400/20 to-orange-400/20 border border-yellow-400/40 rounded-xl p-3 backdrop-blur-sm shadow-lg">
              <div className="flex items-center justify-center gap-2">
                <div className="relative">
                  <Clock className="w-4 h-4 text-yellow-300 animate-pulse" />
                  <div className="absolute inset-0 w-4 h-4 bg-yellow-300/20 rounded-full animate-ping"></div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 bg-yellow-400/30 rounded-lg px-2 py-1">
                    <span className="text-sm font-bold text-yellow-300">{timeLeft.days}</span>
                    <span className="text-xs text-yellow-200">d</span>
                  </div>
                  <span className="text-yellow-300 font-bold">:</span>
                  <div className="flex items-center gap-1 bg-yellow-400/30 rounded-lg px-2 py-1">
                    <span className="text-sm font-bold text-yellow-300">{timeLeft.hours}</span>
                    <span className="text-xs text-yellow-200">h</span>
                  </div>
                  <span className="text-yellow-300 font-bold">:</span>
                  <div className="flex items-center gap-1 bg-yellow-400/30 rounded-lg px-2 py-1">
                    <span className="text-sm font-bold text-yellow-300">{timeLeft.minutes}</span>
                    <span className="text-xs text-yellow-200">m</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null
      })()}
    </div>
  </div>
  <motion.div
    className="bg-yellow-400/20 rounded-full p-3 backdrop-blur-sm z-10 border-2 border-yellow-300 shadow-lg"
    animate={{ x: [0, 5, 0] }}
    transition={{ duration: 1.5, repeat: Infinity, repeatType: 'reverse' }}
  >
    <ChevronRight className="w-6 h-6 text-yellow-300" />
  </motion.div>
  {/* Animierter Schatten */}
  {/* <motion.div
    className="absolute inset-0 rounded-2xl pointer-events-none"
    animate={{ boxShadow: [
      '0 4px 24px 0 rgba(255, 215, 0, 0.10)',
      '0 8px 32px 0 rgba(255, 215, 0, 0.18)',
      '0 4px 24px 0 rgba(255, 215, 0, 0.10)'
    ] }}
    transition={{ duration: 2.5, repeat: Infinity, repeatType: 'reverse', ease: 'easeInOut' }}
  />
</motion.div>
      </div> */}
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
            {/* Shop in der Mitte, Card Gallery daneben, Referrals rechts */}
            <div className="col-span-6 grid grid-cols-3 gap-3">
              {/* Card Gallery */}
              <div className="relative">
                <Link href="/collection" className="block w-full h-full">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                    whileHover={{ scale: 1.04, boxShadow: '0 0 32px 0 rgba(255, 215, 0, 0.25)' }}
                    className="bg-gradient-to-br from-[#232526] to-[#414345] rounded-xl shadow-lg p-3 h-full border-2 border-yellow-400 cursor-pointer flex flex-col items-center justify-center text-center"
                  >
                    <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center mb-1 border border-yellow-300">
                      <BookOpen className="h-5 w-5 text-white drop-shadow-lg" />
                    </div>
                    <div className="text-sm font-bold text-yellow-100">Card Gallery</div>
                    <div className="text-xs text-sky-400">Browse Cards</div>
                  </motion.div>
                </Link>
              </div>

              {/* Shop */}
              <div className="relative">
                {hasActiveDiscount && (
                  <div className="absolute -top-2 -right-2 bg-white text-red-600 text-[10px] font-bold px-1.5 py-0.5 rounded-full shadow z-10">
                    -{discountValue}%
                  </div>
                )}
                <Link href="/shop" className="block w-full h-full">
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.4 }}
                    whileHover={{ scale: 1.04, boxShadow: hasActiveDiscount ? '0 0 32px 0 rgba(239, 68, 68, 0.4)' : '0 0 32px 0 rgba(255, 215, 0, 0.25)' }}
                    className={`relative rounded-2xl p-3 shadow-2xl flex flex-col items-center justify-center min-h-[70px] h-full text-center border-2 transition overflow-hidden ${
                      hasActiveDiscount 
                        ? 'bg-gradient-to-br from-red-600 to-red-800 border-red-400 animate-pulse' 
                        : 'bg-gradient-to-br from-[#232526] to-[#414345] border-yellow-400'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 border ${
                      hasActiveDiscount 
                        ? 'bg-red-400 shadow-[0_0_8px_2px_rgba(239,68,68,0.3)] border-red-300' 
                        : 'bg-yellow-400 shadow-[0_0_8px_2px_rgba(251,191,36,0.18)] border-yellow-300'
                    }`}>
                      <ShoppingCart className="h-5 w-5 text-white drop-shadow-lg" />
                    </div>
                    <div className={`text-sm font-extrabold drop-shadow-sm tracking-wide ${
                      hasActiveDiscount ? 'text-red-100' : 'text-yellow-100'
                    }`}>Shop</div>
                    <div className={`text-xs font-semibold mt-0.5 ${
                      hasActiveDiscount ? 'text-red-200' : 'text-sky-400'
                    }`}>Exklusive Packs</div>
                  </motion.div>
                </Link>
              </div>

              {/* Referrals/SBC Slide System */}
              <div className="relative w-full h-full rounded-xl overflow-hidden">
                <AnimatePresence mode="wait">
                  <motion.div
                    key={referralSbcSlides[referralSbcIndex].key}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className={`w-full h-full rounded-xl bg-gradient-to-br ${referralSbcSlides[referralSbcIndex].bg} p-2 shadow-lg flex flex-col items-center justify-center min-h-[70px] text-center font-bold border-2 ${referralSbcSlides[referralSbcIndex].border} relative cursor-pointer`}
                    onClick={referralSbcSlides[referralSbcIndex].action}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-1 border`}>
                      {referralSbcSlides[referralSbcIndex].icon}
                    </div>
                    <div className={`text-sm font-bold ${referralSbcSlides[referralSbcIndex].color}`}>
                      {referralSbcSlides[referralSbcIndex].title}
                    </div>
                    
                    {/* Navigation arrows - only show if more than one slide */}
                    {referralSbcSlides.length > 1 && (
                      <>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReferralSbcPrev()
                          }}
                          className="absolute top-1 left-1 w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30 transition"
                        >
                          ‹
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            handleReferralSbcNext()
                          }}
                          className="absolute top-1 right-1 w-4 h-4 bg-white/20 rounded-full flex items-center justify-center text-white text-xs hover:bg-white/30 transition"
                        >
                          ›
                        </button>
                      </>
                    )}
                    
                  </motion.div>
                </AnimatePresence>
              </div>
            </div>
            {/* Deals nebeneinander im Grid */}
            <div className="col-span-6 flex gap-0 w-full">
              {/* Deal of the Day */}
              <div
                className="w-1/2 flex flex-col items-center rounded-xl p-3 h-full text-white cursor-pointer relative overflow-hidden"
                style={{
                  backgroundImage: 'url("/dealday.jpg")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat'
                }}
                onClick={() => setShowDailyDealDialog(true)}
              >
                {/* Overlay für bessere Lesbarkeit */}
                <div className="absolute inset-0 bg-black/30 rounded-xl"></div>
                {/* Content über dem Overlay */}
                <div className="relative z-10 w-full h-full flex flex-col items-center">
                {dailyDeal ? (
                  <>
                    <div className="w-full aspect-[3/4] max-h-[160px] rounded-xl flex items-center justify-center mb-1 relative">
                      <img
                        src={getCloudflareImageUrl(dailyDeal.card_image_url)}
                        alt={dailyDeal.card_name}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-1 left-1 bg-black/80 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <span>⭐</span>x{dailyDeal.card_level}
                      </div>
                    </div>
                    <div className="text-lg font-bold text-center mb-0.5">Deal of the Day</div>
                    <div className="text-sm text-white/80 text-center mb-1">
                      {dailyDeal.card_name} <span className="text-white/70">·</span>
                      <span className="inline-block px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold align-middle ml-1">{dailyDeal.card_rarity}</span>
                    </div>
                    <div className="flex gap-2 mb-1 justify-center">
                      {dailyDeal.classic_tickets > 0 && (
                        <span className="inline-block px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center gap-1 border border-white">
                          <Ticket className="h-3 w-3 text-blue-500" />+{dailyDeal.classic_tickets}
                        </span>
                      )}
                      {dailyDeal.elite_tickets > 0 && (
                        <span className="inline-block px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-sm font-bold flex items-center gap-1 border border-white">
                          <Crown className="h-3 w-3 text-purple-500" />+{dailyDeal.elite_tickets}
                        </span>
                      )}
                    </div>
                    <div className="text-lg font-bold text-center mb-1">{price ? `${(dailyDeal.price / price).toFixed(2)} WLD` : `$${dailyDeal.price.toFixed(2)} USD`}</div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center h-full text-white/70">No Deal of the Day</div>
                )}
                </div>
              </div>
              
              {/* Special Deal */}
              <div
                className="w-1/2 flex flex-col items-center rounded-xl p-3 h-full text-white cursor-pointer relative overflow-hidden"
                style={{
                  backgroundImage: 'url("/specialdeal.jpg")',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                  backgroundRepeat: 'no-repeat'
                }}
                onClick={() => setShowSpecialDealDialog(true)}
              >
                {/* Overlay für bessere Lesbarkeit */}
                <div className="absolute inset-0 bg-black/10 rounded-xl"></div>
                {/* Content über dem Overlay */}
                <div className="relative z-10 w-full h-full flex flex-col items-center">
                {specialDeal ? (
                  <>
                    <div className="w-full aspect-[3/4] max-h-[160px] rounded-xl flex items-center justify-center mb-1 relative">
                      <img
                        src={getCloudflareImageUrl(specialDeal.card_image_url)}
                        alt={specialDeal.card_name}
                        className="w-full h-full object-contain"
                      />
                      <div className="absolute top-1 left-1 bg-black/80 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <span>⭐</span>x{specialDeal.card_level}
                      </div>
                    </div>
                    <div className="text-lg font-bold text-center mb-0.5">Special Deal!</div>
                    <div className="text-sm text-white/80 text-center mb-1">
                      {specialDeal.card_name} <span className="text-white/70">·</span>
                      <span className="inline-block px-2 py-1 rounded-full bg-yellow-100 text-yellow-800 text-xs font-bold align-middle ml-1">{specialDeal.card_rarity}</span>
                    </div>
                    <div className="flex gap-2 mb-1 justify-center">
                      {specialDeal.classic_tickets > 0 && (
                        <span className="inline-block px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 text-sm font-bold flex items-center gap-1 border border-white">
                          <Ticket className="h-3 w-3 text-blue-500" />+{specialDeal.classic_tickets}
                        </span>
                      )}
                      {specialDeal.elite_tickets > 0 && (
                        <span className="inline-block px-1.5 py-0.5 rounded-full bg-purple-100 text-purple-700 text-sm font-bold flex items-center gap-1 border border-white">
                          <Crown className="h-3 w-3 text-purple-500" />+{specialDeal.elite_tickets}
                        </span>
                      )}
                      {/* {specialDeal.icon_tickets > 0 && (
                        <span className="inline-block px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-sm font-bold flex items-center gap-1 border border-white">
                          <Crown className="h-3 w-3 text-indigo-500" />+{specialDeal.icon_tickets}
                        </span>
                      )} */}
                    </div>
                    <div className="text-lg font-bold text-center mb-1">
                      {specialDeal.discount_percentage && specialDeal.discount_percentage > 0 ? (
                        <div className="flex flex-col items-center">
                          <div className="flex items-center gap-2">
                            <span className="text-sm line-through text-gray-400">
                              {price ? `${(specialDeal.price / price).toFixed(2)} WLD` : `$${specialDeal.price.toFixed(2)} USD`}
                            </span>
                            <span className="bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
                              -{specialDeal.discount_percentage}%
                            </span>
                          </div>
                          <span className="text-green-400">
                            {price ? `${((specialDeal.price * (1 - specialDeal.discount_percentage / 100)) / price).toFixed(2)} WLD` : `$${(specialDeal.price * (1 - specialDeal.discount_percentage / 100)).toFixed(2)} USD`}
                          </span>
                        </div>
                      ) : (
                        <span>{price ? `${(specialDeal.price / price).toFixed(2)} WLD` : `$${specialDeal.price.toFixed(2)} USD`}</span>
                      )}
                    </div>
                  </>
                ) : (
                  <div className="flex flex-1 items-center justify-center h-full text-white/70">No Special Deal Today</div>
                )}
                </div>
              </div>
              <Dialog open={showSpecialDealDialog} onOpenChange={(open) => {
                if (!open && !buyingSpecialDeal && !showSpecialDealSuccess) {
                  setShowSpecialDealDialog(false);
                }
              }}>
                {specialDeal && (
                  <DialogContent className="sm:max-w-md p-0 overflow-hidden rounded-xl border-0 bg-gray-900 text-white">
                    <DialogTitle className="sr-only">Special Deal</DialogTitle>
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
                            Purchase Successful!
                          </motion.h3>
                          <motion.p
                            initial={{ y: 20, opacity: 0 }}
                            animate={{ y: 0, opacity: 1 }}
                            transition={{ delay: 0.4 }}
                            className="text-gray-400"
                          >
                            You've claimed the special deal
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
                      <div className="relative w-40 h-56 shadow-[0_0_15px_rgba(61,174,245,0.5)]">
                        <div className="absolute inset-0 rounded-lg border-2 border-[#3DAEF5] overflow-hidden">
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
                          <span>Special Deal</span>
                        </div>
                      </div>
                    </div>
                    {/* Card Details */}
                    <div className="bg-gray-800 rounded-t-3xl px-6 pt-6 pb-8 -mt-6 relative z-10">
                      <div className="mb-5">
                        <div className="flex items-center justify-between mb-1">
                          <h3 className="text-xl font-bold text-white">{specialDeal.card_name}</h3>
                          <span className="bg-blue-900 text-blue-200 px-3 py-1 rounded-full text-xs font-bold">{specialDeal.card_rarity}</span>
                        </div>
                        <p className="text-sm text-[#3DAEF5]">{specialDeal.card_character}</p>
                        <p className="text-sm text-gray-400 mt-3">{specialDeal.description}</p>
                      </div>
                      {/* What's Included */}
                      <div className="bg-gray-900/50 rounded-xl p-4 mb-5 border border-gray-700/50">
                        <h4 className="text-sm font-medium text-gray-300 mb-3">What's Included:</h4>
                        <div className="space-y-3">
                          <div className="flex items-center">
                            <div className="w-9 h-9 rounded-md border-2 border-violet-500 flex items-center justify-center mr-3 bg-gray-800">
                              <span className="text-xs font-bold text-violet-400">★{specialDeal.card_level}</span>
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{specialDeal.card_name}</p>
                              <p className="text-xs text-gray-400">Level {specialDeal.card_level} {specialDeal.card_rarity} Card</p>
                            </div>
                          </div>
                          {/* Classic Tickets */}
                          <div className={`flex items-center ${specialDeal.classic_tickets > 0 ? '' : 'opacity-50'}`}> 
                            <div className="w-9 h-9 rounded-md bg-blue-900/30 border border-blue-700/50 flex items-center justify-center mr-3">
                              <Ticket className="h-4 w-4 text-blue-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{specialDeal.classic_tickets} Regular Tickets</p>
                              <p className="text-xs text-gray-400">For regular card packs</p>
                            </div>
                          </div>
                          {/* Elite Tickets */}
                          <div className={`flex items-center ${specialDeal.elite_tickets > 0 ? '' : 'opacity-50'}`}> 
                            <div className="w-9 h-9 rounded-md bg-purple-900/30 border border-purple-700/50 flex items-center justify-center mr-3">
                              <Crown className="h-4 w-4 text-purple-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{specialDeal.elite_tickets} Legendary Tickets</p>
                              <p className="text-xs text-gray-400">For legendary card packs</p>
                            </div>
                          </div>
                          {/* Icon Tickets */}
                          {/* <div className={`flex items-center ${specialDeal.icon_tickets > 0 ? '' : 'opacity-50'}`}> 
                            <div className="w-9 h-9 rounded-md bg-indigo-900/30 border border-indigo-700/50 flex items-center justify-center mr-3">
                              <Crown className="h-4 w-4 text-indigo-400" />
                            </div>
                            <div>
                              <p className="text-sm font-medium text-white">{specialDeal.icon_tickets} Icon Tickets</p>
                              <p className="text-xs text-gray-400">For icon rewards</p>
                            </div>
                          </div> */}
                        </div>
                      </div>
                      {/* Price and Action */}
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-400">Price:</p>
                          {specialDeal.discount_percentage && specialDeal.discount_percentage > 0 ? (
                            <div>
                              <p className="text-lg line-through text-gray-500">{price ? `${(specialDeal.price / price).toFixed(2)} WLD` : `$${specialDeal.price.toFixed(2)} USD`}</p>
                              <p className="text-2xl font-bold text-green-400">{price ? `${((specialDeal.price * (1 - specialDeal.discount_percentage / 100)) / price).toFixed(2)} WLD` : `$${(specialDeal.price * (1 - specialDeal.discount_percentage / 100)).toFixed(2)} USD`}</p>
                              <p className="text-sm text-red-400 font-bold">-{specialDeal.discount_percentage}% OFF!</p>
                            </div>
                          ) : (
                            <p className="text-2xl font-bold text-[#3DAEF5]">{price ? `${(specialDeal.price / price).toFixed(2)} WLD` : `$${specialDeal.price.toFixed(2)} USD`}</p>
                          )}
                        </div>
                        <Button
                          onClick={handleBuySpecialDeal}
                          disabled={buyingSpecialDeal}
                          size="lg"
                          className="bg-gradient-to-r from-[#3DAEF5] to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white rounded-full shadow-lg shadow-blue-900/30"
                        >
                          {buyingSpecialDeal ? (
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
                )}
              </Dialog>
            </div>
          </div>
          {/* Daily bonus (keep below the grid) */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1, duration: 0.4 }}
            className="bg-gradient-to-br from-[#232526] to-[#414345] rounded-xl shadow-md border-2 border-yellow-400 overflow-hidden mt-6"
          >
            <div className="relative">
              <div className="relative p-3">
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-yellow-400 flex items-center justify-center border border-yellow-300">
                      <Gift className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h3 className="font-medium text-sm text-yellow-100">Ticket Claim</h3>
                      <p className="text-xs text-yellow-200">
  Get {ticketClaimAmount} ticket every 24 hours
</p>
                    </div>
                  </div>
                  <Button
                    onClick={handleClaimBonus}
                    disabled={claimLoading || alreadyClaimed}
                    size="sm"
                    className={`rounded-full px-4 ${
                      alreadyClaimed
                        ? "bg-gray-600 text-gray-300 hover:bg-gray-600"
                        : "bg-gradient-to-r from-yellow-400 to-yellow-600 hover:from-yellow-500 hover:to-yellow-700 text-white"
                    }`}
                  >
                    {claimLoading ? (
                      <div className="flex items-center">
                        <div className="h-3 w-3 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                        <span className="text-xs">Claiming...</span>
                      </div>
                    ) : alreadyClaimed ? (
                      <div className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        <span className="text-xs">{ticketTimerDisplay}</span>
                      </div>
                    ) : (
                      <span className="text-xs">Claim Now</span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Quick Actions: Friends & Missions - COMMENTED OUT */}
          {/* <div className="mt-4 mb-20 grid grid-cols-2 gap-3">
            <Link href="/friends" className="block w-full h-full">
              <div className="bg-gradient-to-br from-[#232526] to-[#414345] rounded-xl p-4 shadow-lg flex flex-col items-center justify-center min-h-[90px] h-full text-center transition border-2 border-yellow-400">
                <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center mb-2 border border-yellow-300">
                  <Users className="h-5 w-5 text-white" />
                </div>
                <div className="text-base font-bold text-yellow-100">Friends</div>
              </div>
            </Link>
            <Link href="/missions" className="block w-full h-full">
              <div className="bg-gradient-to-br from-[#232526] to-[#414345] rounded-xl p-4 shadow-lg flex flex-col items-center justify-center min-h-[90px] h-full text-center transition border-2 border-yellow-400">
                <div className="w-10 h-10 rounded-full bg-yellow-400 flex items-center justify-center mb-2 border border-yellow-300">
                  <Trophy className="h-5 w-5 text-white" />
                </div>
                <div className="text-base font-bold text-yellow-100">Missions</div>
              </div>
            </Link>
          </div> */}
        </main>
        
        {/* Add bottom padding to ensure content is not hidden by MobileNav */}
        <div className="h-20"></div>

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
            onClose={() => setShowDailyDealDialog(false)}
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
      Invite Friends & Earn Rewards
    </DialogTitle>
    <DialogDescription className="text-sm text-yellow-200">
      Share your referral link and earn bonus tickets when they reach level 10!<br />
      <span className="text-xs text-red-400 font-semibold">Note: Only enter the username in the field, not the complete link!</span><br />
      <span className="text-xs text-red-400 font-semibold">⚠️ Anyone who abuses the referral system and tries to cheat will be banned!</span>
    </DialogDescription>
    {/* Your referral link */}
    <div className="mt-6">
      <div className="text-sm font-semibold text-yellow-100 mb-2">Your Code:</div>
      <div className="flex items-center justify-between bg-gradient-to-r from-[#232526] to-[#414345] border-2 border-yellow-400 rounded-lg px-4 py-3 shadow-lg">
        <span className="truncate text-sm font-mono text-yellow-200 font-bold">{user?.username}</span>
        <Button
          size="sm"
          className="bg-yellow-400 hover:bg-yellow-500 text-white font-bold border-2 border-yellow-300 shadow-lg"
          onClick={() => {
            const link = `https://worldcoin.org/mini-app?app_id=app_81194a47953b441d325cb47c8e632c95&ref=${user?.username}`
            navigator.clipboard.writeText(link)
            setCopied(true)
            setTimeout(() => setCopied(false), 2000)
          }}
        >
          {copied ? "Copied!" : "Copy link"}
        </Button>
      </div>
    </div>
    {/* Rewards overview */}
    <div className="mt-6 bg-gradient-to-br from-yellow-400/20 to-yellow-600/20 border-2 border-yellow-400 rounded-lg p-4 shadow-lg">
      <h4 className="text-sm font-bold text-yellow-100 mb-3 flex items-center gap-2">
        <span className="text-yellow-400">🎁</span>
        What you get:
      </h4>
      <ul className="text-sm text-yellow-200 space-y-2">
        <li className="flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
          <strong className="text-yellow-100">+5</strong> Regular Tickets
        </li>
        <li className="flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
          <strong className="text-yellow-100">+3</strong> Legendary Tickets
        </li>
        <li className="flex items-center gap-2">
          <span className="w-2 h-2 bg-yellow-400 rounded-full"></span>
          Once your friend reaches <strong className="text-yellow-100">Level 10</strong>
        </li>
      </ul>
    </div>
    {/* Referred users list */}
    <div className="mt-6">
      <h4 className="text-sm font-bold text-yellow-100 mb-3 flex items-center gap-2">
        <span className="text-yellow-400">👥</span>
        Your Referrals
      </h4>
      {referredUsers.length === 0 ? (
        <div className="bg-gradient-to-r from-[#232526]/50 to-[#414345]/50 border border-yellow-400/30 rounded-lg p-4 text-center">
          <p className="text-sm text-yellow-200/70">No referrals yet.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto bg-gradient-to-r from-[#232526]/30 to-[#414345]/30 border border-yellow-400/30 rounded-lg p-3">
          {referredUsers.map((ref) => (
            <div key={ref.username} className="flex justify-between items-center border-b border-yellow-400/20 pb-2 last:border-b-0">
              <span className="text-sm text-yellow-200">
                @{ref.username.length > 10 ? ref.username.slice(0, 10) + "…" : ref.username} 
                <span className="text-yellow-400/70 text-xs ml-1">(Lvl {ref.level})</span>
              </span>
              {ref.reward_claimed ? (
                <CheckCircle className="h-4 w-4 text-green-400" />
              ) : ref.level >= 10 ? (
                <Button
                  size="sm"
                  className="bg-green-500 hover:bg-green-600 text-white font-bold text-xs border border-green-400"
                  onClick={async () => {
                    if (!user?.username) return
                    try {
                      const res = await claimReferralRewardForUser(user.username, ref.username)
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
                          title: "Success!",
                          description: "Referral reward claimed successfully!",
                        })
                      } else {
                        toast({ title: "Error", description: res.error, variant: "destructive" })
                      }
                    } catch (error) {
                      console.error("Error claiming referral reward:", error)
                      toast({ 
                        title: "Error", 
                        description: "Failed to claim referral reward. Please try again.", 
                        variant: "destructive" 
                      })
                    }
                  }}
                >
                  Claim
                </Button>
              ) : (
                <span className="text-xs text-yellow-400/50">Waiting...</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  </DialogContent>
</Dialog>

      

      <MobileNav />
    </div>
    </ProtectedRoute>
  )
}

