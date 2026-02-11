"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { ArrowLeft, Trophy, ChevronDown, ChevronUp, Clock } from "lucide-react"
import { Button } from "@/components/ui/button"
import CardItem from "@/components/card-item"
import { WEEKLY_CONTEST_CONFIG, getContestEndTimestamp, getTimeUntilContestEnd, isContestActive } from "@/lib/weekly-contest-config"
import { useI18n } from "@/contexts/i18n-context"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import { motion } from "framer-motion"
import ProtectedRoute from "@/components/protected-route"

const WEEKLY_PRIZE_POOL = WEEKLY_CONTEST_CONFIG.prizePool

const CONTEST_END_TIMESTAMP = getContestEndTimestamp()

type Entry = {
  user_id: string
  legendary_count: number
}

type UserStats = {
  legendary_count: number
  rank: number | null
}

export default function WeeklyContestPage() {
  const { user } = useAuth()
  const router = useRouter()
  const { t } = useI18n()
  const [leaderboard, setLeaderboard] = useState<Entry[]>([])
  const [userStats, setUserStats] = useState<UserStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(getTimeUntilContestEnd())
  const [isTradeMarketOpen, setIsTradeMarketOpen] = useState(false)
  const [isDrawCardsOpen, setIsDrawCardsOpen] = useState(false)
  const [isWheelSpinsOpen, setIsWheelSpinsOpen] = useState(false)
  const [isOtherOpen, setIsOtherOpen] = useState(false)

  useEffect(() => {
    const fetchData = async () => {
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) {
          setLoading(false)
          return
        }

        const weekStart = WEEKLY_CONTEST_CONFIG.weekStart

        // Fetch leaderboard - Top 20
        // WICHTIG: trade_points fließen jetzt direkt in legendary_count
        const { data: entries, error: entriesError } = await (supabase
          .from("weekly_contest_entries") as any)
          .select("wallet_address, legendary_count")
          .eq("week_start_date", weekStart)
          .order("legendary_count", { ascending: false })
          .limit(20)

        if (!entriesError && entries) {
          // Get usernames for all wallet addresses
          const walletAddresses = entries.map((e: any) => e.wallet_address)
          const { data: users } = await (supabase
            .from("users") as any)
            .select("wallet_address, username")
            .in("wallet_address", walletAddresses)

          // Create a map for quick lookup
          const usernameMap = new Map(users?.map((u: any) => [u.wallet_address, u.username]) || [])

          // Format the data (legendary_count enthält jetzt auch Trade-Punkte)
          const formattedData: Entry[] = entries.map((entry: any) => {
            const walletAddr = entry.wallet_address as string
            const username = usernameMap.get(walletAddr)
            return {
              user_id: (username || walletAddr.slice(0, 10) + "...") as string,
              legendary_count: Number(entry.legendary_count) || 0,
            }
          })

          setLeaderboard(formattedData)
        }

        // Fetch user stats
        // WICHTIG: trade_points fließen jetzt direkt in legendary_count
        if (user?.wallet_address) {
          const { data: userEntry, error: userError } = await (supabase
            .from("weekly_contest_entries") as any)
            .select("legendary_count")
            .eq("week_start_date", weekStart)
            .eq("wallet_address", user.wallet_address)
            .maybeSingle()

          if (!userError) {
            if (userEntry) {
              const userEntryData = userEntry as any
              const userLegendaryCount: number = Number(userEntryData.legendary_count) || 0

              // Calculate rank - count how many have more points
              const { count } = await (supabase
                .from("weekly_contest_entries") as any)
                .select("*", { count: "exact", head: true })
                .eq("week_start_date", weekStart)
                .gt("legendary_count", userLegendaryCount)

              const rank: number | null = typeof count === 'number' && count !== null ? count + 1 : null

              setUserStats({
                legendary_count: userLegendaryCount,
                rank,
              })
            } else {
              setUserStats({
                legendary_count: 0,
                rank: null,
              })
            }
          }
        }
      } catch (error) {
        console.error("Error fetching contest data:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user?.wallet_address])

  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown(getTimeUntilContestEnd())
    }, 1000)
    return () => clearInterval(interval)
  }, [])

  const formatCountdown = (ms: number) => {
    if (ms <= 0) return null
    const totalSeconds = Math.floor(ms / 1000)
    const days = Math.floor(totalSeconds / 86400)
    const hours = Math.floor((totalSeconds % 86400) / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60
    return { days, hours, minutes, seconds }
  }

  const time = formatCountdown(countdown)
  const contestEnded = countdown <= 0

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
                {t("contest.title", "Weekly Contest")}
              </h1>
            </div>
          </div>
        </header>

        <main className="w-full px-4 pb-32 flex-1 max-w-2xl mx-auto">
          <div className="space-y-3 mt-4">
            {/* Timer Card - Glassmorphism */}
            {!contestEnded && time && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10"
              >
                <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
                <div className="flex items-center justify-center gap-4">
                  <div className="flex flex-col items-center">
                    <span className="text-yellow-300 text-2xl font-mono drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]">{time.days}</span>
                    <span className="text-yellow-100 text-xs">D</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-yellow-300 text-2xl font-mono drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]">{time.hours}</span>
                    <span className="text-yellow-100 text-xs">H</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-yellow-300 text-2xl font-mono drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]">{time.minutes}</span>
                    <span className="text-yellow-100 text-xs">M</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <span className="text-yellow-300 text-2xl font-mono drop-shadow-[0_0_8px_rgba(252,211,77,0.8)]">{time.seconds}</span>
                    <span className="text-yellow-100 text-xs">S</span>
                  </div>
                </div>
              </motion.div>
            )}

            {contestEnded && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-red-500/30"
              >
                <div className="text-center text-red-400 text-lg font-semibold">
                  {t("contest.ended", "Contest Ended")}
                </div>
              </motion.div>
            )}

            {/* Mission Card - Glassmorphism */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
              <h2 className="text-base font-semibold text-white mb-3">{t("contest.your_mission", "Your Mission:")}</h2>
              <div className="text-lg font-semibold text-[#d4af37] mb-4">
                {t("contest.earn_points", "Earn as many Points as possible!")}
              </div>
          
          {/* Double Points Today Banner - UNCOMMENT FOR SPECIAL EVENTS */}
          {/* <div className="mb-4 p-3 bg-gradient-to-r from-green-500/20 to-green-400/10 border border-green-400 rounded-lg">
            <div className="flex items-center justify-center gap-2 text-green-300 font-bold">
              <span className="text-xl">🎉</span>
              <span>DOUBLE POINTS TODAY!</span>
              <span className="text-xl">🎉</span>
            </div>
            <p className="text-sm text-green-200 mt-1">All points earned today are doubled!</p>
          </div> */}
          
              <div className="text-xs text-white/70 space-y-1">
              <Collapsible className="w-full" open={isDrawCardsOpen} onOpenChange={setIsDrawCardsOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity py-1">
                  <span>• {t("contest.draw_cards", "Draw Cards")}</span>
                  {isDrawCardsOpen ? (
                    <ChevronUp className="h-3 w-3 text-white/40" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-white/40" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 text-xs pl-0 text-left">
                  <div className="text-left">• {t("contest.common_cards", "Common Cards")} = <span className="font-semibold text-[#d4af37]">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.rare_cards", "Rare Cards")} = <span className="font-semibold text-[#d4af37]">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.epic_cards", "Epic Cards")} = <span className="font-semibold text-[#d4af37]">10 {t("contest.points", "Points")}</span> <span className="text-[#10b981] font-semibold">(2x Bonus!)</span></div>
                  <div className="text-left">• {t("contest.legendary_cards", "Legendary Cards")} = <span className="font-semibold text-[#d4af37]">40 {t("contest.points", "Points")}</span> <span className="text-[#10b981] font-semibold">(2x Bonus!)</span></div>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible className="w-full" open={isTradeMarketOpen} onOpenChange={setIsTradeMarketOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity py-1">
                  <span>• {t("contest.trade_market", "Buying Cards on Trade Market")}</span>
                  {isTradeMarketOpen ? (
                    <ChevronUp className="h-3 w-3 text-white/40" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-white/40" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 text-xs pl-0 text-left">
                  <div className="text-left">• {t("contest.common_cards", "Common Cards")} = <span className="font-semibold text-[#d4af37]">1 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.rare_cards", "Rare Cards")} = <span className="font-semibold text-[#d4af37]">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.epic_cards", "Epic Cards")} = <span className="font-semibold text-[#d4af37]">3 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.legendary_cards", "Legendary Cards")} = <span className="font-semibold text-[#d4af37]">5 {t("contest.points", "Points")}</span></div>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible className="w-full" open={isWheelSpinsOpen} onOpenChange={setIsWheelSpinsOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity py-1">
                  <span>• {t("contest.lucky_wheel_spins", "Lucky Wheel Spins")}</span>
                  {isWheelSpinsOpen ? (
                    <ChevronUp className="h-3 w-3 text-white/40" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-white/40" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 text-xs pl-0 text-left">
                  <div className="text-left">• {t("contest.standard_wheel", "Standard Lucky Wheel Spin")} = <span className="font-semibold text-[#d4af37]">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.premium_wheel", "Premium Lucky Wheel Spin")} = <span className="font-semibold text-[#d4af37]">25 {t("contest.points", "Points")}</span></div>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible className="w-full" open={isOtherOpen} onOpenChange={setIsOtherOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity py-1">
                  <span>• {t("contest.other", "Other")}</span>
                  {isOtherOpen ? (
                    <ChevronUp className="h-3 w-3 text-white/40" />
                  ) : (
                    <ChevronDown className="h-3 w-3 text-white/40" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 text-xs pl-0 text-left">
                  <div className="text-left">• {t("contest.ticket_shop", "Buying Tickets in Shop")} = <span className="font-semibold text-[#d4af37]">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.referrals", "Referrals")} = <span className="font-semibold text-[#d4af37]">5 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.special_deal", "Buying Special Deal")} = <span className="font-semibold text-[#d4af37]">100 {t("contest.points", "Points")}</span></div>
                </CollapsibleContent>
              </Collapsible>
            </div>
              <div className="mt-3 pt-3 border-t border-white/10">
                <p className="text-xs text-white/80 font-semibold mb-1">{t("contest.trade_market_rules_title", "Important: Trade Market Rules")}</p>
                <p className="text-xs text-white/60">
                  {t("contest.trade_market_rules_desc", "Points are only counted when buying cards from different users. Every 24 hours, you can only buy a card from the same user once and receive points.")}
                </p>
              </div>
            </motion.div>

            {/* Progress Card - Glassmorphism */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
              className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
              <h2 className="text-base font-semibold text-white mb-3">{t("contest.your_progress", "Your Progress")}</h2>
              {loading ? (
                <p className="text-sm text-white/60">{t("contest.loading_stats", "Loading your stats...")}</p>
              ) : userStats ? (
                <div className="space-y-2">
                  <p className="text-base text-white">
                    {t("contest.you_earned", "You earned")} <span className="font-semibold text-[#d4af37] text-xl">{userStats.legendary_count}</span> {t("contest.points_this_week", "points this week.")}
                  </p>
                  {userStats.rank && (
                    <p className="text-sm text-white/70">
                      {t("contest.current_rank", "Current rank:")}: <span className="font-semibold text-[#d4af37]">#{userStats.rank}</span>
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-white/60">{t("contest.no_points", "No points earned yet this week.")}</p>
              )}
            </motion.div>

            {/* Prize Pool Card - Glassmorphism */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
              <h2 className="text-base font-semibold text-white mb-3">🏆 {t("contest.prize_pool", "Prize Pool")}</h2>
              <ul className="text-sm text-white space-y-2">
                {WEEKLY_PRIZE_POOL.map((prize, idx) => (
                  <li key={prize.rank} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                    idx === 0 ? 'bg-[#d4af37]/10 border border-[#d4af37]/20' :
                    idx === 1 ? 'bg-white/5 border border-white/10' :
                    idx === 2 ? 'bg-white/5 border border-white/10' :
                    'bg-white/5 border border-white/10'
                  }`}>
                    <span className="text-xl">{prize.icon}</span>
                    <span className="flex-1 font-semibold text-white">{prize.rank.replace(/Place/g, t("contest.place", "Place"))}</span>
                    <span className="font-semibold text-[#d4af37]">{prize.reward}</span>
                  </li>
                ))}
              </ul>
            </motion.div>

            {/* Leaderboard Card - Glassmorphism */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="relative rounded-2xl p-4 backdrop-blur-xl bg-white/5 border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
              <h2 className="text-base font-semibold text-white mb-3">{t("contest.leaderboard", "Leaderboard")}</h2>
              {loading ? (
                <p className="text-center text-white/60 text-sm">{t("contest.loading_leaderboard", "Loading leaderboard...")}</p>
              ) : leaderboard.length === 0 ? (
                <p className="text-center text-white/60 text-sm">{t("contest.no_entries", "No entries yet this week.")}</p>
              ) : (
                <div className="space-y-2">
                  {leaderboard.map((entry, index) => (
                    <div
                      key={entry.user_id}
                      className={`flex justify-between items-center px-3 py-2 rounded-lg text-sm font-medium transition-all
                        ${index === 0 ? 'bg-[#d4af37]/10 border border-[#d4af37]/20' :
                          index === 1 ? 'bg-white/5 border border-white/10' :
                          index === 2 ? 'bg-white/5 border border-white/10' :
                          'bg-white/5 border border-white/10'}
                        ${user?.username === entry.user_id ? 'border-[#d4af37] border-2' : ''}
                      `}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-base font-semibold w-6 text-white/70">{index + 1}</span>
                        <span className="truncate max-w-[120px] text-white">{entry.user_id.length > 14 ? `${entry.user_id.slice(0, 14)}…` : entry.user_id}</span>
                      </div>
                      <span className="font-semibold text-[#d4af37]">{entry.legendary_count}</span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
