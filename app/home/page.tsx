"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { claimDailyBonus } from "@/app/actions"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import { Ticket, Gift, Sparkles, Crown, Clock, ArrowRightLeft, X as LucideX, Send as LucideSend } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import Link from "next/link"
import { motion } from "framer-motion"
// Removed Next.js Image import - using regular img tags
import { XLogo } from "@/components/x-logo"

export default function HomePage() {
  const { user, updateUserTickets } = useAuth()
  const [claimLoading, setClaimLoading] = useState(false)
  const [nextClaimTime, setNextClaimTime] = useState<Date | null>(null)
  const [timeRemaining, setTimeRemaining] = useState<string>("")
  const [canClaim, setCanClaim] = useState(false)
  const [showBuyAvatarDialog, setShowBuyAvatarDialog] = useState(false)
  const [selectedAvatarToBuy, setSelectedAvatarToBuy] = useState(null)

  // Check if user can claim bonus and set up countdown timer
  useEffect(() => {
    if (!user) return

    const checkClaimStatus = async () => {
      try {
        // Get the last claim time from localStorage
        const lastClaimTimeStr = localStorage.getItem(`lastClaim_${user.username}`)
        const lastClaimTime = lastClaimTimeStr ? new Date(lastClaimTimeStr) : null

        if (!lastClaimTime) {
          setCanClaim(true)
          return
        }

        // Calculate next claim time (12 hours after last claim)
        const nextClaim = new Date(lastClaimTime.getTime() + 12 * 60 * 60 * 1000)
        setNextClaimTime(nextClaim)

        // Check if current time is past the next claim time
        const now = new Date()
        setCanClaim(now >= nextClaim)

        // Update the timer
        updateCountdown(nextClaim)
      } catch (error) {
        console.error("Error checking claim status:", error)
      }
    }

    checkClaimStatus()

    // Set up interval to update countdown
    const interval = setInterval(() => {
      if (nextClaimTime) {
        updateCountdown(nextClaimTime)
      }
    }, 1000)

    return () => clearInterval(interval)
  }, [user, nextClaimTime])

  // Update countdown timer
  const updateCountdown = (nextClaim: Date) => {
    const now = new Date()
    const diff = nextClaim.getTime() - now.getTime()

    if (diff <= 0) {
      setTimeRemaining("Ready to claim!")
      setCanClaim(true)
      return
    }

    // Calculate hours, minutes, seconds
    const hours = Math.floor(diff / (1000 * 60 * 60))
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((diff % (1000 * 60)) / 1000)

    setTimeRemaining(
      `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`,
    )
    setCanClaim(false)
  }

  const handleClaimBonus = async () => {
    if (!user || !canClaim) return

    setClaimLoading(true)
    try {
      // Call the server action to claim the bonus
      const result = await claimDailyBonus(user.username)

      if (result.success) {
        // Update the user's tickets in the auth context
        updateUserTickets(typeof result.newTicketCount === "number" ? result.newTicketCount : 0)

        // Store the current time as the last claim time
        const now = new Date()
        localStorage.setItem(`lastClaim_${user.username}`, now.toISOString())

        // Set the next claim time to 12 hours from now
        const nextClaim = new Date(now.getTime() + 12 * 60 * 60 * 1000)
        setNextClaimTime(nextClaim)
        setCanClaim(false)

        toast({
          title: "Success!",
          description: "You've claimed 1 ticket as your daily bonus!",
        })
      } else if (result.alreadyClaimed) {
        toast({
          title: "Already Claimed",
          description: "You need to wait before claiming again.",
        })
      } else {
        toast({
          title: "Error",
          description: result.error || "Failed to claim bonus",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error claiming bonus:", error)
      toast({
        title: "Error",
        description: "Failed to claim daily bonus",
        variant: "destructive",
      })
    } finally {
      setClaimLoading(false)
    }
  }

 return (
  <ProtectedRoute>
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50 pb-20 text-black">
      <header className="bg-white p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button className="w-10 h-10 rounded-full bg-black flex items-center justify-center transition-transform hover:scale-105">
              <LucideX className="h-6 w-6 text-white" />
            </button>
            <button className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center transition-transform hover:scale-105">
              <LucideSend className="h-6 w-6 text-white" />
            </button>
          </div>
          <h1 className="text-xl font-bold text-black">Anime World TCG</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded-full">
              <Ticket className="h-4 w-4 text-blue-500" />
              <span className="font-bold text-black">{typeof user?.tickets === "number" ? user.tickets : 0}</span>
            </div>
            <div className="flex items-center gap-1 bg-gray-100 px-3 py-1.5 rounded-full">
              <Crown className="h-4 w-4 text-yellow-500" />
              <span className="font-bold text-black">{typeof user?.legendary_tickets === "number" ? user.legendary_tickets : 0}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 space-y-6">
        {/* Join + Premium/Clans */}
        <motion.div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-bold text-black">Join the Community</h3>
            <p className="text-sm text-gray-700">Connect with other players</p>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm">
            <h3 className="font-bold text-black">Premium Pass & Clans</h3>
            <p className="text-sm text-gray-700">Exclusive rewards & join teams</p>
          </div>
        </motion.div>

        {/* Weekly Contest */}
        <motion.div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-yellow-500">
          <h3 className="font-bold text-yellow-600">Weekly Contest</h3>
          <p className="text-sm text-gray-700">Compete and win</p>
        </motion.div>

        {/* Missions */}
        <motion.div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold text-black">Missions</h3>
          <p className="text-sm text-gray-700">Complete tasks and earn</p>
        </motion.div>

        {/* Referrals + Ticket Claim */}
        <motion.div className="grid grid-cols-2 gap-4">
          <div className="bg-white rounded-xl p-4 shadow-sm border-l-4 border-green-500">
            <h3 className="font-bold text-green-600">Referrals</h3>
            <p className="text-sm text-gray-700">Invite friends for rewards</p>
          </div>
          <motion.div className="bg-white rounded-xl p-4 shadow-sm">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                  <Gift className="h-5 w-5 text-blue-500" />
                </div>
                <div>
                  <h3 className="font-bold text-black">Bonus Tickets</h3>
                  <p className="text-sm text-gray-700">Claim 3 tickets every 12 hours</p>
                  {!canClaim && timeRemaining && (
                    <div className="flex items-center mt-1 text-xs text-gray-500">
                      <Clock className="h-3 w-3 mr-1" />
                      <span>Next claim in: {timeRemaining}</span>
                    </div>
                  )}
                </div>
              </div>
              <Button
                onClick={handleClaimBonus}
                disabled={claimLoading || !canClaim}
                className={
                  !canClaim
                    ? "bg-gray-100 text-gray-700"
                    : "bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white"
                }
              >
                {claimLoading ? (
                  <div className="flex items-center">
                    <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                    <span>Claiming...</span>
                  </div>
                ) : !canClaim ? (
                  "Wait"
                ) : (
                  "Claim"
                )}
              </Button>
            </div>
          </motion.div>
        </motion.div>

        {/* Ticket Shop */}
        <motion.div className="bg-white rounded-xl p-4 shadow-sm">
          <h3 className="font-bold text-black">Ticket Shop</h3>
          <p className="text-sm text-gray-700">Buy more tickets</p>
        </motion.div>

        {/* Quick Access */}
        <motion.div className="grid grid-cols-2 gap-4">
          <Link href="/collection" className="block">
            <div className="bg-white rounded-xl p-4 shadow-sm h-full">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center mb-2">
                <Sparkles className="h-5 w-5 text-purple-500" />
              </div>
              <h3 className="font-bold text-black">Collection</h3>
              <p className="text-sm text-gray-700">View your cards</p>
            </div>
          </Link>
          <Link href="/trade" className="block">
            <div className="bg-white rounded-xl p-4 shadow-sm h-full">
              <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-2">
                <ArrowRightLeft className="h-5 w-5 text-green-500" />
              </div>
              <h3 className="font-bold text-black">Transfer</h3>
              <p className="text-sm text-gray-700">Exchange cards</p>
            </div>
          </Link>
        </motion.div>
      </main>

      <MobileNav />
    </div>
  </ProtectedRoute>
)
}

