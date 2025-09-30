"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { updateScoreForCards, updateScoreForLevelUp } from "@/app/actions/update-score"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import { Ticket, Crown, Star, Sword, Zap, X, ArrowUp } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { motion, AnimatePresence, useAnimation, useMotionValue, useTransform } from "framer-motion"
// Removed Next.js Image import - using regular img tags
import { incrementMission } from "@/app/actions/missions"
import { incrementLegendaryDraw } from "@/app/actions/weekly-contest"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { incrementClanMission } from "@/app/actions/clan-missions"
import { MiniKit, Tokens, type PayCommandInput, tokenToDecimals } from "@worldcoin/minikit-js"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { Info } from "lucide-react"
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip"
// import { isUserBanned } from "@/lib/banned-users" // Lokale Version verwendet
import { getActiveGodPackDiscount } from "@/app/actions/god-pack-discount"

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

// Rarität definieren - UPDATED: Added godlike
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
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawnCards, setDrawnCards] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<"regular" | "legendary" | "god" | "icon">("regular")
  const [legendaryTickets, setLegendaryTickets] = useState(2)
  const [eliteTickets, setEliteTickets] = useState(0)
  const [tickets, setTickets] = useState(0)
  const [hasPremiumPass, setHasPremiumPass] = useState(false)
  const [hasXpPass, setHasXpPass] = useState(false)
  const [userClanRole, setUserClanRole] = useState<string | null>(null)
  const [isUpdatingScore, setIsUpdatingScore] = useState(false)
  const [isMultiDraw, setIsMultiDraw] = useState(false)
  const [isBulkDraw, setIsBulkDraw] = useState(false)
  const [showBulkLoading, setShowBulkLoading] = useState(false)
  const [wldPriceEstimate, setWldPriceEstimate] = useState<string>("–")
  const [normalWldPrice, setNormalWldPrice] = useState<string>("–")

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

  // Check if user has active Icon Pass
  useEffect(() => {
    const checkIconPass = async () => {
      if (!user?.username) return
      
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        const { data, error } = await supabase
          .from('icon_passes')
          .select('*')
          .eq('user_id', user.username)
          .eq('active', true)
          .single()

        console.log('Icon Pass check in draw-content:', { data, error, username: user.username })
        
        if (!error && data) {
          setHasIconPass(true)
          console.log('✅ Icon Pass is active in draw-content!')
        } else {
          setHasIconPass(false)
          console.log('❌ No active Icon Pass found in draw-content')
        }
      } catch (error) {
        console.error('❌ Error checking Icon Pass in draw-content:', error)
        setHasIconPass(false)
      }
    }

    checkIconPass()
  }, [user?.username])

  const fetchGodPacksLeft = async () => {
    const supabase = getSupabaseBrowserClient()
    const today = new Date().toISOString().split("T")[0]
    if (!supabase) return
    const { data, error } = await supabase
      .from("god_pack_daily_usage")
      .select("packs_opened")
      .eq("usage_date", today)

    if (!error && data) {
      const totalOpened = (data as { packs_opened: number }[]).reduce(
        (sum, row) => sum + row.packs_opened,
        0,
      )

      setGodPacksLeft(Math.min(totalOpened, max_godpacks_daily))
      const chances = calculateDynamicGodPackChances(totalOpened)
      setGodPackChances(chances)
    } else {
      console.error("Error fetching god pack usage:", error)
      setGodPacksLeft(null)
    }
  }

  // Fetch God Pack Discount
  const fetchGodPackDiscount = async () => {
    try {
      const result = await getActiveGodPackDiscount()
      if (result.success && result.data) {
        setGodPackDiscount({
          isActive: true,
          value: result.data.value,
          endTime: result.data.end_time
        })
      } else {
        setGodPackDiscount(null)
      }
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
  const { price } = useWldPrice()
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
  // Payment function for God Pack
  const sendPayment = async (count = 1) => {
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
        variant: "destructive" 
      })
      return
    }

    let dollarAmount = 0.91 * count
    
    // Apply permanent 10% discount for 5 packs
    if (count === 5) {
      dollarAmount = dollarAmount * 0.90 // 10% discount
    }
    
    // Apply additional God Pack discount if active and user is on god pack tab
    if (godPackDiscount?.isActive && activeTab === "god") {
      dollarAmount = dollarAmount * (1 - godPackDiscount.value)
    }
    
    const fallbackWldAmount = dollarAmount
    const wldAmount = price ? dollarAmount / price : fallbackWldAmount
    const wldAmountRounded = Number(wldAmount.toFixed(3))
    setWldPriceEstimate(wldAmountRounded.toFixed(3))

    try {
      const {commandPayload, finalPayload} = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: WLD_TOKEN,
            abi: erc20TransferAbi,
            functionName: "transfer",
            args: ["0x9311788aa11127F325b76986f0031714082F016B", tokenToDecimals(wldAmountRounded, Tokens.WLD).toString()],
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
        const { data: epochs, error } = await supabase.from("cards").select("epoch").not("epoch", "is", null)

        if (!error && epochs) {
          const uniqueEpochs = [...new Set(epochs.map((e) => e.epoch as number))].sort((a, b) => b - a)
          setAvailableEpochs(uniqueEpochs as number[])
        }
      } catch (error) {
        console.error("Error fetching epochs:", error)
      }
    }

    fetchAvailableEpochs()
  }, [])

  // Check user's clan role for XP bonuses
  useEffect(() => {
    const fetchUserClanRole = async () => {
      if (!user?.username) return

      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      try {
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("clan_id")
          .eq("username", user.username)
          .single()

        if (userError || !userData?.clan_id) {
          setUserClanRole(null)
          return
        }

        const { data: memberData, error: memberError } = await supabase
          .from("clan_members")
          .select("role")
          .eq("clan_id", userData.clan_id)
          .eq("user_id", user.username)
          .single()

        if (!memberError && memberData) {
          setUserClanRole(memberData.role as string)
        }
      } catch (error) {
        console.error("Error fetching clan role:", error)
      }
    }

    fetchUserClanRole()
  }, [user?.username])

  useEffect(() => {
    const normalDollarAmount = 0.8
    let discountedDollarAmount = 0.8
    
    // Apply God Pack discount if active and user is on god pack tab
    if (godPackDiscount?.isActive && activeTab === "god") {
      discountedDollarAmount = discountedDollarAmount * (1 - godPackDiscount.value)
    }
    
    if (price) {
      const normalWld = normalDollarAmount / price
      const discountedWld = discountedDollarAmount / price
      
      setNormalWldPrice(normalWld.toFixed(3))
      setWldPriceEstimate(discountedWld.toFixed(3))
    }
  }, [price, godPackDiscount, activeTab])

  useEffect(() => {
    setIsClient(true)
    refreshUserData?.()

    const fetchXpPass = async () => {
      if (!user?.username) return

      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { data, error } = await supabase
        .from("xp_passes")
        .select("active")
        .eq("user_id", user.username)
        .eq("active", true)
        .single()

      if (data?.active) {
        setHasXpPass(true)
      } else {
        setHasXpPass(false)
      }
    }

    fetchXpPass()
  }, [refreshUserData, user?.username])

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
      if (typeof user.has_premium === "boolean") {
        setHasPremiumPass(user.has_premium)
      }
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
    x.set(0, true)
    y.set(0, true)
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

      console.log("looking for pack")

      // God pack doesn't require tickets, only payment
      if (cardType !== "god") {
        console.log("not god")
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
            username: user.username,
            cardType,
            count,
          }),
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const result = await response.json()

        // Mission tracking für legendary cards
        const legendaryCards = result.drawnCards?.filter((card: any) => card.rarity === "legendary") || []
        if (legendaryCards.length > 0) {
          await incrementMission(user.username, "draw_legendary_card", legendaryCards.length)
        }

        const premierLeagueCards = result.drawnCards?.filter((card: any) => card.league_id === "3cd1fa22-d6fd-466a-8fe2-ca5c661d015d") || []
        if (premierLeagueCards.length > 0) {
          await incrementLegendaryDraw(user.username, premierLeagueCards.length * 1)
        }

        const bundesligaCards = result.drawnCards?.filter((card: any) => card.league_id === "cba80327-d67e-400d-81b7-9689ab27224c") || []
        if (bundesligaCards.length > 0) {
          await incrementLegendaryDraw(user.username, bundesligaCards.length * 1)
        }

        const goatPacks = cardType === "god" ? count : 0;
        
        if (goatPacks > 0) {
          await incrementLegendaryDraw(user.username, goatPacks * 15);
        }
        
        const ultimateCards = result.drawnCards?.filter((card: any) => card.rarity=== "ultimate") || []
        if (ultimateCards.length > 0) {
          await incrementLegendaryDraw(user.username, ultimateCards.length * 5)
          
        }


        // Mission tracking for godlike cards
        const godlikeCards = result.drawnCards?.filter((card: any) => card.rarity === "godlike") || []
        if (godlikeCards.length > 0) {
          await incrementMission(user.username, "draw_godlike_card", godlikeCards.length)
        }

        if (cardType === "legendary") {
          await incrementMission(user.username, "open_legendary_pack", count)
          await incrementMission(user.username, "open_3_legendary_packs", count)
          if (user.clan_id !== undefined) {
            await incrementClanMission(user.clan_id, "legendary_packs", count)
          }
        } else {
          await incrementMission(user.username, "open_regular_pack", count)
          if (user.clan_id !== undefined) {
            await incrementClanMission(user.clan_id, "regular_packs", count)
          }
        }

        const legendary_cards = result.drawnCards?.filter((card: any) => card.rarity === "legendary") || []
        if (legendary_cards.length > 0) {
          if (user.clan_id !== undefined) {
            await incrementClanMission(user.clan_id, "legendary_cards", legendary_cards.length)
          }
        }

        if (result.success && result.drawnCards?.length > 0) {
          setDrawnCards(result.drawnCards)

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
            const newTicketCount = result.newTicketCount ?? tickets
            const newEliteTicketCount = result.newEliteTicketCount ?? eliteTickets
            // const newIconTicketCount = result.newIconTicketCount ?? iconTickets
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
      const scoreResult = await updateScoreForCards(user.username, drawnCards)
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
            updateScoreForLevelUp(user.username)
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
            updateScoreForLevelUp(user.username)
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
    common: 'basic',
    epic: 'elite',
    legendary: 'ultimate',
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
      basic: 0,
      rare: 0,
      elite: 0,
      ultimate: 0,
    }
    drawnCards.forEach((card) => {
      // Mappe alte Namen auf neue
      let key = card.rarity
      if (key === 'common') key = 'basic'
      if (key === 'epic') key = 'elite'
      if (key === 'legendary') key = 'ultimate'
      if (stats.hasOwnProperty(key)) {
        stats[key]++
      }
    })
    return stats
  }

  // Hilfsfunktion für die Anzeige der Rarity-Namen
  const getDisplayRarity = (rarity: string) => {
    if (rarity === 'common' || rarity === 'basic') return 'Basic';
    if (rarity === 'epic' || rarity === 'elite') return 'Elite';
    if (rarity === 'legendary' || rarity === 'ultimate') return 'Ultimate';
    if (rarity === 'godlike' || rarity === 'goat') return 'GOAT';
    return rarity.charAt(0).toUpperCase() + rarity.slice(1);
  };

  if (!isClient) {
    return (
      <ProtectedRoute>
        <div 
          className="min-h-screen pb-20"
          style={{
            backgroundImage: 'url(/hintergrung.png)',
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
          <MobileNav />
        </div>
      </ProtectedRoute>
    )
  }

  return (
    <ProtectedRoute>
      <div 
        className="min-h-screen pb-20"
        style={{
          backgroundImage: 'url(/hintergrung.png)',
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
                <div className="flex items-center gap-1 bg-black/80 px-3 py-1.5 rounded-full shadow-sm border border-yellow-400">
                  <Ticket className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="font-medium text-sm text-yellow-200">{tickets}</span>
                </div>
                <div className="flex items-center gap-1 bg-black/80 px-3 py-1.5 rounded-full shadow-sm border border-yellow-400">
                  <Ticket className="h-3.5 w-3.5 text-yellow-400" />
                  <span className="font-medium text-sm text-yellow-200">{eliteTickets}</span>
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

                {/* Tabs - UPDATED: Changed God tab to red gradient */}
                <div className="grid grid-cols-2 rounded-xl overflow-hidden mb-6 border border-yellow-400 bg-black/70">
                  <button
                    onClick={() => setActiveTab("regular")}
                    className={`py-3 px-2 text-center font-medium transition-all text-xs ${
                      activeTab === "regular"
                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white"
                        : "bg-black/50 text-yellow-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Ticket className="h-3 w-3" />
                      <span>Basic</span>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab("legendary")}
                    className={`py-3 px-2 text-center font-medium transition-all text-xs ${
                      activeTab === "legendary"
                        ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white"
                        : "bg-black/50 text-yellow-200"
                    }`}
                  >
                    <div className="flex items-center justify-center gap-1">
                      <Ticket className="h-3 w-3" />
                      <span>Elite</span>
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
                {godPackDiscount?.isActive && activeTab === "god" && (
                  <div className="mb-4 text-center text-sm font-medium px-4 py-2 rounded-xl bg-gradient-to-r from-red-500 to-red-600 text-white border border-red-400 animate-pulse">
                    🔥 {Math.round(godPackDiscount.value * 100)}% OFF GOAT PACKS! 
                    <div className="flex items-center justify-center gap-2 mt-1 text-xs">
                      <span className="line-through text-gray-300">{normalWldPrice} WLD</span>
                      <span className="text-green-300 font-bold">{wldPriceEstimate} WLD</span>
                    </div>
                    {godPackDiscountTimeLeft && (
                      <span className="block text-xs mt-1">
                        Limited time: {godPackDiscountTimeLeft}
                      </span>
                    )}
                  </div>
                )}
                
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
                                ? "/elite_pack-removebg-preview.png"
                                : activeTab === "icon"
                                  ? "/icon_pack_echt-removebg-preview.png"
                                  : "/classic_pack.png"
                          }
                          alt="Card Pack"
                          className="absolute inset-0 w-full h-full object-contain"
                        />
                      </motion.div>

                      <div className="text-center mb-4">
                        <h3 className="text-lg font-medium text-white">
                          {activeTab === "god" ? "GOAT" : activeTab === "legendary" ? "Elite" : activeTab === "icon" ? "ICON" : "Basic"} Card Pack
                        </h3>
                        <p className="text-sm text-gray-500">Contains 1 random card</p>
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

                      <div className="w-full space-y-2 mb-4">
                        {/* God Pack Rarity Display - UPDATED: Changed godlike text to red */}
                        {activeTab === "god" ? (
                          <div className="border border-gray-200 rounded-lg p-3 relative">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-purple-500">Elite</span>
                                <span className="text-purple-500">{godPackChances.epic}%</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-amber-500">Ultimate</span>
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
                        ) : activeTab === "legendary" ? (
                          <div className="border border-gray-200 rounded-lg p-3 relative">
                            {/* PASS ACTIVE Badge */}
                            {hasIconPass && (
                              <div className="absolute -top-2 -right-2 bg-gradient-to-r from-yellow-400 to-yellow-600 text-white text-xs px-2 py-1 rounded-full font-bold z-10">
                                PASS ACTIVE
                              </div>
                            )}
                            
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Basic</span>
                                <span className="text-gray-500">{hasIconPass ? "7%" : "10%"}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-blue-500">Rare</span>
                                <span className="text-blue-500">{hasIconPass ? "35%" : "45%"}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-purple-500">Elite</span>
                                <span className="text-purple-500">{hasIconPass ? "40%" : "35%"}</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-amber-500">Ultimate</span>
                                <span className="text-amber-500">{hasIconPass ? "18%" : "10%"}</span>
                              </div>
                            </div>
                          </div>
                        ) : activeTab === "icon" ? (
                          <div className="border border-gray-200 rounded-lg p-3 relative">
                            <div className="space-y-2">
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-gray-500">Basic</span>
                                <span className="text-gray-500">5%</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-blue-500">Rare</span>
                                <span className="text-blue-500">35%</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-purple-500">Elite</span>
                                <span className="text-purple-500">40%</span>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-amber-500">Ultimate</span>
                                <span className="text-amber-500">20%</span>
                              </div>
                            </div>
                            {/* Detaillierte Draw Rate Tabelle entfernt */}
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
                                <span className="text-gray-500">Basic</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-gray-500">{hasPremiumPass ? "40%" : "50%"}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-blue-500">Rare</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-blue-500">{hasPremiumPass ? "36%" : "34%"}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-purple-500">Elite</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-purple-500">{hasPremiumPass ? "18%" : "14%"}</span>
                                </div>
                              </div>
                              <div className="flex justify-between items-center text-sm">
                                <span className="text-amber-500">Ultimate</span>
                                <div className="flex items-center gap-2">
                                  <span className="text-amber-500">{hasPremiumPass ? "6%" : "2%"}</span>
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
                              <Button
                                onClick={() => sendPayment(1)}
                                disabled={godPacksLeft === null || godPacksLeft >= max_godpacks_daily}
                                className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {isDrawing ? (
                                  <div className="flex items-center justify-center">
                                    <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                                    <span className="text-sm font-medium">Opening...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Zap className="h-5 w-5" />
                                    <span className="font-bold text-base">1 Pack</span>
                                    {godPackDiscount?.isActive ? (
                                      <span className="block text-sm">
                                        <span className="line-through text-gray-300">{(0.91 / (price || 1)).toFixed(3)} WLD</span>
                                        <span className="text-green-300 ml-2">{((0.91 * (1 - godPackDiscount.value)) / (price || 1)).toFixed(3)} WLD</span>
                                      </span>
                                    ) : (
                                      <span className="block text-sm">{(0.91 / (price || 1)).toFixed(3)} WLD</span>
                                    )}
                                  </div>
                                )}
                              </Button>

                              <div className="relative">
                                <Button
                                  onClick={() => sendPayment(5)}
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
                                    <span className="text-sm font-medium">Opening...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Zap className="h-5 w-5" />
                                    <span className="font-bold text-base text-white">5 Packs</span>
                                    <span className="block text-sm">
                                      <span className="text-white">
                                        {godPackDiscount?.isActive 
                                          ? ((4.55 * 0.90 * (1 - godPackDiscount.value)) / (price || 1)).toFixed(3)
                                          : ((4.55 * 0.90) / (price || 1)).toFixed(3)
                                        } WLD
                                      </span>
                                    </span>
                                  </div>
                                )}
                              </Button>
                              <div className="absolute -top-2 -right-2 bg-orange-500 text-white text-xs px-1.5 py-0.5 rounded-full font-bold">
                                DISCOUNT (-10%)
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
                                    : "flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
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
                                    <span className="font-bold text-base">1 Pack</span>
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
                                      : "flex-1 bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-green-400"
                                }
                              >
                                {isDrawing ? (
                                  <div className="flex items-center justify-center">
                                    <div className="h-4 w-4 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                                    <span className="text-sm font-medium">Opening...</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2">
                                    <Ticket className="h-5 w-5" />
                                    <span className="font-bold text-base">5 Packs</span>
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
                                    : "w-full bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800 text-white rounded-xl py-4 shadow-lg hover:shadow-xl transition-all duration-200 border-2 border-green-400"
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
                                  <span className="font-bold text-base">20 Packs (Bulk)</span>
                                </div>
                              )}
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {showPackSelection && activeTab !== "god" && (
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
                Need more tickets? Visit the Shop
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
                    <h2 className="text-lg font-semibold">Bulk Opening Results</h2>
                    <div className="text-sm text-gray-600">{drawnCards.length} cards</div>
                  </div>
                </div>

                <div className="bg-white border-b border-gray-200 px-4 py-3">
                  <div className="grid grid-cols-4 gap-2 text-center">
                    {['basic', 'rare', 'elite', 'ultimate'].map((rarity) => (
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
                          <span>Adding to Collection...</span>
                        </div>
                      ) : (
                        "Add to Collection"
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
                        <span>Adding to Collection...</span>
                      </div>
                    ) : (
                      `Add All ${drawnCards.length} Cards to Collection`
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
                                ? "/elite_pack-removebg-preview.png"
                                : activeTab === "icon"
                                  ? "/icon_pack_echt-removebg-preview.png"
                                  : "/classic_pack.png"
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
                    <h2 className="text-2xl font-bold text-gray-800 mb-2">Opening 20 Packs...</h2>
                    <p className="text-gray-600">Preparing your cards</p>
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
                          getRarityStyles(["common", "rare", "epic", "legendary", "godlike"][i % 5] as CardRarity)
                            .border
                        } ${getRarityStyles(["common", "rare", "epic", "legendary", "godlike"][i % 5] as CardRarity).bg}`}
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
                      x.set(0, true)
                      y.set(0, true)
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
                      x.set(0, true)
                      y.set(0, true)
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
                              {selectedBulkCard.rarity?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Special effects für legendary, epic und godlike cards */}
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
                            ? "/elite_pack-removebg-preview.png"
                            : activeTab === "icon"
                              ? "/icon_pack_echt-removebg-preview.png"
                              : "/classic_pack.png"
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
                      Open
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
                                  {card?.rarity?.charAt(0).toUpperCase()}
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
                                    {getCurrentCard()?.rarity?.toUpperCase()}
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
                        <span>Updating...</span>
                      </div>
                    ) : (
                      `Add ${isMultiDraw ? "Cards" : "Card"} to Collection`
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
                    <h2 className="text-2xl font-bold text-center">Level Up!</h2>
                    <p className="text-lg font-medium text-center text-amber-600">You reached Level {newLevel}!</p>
                    <p className="text-sm text-center text-gray-600 mt-1">+100 Leaderboard Points</p>
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
                      Continue
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

        <MobileNav />
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
