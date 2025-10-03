"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { claimMissionReward, claimBonusReward } from "../actions/missions"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import MobileNav from "@/components/mobile-nav"
import { Gift, CheckCircle, ArrowLeft, Sparkles, Star, Target } from "lucide-react"
import { useRouter } from "next/navigation"
import { motion } from "framer-motion"
import toast from "react-hot-toast"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"

export default function ModernMissionsPage() {
  const { user, refreshUserData } = useAuth()
  const router = useRouter()
  const [missions, setMissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bonusClaimed, setBonusClaimed] = useState(false)
  const [claimingBonus, setClaimingBonus] = useState(false)

  const loadMissions = async () => {
    if (!user) return
    const res = await fetch("/api/daily-missions", {
      method: "POST",
      body: JSON.stringify({ username: user.wallet_address }),
      headers: { "Content-Type": "application/json" },
    })
    const data = await res.json()
    if (data.success) {
      setMissions(data.missions)
      setBonusClaimed(data.bonusClaimed)
    }
    setLoading(false)
  }

  useEffect(() => {
    loadMissions()
  }, [user])

  const handleClaim = async (key: string) => {
    if (!user) return
    const res = await claimMissionReward(user.wallet_address, key)
    if (res.success) {
      toast.success("Reward claimed! ✨")
      await refreshUserData()
      loadMissions()
    }
  }

  const handleBonusClaim = async () => {
    if (!user) return
    setClaimingBonus(true)
    const res = await claimBonusReward(user.wallet_address)
    if (res.success) {
      toast.success("Bonus elite ticket claimed! 🎉")
      await refreshUserData()
      setBonusClaimed(true)
      loadMissions()
    }
    setClaimingBonus(false)
  }

  const completed = missions.filter((m) => m.reward_claimed).length

  const getMissionIcon = (key: string) => {
    switch (key) {
      case "open_packs":
        return "📦"
      case "pull_legendary":
        return "⭐"
      case "level_up":
        return "🚀"
      case "daily_login":
        return "📅"
      default:
        return "🎯"
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-100 via-purple-100 to-cyan-100 pb-24">
      <header className="sticky top-0 z-10 bg-white/90 border-b px-4 py-3 flex items-center gap-2 backdrop-blur-sm shadow-lg border-2 border-white/20">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")} className="hover:bg-purple-100">
          <ArrowLeft className="h-5 w-5 text-gray-600" />
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-pink-500 to-purple-500 flex items-center justify-center shadow-lg">
            <Target className="h-4 w-4 text-white" />
          </div>
          <h1 className="text-lg font-bold bg-gradient-to-r from-pink-600 to-purple-600 bg-clip-text text-transparent">
            Daily Missions ✨
          </h1>
        </div>
      </header>

      <main className="p-4 space-y-4 max-w-md mx-auto">
        {loading ? (
          <div className="text-center py-12">
            <div className="relative">
              <div className="h-12 w-12 border-4 border-t-transparent border-pink-500 rounded-full animate-spin mx-auto mb-4"></div>
              <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-5 w-5 text-purple-500 animate-pulse" />
            </div>
            <p className="text-gray-500">Loading missions...</p>
          </div>
        ) : (
          <>
            {/* Mission Cards */}
            <div className="space-y-3">
              {missions.map((mission, index) => (
                <motion.div
                  key={mission.key}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  <Card className="border-0 shadow-xl bg-white/90 backdrop-blur-sm border-2 border-white/20 overflow-hidden">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-3">
                          <div className="text-2xl">{getMissionIcon(mission.key)}</div>
                          <div>
                            <h3 className="font-semibold text-gray-900 text-sm">{mission.label}</h3>
                            <p className="text-xs text-gray-600">
                              {mission.progress} / {mission.goal} •{" "}
                              <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent font-semibold">
                                {mission.reward?.xp && `${mission.reward.xp} XP `}
                                {mission.reward?.tickets &&
                                  `${mission.reward.tickets} Ticket${mission.reward.tickets > 1 ? "s" : ""}`}
                              </span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {mission.reward_claimed && (
                            <Badge className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Done
                            </Badge>
                          )}
                          {mission.progress >= mission.goal && !mission.reward_claimed && (
                            <Badge className="bg-gradient-to-r from-yellow-500 to-orange-500 text-white border-0 text-xs animate-pulse">
                              <Gift className="h-3 w-3 mr-1" />
                              Ready
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="relative mb-3">
                        <Progress
                          value={Math.min((mission.progress / mission.goal) * 100, 100)}
                          className="h-2 bg-gray-200 shadow-inner"
                        >
                          <div
                            className="h-full bg-gradient-to-r from-pink-500 via-purple-500 to-cyan-500 rounded-full transition-all duration-500 shadow-lg"
                            style={{ width: `${Math.min((mission.progress / mission.goal) * 100, 100)}%` }}
                          />
                        </Progress>
                        <div className="absolute inset-0 bg-gradient-to-r from-pink-400/20 via-purple-400/20 to-cyan-400/20 rounded-full animate-pulse"></div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleClaim(mission.key)}
                        disabled={mission.reward_claimed || mission.progress < mission.goal}
                        className={`w-full text-xs transition-all duration-200 ${
                          mission.reward_claimed
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : mission.progress >= mission.goal
                              ? "bg-gradient-to-r from-pink-500 to-purple-500 hover:from-pink-600 hover:to-purple-600 text-white shadow-lg hover:shadow-xl"
                              : "bg-gray-200 text-gray-500 cursor-not-allowed"
                        }`}
                      >
                        {mission.reward_claimed ? (
                          <motion.span
                            className="flex items-center justify-center gap-1"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 300 }}
                          >
                            <CheckCircle className="w-3 h-3" /> Claimed ✨
                          </motion.span>
                        ) : mission.progress >= mission.goal ? (
                          <>
                            <Gift className="w-3 h-3 mr-1" />
                            Claim Reward
                          </>
                        ) : (
                          "Mission Incomplete"
                        )}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>

            {/* Bonus Mission Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: missions.length * 0.1 + 0.2 }}
            >
              <Card className="border-0 shadow-2xl bg-gradient-to-br from-purple-100 to-pink-100 border-2 border-purple-200/50 overflow-hidden">
                <CardHeader className="pb-3 bg-gradient-to-r from-purple-500/10 to-pink-500/10">
                  <CardTitle className="text-sm font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent flex items-center gap-2">
                    <Star className="h-4 w-4 text-purple-500" />
                    Bonus Reward ✨
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <p className="text-xs text-gray-700">
                    Complete <span className="font-bold text-purple-600">4 Missions</span> to earn{" "}
                    <span className="font-semibold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                      +1 Elite Ticket
                    </span>
                  </p>

                  <div className="relative">
                    <Progress value={(completed / 4) * 100} className="h-3 bg-gray-200 shadow-inner">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 rounded-full transition-all duration-500 shadow-lg"
                        style={{ width: `${(completed / 4) * 100}%` }}
                      />
                    </Progress>
                    <div className="absolute inset-0 bg-gradient-to-r from-purple-400/20 via-pink-400/20 to-cyan-400/20 rounded-full animate-pulse"></div>
                  </div>

                  <div className="flex justify-between text-xs text-gray-600 mb-3">
                    <span>{completed} / 4 completed</span>
                    <span>{Math.round((completed / 4) * 100)}%</span>
                  </div>

                  <Button
                    onClick={handleBonusClaim}
                    disabled={bonusClaimed || claimingBonus || completed < 4}
                    className={`w-full text-sm transition-all duration-200 ${
                      bonusClaimed
                        ? "bg-gray-100 text-gray-400"
                        : completed >= 4
                          ? "bg-gradient-to-r from-purple-500 via-pink-500 to-cyan-500 hover:from-purple-600 hover:via-pink-600 hover:to-cyan-600 text-white shadow-lg hover:shadow-xl"
                          : "bg-gray-200 text-gray-500 cursor-not-allowed"
                    }`}
                  >
                    {bonusClaimed ? (
                      <motion.span
                        className="flex items-center justify-center gap-1"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <CheckCircle className="w-4 h-4" /> Bonus Claimed ✨
                      </motion.span>
                    ) : claimingBonus ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="h-3 w-3 border-2 border-t-transparent border-white rounded-full animate-spin"></div>
                        Claiming...
                      </span>
                    ) : completed >= 4 ? (
                      <>
                        <Star className="w-4 h-4 mr-1" />
                        Claim Bonus Reward
                      </>
                    ) : (
                      `Complete ${4 - completed} more mission${4 - completed !== 1 ? "s" : ""}`
                    )}
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </main>

      <MobileNav />
    </div>
  )
}
