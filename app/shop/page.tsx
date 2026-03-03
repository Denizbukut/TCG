"use client"

import { useState, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useI18n } from "@/contexts/i18n-context"
import ProtectedRoute from "@/components/protected-route"
import { useRouter } from "next/navigation"
import { ArrowLeft } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Ticket, Info, Check, Crown, Clock, Sword, CircleDot } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { motion } from "framer-motion"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { MiniKit } from "@worldcoin/minikit-js"
import { useEffect } from "react"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { useAnixPrice } from "@/contexts/AnixPriceContext"
import { getActiveTimeDiscount } from "@/app/actions/time-discount"
import { getBattleLimitStatus } from "@/app/battle-limit-actions"
import { PaymentCurrencyToggle } from "@/components/payment-currency-toggle"
import { usePaymentCurrency } from "@/contexts/payment-currency-context"
import { ERC20_TRANSFER_ABI, PAYMENT_RECIPIENT, getTransferDetails, WLD_TOKEN_ADDRESS, USDC_TOKEN_ADDRESS, ANIX_TOKEN_ADDRESS, USDC_DECIMALS, ANIX_DECIMALS } from "@/lib/payment-utils"
import { ethers } from "ethers"


export default function ShopPage() {
  const { user, updateUserTickets } = useAuth()
  const { t } = useI18n()
  const router = useRouter()
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
  const [tokenBalances, setTokenBalances] = useState<{
    WLD: string | null
    USDC: string | null
    ANIX: string | null
  }>({
    WLD: null,
    USDC: null,
    ANIX: null,
  })
 
   const { price } = useWldPrice()
   const { price: anixPrice } = useAnixPrice()
   const { currency: paymentCurrency, setCurrency: setPaymentCurrency } = usePaymentCurrency()

  // Track if token balances have been loaded to prevent duplicate calls
  const tokenBalancesLoadedRef = useRef<string | null>(null)

  // Load token balances
  useEffect(() => {
    if (!user?.wallet_address) {
      // Reset balances when user logs out
      setTokenBalances({ WLD: null, USDC: null, ANIX: null })
      tokenBalancesLoadedRef.current = null
      return
    }

    // Prevent duplicate fetches for the same wallet address
    if (tokenBalancesLoadedRef.current === user.wallet_address) {
      return // Already loaded, skip
    }
    
    tokenBalancesLoadedRef.current = user.wallet_address

    const loadTokenBalances = async () => {
      if (!user?.wallet_address) return

      const provider = new ethers.JsonRpcProvider(
        "https://worldchain-mainnet.g.alchemy.com/public",
        { chainId: 480, name: "worldchain" },
        { staticNetwork: true }
      )

      const ERC20_ABI = [
        "function balanceOf(address) view returns (uint256)",
        "function decimals() view returns (uint8)"
      ]

      try {
        // Load WLD balance
        try {
          const wldContract = new ethers.Contract(WLD_TOKEN_ADDRESS, ERC20_ABI, provider)
          const [wldBalance, wldDecimals] = await Promise.all([
            wldContract.balanceOf(user.wallet_address),
            wldContract.decimals(),
          ])
          const wldFormatted = parseFloat(ethers.formatUnits(wldBalance, wldDecimals)).toFixed(2)
          setTokenBalances(prev => ({ ...prev, WLD: wldFormatted }))
        } catch (err) {
          console.error("Error loading WLD balance:", err)
        }

        // Load USDC balance
        try {
          const usdcContract = new ethers.Contract(USDC_TOKEN_ADDRESS, ERC20_ABI, provider)
          const [usdcBalance] = await Promise.all([
            usdcContract.balanceOf(user.wallet_address),
          ])
          const usdcFormatted = parseFloat(ethers.formatUnits(usdcBalance, USDC_DECIMALS)).toFixed(2)
          setTokenBalances(prev => ({ ...prev, USDC: usdcFormatted }))
        } catch (err) {
          console.error("Error loading USDC balance:", err)
        }

        // Load ANIX balance
        try {
          const anixContract = new ethers.Contract(ANIX_TOKEN_ADDRESS, ERC20_ABI, provider)
          const [anixBalance] = await Promise.all([
            anixContract.balanceOf(user.wallet_address),
          ])
          const anixFormatted = parseFloat(ethers.formatUnits(anixBalance, ANIX_DECIMALS)).toFixed(2)
          setTokenBalances(prev => ({ ...prev, ANIX: anixFormatted }))
        } catch (err) {
          console.error("Error loading ANIX balance:", err)
        }
      } catch (error) {
        console.error("Error loading token balances:", error)
      }
    }

    loadTokenBalances()
    // Refresh balances every 30 seconds
    const interval = setInterval(loadTokenBalances, 30000)
    return () => clearInterval(interval)
  }, [user?.wallet_address])

   const formatPrice = (usdAmount: number) => {
     const details = getTransferDetails({
       usdAmount,
       currency: paymentCurrency,
       wldPrice: price,
       anixPrice,
     })
     // For ANIX, format with 2 decimal places
     if (paymentCurrency === "ANIX") {
       const formatted = details.numericAmount.toFixed(2)
       return `${formatted} ANIX`
     }
     return details.displayAmount
   }
 
  // Track if clan role has been fetched to prevent duplicate calls
  const clanRoleFetchedRef = useRef<string | null>(null)

  // Fetch user clan role
  useEffect(() => {
    if (!user?.username) {
      // Reset when user logs out
      clanRoleFetchedRef.current = null
      return
    }
    // Prevent duplicate fetches for the same username
    if (clanRoleFetchedRef.current === user.username) return
    
    clanRoleFetchedRef.current = user.username

    const fetchUserClanRole = async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      try {
        const { data: userData, error: userError } = await (supabase
          .from("users") as any)
          .select("clan_id")
          .eq("username", user.username)
          .single()

        if (userError || !userData?.clan_id) {
          setUserClanRole(null)
          return
        }

        const clanId = userData.clan_id

        // Fetch user role in clan
        const { data: memberData, error: memberError } = await (supabase
          .from("clan_members") as any)
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
        const { count, error: countError } = await (supabase
          .from("clan_members") as any)
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

  // Track if battle limit has been fetched to prevent duplicate calls
  const battleLimitFetchedRef = useRef<string | null>(null)

  // Fetch battle limit status
  useEffect(() => {
    if (!user?.username) {
      // Reset when user logs out
      battleLimitFetchedRef.current = null
      return
    }
    // Prevent duplicate fetches for the same username
    if (battleLimitFetchedRef.current === user.username) return
    
    battleLimitFetchedRef.current = user.username

    const fetchBattleLimit = async () => {
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

  // Track if time discount has been fetched to prevent duplicate calls
  const timeDiscountFetchedRef = useRef(false)

  // Fetch time-based discount
  useEffect(() => {
    // Prevent duplicate initial fetch
    if (timeDiscountFetchedRef.current) return
    timeDiscountFetchedRef.current = true

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

  // ANIX Rabatt: 10% dauerhafter Rabatt wenn mit ANIX bezahlt wird
  // WICHTIG: Bei ANIX wird KEIN Time-Based Discount angewendet, da ANIX bereits 10% Rabatt hat
  if (paymentCurrency === "ANIX") {
    return originalPrice * 0.9
  }

  // Zeitbasierter Rabatt (höchste Priorität) - nur für WLD/USDC
  if (timeDiscount?.isActive && timeDiscount.value > 0) {
    finalPrice = originalPrice * (1 - timeDiscount.value)
    discountApplied = true
  }
  
  // Bestehende Rabatte (niedrigere Priorität) - nur für WLD/USDC
  const qualifiesForExistingDiscount =
    userClanRole === "cheap_hustler" ||
    (userClanRole === "leader" && clanMemberCount >= 30)

  if (qualifiesForExistingDiscount && !discountApplied) {
    finalPrice = originalPrice * 0.9
  }

  return finalPrice
}
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

    const transferDetails = getTransferDetails({
      usdAmount: discountedPrice,
      currency: paymentCurrency,
      wldPrice: price,
      anixPrice,
    })

    const txResult = await MiniKit.commandsAsync.sendTransaction({
      transaction: [
        {
          address: transferDetails.tokenAddress,
          abi: ERC20_TRANSFER_ABI,
          functionName: "transfer",
          args: [PAYMENT_RECIPIENT, transferDetails.rawAmount],
        },
      ],
    })

    console.log("MiniKit sendTransaction result:", txResult)

    const { finalPayload } = txResult
    console.log("MiniKit finalPayload:", finalPayload)

    if (finalPayload.status === "success") {
      console.log("success sending payment")
      await handleBuyTickets(packageId, ticketAmount, ticketType)
    } else {
      toast({
        title: t("shop.payment_failed", "Payment Failed"),
        description: t("shop.payment_failed_desc", "Your payment could not be processed. Please try again."),
        variant: "destructive",
      })
      setIsLoading({ ...isLoading, [packageId]: false })
    }
  } catch (error) {
    console.error("Payment error:", error)
    toast({
      title: t("shop.payment_error", "Payment Error"),
      description: t("shop.payment_error_desc", "An error occurred during payment. Please try again."),
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
        title: t("shop.error", "Error"),
        description: t("shop.login_required_to_purchase", "You must be logged in to purchase tickets"),
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
      const { data: userData, error: fetchError } = await (supabase
        .from("users") as any)
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
      const { error: updateError } = await ((supabase
        .from("users") as any)
        .update({
          tickets: newTicketCount,
          elite_tickets: newEliteTicketCount,
          icon_tickets: newIconTicketCount,
        })
        .eq("username", user.username) as any)

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
await ((supabase.from("ticket_purchases") as any).insert({
  wallet_address: user.wallet_address,
  ticket_type: ticketType === "regular" ? "classic" : ticketType === "legendary" ? "elite" : "icon",
  amount: ticketAmount,
  price_usd: getDiscountedPrice(packageId.startsWith("reg") ? regularPackages.find(p => p.id === packageId)?.price ?? 0 : legendaryPackages.find(p => p.id === packageId)?.price ?? 0),
  price_wld: price ? (getDiscountedPrice(packageId.startsWith("reg") ? regularPackages.find(p => p.id === packageId)?.price ?? 0 : legendaryPackages.find(p => p.id === packageId)?.price ?? 0) / price).toFixed(3) : null,
  discounted: getDiscountedPrice(packageId.startsWith("reg") ? regularPackages.find(p => p.id === packageId)?.price ?? 0 : legendaryPackages.find(p => p.id === packageId)?.price ?? 0) < (packageId.startsWith("reg") ? regularPackages.find(p => p.id === packageId)?.price ?? 0 : legendaryPackages.find(p => p.id === packageId)?.price ?? 0),
}) as any)

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
        title: t("shop.purchase_successful", "Purchase Successful!"),
        description: t("shop.purchase_successful_desc", "You've purchased {amount} {type} tickets!{discount}", { 
          amount: ticketAmount, 
          type: ticketType === "legendary" ? "elite" : ticketType === "icon" ? "icon" : "classic",
          discount: discountMessage
        }),
      })
    } catch (error) {
      console.error("Error buying tickets:", error)
      toast({
        title: t("shop.error", "Error"),
        description: error instanceof Error ? error.message : t("shop.unexpected_error", "An unexpected error occurred"),
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
      <div className="flex flex-col min-h-screen text-white relative bg-[#0a0a0a] overflow-y-auto">
        {/* Premium Header - Coinbase Style */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-[#1a1a1a]">
          <div className="w-full px-4 py-2.5 flex items-center justify-between max-w-2xl mx-auto">
            {/* Left: Back Button + Title */}
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.push("/")}
                className="w-8 h-8 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4 text-white/70" />
              </Button>
              <h1 className="text-base font-semibold tracking-tight text-white">
                {t("shop.title", "Ticket Shop")}
              </h1>
            </div>
            
            {/* Right: Tickets */}
            <div className="flex items-center gap-2">
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

        <main className="w-full px-4 pb-32 flex-1 max-w-2xl mx-auto">
          <div className="space-y-3 mt-4">
            {/* Time-based Discount Banner */}
            {timeDiscount?.isActive && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10"
              >
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
                <div className="flex items-center justify-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-[#d4af37]" />
                  <p className="font-bold text-sm tracking-wide text-white">{t("shop.limited_offer", "LIMITED TIME OFFER!")}</p>
                </div>
                <p className="text-xs text-white/70 mb-2 text-center">
                  {t("shop.discount_off", "{percent}% off all tickets!", { percent: Math.round(timeDiscount.value * 100) })}
                </p>
                <div className="flex items-center justify-center gap-1">
                  <span className="text-xs text-white/60">{t("shop.ends_in", "Ends in:")}:</span>
                  <span className="font-mono font-bold text-sm text-[#d4af37]">{discountTimeLeft}</span>
                </div>
              </motion.div>
            )}

            {/* Existing Discount Banner */}
            {(userClanRole === "cheap_hustler" || (userClanRole === "leader" && clanMemberCount >= 30)) && !timeDiscount?.isActive && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10"
              >
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
                <p className="font-semibold text-sm tracking-wide text-white text-center mb-1">{t("shop.discount_active", "Discount Active!")}</p>
                <p className="text-xs text-white/70 text-center">
                  {userClanRole === "cheap_hustler"
                    ? t("shop.cheap_hustler_discount", "You get 10% off all ticket purchases as a Cheap Hustler!")
                    : t("shop.leader_discount", "You get 10% off all ticket purchases as a Leader of a 30+ member clan!")}
                </p>
              </motion.div>
            )}

            {/* Currency Toggle */}
            <div className="flex justify-center mb-3">
              <PaymentCurrencyToggle size="sm" />
            </div>

            {/* Main Shop Tabs */}
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
              <Tabs defaultValue="regular" className="w-full">
                <TabsList className="grid w-full grid-cols-2 h-12 rounded-xl p-1 bg-white/5 backdrop-blur-sm border border-white/10 mb-4">
                  <TabsTrigger
                    value="regular"
                    className="rounded-lg data-[state=active]:bg-[#d4af37]/20 data-[state=active]:border data-[state=active]:border-[#d4af37]/30 data-[state=active]:text-white transition-all font-semibold tracking-wide text-white/70"
                  >
                    <Ticket className="h-[18px] w-[18px] mr-2 flex-shrink-0" />
                    {t("shop.regular_tickets", "Regular Tickets")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="legendary"
                    className="rounded-lg data-[state=active]:bg-[#d4af37]/20 data-[state=active]:border data-[state=active]:border-[#d4af37]/30 data-[state=active]:text-white transition-all font-semibold tracking-wide text-white/70"
                  >
                    <Crown className="h-[18px] w-[18px] mr-2 flex-shrink-0" />
                    {t("shop.legendary_tickets", "Legendary Tickets")}
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
                          <div
                            className="relative rounded-xl p-3 backdrop-blur-xl bg-white/5 border border-white/10 h-full flex flex-col"
                          >
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
                            {hasDiscount && (
                              <div className="absolute top-2 right-2 bg-[#d4af37] text-black text-xs font-bold px-2 py-0.5 rounded-full z-10">
                                -{Math.round((1 - discountedPrice / originalPrice) * 100)}%
                              </div>
                            )}
                            <div className="flex items-center gap-2 mb-2">
                              <Ticket className="h-4 w-4 text-[#d4af37]" />
                              <span className="text-sm font-semibold text-white">
                                {pkg.amount} {pkg.amount === 1 ? t("shop.regular_ticket", "Regular Ticket") : t("shop.regular_tickets", "Regular Tickets")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 mb-3 flex-1">
                              {hasDiscount && (
                                <span className="text-xs text-white/50 line-through">
                                  {formatPrice(originalPrice)}
                                </span>
                              )}
                              <span className="text-base font-bold text-white">
                                {formatPrice(discountedPrice)}
                              </span>
                              <span className="text-xs text-white/60">
                                (~${discountedPrice.toFixed(2)})
                              </span>
                            </div>
                            <Button
                              size="sm"
                              className="w-full bg-gradient-to-r from-[#d4af37] to-[#f4d03f] hover:from-[#f4d03f] hover:to-[#d4af37] text-black font-semibold rounded-lg"
                              onClick={() => sendPayment(originalPrice, pkg.id, pkg.amount, 'regular')}
                              disabled={isLoading[pkg.id]}
                            >
                              {isLoading[pkg.id] ? (
                                <>
                                  <div className="h-4 w-4 border-2 border-t-transparent border-black rounded-full animate-spin mr-2"></div>
                                  {t("shop.processing", "Processing...")}
                                </>
                              ) : (
                                t("shop.purchase", "Purchase")
                              )}
                            </Button>
                          </div>
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
                          <div
                            className="relative rounded-xl p-3 backdrop-blur-xl bg-white/5 border border-white/10 h-full flex flex-col"
                          >
                            <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
                            {hasDiscount && (
                              <div className="absolute top-2 right-2 bg-[#d4af37] text-black text-xs font-bold px-2 py-0.5 rounded-full z-10">
                                -{Math.round((1 - discountedPrice / originalPrice) * 100)}%
                              </div>
                            )}
                            <div className="flex items-center gap-2 mb-2">
                              <Crown className="h-4 w-4 text-[#d4af37]" />
                              <span className="text-sm font-semibold text-white">
                                {pkg.amount} {pkg.amount === 1 ? t("shop.legendary_ticket", "Legendary Ticket") : t("shop.legendary_tickets", "Legendary Tickets")}
                              </span>
                            </div>
                            <div className="flex flex-col gap-1 mb-3 flex-1">
                              {hasDiscount && (
                                <span className="text-xs text-white/50 line-through">
                                  {formatPrice(originalPrice)}
                                </span>
                              )}
                              <span className="text-base font-bold text-white">
                                {formatPrice(discountedPrice)}
                              </span>
                              <span className="text-xs text-white/60">
                                (~${discountedPrice.toFixed(2)})
                              </span>
                            </div>
                            <Button
                              size="sm"
                              className="w-full bg-gradient-to-r from-[#d4af37] to-[#f4d03f] hover:from-[#f4d03f] hover:to-[#d4af37] text-black font-semibold rounded-lg"
                              onClick={() => sendPayment(originalPrice, pkg.id, pkg.amount, 'legendary')}
                              disabled={isLoading[pkg.id]}
                            >
                              {isLoading[pkg.id] ? (
                                <>
                                  <div className="h-4 w-4 border-2 border-t-transparent border-black rounded-full animate-spin mr-2"></div>
                                  {t("shop.processing", "Processing...")}
                                </>
                              ) : (
                                t("shop.purchase", "Purchase")
                              )}
                            </Button>
                          </div>
                        </motion.div>
                      )
                    })}
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>

            {/* Payment info section */}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-white">{t("shop.payment_info", "Payment Information")}</h3>
                <Badge className="bg-[#d4af37]/20 border border-[#d4af37]/30 text-[#d4af37]">
                  {t("shop.secure", "Secure")}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-3">
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-white/70">
                    <Check className="h-4 w-4 text-[#d4af37] mr-2" />
                    {t("shop.instant_delivery", "Instant delivery")}
                  </div>
                  <div className="flex items-center text-sm text-white/70">
                    <Check className="h-4 w-4 text-[#d4af37] mr-2" />
                    {t("shop.secure_transactions", "Secure transactions")}
                  </div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center text-sm text-white/70">
                    <Check className="h-4 w-4 text-[#d4af37] mr-2" />
                    {t("shop.no_hidden_fees", "No hidden fees")}
                  </div>
                  <div className="flex items-center text-sm text-white/70">
                    <Check className="h-4 w-4 text-[#d4af37] mr-2" />
                    {t("shop.support_24_7", "24/7 support")}
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <p className="text-xs text-white/60">
                  {t("shop.wld_description", "WLD is the Worldcoin token used for payments in this app. All transactions are processed securely and tickets are added instantly to your account.")}
                </p>
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
