"use client"

import { useState, useEffect, useRef } from "react"
import { useAuth } from "@/contexts/auth-context"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import MobileNav from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { toast } from "@/components/ui/use-toast"
import { motion, AnimatePresence } from "framer-motion"
import {
  Crown,
  Ticket,
  Star,
  Gift,
  Check,
  Lock,
  Sparkles,
  Clock,
  Calendar,
  Bell,
  BarChart3,
  ChevronDown,
  ChevronUp,
  ArrowRight,
  Home,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import type { PremiumPass, ClaimedReward } from "@/types/database"
import { MiniKit, tokenToDecimals, Tokens, type PayCommandInput } from "@worldcoin/minikit-js"
import Link from "next/link";


interface LevelReward {
  level: number
  standardClaimed: boolean
  premiumClaimed: boolean
  isSpecialLevel?: boolean
}

export default function PremiumPassPage() {
  const { user, updateUserTickets } = useAuth()
  const [hasPremium, setHasPremium] = useState(false)
  const [premiumExpiryDate, setPremiumExpiryDate] = useState<Date | null>(null)
  const [lastLegendaryClaim, setLastLegendaryClaim] = useState<Date | null>(null)
  const [canClaimLegendary, setCanClaimLegendary] = useState(false)
  const [timeUntilNextClaim, setTimeUntilNextClaim] = useState<number | null>(null)
  const [levelRewards, setLevelRewards] = useState<LevelReward[]>([])
  const [isClaimingLegendary, setIsClaimingLegendary] = useState(false)
  const [isClaimingReward, setIsClaimingReward] = useState(false)
  const [showXpAnimation, setShowXpAnimation] = useState(false)
  const [xpGained, setXpGained] = useState(0)
  const [showLevelUpAnimation, setShowLevelUpAnimation] = useState(false)
  const [newLevel, setNewLevel] = useState(1)
  const [tickets, setTickets] = useState(0)
  const [eliteTickets, setEliteTickets] = useState(0)
  const [unclaimedRewards, setUnclaimedRewards] = useState(0)
  const [hasXpPass, setHasXpPass] = useState(false)
const [xpPassExpiryDate, setXpPassExpiryDate] = useState<Date | null>(null)

  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [showClaimPopup, setShowClaimPopup] = useState(false)
  const [claimedRewardsInfo, setClaimedRewardsInfo] = useState<{
    standardTickets: number
    eliteTickets: number
  }>({ standardTickets: 0, eliteTickets: 0 })

  // State for collapsible sections
  const [benefitsExpanded, setBenefitsExpanded] = useState(true)
  const [price, setPrice] = useState<number | null>(null)

  // Add a new state for tracking which benefits are expanded
  const [expandedBenefits, setExpandedBenefits] = useState<Record<string, boolean>>({
    dailyTicket: true,
    levelRewards: true,
    dropRates: true,
    duration: true,
  })

  // Toggle function for individual benefits
  const toggleBenefit = (benefit: string) => {
    setExpandedBenefits((prev) => ({
      ...prev,
      [benefit]: !prev[benefit],
    }))
  }
  useEffect(() => {
  const fetchPrice = async () => {
    try {
      const res = await fetch("/api/wld-price")
      const json = await res.json()

      if (json.price) {
        setPrice(json.price)
      } else {
        console.warn("Preis nicht gefunden in JSON:", json)
      }
    } catch (err) {
      console.error("Client error:", err)
    }
  }

  fetchPrice()
}, [])
useEffect(() => {
  if (price !== null) {
    console.log("WLD Preis:", price)
  }
}, [price])

  // Format time remaining as HH:MM:SS
  const formatTimeRemaining = (milliseconds: number) => {
    if (milliseconds <= 0) return "00:00:00"

    const hours = Math.floor(milliseconds / (1000 * 60 * 60))
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000)

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }

  // Format date as DD/MM/YYYY
  const formatDate = (date: Date) => {
    return date.toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    })
  }

  // Calculate XP needed for a specific level (same formula as main system)
  const calculateXpForLevel = (level: number) => {
    if (level <= 1) return 500
    // Lineare Formel: 500 + (level - 1) * 1500
    return 500 + (level - 1) * 1500
  }

  const sendXpPayment = async () => {
    try {
      console.log("Starting XP payment process...")
      const dollarAmount = 1.5
      const fallbackWldAmount = 1.5
      const wldAmount = price ? dollarAmount / price : fallbackWldAmount
      
      console.log("Payment details:", { dollarAmount, wldAmount, price })
      
      const res = await fetch("/api/initiate-payment", {
        method: "POST",
      })
      
      if (!res.ok) {
        throw new Error(`Payment initiation failed: ${res.status}`)
      }
      
      const { id } = await res.json()
      console.log("Payment initiated with ID:", id)

      const payload: PayCommandInput = {
        reference: id,
        to: "0x9311788aa11127F325b76986f0031714082F016B", // unified wallet address
        tokens: [
          {
            symbol: Tokens.WLD,
            token_amount: tokenToDecimals(wldAmount, Tokens.WLD).toString(),
          },
        ],
        description: "XP Pass",
      }

      console.log("Sending payment payload:", payload)
      const { finalPayload } = await MiniKit.commandsAsync.pay(payload)
      console.log("Payment response:", finalPayload)

      if (finalPayload.status == "success") {
        console.log("Payment successful, calling handlePurchaseXpPass")
        await handlePurchaseXpPass()
      } else {
        console.error("Payment failed:", finalPayload)
        toast({
          title: "Payment Failed",
          description: "Failed to process payment. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error in sendXpPayment:", error)
      toast({
        title: "Payment Error",
        description: error instanceof Error ? error.message : "An unexpected error occurred",
        variant: "destructive",
      })
    }
  }
const handlePurchaseXpPass = async () => {
  const supabase = getSupabaseBrowserClient()
  if (!supabase || !user?.username) return

  try {
    // Calculate expiry date (1 week from now)
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 7)

    // Check if user already has an XP pass record
    const { data: existingPass, error: checkError } = await supabase
      .from("xp_passes")
      .select("*")
      .eq("user_id", user.username)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking existing XP pass:", checkError)
      toast({
        title: "Error",
        description: "Failed to check XP pass status",
        variant: "destructive",
      })
      return
    }

    let error

    if (existingPass) {
      // Update existing XP pass
      const { error: updateError } = await supabase
        .from("xp_passes")
        .update({
          active: true,
          purchased_at: new Date().toISOString(),
          expires_at: expiryDate.toISOString(),
        })
        .eq("user_id", user.username)

      error = updateError
    } else {
      // Create new XP pass record
      const { error: insertError } = await supabase.from("xp_passes").insert({
        user_id: user.username,
        active: true,
        purchased_at: new Date().toISOString(),
        expires_at: expiryDate.toISOString(),
      })

      error = insertError
    }

    if (error) {
      console.error("Error purchasing XP pass:", error)
      toast({
        title: "Error",
        description: "Failed to purchase XP pass",
        variant: "destructive",
      })
      return
    }

    // Log the purchase
    try {
      const dollarAmount = 1.5
      const wldAmount = price ? dollarAmount / price : dollarAmount
      
      const { error: logError } = await supabase.from("ticket_purchases").insert({
        username: user.username,
        ticket_type: "xp_pass",
        amount: 1,
        price_usd: dollarAmount,
        price_wld: wldAmount.toFixed(3),
        discounted: false,
      })
      
      if (logError) {
        console.error("Error logging XP pass purchase:", logError)
      }
    } catch (logError) {
      console.error("Error in purchase logging:", logError)
    }

    // Update local state
    setHasXpPass(true)
    setXpPassExpiryDate(expiryDate)

    toast({
      title: "Success!",
      description: existingPass
        ? "You've renewed your XP Pass for 1 week!"
        : "You've purchased the XP Pass for 1 week!",
    })
  } catch (error) {
    console.error("Error in handlePurchaseXpPass:", error)
    toast({
      title: "Error",
      description: "An unexpected error occurred",
      variant: "destructive",
    })
  }
}



  // Fetch premium status and level rewards
  useEffect(() => {
    if (!user?.username) return

    const fetchPremiumStatus = async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      try {
        // Get user data including tickets and elite tickets
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("tickets, elite_tickets")
          .eq("username", user.username)
          .single()

        if (userError) {
          console.error("Error fetching user data:", userError)
        } else if (userData) {
          // Update tickets and elite tickets
          if (typeof userData.tickets === "number") {
            setTickets(userData.tickets)
          }
          if (typeof userData.elite_tickets === "number") {
            setEliteTickets(userData.elite_tickets)
          }
        }

        // Check if user has premium
        const { data: premiumData, error: premiumError } = (await supabase
          .from("premium_passes")
          .select("*")
          .eq("user_id", user.username)
          .eq("active", true)
          .single()) as { data: PremiumPass | null; error: any }

        if (premiumError && premiumError.code !== "PGRST116") {
          console.error("Error fetching premium status:", premiumError)
        }

        // Set premium status and last claim time
        if (premiumData) {
          // Check if premium pass has expired
          const now = new Date()
          const expiryDate = premiumData.expires_at ? new Date(premiumData.expires_at) : null

          if (expiryDate && now > expiryDate) {
            // Premium pass has expired, update database
            console.log("Premium pass expired, updating database...")

            // Update premium_passes table
            const { error: updatePassError } = await supabase
              .from("premium_passes")
              .update({ active: false })
              .eq("user_id", user.username)
              .eq("id", premiumData.id)

            if (updatePassError) {
              console.error("Error updating premium pass status:", updatePassError)
            }

            // Update users table
            const { error: updateUserError } = await supabase
              .from("users")
              .update({ has_premium: false })
              .eq("username", user.username)

            if (updateUserError) {
              console.error("Error updating user premium status:", updateUserError)
            }

            // Update local state
            setHasPremium(false)
            setPremiumExpiryDate(null)
            setLastLegendaryClaim(null)
            setCanClaimLegendary(false)

            toast({
              title: "Premium Pass Expired",
              description: "Your premium pass has expired. Renew to continue enjoying premium benefits!",
              variant: "destructive",
            })
          } else {
            // Premium pass is still active
            setHasPremium(true)

            // Set premium expiry date if available
            if (expiryDate) {
              setPremiumExpiryDate(expiryDate)
            }

            if (premiumData.last_elite_claim) {
              const lastClaim = new Date(premiumData.last_elite_claim as string)
              setLastLegendaryClaim(lastClaim)

              // Check if 24 hours have passed since last claim
              const timeSinceClaim = now.getTime() - lastClaim.getTime()
              const twentyFourHoursInMs = 24 * 60 * 60 * 1000

              if (timeSinceClaim >= twentyFourHoursInMs) {
                setCanClaimLegendary(true)
              } else {
                setCanClaimLegendary(false)
                setTimeUntilNextClaim(twentyFourHoursInMs - timeSinceClaim)
              }
            } else {
              // No previous claim, can claim immediately
              setCanClaimLegendary(true)
            }
          }
        } else {
          setHasPremium(false)
        }

        // 👇 XP PASS LADEN (aus xp_passes Tabelle)
        const { data: xpData, error: xpError } = await supabase
          .from("xp_passes")
          .select("*")
          .eq("user_id", user.username)
          .eq("active", true)
          .single()

        console.log("XP Pass data from xp_passes table:", { xpData, xpError })

        if (xpData) {
          const expiry = new Date(String(xpData.expires_at))
          const now = new Date()

          if (now > expiry) {
            // XP-Pass ist abgelaufen – deaktiviere
            console.log("XP Pass expired, deactivating...")
            await supabase
              .from("xp_passes")
              .update({ active: false })
              .eq("user_id", user.username)
              .eq("id", xpData.id as string)

            setHasXpPass(false)
            setXpPassExpiryDate(null)
          } else {
            // XP-Pass ist aktiv
            console.log("XP Pass is active, expiry:", expiry)
            setHasXpPass(true)
            setXpPassExpiryDate(expiry)
          }
        } else {
          console.log("No active XP pass found")
          setHasXpPass(false)
          setXpPassExpiryDate(null)
        }

        // Fetch claimed rewards
        const { data: claimedRewardsData, error: claimedRewardsError } = (await supabase
          .from("claimed_rewards")
          .select("*")
          .eq("user_id", user.username)) as { data: ClaimedReward[] | null; error: any }

        if (claimedRewardsError) {
          console.error("Error fetching claimed rewards:", claimedRewardsError)
        }

        // Create rewards array for all levels up to current level + 50 (to show future levels)
        const userLevel = user.level || 1
        const maxLevel = Math.max(userLevel + 50, 50) // Show at least up to level 50
        const rewards: LevelReward[] = []

        for (let i = 1; i <= maxLevel; i++) {
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
          if (reward.level <= userLevel) {
            if (!reward.standardClaimed) unclaimed++
            if (hasPremium && !reward.premiumClaimed) unclaimed++
          }
        })
        setUnclaimedRewards(unclaimed)
      } catch (error) {
        console.error("Error in fetchPremiumStatus:", error)
      }
    }

    fetchPremiumStatus()

    // Set up interval to update countdown timer
    const interval = setInterval(() => {
      if (timeUntilNextClaim && timeUntilNextClaim > 1000) {
        setTimeUntilNextClaim((prevTime) => (prevTime ? prevTime - 1000 : null))
      } else if (timeUntilNextClaim && timeUntilNextClaim <= 1000) {
        setCanClaimLegendary(true)
        setTimeUntilNextClaim(null)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [user?.username, user?.level, timeUntilNextClaim, hasPremium])

  // Scroll to current level when component mounts
  useEffect(() => {
    if (scrollContainerRef.current && user?.level) {
      const levelElement = document.getElementById(`level-${user.level}`)
      if (levelElement) {
        // Scroll to center the current level
        const containerWidth = scrollContainerRef.current.offsetWidth
        const scrollPosition = levelElement.offsetLeft - containerWidth / 2 + levelElement.offsetWidth / 2

        scrollContainerRef.current.scrollTo({
          left: Math.max(0, scrollPosition),
          behavior: "smooth",
        })
      }
    }
  }, [levelRewards, user?.level])

  // Handle claiming legendary ticket
  const handleClaimLegendaryTicket = async () => {
    if (!user?.username || !hasPremium || !canClaimLegendary) return

    setIsClaimingLegendary(true)
    const supabase = getSupabaseBrowserClient()

    try {
      if (!supabase) return

      // Update last claim time
      const { error: updateError } = await supabase
        .from("premium_passes")
        .update({ last_elite_claim: new Date().toISOString() })
        .eq("user_id", user.username)
        .eq("active", true)

      if (updateError) {
        console.error("Error updating last claim time:", updateError)
        toast({
          title: "Error",
          description: "Failed to claim elite ticket",
          variant: "destructive",
        })
        return
      }

      // Update user's elite tickets in the database
      const newEliteTicketCount = (eliteTickets || 0) + 1

      const { error: ticketUpdateError } = await supabase
        .from("users")
        .update({ elite_tickets: newEliteTicketCount })
        .eq("username", user.username)

      if (ticketUpdateError) {
        console.error("Error updating legendary tickets:", ticketUpdateError)
        toast({
          title: "Error",
          description: "Failed to update elite tickets",
          variant: "destructive",
        })
        return
      }

      // Update local state
      setEliteTickets(newEliteTicketCount)

      // Update auth context
      await updateUserTickets?.(tickets || 0, newEliteTicketCount)

      toast({
        title: "Success!",
        description: "You've claimed your daily elite ticket!",
      })

      // Reset claim status
      setCanClaimLegendary(false)
      setLastLegendaryClaim(new Date())
      setTimeUntilNextClaim(24 * 60 * 60 * 1000) // 24 hours in milliseconds
    } catch (error) {
      console.error("Error claiming legendary ticket:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsClaimingLegendary(false)
    }
  }

  // Handle claiming all level rewards
  const handleClaimAllRewards = async () => {
    if (!user?.username) return

    setIsClaimingReward(true)
    const supabase = getSupabaseBrowserClient()

    try {
      if (!supabase) return

      let standardTicketsToAdd = 0
      let eliteTicketsToAdd = 0
      const updatedRewards = [...levelRewards]
      const userLevel = user.level || 1

      // Process all unclaimed rewards up to the user's current level
      for (let i = 0; i < updatedRewards.length; i++) {
        const reward = updatedRewards[i]
        if (reward.level <= userLevel) {
          // Standard rewards
          if (!reward.standardClaimed) {
            // Double rewards for every 5 levels
            standardTicketsToAdd += reward.isSpecialLevel ? 6 : 3
            updatedRewards[i] = { ...reward, standardClaimed: true }
          }

          // Premium rewards (if user has premium)
          if (hasPremium && !reward.premiumClaimed) {
            // Double rewards for every 5 levels
            eliteTicketsToAdd += reward.isSpecialLevel ? 2 : 1
            updatedRewards[i] = { ...reward, premiumClaimed: true }
          }
        }
      }

      // If there are rewards to claim
      if (standardTicketsToAdd > 0 || eliteTicketsToAdd > 0) {
        // Update claimed rewards in database
        for (let i = 0; i < updatedRewards.length; i++) {
          const reward = updatedRewards[i]
          if (reward.level <= userLevel) {
            // Check if reward for this level already exists
            const { data: existingReward, error: existingRewardError } = (await supabase
              .from("claimed_rewards")
              .select("*")
              .eq("user_id", user.username)
              .eq("level", reward.level)
              .single()) as { data: ClaimedReward | null; error: any }

            if (existingRewardError && existingRewardError.code !== "PGRST116") {
              console.error("Error checking existing reward:", existingRewardError)
              continue
            }

            if (existingReward) {
              // Update existing reward
              const updateData = {
                standard_claimed: true,
                premium_claimed: hasPremium ? true : existingReward.premium_claimed,
              }

              await supabase
                .from("claimed_rewards")
                .update(updateData)
                .eq("id", existingReward.id as string)
            } else {
              // Create new reward record
              const insertData = {
                user_id: user.username,
                level: reward.level,
                standard_claimed: true,
                premium_claimed: hasPremium,
              }

              await supabase.from("claimed_rewards").insert(insertData)
            }
          }
        }

        // Calculate new ticket counts
        const newTicketCount = (tickets || 0) + standardTicketsToAdd
        const newEliteTicketCount = (eliteTickets || 0) + eliteTicketsToAdd

        // Update user's tickets in the database
        const { error: ticketUpdateError } = await supabase
          .from("users")
          .update({
            tickets: newTicketCount,
            elite_tickets: newEliteTicketCount,
          })
          .eq("username", user.username)

        if (ticketUpdateError) {
          console.error("Error updating tickets:", ticketUpdateError)
          toast({
            title: "Error",
            description: "Failed to update tickets",
            variant: "destructive",
          })
          return
        }

        // Update local state
        setTickets(newTicketCount)
        setEliteTickets(newEliteTicketCount)

        // Update auth context
        await updateUserTickets?.(newTicketCount, newEliteTicketCount)

        // Update local state
        setLevelRewards(updatedRewards)
        setUnclaimedRewards(0)

        // Show claim popup
        setClaimedRewardsInfo({
          standardTickets: standardTicketsToAdd,
          eliteTickets: eliteTicketsToAdd,
        })
        setShowClaimPopup(true)
      } else {
        toast({
          title: "No rewards to claim",
          description: "You have already claimed all available rewards.",
        })
      }
    } catch (error) {
      console.error("Error claiming all rewards:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    } finally {
      setIsClaimingReward(false)
    }
  }

  // Update the sendPayment function to reflect the promotional price
  const sendPayment = async () => {
    const dollarAmount = 1.5
    const fallbackWldAmount = 1.5
    const wldAmount = price ? dollarAmount / price : fallbackWldAmount
    const res = await fetch("/api/initiate-payment", {
      method: "POST",
    })
    const { id } = await res.json()

    const payload: PayCommandInput = {
      reference: id,
      to: "0x9311788aa11127F325b76986f0031714082F016B", // unified wallet address
      tokens: [
        {
          symbol: Tokens.WLD,
          token_amount: tokenToDecimals(wldAmount, Tokens.WLD).toString(),
        },
      ],
      description: "Premium Pass",
    }

    const { finalPayload } = await MiniKit.commandsAsync.pay(payload)

    if (finalPayload.status == "success") {
      console.log("success sending payment")
      handlePurchasePremium()
    }
  }

  // Handle purchasing premium pass
  const handlePurchasePremium = async () => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !user?.username) return

    try {
      // Calculate expiry date (1 month from now)
      const expiryDate = new Date()
      expiryDate.setDate(expiryDate.getDate() + 14)

      // Check if user already has a premium pass record
      const { data: existingPass, error: checkError } = await supabase
        .from("premium_passes")
        .select("*")
        .eq("user_id", user.username)
        .single()

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Error checking existing premium pass:", checkError)
        toast({
          title: "Error",
          description: "Failed to check premium pass status",
          variant: "destructive",
        })
        return
      }

      let error

      if (existingPass) {
        // Update existing premium pass
        const { error: updateError } = await supabase
          .from("premium_passes")
          .update({
            active: true,
            purchased_at: new Date().toISOString(),
            expires_at: expiryDate.toISOString(),
          })
          .eq("user_id", user.username)

        error = updateError
      } else {
        // Create new premium pass record
        const { error: insertError } = await supabase.from("premium_passes").insert({
          user_id: user.username,
          active: true,
          purchased_at: new Date().toISOString(),
          expires_at: expiryDate.toISOString(),
        })

        error = insertError
      }

      if (error) {
        console.error("Error purchasing premium pass:", error)
        toast({
          title: "Error",
          description: "Failed to purchase premium pass",
          variant: "destructive",
        })
        return
      }

      // Always update user's premium status to true
      const { error: updateError } = await supabase
        .from("users")
        .update({ has_premium: true })
        .eq("username", user.username)

      if (updateError) {
        console.error("Error updating user premium status:", updateError)
        toast({
          title: "Warning",
          description: "Premium pass activated but user status update failed",
          variant: "destructive",
        })
      }

      // Update local state
      setHasPremium(true)
      setPremiumExpiryDate(expiryDate)

      toast({
        title: "Success!",
        description: existingPass
          ? "You've renewed your Premium Pass for 1 month!"
          : "You've purchased the Premium Pass for 1 month!",
      })
    } catch (error) {
      console.error("Error in handlePurchasePremium:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    }
  }

  // Calculate how many legendary tickets the user would get if they purchased premium
  const calculatePotentialEliteTickets = () => {
    if (!user) return 0

    const userLevel = user.level || 1
    let count = 0

    // Count unclaimed premium rewards
    levelRewards.forEach((reward) => {
      if (reward.level <= userLevel && !reward.premiumClaimed) {
        count++
      }
    })

    return count
  }

  // Completely redesigned drop rate comparison to make percentages clearly visible
  const renderDropRateComparison = () => {
    // Standard pack rates
    const standardRates = [
      { rarity: "Common", rate: 50, color: "bg-gray-400" },
      { rarity: "Rare", rate: 34, color: "bg-blue-500" },
      { rarity: "Epic", rate: 14, color: "bg-purple-500" },
      { rarity: "Legendary", rate: 2, color: "bg-blue-500" },
    ]

    // Premium pack rates
    const premiumRates = [
      { rarity: "Common", rate: 40, color: "bg-gray-400" },
      { rarity: "Rare", rate: 36, color: "bg-blue-500" },
      { rarity: "Epic", rate: 18, color: "bg-purple-500" },
      { rarity: "Legendary", rate: 6, color: "bg-blue-500" },
    ]

    return (
      <div className="mt-3 bg-white rounded-lg p-3">
        <div className="grid grid-cols-3 gap-2 mb-3">
          <div className="text-xs font-medium text-center">Rarity</div>
          <div className="text-xs font-medium text-center">Standard</div>
          <div className="text-xs font-medium text-center">Premium</div>
        </div>

        {standardRates.map((item, index) => (
          <div key={item.rarity} className="grid grid-cols-3 gap-2 items-center mb-2">
            <div className="text-xs font-medium">{item.rarity}</div>

            {/* Standard rate */}
            <div className="flex items-center justify-center">
              <div
                className={`w-8 h-8 rounded-full ${item.color} flex items-center justify-center text-white text-xs font-bold`}
              >
                {item.rate}%
              </div>
            </div>

            {/* Premium rate with arrow */}
            <div className="flex items-center justify-center">
              <ArrowRight className="h-3 w-3 text-blue-500 mr-1" />
              <div
                className={`w-8 h-8 rounded-full ${item.color} flex items-center justify-center text-white text-xs font-bold`}
              >
                {premiumRates[index].rate}%
              </div>
            </div>
          </div>
        ))}

        <p className="text-xs text-gray-500 mt-3 italic text-center">
          Premium Pass significantly increases your chances of getting rare, epic, and elite cards in regular packs!
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3 flex flex-col gap-2">
          <div className="flex justify-between items-center">
            <h1 className="text-lg font-medium">Game Pass</h1>
            {/* Ticket Anzeige */}
            <div className="flex items-center gap-2">
              {/* Classic Ticket */}
              <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                <Ticket className="h-3.5 w-3.5 text-violet-500" />
                <span className="font-medium text-sm">{tickets}</span>
              </div>
              {/* Elite Ticket */}
              <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                <Ticket className="h-3.5 w-3.5 text-blue-500" />
                <span className="font-medium text-sm">{eliteTickets}</span>
              </div>
              {/* Icon Ticket */}
              <div className="flex items-center gap-1 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-100">
                <Crown className="h-3.5 w-3.5 text-indigo-500" />
                <span className="font-medium text-sm">{user?.icon_tickets ?? 0}</span>
              </div>
            </div>
          </div>
          {/* Back to Home Button mittig */}
          <div className="flex justify-center mt-2">
            <Link href="/">
              <Button variant="outline" className="flex items-center gap-2 px-4 py-2 rounded-full shadow bg-white/80 hover:bg-white">
                <Home className="h-5 w-5 text-blue-600" />
                <span className="font-semibold text-blue-700">Back to Home</span>
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-lg mx-auto space-y-5">
        {/* User Level */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-white rounded-2xl p-4 shadow-sm"
        >
          <div className="flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <h2 className="font-semibold text-base">Level {user?.level || 1}</h2>
              <div className="flex items-center"></div>
            </div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-gray-500">
                {user?.experience || 0} / {user?.nextLevelExp || 500} XP
              </span>
              <span className="text-xs font-medium">
                {Math.floor(((user?.experience || 0) / (user?.nextLevelExp || 500)) * 100)}%
              </span>
            </div>
            <Progress
              value={user?.experience ? (user.experience / user.nextLevelExp) * 100 : 0}
              className="h-1.5 bg-gray-100"
              indicatorClassName="bg-gradient-to-r from-violet-500 to-fuchsia-500"
            />
          </div>
        </motion.div>

        {/* Premium Pass Status */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="bg-white rounded-2xl shadow-sm overflow-hidden"
        >
          <div className="relative">
            {/* Premium background pattern */}
            <div className="absolute inset-0 overflow-hidden">
              <div className="absolute -right-16 -top-16 w-32 h-32 rounded-full bg-gradient-to-br from-blue-400/20 to-blue-600/20"></div>
              <div className="absolute -left-16 -bottom-16 w-32 h-32 rounded-full bg-gradient-to-tr from-blue-400/20 to-blue-600/20"></div>
            </div>

            <div className="relative p-4">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-r from-orange-400 to-orange-600 flex items-center justify-center relative">
                    <Crown className="h-6 w-6 text-white" />
                    {(canClaimLegendary || unclaimedRewards > 0) && (
                      <div className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                        <Bell className="h-2.5 w-2.5 text-white" />
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-medium text-lg">Premium Pass</h3>
                      {hasPremium && (
                        <Badge className="bg-gradient-to-r from-orange-400 to-orange-600 text-white">Active</Badge>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">
                      {hasPremium ? "Enjoy exclusive rewards and benefits!" : "Unlock exclusive rewards and benefits!"}
                    </p>
                    {hasPremium && premiumExpiryDate && (
                      <div className="flex items-center gap-1 mt-1 text-xs text-orange-600">
                        <Calendar className="h-3 w-3" />
                        <span>Valid until {formatDate(premiumExpiryDate)}</span>
                      </div>
                    )}
                  </div>
                </div>
                {!hasPremium && (
                  <Button
                    onClick={sendPayment}
                    className="bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white rounded-full"
                  >
                    <Crown className="h-4 w-4 mr-2" />
                    Get Premium
                  </Button>
                )}
              </div>

              {/* Limited Time Offer - Only show for non-premium users */}
              {!hasPremium && (
                <div className="bg-white rounded-xl p-3 mb-4 relative overflow-hidden border border-gray-200 shadow-sm">
                  <div className="relative flex items-center">
                    <div className="mr-3 bg-gray-100 p-2 rounded-lg">
                      <Sparkles className="h-5 w-5 text-blue-500" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-bold text-gray-900 text-sm">Support the Game</h4>
                      <p className="text-gray-700 text-sm">
                        Get <b>Premium Pass</b> for only <b>$1.50</b> and enjoy full benefits!
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Premium Benefits Highlight Box - Collapsible */}
              <div className="bg-white rounded-xl p-4 mb-4 border border-gray-200 shadow-sm">
                <button
                  onClick={() => setBenefitsExpanded(!benefitsExpanded)}
                  className="w-full flex items-center justify-between font-medium text-gray-800 mb-2"
                >
                  <div className="flex items-center">
                    <Sparkles className="h-4 w-4 mr-2 text-orange-500" />
                    Premium Pass Benefits
                    {hasPremium && (
                      <div className="ml-2 bg-green-500 rounded-full p-0.5">
                        <Check className="h-3 w-3 text-white" />
                      </div>
                    )}
                  </div>
                  {benefitsExpanded ? (
                    <ChevronUp className="h-4 w-4 text-orange-500" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-orange-500" />
                  )}
                </button>

                {benefitsExpanded && (
                  <div className="space-y-3">
                    {/* Daily Legendary Ticket */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center">
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mr-2">
                          <Ticket className="h-3 w-3 text-blue-600" />
                        </div>
                        <span className="text-sm">Daily Elite Ticket</span>
                      </div>

                      <p className="text-xs text-gray-600 mt-2 pl-7">
                        Claim <b>1 elite ticket</b> every <b>24 hours</b>
                      </p>
                    </div>

                    {/* Premium Level Rewards */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center">
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mr-2">
                          <Gift className="h-3 w-3 text-orange-600" />
                        </div>
                        <span className="text-sm">Premium Level Rewards</span>
                      </div>

                      <p className="text-xs text-gray-600 mt-2 pl-7">
                        Get <b>1 elite ticket</b> for each <b>level up</b> (2 tickets every 5 levels)
                      </p>
                    </div>

                    {/* Improved Drop Rates */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center">
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mr-2">
                          <BarChart3 className="h-3 w-3 text-blue-600" />
                        </div>
                        <span className="text-sm">
                          Improved <b>Classic Pack</b> Drop Rates
                        </span>
                      </div>

                      {renderDropRateComparison()}
                    </div>

                    {/* 30 Days Duration */}
                    <div className="bg-white rounded-lg p-3 border border-gray-100">
                      <div className="flex items-center">
                        <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0 mr-2">
                          <Calendar className="h-3 w-3 text-orange-600" />
                        </div>
                        <span className="text-sm">14 Days Duration</span>
                      </div>

                      <p className="text-xs text-gray-600 mt-2 pl-7">
                        Premium Pass is valid for <b>14 days</b> from purchase
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Daily Legendary Ticket Claim */}
              {hasPremium && (
                <div className="flex items-center gap-3 bg-white p-3 rounded-lg mb-3 border border-gray-200 shadow-sm">
                  <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                    <Ticket className="h-4 w-4 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-sm">Daily Elite Ticket</h4>
                    <p className="text-xs text-gray-500">Claim 1 elite ticket every 24 hours</p>
                  </div>
                  <Button
                    onClick={handleClaimLegendaryTicket}
                    disabled={!canClaimLegendary || isClaimingLegendary}
                    size="sm"
                    className={`rounded-full px-3 ${
                      canClaimLegendary
                        ? "bg-gradient-to-r from-blue-400 to-blue-600 hover:from-blue-500 hover:to-blue-700 text-white"
                        : "bg-gray-100 text-gray-500 hover:bg-gray-100"
                    }`}
                  >
                    {isClaimingLegendary ? (
                      <div className="flex items-center">
                        <div className="h-3 w-3 border-2 border-t-transparent border-current rounded-full animate-spin mr-2"></div>
                        <span className="text-xs">Claiming...</span>
                      </div>
                    ) : canClaimLegendary ? (
                      <span className="text-xs">Claim Now</span>
                    ) : (
                      <div className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        <span className="text-xs">{formatTimeRemaining(timeUntilNextClaim || 0)}</span>
                      </div>
                    )}
                  </Button>
                </div>
              )}

              {!hasPremium && (
                <Alert className="bg-white border-gray-200 mb-2">
                  <AlertTitle className="text-gray-800 flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    Get {calculatePotentialEliteTickets()} Elite Tickets Now!
                  </AlertTitle>
                  <AlertDescription className="text-gray-600 text-sm">
                    Purchase Premium Pass now and claim elite tickets for all your previous level ups!
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </div>
        </motion.div>


        {/* Level Rewards Timeline */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.4 }}
          className="bg-white rounded-2xl shadow-sm p-4"
        >
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-medium text-lg">Pass Rewards</h3>
            {unclaimedRewards > 0 && (
              <Button
                onClick={handleClaimAllRewards}
                disabled={isClaimingReward}
                size="sm"
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white rounded-full"
              >
                {isClaimingReward ? (
                  <div className="flex items-center">
                    <div className="h-3 w-3 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                    <span>Claiming...</span>
                  </div>
                ) : (
                  <>
                    <Gift className="h-3.5 w-3.5 mr-1.5" />
                    Claim All ({unclaimedRewards})
                  </>
                )}
              </Button>
            )}
          </div>

          {/* Scrollable timeline */}
          <div
            ref={scrollContainerRef}
            className="overflow-x-auto pb-4 hide-scrollbar"
            style={{ scrollbarWidth: "none", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
          >
            <div className="flex flex-col min-w-max">
              {/* Standard rewards (top) */}
              <div className="flex mb-2">
                {levelRewards.map((reward) => (
                  <div key={`standard-${reward.level}`} className="flex flex-col items-center w-24">
                    <div className="h-20 flex flex-col items-center justify-end pb-2">
                      <div
                        className={`
                        w-20 h-16 rounded-lg flex flex-col items-center justify-center relative
                        ${
                          reward.level <= (user?.level || 1)
                            ? reward.standardClaimed
                              ? "bg-gray-100"
                              : reward.isSpecialLevel
                                ? "bg-violet-200"
                                : "bg-violet-100"
                            : "bg-gray-100"
                        }
                      `}
                      >
                        <Ticket className="h-5 w-5 text-violet-500 mb-1" />
                        <span className="text-xs font-medium">{reward.isSpecialLevel ? "6" : "3"} Tickets</span>
                        {reward.isSpecialLevel && !reward.standardClaimed && reward.level <= (user?.level || 1) && (
                          <span className="absolute -top-2 -right-2 bg-violet-500 text-white text-[10px] px-1 rounded-full">
                            2x
                          </span>
                        )}

                        {reward.standardClaimed && (
                          <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Level markers (middle) */}
              <div className="flex items-center h-10 relative">
                <div className="absolute left-0 right-0 h-0.5 bg-gray-200"></div>

                {levelRewards.map((reward) => (
                  <div
                    id={`level-${reward.level}`}
                    key={`level-${reward.level}`}
                    className={`flex flex-col items-center justify-center w-24 z-10`}
                  >
                    <div
                      className={`
                      w-6 h-6 rounded-full flex items-center justify-center
                      ${
                        reward.level === (user?.level || 1)
                          ? "bg-violet-500 text-white"
                          : reward.level < (user?.level || 1)
                            ? "bg-violet-200"
                            : "bg-gray-200"
                      }
                    `}
                    >
                      <span className="text-xs font-medium">{reward.level}</span>
                    </div>
                    <span className="text-[10px] mt-0.5">Level {reward.level}</span>
                  </div>
                ))}
              </div>

              {/* Premium rewards (bottom) */}
              <div className="flex mt-2">
                {levelRewards.map((reward) => (
                  <div key={`premium-${reward.level}`} className="flex flex-col items-center w-24">
                    <div className="h-20 flex flex-col items-center justify-start pt-2 relative">
                      <div
                        className={`
                        w-20 h-16 rounded-lg flex flex-col items-center justify-center relative
                        ${
                          reward.level <= (user?.level || 1)
                            ? hasPremium
                              ? reward.premiumClaimed
                                ? "bg-gray-100"
                                : reward.isSpecialLevel
                                  ? "bg-blue-200"
                                  : "bg-blue-100"
                              : "bg-gray-100"
                            : "bg-gray-100"
                        }
                        ${!hasPremium ? "opacity-60" : ""}
                      `}
                      >
                        {!hasPremium && (
                          <div className="absolute inset-0 flex items-center justify-center bg-black/10 rounded-lg">
                            <Lock className="h-4 w-4 text-gray-600" />
                          </div>
                        )}

                        <Ticket className="h-5 w-5 text-blue-500 mb-1" />
                        <span className="text-xs font-medium">{reward.isSpecialLevel ? "2" : "1"} Elite</span>
                        {reward.isSpecialLevel &&
                          !reward.premiumClaimed &&
                          hasPremium &&
                          reward.level <= (user?.level || 1) && (
                            <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] px-1 rounded-full">
                              2x
                            </span>
                          )}

                        {reward.premiumClaimed && (
                          <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5">
                            <Check className="h-3 w-3 text-white" />
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-6 flex justify-center gap-4 text-xs text-gray-500">
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-violet-200 mr-1"></div>
              <span>Standard Reward</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-blue-100 mr-1"></div>
              <span>Premium Reward</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 rounded-full bg-green-500 mr-1"></div>
              <span>Claimed</span>
            </div>
          </div>
        </motion.div>

      </main>

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
              className="bg-white rounded-xl p-4 shadow-lg flex flex-col items-center gap-2 border-2 border-violet-300"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [0, 1.2, 1],
                opacity: [0, 1, 1, 0],
              }}
              transition={{
                duration: 2,
                times: [0, 0.3, 0.5, 1],
              }}
            >
              <div className="text-xl font-bold text-violet-600">+{xpGained} XP</div>
              <div className="flex items-center gap-2">
                <Star className="h-6 w-6 text-violet-500" />
              </div>
            </motion.div>
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
            className="fixed inset-0 z-50 pointer-events-none flex items-center justify-center"
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
                <div className="w-20 h-20 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 flex items-center justify-center mb-2">
                  <Crown className="h-10 w-10 text-white" />
                </div>
              </motion.div>
              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5, duration: 0.5 }}
              >
                <h2 className="text-2xl font-bold text-center">Level Up!</h2>
                <p className="text-lg font-medium text-center text-blue-600">You reached Level {newLevel}!</p>
              </motion.div>
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.7, duration: 0.5 }}
                className="flex gap-4"
              >
                <div className="flex flex-col items-center">
                  <div className="flex items-center gap-1 mb-1">
                    <Ticket className="h-4 w-4 text-violet-500" />
                    <span className="font-medium">x3</span>
                  </div>
                  <span className="text-xs text-gray-500">Classic Tickets</span>
                </div>
                {hasPremium && (
                  <div className="flex flex-col items-center">
                    <div className="flex items-center gap-1 mb-1">
                      <Ticket className="h-4 w-4 text-blue-500" />
                      <span className="font-medium">x1</span>
                    </div>
                    <span className="text-xs text-gray-500">Elite Ticket</span>
                  </div>
                )}
              </motion.div>
            </motion.div>

            {/* Particles */}
            {Array.from({ length: 30 }).map((_, i) => (
              <motion.div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-blue-400"
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

      {/* Claim Rewards Popup */}
      <AnimatePresence>
        {showClaimPopup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center"
          >
            <div className="absolute inset-0 bg-black/50" onClick={() => setShowClaimPopup(false)} />
            <motion.div
              className="relative z-10 bg-white rounded-xl p-6 shadow-lg flex flex-col items-center gap-4 border-2 border-violet-300 max-w-xs w-full"
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
            >
              <h2 className="text-xl font-bold text-center">Rewards Claimed!</h2>

              {claimedRewardsInfo.standardTickets > 0 && (
                <div className="flex items-center gap-3 bg-violet-50 p-3 rounded-lg w-full">
                  <div className="w-10 h-10 rounded-full bg-violet-100 flex items-center justify-center">
                    <Ticket className="h-5 w-5 text-violet-500" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">Classic Tickets</h4>
                    <p className="text-sm text-violet-600 font-bold">+{claimedRewardsInfo.standardTickets}</p>
                  </div>
                </div>
              )}

              {claimedRewardsInfo.eliteTickets > 0 && (
                <div className="flex items-center gap-3 bg-blue-50 p-3 rounded-lg w-full">
                  <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                    <Ticket className="h-5 w-5 text-blue-500" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium">Elite Tickets</h4>
                    <p className="text-sm text-blue-600 font-bold">+{claimedRewardsInfo.eliteTickets}</p>
                  </div>
                </div>
              )}

              <Button
                onClick={() => setShowClaimPopup(false)}
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 text-white w-full mt-2"
              >
                Continue
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <MobileNav />
    </div>
  )
}
