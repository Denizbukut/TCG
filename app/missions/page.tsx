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
import { useI18n } from "@/contexts/i18n-context"

export default function ModernMissionsPage() {
  const { user, refreshUserData } = useAuth()
  const { t } = useI18n()
  const router = useRouter()
  const [missions, setMissions] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [bonusClaimed, setBonusClaimed] = useState(false)
  const [claimingBonus, setClaimingBonus] = useState(false)
  const loadMissions = async () => {
    if (!user) return
    const res = await fetch("/api/daily-missions", {
      method: "POST",
      body: JSON.stringify({ walletAddress: user.wallet_address }),
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
      toast.success(t("daily_missions.bonus.toast", "3 legendary tickets claimed! 🎉"))
      await refreshUserData()
      setBonusClaimed(true)
      loadMissions()
    }
    setClaimingBonus(false)
  }

  const completed = missions.filter((m) => m.reward_claimed).length
  const requiredForBonus = 5
  const cappedCompleted = Math.min(completed, requiredForBonus)
  const remainingForBonus = Math.max(requiredForBonus - completed, 0)

  const getMissionIcon = (key: string) => {
    switch (key) {
      case "trade_market_purchase":
        return "🤝"
      case "ticket_shop_bulk_purchase":
        return "🎟️"
      case "legendary_bulk_20":
        return "🌟"
      case "special_deal_purchase":
        return "💎"
      case "daily_deal_purchase":
        return "🛍️"
      default:
        return "🎯"
    }
  }

  const getMissionTitle = (mission: any) =>
    t(`daily_missions.${mission.key}.title`, mission.label)

  const getRewardText = (mission: any) => {
    const parts: string[] = []
    const ticketCount = mission.reward?.tickets ?? 0
    if (ticketCount > 0) {
      const key =
        ticketCount === 1
          ? "daily_missions.rewards.regular_ticket_one"
          : "daily_missions.rewards.regular_ticket_other"
      parts.push(t(key, `+${ticketCount} regular Ticket${ticketCount === 1 ? "" : "s"}`, { count: ticketCount }))
    }
    const legendaryCount = mission.reward?.eliteTickets ?? 0
    if (legendaryCount > 0) {
      const key =
        legendaryCount === 1
          ? "daily_missions.rewards.legendary_ticket_one"
          : "daily_missions.rewards.legendary_ticket_other"
      parts.push(
        t(key, `+${legendaryCount} legendary Ticket${legendaryCount === 1 ? "" : "s"}`, {
          count: legendaryCount,
        }),
      )
    }
    if (mission.reward?.xp) {
      parts.push(t("daily_missions.rewards.xp", `+${mission.reward.xp} XP`, { count: mission.reward.xp }))
    }
    return parts.join(" • ")
  }

  return (
    <div
      className="relative min-h-screen pb-24 text-yellow-100"
      style={{
        backgroundImage: "url('/hintergrung.png')",
        backgroundSize: "cover",
        backgroundPosition: "center",
      }}
    >
      <div className="absolute inset-0 bg-black/70" aria-hidden="true"></div>

      <div className="relative z-10 min-h-screen">
        <header className="sticky top-0 z-20 bg-black/85 border-b border-yellow-500/40 px-4 py-3 flex items-center gap-3 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.45)]">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => router.push("/")}
            className="bg-black/40 border border-yellow-500/30 text-yellow-200 hover:bg-yellow-500/20"
          >
            <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-black/60 border border-yellow-400 flex items-center justify-center shadow-lg">
              <Target className="h-4 w-4 text-yellow-300" />
          </div>
            <h1 className="text-lg font-bold text-yellow-100 tracking-wide flex items-center gap-2">
              {t("daily_missions.header.title", "Daily Missions")}
              <Sparkles className="h-4 w-4 text-yellow-300" />
          </h1>
        </div>
      </header>

        <main className="p-4 space-y-5 max-w-lg mx-auto">
        {loading ? (
          <div className="text-center py-12 text-yellow-200/80">
            <div className="relative">
              <div className="h-12 w-12 border-4 border-t-transparent border-yellow-400 rounded-full animate-spin mx-auto mb-4"></div>
              <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 h-5 w-5 text-yellow-300 animate-pulse" />
            </div>
            <p>Loading missions...</p>
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
                  <Card className="border border-yellow-500/40 bg-black/75 backdrop-blur-xl text-yellow-100 shadow-[0_10px_28px_rgba(0,0,0,0.5)] overflow-hidden">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-yellow-500/20 border border-yellow-400/60 text-xl">
                            {getMissionIcon(mission.key)}
                          </div>
                          <div>
                            <h3 className="font-semibold text-sm text-yellow-100 tracking-wide">
                              {getMissionTitle(mission)}
                            </h3>
                            <p className="text-xs text-yellow-200/80">
                              {mission.progress} / {mission.goal} •{" "}
                              <span className="text-yellow-200 font-semibold">{getRewardText(mission)}</span>
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {mission.reward_claimed && (
                            <Badge className="bg-green-500/80 text-white border border-green-400/70 text-xs">
                              <CheckCircle className="h-3 w-3 mr-1" />
                              Done
                            </Badge>
                          )}
                          {mission.progress >= mission.goal && !mission.reward_claimed && (
                            <Badge className="bg-yellow-500/80 text-black border border-yellow-400 text-xs animate-pulse">
                              <Gift className="h-3 w-3 mr-1" />
                              Ready
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="relative">
                        <Progress
                          value={Math.min((mission.progress / mission.goal) * 100, 100)}
                            className="h-2 bg-black/40 border border-yellow-500/20"
                        >
                          <div
                              className="h-full bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-100 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(255,215,0,0.45)]"
                            style={{ width: `${Math.min((mission.progress / mission.goal) * 100, 100)}%` }}
                          />
                        </Progress>
                          <div className="absolute inset-0 bg-yellow-400/10 rounded-full blur-[1px]"></div>
                        </div>
                      </div>

                      <Button
                        size="sm"
                        onClick={() => handleClaim(mission.key)}
                        disabled={mission.reward_claimed || mission.progress < mission.goal}
                        className={`w-full text-xs transition-all duration-200 tracking-wide ${
                          mission.reward_claimed
                            ? "bg-black/40 text-yellow-200/40 border border-yellow-500/10 cursor-not-allowed"
                            : mission.progress >= mission.goal
                              ? "bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-200 text-black font-semibold shadow-[0_8px_24px_rgba(255,215,0,0.25)] hover:shadow-[0_12px_30px_rgba(255,215,0,0.35)]"
                              : "bg-black/40 text-yellow-200/50 border border-yellow-500/10 cursor-not-allowed"
                        }`}
                      >
                        {mission.reward_claimed ? (
                          <motion.span
                            className="flex items-center justify-center gap-1"
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 300 }}
                          >
                            <CheckCircle className="w-3 h-3" /> Claimed
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
              <Card className="border border-yellow-500/50 bg-black/75 backdrop-blur-xl text-yellow-100 shadow-[0_12px_32px_rgba(0,0,0,0.55)] overflow-hidden">
                <CardHeader className="pb-3 border-b border-yellow-500/30 bg-black/60">
                  <CardTitle className="text-sm font-semibold text-yellow-200 flex items-center gap-2">
                    <Star className="h-4 w-4 text-yellow-300" />
                    Bonus Reward
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-4">
                  <p className="text-xs text-yellow-200/80">
                    {t("daily_missions.bonus.description", "Complete {count} missions to earn +3 legendary tickets", {
                      count: requiredForBonus,
                    })}
                  </p>

                  <div className="relative">
                    <Progress value={(cappedCompleted / requiredForBonus) * 100} className="h-3 bg-black/40 border border-yellow-500/20">
                      <div
                        className="h-full bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-100 rounded-full transition-all duration-500 shadow-[0_0_12px_rgba(255,215,0,0.45)]"
                        style={{ width: `${(cappedCompleted / requiredForBonus) * 100}%` }}
                      />
                    </Progress>
                    <div className="absolute inset-0 bg-yellow-400/10 rounded-full"></div>
                  </div>

                  <div className="flex justify-between text-xs text-yellow-200/70 mb-3">
                    <span>{cappedCompleted} / {requiredForBonus} completed</span>
                    <span>{Math.round((cappedCompleted / requiredForBonus) * 100)}%</span>
                  </div>

                  <Button
                    onClick={handleBonusClaim}
                    disabled={bonusClaimed || claimingBonus || completed < requiredForBonus}
                    className={`w-full text-sm transition-all duration-200 tracking-wide ${
                      bonusClaimed
                        ? "bg-black/40 text-yellow-200/40 border border-yellow-500/10 cursor-not-allowed"
                        : completed >= requiredForBonus
                          ? "bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-200 text-black font-semibold shadow-[0_8px_24px_rgba(255,215,0,0.25)] hover:shadow-[0_12px_30px_rgba(255,215,0,0.35)]"
                          : "bg-black/40 text-yellow-200/50 border border-yellow-500/10 cursor-not-allowed"
                    }`}
                  >
                    {bonusClaimed ? (
                      <motion.span
                        className="flex items-center justify-center gap-1"
                        initial={{ scale: 0.9, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ type: "spring", stiffness: 300 }}
                      >
                        <CheckCircle className="w-4 h-4" /> Bonus Claimed
                      </motion.span>
                    ) : claimingBonus ? (
                      <span className="flex items-center justify-center gap-2">
                        <div className="h-3 w-3 border-2 border-t-transparent border-yellow-200 rounded-full animate-spin"></div>
                        Claiming...
                      </span>
                    ) : completed >= requiredForBonus ? (
                      <>
                        <Star className="w-4 h-4 mr-1" />
                        Claim Bonus Reward
                      </>
                    ) : (
                      `Complete ${remainingForBonus} more mission${remainingForBonus !== 1 ? "s" : ""}`
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
    </div>
  )
}
