"use client"

import { useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import { Ticket, Info, Check, Crown, Clock, Sword, CircleDot } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { motion } from "framer-motion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { MiniKit, tokenToDecimals, Tokens, type PayCommandInput } from "@worldcoin/minikit-js"
import { useEffect } from "react"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { getActiveTimeDiscount } from "@/app/actions/time-discount"
import { getBattleLimitStatus } from "@/app/battle-limit-actions"


export default function ShopPage() {
  const { user, updateUserTickets } = useAuth()
  const [isLoading, setIsLoading] = useState<Record<string, boolean>>({})
  const [tickets, setTickets] = useState<number>(user?.tickets ? Number(user.tickets) : 0)
  const [eliteTickets, setEliteTickets] = useState<number>(
    user?.elite_tickets ? Number(user.elite_tickets) : 0,
  )
  const [iconTickets, setIconTickets] = useState<number>(user?.icon_tickets ? Number(user.icon_tickets) : 0)
  const [userClanRole, setUserClanRole] = useState<string | null>(null)
  const [clanMemberCount, setClanMemberCount] = useState<number>(0)
  const [battleLimit, setBattleLimit] = useState<{
    battlesUsed: number
    battlesRemaining: number
    dailyLimit: number
    canBattle: boolean
  } | null>(null)
  // const [showPvpBattles, setShowPvpBattles] = useState(false)

  // Time-based discount state
  const [timeDiscount, setTimeDiscount] = useState<{
    name: string
    value: number
    isActive: boolean
    endTime?: string
  } | null>(null)
  const [discountTimeLeft, setDiscountTimeLeft] = useState<string>("")

  const { price } = useWldPrice()

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

      const clanId = userData.clan_id

      // Fetch user role in clan
      const { data: memberData, error: memberError } = await supabase
        .from("clan_members")
        .select("role")
        .eq("clan_id", clanId)
        .eq("user_id", user.username)
        .single()

      if (memberError || !memberData) {
        setUserClanRole(null)
        return
      }

      setUserClanRole(memberData.role as string)

      // Fetch member count
      const { count, error: countError } = await supabase
        .from("clan_members")
        .select("*", { count: "exact", head: true })
        .eq("clan_id", clanId)

      if (!countError) {
        setClanMemberCount(count ?? 0)
      }
    } catch (error) {
      console.error("Error fetching clan role or member count:", error)
    }
  }

  fetchUserClanRole()
}, [user?.username])

  // Fetch battle limit status
  useEffect(() => {
    const fetchBattleLimit = async () => {
      if (!user?.username) return
      
      try {
        const result = await getBattleLimitStatus(user.username)
        if (result.success) {
          setBattleLimit({
            battlesUsed: result.battlesUsed ?? 0,
            battlesRemaining: result.battlesRemaining ?? 0,
            dailyLimit: result.dailyLimit ?? 5,
            canBattle: result.canBattle ?? false
          })
        }
      } catch (error) {
        console.error("Error fetching battle limit:", error)
      }
    }

    fetchBattleLimit()
  }, [user?.username])

  // Synchronisiere Ticket-States mit User-Objekt
  useEffect(() => {
    if (user) {
      if (typeof user.tickets === "number") setTickets(user.tickets)
      if (typeof user.elite_tickets === "number") setEliteTickets(user.elite_tickets)
      if (typeof user.icon_tickets === "number") setIconTickets(user.icon_tickets)
    }
  }, [user])

  // Fetch time-based discount
  useEffect(() => {
    const fetchTimeDiscount = async () => {
      try {
        const result = await getActiveTimeDiscount()
        if (result.success && result.data) {
          setTimeDiscount({
            name: String(result.data.name || ""),
            value: Number(result.data.value) || 0,
            isActive: Boolean(result.data.is_active),
            endTime: result.data.end_time ? new Date(String(result.data.end_time)).toISOString() : undefined
          })
        }
      } catch (error) {
        console.error("Error fetching time discount:", error)
      }
    }

    fetchTimeDiscount()
    // Check every 30 seconds for updates
    const interval = setInterval(fetchTimeDiscount, 30000)
    return () => clearInterval(interval)
  }, [])

  // Update discount countdown timer
  useEffect(() => {
    if (!timeDiscount?.endTime) return

    const updateTimer = () => {
      const now = new Date().getTime()
      const endTime = new Date(timeDiscount.endTime!).getTime()
      const timeLeft = endTime - now

      if (timeLeft <= 0) {
        setDiscountTimeLeft("")
        setTimeDiscount(null)
        return
      }

      const hours = Math.floor(timeLeft / (1000 * 60 * 60))
      const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000)

      setDiscountTimeLeft(`${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`)
    }

    updateTimer()
    const interval = setInterval(updateTimer, 1000)

    return () => clearInterval(interval)
  }, [timeDiscount?.endTime])


 const getDiscountedPrice = (originalPrice: number) => {
  let finalPrice = originalPrice
  let discountApplied = false

  // Zeitbasierter Rabatt (höchste Priorität)
  if (timeDiscount?.isActive && timeDiscount.value > 0) {
    finalPrice = originalPrice * (1 - timeDiscount.value)
    discountApplied = true
  }
  
  // Bestehende Rabatte (niedrigere Priorität)
  const qualifiesForExistingDiscount =
    userClanRole === "cheap_hustler" ||
    (userClanRole === "leader" && clanMemberCount >= 30)

  if (qualifiesForExistingDiscount && !discountApplied) {
    finalPrice = originalPrice * 0.9
  }

  return finalPrice
}
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
  // const sendPvpBattlePayment = async (dollarPrice: number, packageId: string, battleAmount: number) => {
  //   setIsLoading({ ...isLoading, [packageId]: true })

  //   try {
  //     const discountedPrice = getDiscountedPrice(dollarPrice)
  //     const roundedWldAmount = Number.parseFloat((price ? discountedPrice / price : discountedPrice).toFixed(3))
  //     const {commandPayload, finalPayload} = await MiniKit.commandsAsync.sendTransaction({
  //       transaction: [
  //         {
  //           address: WLD_TOKEN,
  //           abi: erc20TransferAbi,
  //           functionName: "transfer",
  //           args: ["0xDb4D9195EAcE195440fbBf6f80cA954bf782468E", tokenToDecimals(roundedWldAmount, Tokens.WLD).toString()]
  //         },

  //       ],
  //     })
     

  //     if (finalPayload.status === "success") {
  //       console.log("success sending payment")
  //       await handleBuyPvpBattles(packageId, battleAmount)
  //     } else {
  //       toast({
  //         title: "Payment Failed",
  //         description: "Your payment could not be processed. Please try again.",
  //         variant: "destructive",
  //       })
  //       setIsLoading({ ...isLoading, [packageId]: false })
  //     }
  //   } catch (error) {
  //     console.error("Payment error:", error)
  //     toast({
  //       title: "Payment Error",
  //       description: "An error occurred during payment. Please try again.",
  //       variant: "destructive",
  //     })
  //     setIsLoading({ ...isLoading, [packageId]: false })
  //   }
  // }

  const sendPayment = async (
  dollarPrice: number,
  packageId: string,
  ticketAmount: number,
  ticketType: "regular" | "legendary" | "icon",
) => {
  setIsLoading({ ...isLoading, [packageId]: true })

  try {
    const discountedPrice = getDiscountedPrice(dollarPrice)
    // WLD-Betrag berechnen (fallback = 1:1)
    const roundedWldAmount = Number.parseFloat((price ? discountedPrice / price : discountedPrice).toFixed(3))

   
    const {commandPayload, finalPayload} = await MiniKit.commandsAsync.sendTransaction({
      transaction: [
        {
          address: WLD_TOKEN,
          abi: erc20TransferAbi,
          functionName: "transfer",
          args: ["0xDb4D9195EAcE195440fbBf6f80cA954bf782468E",tokenToDecimals(roundedWldAmount, Tokens.WLD).toString() ],
        },

      ],
    })
   

    if (finalPayload.status === "success") {
      console.log("success sending payment")
      await handleBuyTickets(packageId, ticketAmount, ticketType)
    } else {
      toast({
        title: "Payment Failed",
        description: "Your payment could not be processed. Please try again.",
        variant: "destructive",
      })
      setIsLoading({ ...isLoading, [packageId]: false })
    }
  } catch (error) {
    console.error("Payment error:", error)
    toast({
      title: "Payment Error",
      description: "An error occurred during payment. Please try again.",
      variant: "destructive",
    })
    setIsLoading({ ...isLoading, [packageId]: false })
  }
}


  // Handle buying PvP battles
  // const handleBuyPvpBattles = async (packageId: string, battleAmount: number) => {
  //   if (!user?.username) {
  //     toast({
  //       title: "Error",
  //       description: "You must be logged in to purchase PvP battles",
  //       variant: "destructive",
  //     })
  //     setIsLoading({ ...isLoading, [packageId]: false })
  //     return
  //   }

  //   try {
  //     const supabase = getSupabaseBrowserClient()
  //     if (!supabase) {
  //       throw new Error("Could not connect to database")
  //     }

  //     // Get user UUID
  //     const { data: userData, error: userError } = await supabase
  //       .from("users")
  //       .select("id")
  //       .eq("username", user.username)
  //       .single()

  //     if (userError || !userData) {
  //       throw new Error("Could not fetch user data")
  //     }

  //     const userId = userData.id

  //     // Get current battle limit
  //     const { data: battleLimitData, error: battleLimitError } = await supabase
  //       .from("user_battle_limits")
  //       .select("battles_used, last_reset_date")
  //       .eq("user_id", userId)
  //       .single()

  //     let currentBattlesUsed = 0
  //     let lastResetDate = new Date().toISOString().split('T')[0]

  //     if (battleLimitError && battleLimitError.code !== 'PGRST116') {
  //       throw new Error("Could not fetch battle limit")
  //     } else if (battleLimitData) {
  //       currentBattlesUsed = battleLimitData.battles_used || 0
  //       lastResetDate = battleLimitData.last_reset_date || lastResetDate
  //     }

  //     // Check if we need to reset (new day)
  //     const today = new Date().toISOString().split('T')[0]
  //     if (lastResetDate !== today) {
  //       currentBattlesUsed = 0
  //       lastResetDate = today
  //     }

  //     // Add purchased battles (reduce battles_used)
  //     const newBattlesUsed = Math.max(0, currentBattlesUsed - battleAmount)

  //     console.log(`PvP Battle Purchase Debug:`, {
  //       currentBattlesUsed,
  //       battleAmount,
  //       newBattlesUsed,
  //       battlesRemaining: 5 - newBattlesUsed
  //     })

  //     // Update battle limit
  //     const { error: updateError } = await supabase
  //       .from("user_battle_limits")
  //       .upsert({
  //         user_id: userId,
  //         battles_used: newBattlesUsed,
  //         last_reset_date: lastResetDate,
  //         updated_at: new Date().toISOString()
  //       }, {
  //         onConflict: 'user_id'
  //       })

  //     if (updateError) {
  //       throw new Error("Failed to update battle limit")
  //     }

  //     // Log the PvP purchase
  //     const originalPrice = pvpBattlePackages.find(p => p.id === packageId)?.price || 0
  //     const discountedPrice = getDiscountedPrice(originalPrice)
  //     const hasDiscount = discountedPrice < originalPrice
  //     const discountPercentage = hasDiscount ? ((originalPrice - discountedPrice) / originalPrice) * 100 : 0

  //     await supabase.from("pvp_purchases").insert({
  //       user_id: userId,
  //       username: user.username,
  //       amount: battleAmount,
  //       price_usd: discountedPrice,
  //       price_wld: price ? (discountedPrice / price).toFixed(6) : null,
  //       discounted: hasDiscount,
  //       discount_percentage: hasDiscount ? discountPercentage : null,
  //       clan_role: userClanRole,
  //       clan_member_count: clanMemberCount
  //     })

  //     // Update local state
  //     setBattleLimit({
  //       battlesUsed: newBattlesUsed,
  //       battlesRemaining: 5 - newBattlesUsed,
  //       dailyLimit: 5,
  //       canBattle: newBattlesUsed < 5
  //     })

  //     toast({
  //       title: "Purchase Successful!",
  //       description: `You've purchased ${battleAmount} additional PvP battle${battleAmount > 1 ? 's' : ''}!`,
  //     })
  //   } catch (error) {
  //     console.error("Error buying PvP battles:", error)
  //     toast({
  //       title: "Error",
  //       description: error instanceof Error ? error.message : "An unexpected error occurred",
  //       variant: "destructive",
  //     })
  //   } finally {
  //     setIsLoading({ ...isLoading, [packageId]: false })
  //   }
  // }

  // Handle buying tickets
  const handleBuyTickets = async (packageId: string, ticketAmount: number, ticketType: "regular" | "legendary" | "icon") => {
    if (!user?.username) {
      toast({
        title: "Error",
        description: "You must be logged in to purchase tickets",
        variant: "destructive",
      })
      setIsLoading({ ...isLoading, [packageId]: false })
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
        .select("tickets, elite_tickets, icon_tickets")
        .eq("username", user.username)
        .single()

      if (fetchError) {
        throw new Error("Could not fetch user data")
      }

      // Calculate new ticket counts
      let newTicketCount = typeof userData.tickets === "number" ? userData.tickets : Number(userData.tickets) || 0
      let newEliteTicketCount =
        typeof userData.elite_tickets === "number"
          ? userData.elite_tickets
          : Number(userData.elite_tickets) || 0
      let newIconTicketCount =
        typeof userData.icon_tickets === "number"
          ? userData.icon_tickets
          : Number(userData.icon_tickets) || 0

      if (ticketType === "regular") {
        newTicketCount += ticketAmount
      } else if (ticketType === "legendary") {
        newEliteTicketCount += ticketAmount
      } else if (ticketType === "icon") {
        newIconTicketCount += ticketAmount
      }

      // Update tickets in database
      const { error: updateError } = await supabase
        .from("users")
        .update({
          tickets: newTicketCount,
          elite_tickets: newEliteTicketCount,
          icon_tickets: newIconTicketCount,
        })
        .eq("username", user.username)

      if (updateError) {
        throw new Error("Failed to update tickets")
      }

              // Update local state
        setTickets(newTicketCount)
        setEliteTickets(newEliteTicketCount)
        setIconTickets(newIconTicketCount)

      // Update auth context
      await updateUserTickets?.(newTicketCount, newEliteTicketCount, newIconTicketCount)

      const qualifiesForCheapHustler = userClanRole === "cheap_hustler"
      const qualifiesForLeaderDiscount = userClanRole === "leader" && clanMemberCount >= 30

      const discountMessage = timeDiscount?.isActive
        ? ` (${Math.round(timeDiscount.value * 100)}% limited time discount applied!)`
        : qualifiesForCheapHustler
        ? " (10% Cheap Hustler discount applied!)"
        : qualifiesForLeaderDiscount
        ? " (10% Leader discount applied!)"
        : ""
      
        // Log the purchase
await supabase.from("ticket_purchases").insert({
  wallet_address: user.wallet_address,
  ticket_type: ticketType === "regular" ? "classic" : ticketType === "legendary" ? "elite" : "icon",
  amount: ticketAmount,
  price_usd: getDiscountedPrice(packageId.startsWith("reg") ? regularPackages.find(p => p.id === packageId)?.price ?? 0 : legendaryPackages.find(p => p.id === packageId)?.price ?? 0),
  price_wld: price ? (getDiscountedPrice(packageId.startsWith("reg") ? regularPackages.find(p => p.id === packageId)?.price ?? 0 : legendaryPackages.find(p => p.id === packageId)?.price ?? 0) / price).toFixed(3) : null,
  discounted: getDiscountedPrice(packageId.startsWith("reg") ? regularPackages.find(p => p.id === packageId)?.price ?? 0 : legendaryPackages.find(p => p.id === packageId)?.price ?? 0) < (packageId.startsWith("reg") ? regularPackages.find(p => p.id === packageId)?.price ?? 0 : legendaryPackages.find(p => p.id === packageId)?.price ?? 0),
})

      toast({
        title: "Purchase Successful!",
        description: `You've purchased ${ticketAmount} ${ticketType === "legendary" ? "elite" : ticketType === "icon" ? "icon" : "classic"} tickets!${discountMessage}`,
      })
    } catch (error) {
      console.error("Error buying tickets:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsLoading({ ...isLoading, [packageId]: false })
    }
  }


  // Regular ticket packages
  const regularPackages = [
    { id: "reg-1", amount: 1, price: 0.13 },
    { id: "reg-5", amount: 5, price: 0.55 },
    { id: "reg-10", amount: 10, price: 0.8 },
    { id: "reg-20", amount: 20, price: 1.65 },
    { id: "reg-50", amount: 50, price: 3.2 },
    { id: "reg-100", amount: 100, price: 5.3 },
    
  ]

  // Legendary ticket packages
  const legendaryPackages = [
    { id: "leg-1", amount: 1, price: 0.17 },
    { id: "leg-5", amount: 5, price: 0.75 },
    { id: "leg-10", amount: 10, price: 1.4 },
    { id: "leg-20", amount: 20, price: 2.6 },
    { id: "leg-50", amount: 50, price: 6 },
    { id: "leg-100", amount: 100, price: 10 },
  ]

  // Icon Ticket Packages (20% teurer als Legendary)
  const iconPackages = legendaryPackages.map(pkg => ({
    id: `icon-${pkg.amount}`,
    amount: pkg.amount,
    price: +(pkg.price * 1.2).toFixed(2),
  }))

  // PvP Battle Packs (nur verfügbar wenn alle 5 Battles verbraucht)
  // const pvpBattlePackages = [
  //   { id: "pvp-1", amount: 1, price: 0.25 },
  //   { id: "pvp-5", amount: 5, price: 0.78 },
  // ]

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-[#181a20] to-[#23262f] pb-20 text-white">
        {/* Shop Header mit Ticket-Anzeige oben rechts */}
        <div className="flex items-center justify-between max-w-lg mx-auto px-4 py-3">
          <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-gray-200 to-gray-400 bg-clip-text text-transparent drop-shadow-lg">
            Ticket Shop
          </h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full shadow-sm border border-blue-400/30 backdrop-blur-md">
              <Ticket className="h-3.5 w-3.5 text-blue-400" />
              <span className="font-medium text-sm text-blue-100">{tickets}</span>
            </div>
            <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full shadow-sm border border-purple-400/30 backdrop-blur-md">
              <Ticket className="h-3.5 w-3.5 text-purple-400" />
                              <span className="font-medium text-sm text-purple-100">{eliteTickets}</span>
            </div>
            {/* Icon Tickets - COMMENTED OUT */}
            {/* <div className="flex items-center gap-1 bg-white/10 px-3 py-1.5 rounded-full shadow-sm border border-gray-400/30 backdrop-blur-md">
              <Crown className="h-3.5 w-3.5 text-yellow-200" />
              <span className="font-medium text-sm text-gray-100">{iconTickets}</span>
            </div> */}
          </div>
        </div>

        <main className="p-4 space-y-6 max-w-lg mx-auto">
          {/* Time-based Discount Banner */}
          {timeDiscount?.isActive && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-r from-red-600/80 to-red-800/80 text-white rounded-xl p-3 text-center shadow-lg border border-red-400/30 backdrop-blur-md"
            >
              <div className="flex items-center justify-center gap-2 mb-1">
                <Clock className="h-4 w-4 text-red-200" />
                <p className="font-bold text-sm tracking-wide">🔥 LIMITED TIME OFFER!</p>
              </div>
              <p className="text-xs opacity-90 mb-2">
                {Math.round(timeDiscount.value * 100)}% off all tickets!
              </p>
              <div className="flex items-center justify-center gap-1">
                <span className="text-xs opacity-75">Ends in:</span>
                <span className="font-mono font-bold text-sm text-red-200">{discountTimeLeft}</span>
              </div>
            </motion.div>
          )}

          {/* Existing Discount Banner */}
          {(userClanRole === "cheap_hustler" || (userClanRole === "leader" && clanMemberCount >= 30)) && !timeDiscount?.isActive && (
  <motion.div
    initial={{ opacity: 0, y: -10 }}
    animate={{ opacity: 1, y: 0 }}
    className="bg-gradient-to-r from-gray-700/80 to-gray-900/80 text-gray-100 rounded-xl p-3 text-center shadow-lg border border-gray-400/30 backdrop-blur-md"
  >
    <p className="font-semibold text-sm tracking-wide">🎉 Discount Active!</p>
    <p className="text-xs opacity-90">
      {userClanRole === "cheap_hustler"
        ? "You get 10% off all ticket purchases as a Cheap Hustler!"
        : "You get 10% off all ticket purchases as a Leader of a 30+ member clan!"}
    </p>
  </motion.div>
)}

                    {/* Main Shop Tabs */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
            {/* <Tabs defaultValue="tickets" className="w-full">
              <TabsList className="grid w-full grid-cols-1 h-12 rounded-2xl p-1 bg-gradient-to-r from-gray-900/60 via-gray-800/40 to-gray-900/60 mb-6 shadow-lg backdrop-blur-md">
                <TabsTrigger
                  value="tickets"
                  className="rounded-lg data-[state=active]:bg-white/10 data-[state=active]:border-2 data-[state=active]:border-yellow-300 data-[state=active]:text-yellow-200 data-[state=active]:shadow transition-all font-semibold tracking-wide"
                >
                  <Ticket className="h-4 w-4 mr-2 text-yellow-300" />
                  Tickets
                </TabsTrigger>
              </TabsList> */}

              {/* Tickets Tab Content */}
              {/* <TabsContent value="tickets" className="mt-0"> */}
                <Tabs defaultValue="regular" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 h-12 rounded-2xl p-1 bg-gradient-to-r from-gray-900/60 via-gray-800/40 to-gray-900/60 mb-6 shadow-lg backdrop-blur-md">
                    <TabsTrigger
                      value="regular"
                      className="rounded-lg data-[state=active]:bg-white/10 data-[state=active]:border-2 data-[state=active]:border-blue-300 data-[state=active]:text-blue-200 data-[state=active]:shadow transition-all font-semibold tracking-wide"
                    >
                      <Ticket className="h-4 w-4 mr-2 text-blue-300" />
                      Regular Tickets
                    </TabsTrigger>
                    <TabsTrigger
                      value="legendary"
                      className="rounded-lg data-[state=active]:bg-white/10 data-[state=active]:border-2 data-[state=active]:border-purple-400 data-[state=active]:text-purple-200 data-[state=active]:shadow transition-all font-semibold tracking-wide"
                    >
                      <Ticket className="h-4 w-4 mr-2 text-purple-300" />
                      Legendary Tickets
                    </TabsTrigger>
                    {/* <TabsTrigger
                      value="icon"
                      className="rounded-lg data-[state=active]:bg-white/10 data-[state=active]:border-2 data-[state=active]:border-yellow-200 data-[state=active]:text-yellow-100 data-[state=active]:shadow transition-all font-semibold tracking-wide"
                    >
                      <span className="font-extrabold text-yellow-200 mr-2">★</span>
                      Icon Tickets
                    </TabsTrigger> */}
                                    </TabsList>

                  {/* Regular Tickets Content */}
    <TabsContent value="regular" className="mt-0 space-y-6">
      <div className="grid grid-cols-2 gap-3">
        {regularPackages.map((pkg) => {
          const originalPrice = pkg.price
          const discountedPrice = getDiscountedPrice(originalPrice)
          const hasDiscount = discountedPrice < originalPrice
          return (
            <motion.div
              key={pkg.id}
              whileHover={{ scale: 1.03, boxShadow: '0 0 32px 0 rgba(212,175,55,0.10)' }}
              className="relative h-full"
            >
              <Card
                className="overflow-hidden border-2 border-blue-300/30 bg-gradient-to-br from-gray-900/60 to-gray-800/40 rounded-xl shadow-md backdrop-blur-md transition-all p-2 h-full flex flex-col"
              >
                {/* Shine Effekt */}
                <motion.div
                  className="absolute left-[-40%] top-0 w-1/2 h-full bg-gradient-to-r from-transparent via-blue-100/10 to-transparent skew-x-[-20deg] pointer-events-none"
                  animate={{ left: ['-40%', '120%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                {hasDiscount && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-blue-400 to-blue-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg z-10">
                    -{Math.round((1 - discountedPrice / originalPrice) * 100)}%
                  </div>
                )}
                <CardHeader className="p-2 pb-1 space-y-0">
                  <CardTitle className="text-base font-extrabold flex items-center text-blue-200 drop-shadow">
                    <span className="mr-1">{pkg.amount}</span>
                    <Ticket className="h-4 w-4 text-blue-300 drop-shadow-lg mx-1" />
                    <span className="ml-1 text-xs">{pkg.amount === 1 ? "Regular Ticket" : "Regular Tickets"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 pb-1 flex-1">
                  <Separator className="my-2 border-blue-300/20" />
                  <div className="flex items-center justify-between">
                    <div className="flex flex-col items-start">
                      {hasDiscount && (
                        <span className="text-xs text-blue-200/60 line-through">
                          {price ? `${(originalPrice / price).toFixed(3)} WLD` : `${originalPrice.toFixed(3)} WLD`}
                        </span>
                      )}
                      <span className="text-base font-bold text-blue-100">
                        {price
                          ? `${(discountedPrice / price).toFixed(3)} WLD`
                          : `${discountedPrice.toFixed(3)} WLD`}
                      </span>
                      <span className="text-xs text-blue-100/80">
                        (~${discountedPrice.toFixed(2)})
                      </span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="p-2 pt-0">
                  <Button
                    size="sm"
                    className="w-full bg-gradient-to-r from-gray-800/80 to-blue-200/30 text-blue-100 font-bold border-0 hover:scale-105 hover:shadow-lg transition backdrop-blur-md"
                    onClick={() => sendPayment(originalPrice, pkg.id, pkg.amount, 'regular')}
                    disabled={isLoading[pkg.id]}
                  >
                    {isLoading[pkg.id] ? (
                      <>
                        <div className="h-4 w-4 border-2 border-t-transparent border-blue-300 rounded-full animate-spin mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      "Purchase"
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </TabsContent>

    {/* Legendary Tickets Content */}
    <TabsContent value="legendary" className="mt-0 space-y-6">
      <div className="grid grid-cols-2 gap-2">
        {legendaryPackages.map((pkg) => {
          const originalPrice = pkg.price
          const discountedPrice = getDiscountedPrice(originalPrice)
          const hasDiscount = discountedPrice < originalPrice
          return (
            <motion.div
              key={pkg.id}
              whileHover={{ scale: 1.03, boxShadow: '0 0 32px 0 rgba(180,180,180,0.10)' }}
              className="relative h-full"
            >
              <Card
                className="overflow-hidden border-2 border-purple-400/30 bg-gradient-to-br from-gray-900/60 to-gray-800/40 rounded-xl shadow-md backdrop-blur-md transition-all p-2 h-full flex flex-col"
              >
                <motion.div
                  className="absolute left-[-40%] top-0 w-1/2 h-full bg-gradient-to-r from-transparent via-purple-200/10 to-transparent skew-x-[-20deg] pointer-events-none"
                  animate={{ left: ['-40%', '120%'] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                />
                {hasDiscount && (
                  <div className="absolute top-0 right-0 bg-gradient-to-r from-purple-400 to-purple-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg z-10">
                    -{Math.round((1 - discountedPrice / originalPrice) * 100)}%
                  </div>
                )}
                <CardHeader className="p-2 pb-1 space-y-0">
                  <CardTitle className="text-base font-extrabold flex items-center text-purple-200 drop-shadow">
                    <span className="mr-1">{pkg.amount}</span>
                    <Ticket className="h-4 w-4 text-purple-300 drop-shadow-lg mx-1" />
                    <span className="ml-1 text-xs">{pkg.amount === 1 ? "Legendary Ticket" : "Legendary Tickets"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-2 pt-0 pb-1 flex-1">
                  <Separator className="my-2 border-purple-400/20" />
                  <div className="flex flex-col items-start">
                    {hasDiscount && (
                      <span className="text-xs text-purple-200/60 line-through">
                        {price ? `${(originalPrice / price).toFixed(3)} WLD` : `${originalPrice.toFixed(3)} WLD`}
                      </span>
                    )}
                    <span className="text-base font-bold text-purple-100">
                      {price
                        ? `${(discountedPrice / price).toFixed(3)} WLD`
                        : `${discountedPrice.toFixed(3)} WLD`}
                    </span>
                    <span className="text-xs text-purple-100/80">
                      (~${discountedPrice.toFixed(2)})
                    </span>
                  </div>
                </CardContent>
                <CardFooter className="p-2 pt-0">
                  <Button
                    size="sm"
                    className="w-full bg-gradient-to-r from-gray-800/80 to-purple-400/30 text-purple-100 font-bold border-0 hover:scale-105 hover:shadow-lg transition backdrop-blur-md"
                    onClick={() => sendPayment(originalPrice, pkg.id, pkg.amount, 'legendary')}
                    disabled={isLoading[pkg.id]}
                  >
                    {isLoading[pkg.id] ? (
                      <>
                        <div className="h-4 w-4 border-2 border-t-transparent border-purple-300 rounded-full animate-spin mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      "Purchase"
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )
        })}
      </div>
    </TabsContent>

    {/* Icon Tickets Content - REMOVED */}
                </Tabs>
              {/* </TabsContent> */}

              {/* PvP Tab Content */}
              {/* <TabsContent value="pvp" className="mt-0"> */}
                {/* {battleLimit && (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-r from-amber-800/40 to-orange-900/40 border border-amber-700/50 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <CircleDot className="h-6 w-6 text-orange-300" />
                          <div>
                            <h3 className="text-lg font-bold text-orange-200">Additional PvP Battles</h3>
                            <p className="text-sm text-orange-100">
                              {battleLimit.canBattle 
                                ? `${battleLimit.battlesRemaining} battles remaining`
                                : `All ${battleLimit.dailyLimit} battles used`
                              }
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-xs text-orange-200/80">
                            {battleLimit.battlesUsed}/{battleLimit.dailyLimit}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {pvpBattlePackages.map((pkg) => {
                          const originalPrice = pkg.price
                          const discountedPrice = getDiscountedPrice(originalPrice)
                          const hasDiscount = discountedPrice < originalPrice
                          return (
                            <motion.div
                              key={pkg.id}
                              whileHover={{ scale: 1.03, boxShadow: '0 0 32px 0 rgba(255,140,0,0.10)' }}
                              className="relative"
                            >
                              <Card
                                className="overflow-hidden border-2 border-orange-400/30 bg-gradient-to-br from-gray-900/60 to-gray-800/40 rounded-xl shadow-md backdrop-blur-md transition-all p-2"
                              >
                                <motion.div
                                  className="absolute left-[-40%] top-0 w-1/2 h-full bg-gradient-to-r from-transparent via-orange-200/10 to-transparent skew-x-[-20deg] pointer-events-none"
                                  animate={{ left: ['-40%', '120%'] }}
                                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                                />
                                {hasDiscount && (
                                  <div className="absolute top-0 right-0 bg-gradient-to-r from-orange-400 to-orange-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg z-10">
                                    -{Math.round((1 - discountedPrice / originalPrice) * 100)}%
                                  </div>
                                )}
                                <CardHeader className="p-2 pb-1 space-y-0">
                                  <CardTitle className="text-base font-extrabold flex items-center text-orange-200 drop-shadow">
                                    <span className="mr-1">{pkg.amount}</span>
                                    <CircleDot className="h-4 w-4 text-orange-300 drop-shadow-lg mx-1" />
                                    <span className="ml-1 text-xs">{pkg.amount === 1 ? "PvP Battle" : "PvP Battles"}</span>
                                  </CardTitle>
                                </CardHeader>
                                <CardContent className="p-2 pt-0 pb-1">
                                  <Separator className="my-2 border-orange-400/20" />
                                  <div className="flex items-center justify-between">
                                    <div className="flex flex-col items-start">
                                      {hasDiscount && (
                                        <span className="text-xs text-orange-200/60 line-through">
                                          {price ? `${(originalPrice / price).toFixed(3)} WLD` : `${originalPrice.toFixed(3)} WLD`}
                                        </span>
                                      )}
                                      <span className="text-base font-bold text-orange-100">
                                        {price
                                          ? `${(discountedPrice / price).toFixed(3)} WLD`
                                          : `${discountedPrice.toFixed(3)} WLD`}
                                      </span>
                                      <span className="text-xs text-orange-100/80">
                                        (~${discountedPrice.toFixed(2)})
                                      </span>
                                    </div>
                                  </div>
                                </CardContent>
                                <CardFooter className="p-2 pt-0">
                                  <Button
                                    size="sm"
                                    className={`w-full font-bold border-0 transition backdrop-blur-md ${
                                      battleLimit.canBattle
                                        ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                                        : 'bg-gradient-to-r from-gray-800/80 to-orange-400/30 text-orange-100 hover:scale-105 hover:shadow-lg'
                                    }`}
                                    onClick={() => sendPvpBattlePayment(originalPrice, pkg.id, pkg.amount)}
                                    disabled={isLoading[pkg.id] || battleLimit.canBattle}
                                  >
                                    {isLoading[pkg.id] ? (
                                      <>
                                        <div className="h-4 w-4 border-2 border-t-transparent border-orange-400 rounded-full animate-spin mr-2"></div>
                                        Processing...
                                      </>
                                    ) : battleLimit.canBattle ? (
                                      "Not Available"
                                    ) : (
                                      "Purchase"
                                    )}
                                  </Button>
                                </CardFooter>
                              </Card>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )} */}
              {/* </TabsContent> */}
            {/* </Tabs> */}
          </motion.div>


          {/* Payment info section */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.4 }}
            className="bg-white/10 rounded-xl p-5 shadow-lg space-y-4 border border-gray-400/20 backdrop-blur-md"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-medium text-gray-100">Payment Information</h3>
              <Badge variant="outline" className="text-gray-300 bg-gray-900/30 border-gray-400/30">
                Secure
              </Badge>
            </div>

            <Separator className="border-gray-400/20" />

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-200/80">
                  <Check className="h-4 w-4 text-yellow-200 mr-2" />
                  Instant delivery
                </div>
                <div className="flex items-center text-sm text-gray-200/80">
                  <Check className="h-4 w-4 text-yellow-200 mr-2" />
                  Secure transactions
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex items-center text-sm text-gray-200/80">
                  <Check className="h-4 w-4 text-yellow-200 mr-2" />
                  No hidden fees
                </div>
                <div className="flex items-center text-sm text-gray-200/80">
                  <Check className="h-4 w-4 text-yellow-200 mr-2" />
                  24/7 support
                </div>
              </div>
            </div>

            <div className="pt-2">
              <p className="text-xs text-gray-200/70">
                WLD is the Worldcoin token used for payments in this app. All transactions are processed securely and
                tickets are added instantly to your account.
              </p>
            </div>
          </motion.div>
        </main>

        <MobileNav />
      </div>
    </ProtectedRoute>
  )
}
