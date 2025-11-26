"use client"

import { useEffect, useState } from "react"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"
import { ArrowLeft, Trophy, ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/ui/button"
import CardItem from "@/components/card-item"
import { WEEKLY_CONTEST_CONFIG, getContestEndTimestamp, getTimeUntilContestEnd } from "@/lib/weekly-contest-config"
import { useI18n } from "@/contexts/i18n-context"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"

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
        const { data: entries, error: entriesError } = await supabase
          .from("weekly_contest_entries")
          .select("wallet_address, legendary_count")
          .eq("week_start_date", weekStart)
          .order("legendary_count", { ascending: false })
          .limit(20)

        if (!entriesError && entries) {
          // Get usernames for all wallet addresses
          const walletAddresses = entries.map(e => e.wallet_address)
          const { data: users } = await supabase
            .from("users")
            .select("wallet_address, username")
            .in("wallet_address", walletAddresses)

          // Create a map for quick lookup
          const usernameMap = new Map(users?.map(u => [u.wallet_address, u.username]) || [])

          // Format the data (legendary_count enthält jetzt auch Trade-Punkte)
          const formattedData: Entry[] = entries.map(entry => {
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
          const { data: userEntry, error: userError } = await supabase
            .from("weekly_contest_entries")
            .select("legendary_count")
            .eq("week_start_date", weekStart)
            .eq("wallet_address", user.wallet_address)
            .maybeSingle()

          if (!userError) {
            if (userEntry) {
              const userLegendaryCount: number = Number(userEntry.legendary_count) || 0

              // Calculate rank - count how many have more points
              const { count } = await supabase
                .from("weekly_contest_entries")
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
    <div className="min-h-screen bg-gradient-to-br from-[#18181b] to-[#232526] pb-24">
      <header className="sticky top-0 z-10 bg-black/80 border-b border-yellow-400 px-4 py-3 flex items-center gap-2 backdrop-blur shadow-lg">
        <Button variant="ghost" size="icon" onClick={() => router.push("/")}> <ArrowLeft className="h-5 w-5 text-yellow-400" /></Button>
        <h1 className="text-xl font-extrabold flex items-center gap-2 bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 bg-clip-text text-transparent animate-gradient-move drop-shadow-lg">
          <span className="relative">
            <Trophy className="w-7 h-7 text-yellow-400 animate-trophy-float" style={{ filter: 'drop-shadow(0 0 8px #FFD700)' }} />
          </span>
          {t("contest.title", "Weekly Contest")}
        </h1>
      </header>

      <main className="max-w-md mx-auto p-4 space-y-6">
        <div className="text-center text-lg font-bold">
          {contestEnded ? (
            <div className="text-red-500 text-2xl font-extrabold">{t("contest.ended", "Contest Ended")}</div>
          ) : (
            <div className="flex justify-center gap-4 text-base mt-2">
              {time && (
                <>
                  <div className="flex flex-col items-center"><span className="text-yellow-300 text-2xl font-mono">{time.days}</span><span className="text-yellow-100 text-xs">D</span></div>
                  <div className="flex flex-col items-center"><span className="text-yellow-300 text-2xl font-mono">{time.hours}</span><span className="text-yellow-100 text-xs">H</span></div>
                  <div className="flex flex-col items-center"><span className="text-yellow-300 text-2xl font-mono">{time.minutes}</span><span className="text-yellow-100 text-xs">M</span></div>
                  <div className="flex flex-col items-center"><span className="text-yellow-300 text-2xl font-mono">{time.seconds}</span><span className="text-yellow-100 text-xs">S</span></div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="bg-gradient-to-br from-[#232526] to-[#18181b] border-2 border-yellow-400 rounded-2xl shadow-xl p-6 text-center mb-4">
          <h2 className="text-xl font-bold text-yellow-300 mb-2">{t("contest.your_mission", "Your Mission:")}</h2>
          <div className="text-2xl font-extrabold bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 bg-clip-text text-transparent animate-gradient-move mb-4">
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
          
            <div className="text-sm text-yellow-100 space-y-1">
              <Collapsible className="w-full" open={isDrawCardsOpen} onOpenChange={setIsDrawCardsOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity py-0.5">
                  <span>• {t("contest.draw_cards", "Draw Cards")}</span>
                  {isDrawCardsOpen ? (
                    <ChevronUp className="h-4 w-4 text-yellow-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-yellow-400" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 text-xs pl-0 text-left">
                  <div className="text-left">• {t("contest.common_cards", "Common Cards")} = <span className="font-bold text-yellow-400">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.rare_cards", "Rare Cards")} = <span className="font-bold text-yellow-400">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.epic_cards", "Epic Cards")} = <span className="font-bold text-yellow-400">5 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.legendary_cards", "Legendary Cards")} = <span className="font-bold text-yellow-400">20 {t("contest.points", "Points")}</span></div>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible className="w-full" open={isTradeMarketOpen} onOpenChange={setIsTradeMarketOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity py-0.5">
                  <span>• {t("contest.trade_market", "Buying Cards on Trade Market")}</span>
                  {isTradeMarketOpen ? (
                    <ChevronUp className="h-4 w-4 text-yellow-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-yellow-400" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 text-xs pl-0 text-left">
                  <div className="text-left">• {t("contest.common_cards", "Common Cards")} = <span className="font-bold text-yellow-400">1 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.rare_cards", "Rare Cards")} = <span className="font-bold text-yellow-400">4 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.epic_cards", "Epic Cards")} = <span className="font-bold text-yellow-400">5 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.legendary_cards", "Legendary Cards")} = <span className="font-bold text-yellow-400">10 {t("contest.points", "Points")}</span></div>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible className="w-full" open={isWheelSpinsOpen} onOpenChange={setIsWheelSpinsOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity py-0.5">
                  <span>• {t("contest.lucky_wheel_spins", "Lucky Wheel Spins")}</span>
                  {isWheelSpinsOpen ? (
                    <ChevronUp className="h-4 w-4 text-yellow-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-yellow-400" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 text-xs pl-0 text-left">
                  <div className="text-left">• {t("contest.standard_wheel", "Standard Lucky Wheel Spin")} = <span className="font-bold text-yellow-400">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.premium_wheel", "Premium Lucky Wheel Spin")} = <span className="font-bold text-yellow-400">24 {t("contest.points", "Points")}</span> <span className="text-green-400 font-bold">(2x Bonus)</span></div>
                </CollapsibleContent>
              </Collapsible>
              <Collapsible className="w-full" open={isOtherOpen} onOpenChange={setIsOtherOpen}>
                <CollapsibleTrigger className="flex items-center justify-between w-full text-left hover:opacity-80 transition-opacity py-0.5">
                  <span>• {t("contest.other", "Other")}</span>
                  {isOtherOpen ? (
                    <ChevronUp className="h-4 w-4 text-yellow-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-yellow-400" />
                  )}
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-1 space-y-1 text-xs pl-0 text-left">
                  <div className="text-left">• {t("contest.ticket_shop", "Buying Tickets in Shop")} = <span className="font-bold text-yellow-400">2 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.referrals", "Referrals")} = <span className="font-bold text-yellow-400">5 {t("contest.points", "Points")}</span></div>
                  <div className="text-left">• {t("contest.special_deal", "Buying Special Deal")} = <span className="font-bold text-yellow-400">45 {t("contest.points", "Points")}</span> <span className="text-green-400 font-bold">(3x Bonus)</span></div>
                </CollapsibleContent>
              </Collapsible>
            </div>
            <div className="mt-3 pt-3 border-t border-yellow-400/30">
              <p className="text-xs text-yellow-200 font-semibold mb-1">{t("contest.trade_market_rules_title", "Important: Trade Market Rules")}</p>
              <p className="text-xs text-yellow-100/80">
                {t("contest.trade_market_rules_desc", "Points are only counted when buying cards from different users. Every 24 hours, you can only buy a card from the same user once and receive points.")}
              </p>
            </div>
        </div>

        <div className="bg-gradient-to-br from-[#232526] to-[#18181b] border-2 border-yellow-400 rounded-2xl shadow-xl p-6">
          <h2 className="text-lg font-bold text-yellow-300 mb-2">{t("contest.your_progress", "Your Progress")}</h2>
          {loading ? (
            <p className="text-base text-gray-300">{t("contest.loading_stats", "Loading your stats...")}</p>
          ) : userStats ? (
            <div className="space-y-1">
              <p className="text-lg text-yellow-100">
                {t("contest.you_earned", "You earned")} <span className="font-extrabold text-yellow-400 text-2xl">{userStats.legendary_count}</span> {t("contest.points_this_week", "points this week.")}
              </p>
              {userStats.rank && (
                <p className="text-base text-yellow-200">
                  {t("contest.current_rank", "Current rank:")}: <span className="font-bold text-yellow-400">#{userStats.rank}</span>
                </p>
              )}
            </div>
          ) : (
            <p className="text-base text-gray-300">{t("contest.no_points", "No points earned yet this week.")}</p>
          )}
        </div>

        <div className="bg-gradient-to-br from-[#232526] to-[#18181b] border-2 border-yellow-400 rounded-2xl shadow-xl p-6 space-y-4">
          <div>
            <h2 className="text-lg font-bold text-yellow-300 mb-2">🏆 {t("contest.prize_pool", "Prize Pool")}</h2>
            <ul className="text-lg text-yellow-100 space-y-2">
              {WEEKLY_PRIZE_POOL.map((prize, idx) => (
                <li key={prize.rank} className={`flex items-center gap-3 px-2 py-2 rounded-xl ${
                  idx === 0 ? 'bg-gradient-to-r from-yellow-400/40 to-yellow-200/10 shadow-gold' :
                  idx === 1 ? 'bg-gradient-to-r from-gray-300/30 to-yellow-100/10 shadow-lg' :
                  idx === 2 ? 'bg-gradient-to-r from-amber-700/30 to-yellow-100/10 shadow-lg' :
                  'bg-black/20'
                }`}>
                  <span className="text-2xl drop-shadow-lg">{prize.icon}</span>
                  <span className="flex-1 font-bold text-yellow-200">{prize.rank.replace(/Place/g, t("contest.place", "Place"))}</span>
                  <span className="font-extrabold bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 bg-clip-text text-transparent animate-gradient-move">{prize.reward}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-gradient-to-br from-[#232526] to-[#18181b] border-2 border-yellow-400 rounded-2xl shadow-xl p-6">
          <h2 className="text-lg font-bold text-yellow-300 mb-2">{t("contest.leaderboard", "Leaderboard")}</h2>
          {loading ? (
            <p className="text-center text-gray-300">{t("contest.loading_leaderboard", "Loading leaderboard...")}</p>
          ) : leaderboard.length === 0 ? (
            <p className="text-center text-gray-300">{t("contest.no_entries", "No entries yet this week.")}</p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((entry, index) => (
                <div
                  key={entry.user_id}
                  className={`flex justify-between items-center px-4 py-3 rounded-xl text-lg font-semibold transition-all
                    ${index === 0 ? 'bg-gradient-to-r from-yellow-400/60 to-yellow-200/20 text-yellow-900 shadow-gold' :
                      index === 1 ? 'bg-gradient-to-r from-gray-300/40 to-yellow-100/10 text-gray-900' :
                      index === 2 ? 'bg-gradient-to-r from-amber-700/40 to-yellow-100/10 text-amber-100' :
                      'bg-black/30 text-yellow-100'}
                    ${user?.username === entry.user_id ? 'border-2 border-yellow-400 shadow-gold' : 'border border-yellow-900/30'}
                  `}
                >
                  <div className="flex items-center gap-3">
                    <span className="text-xl font-extrabold w-8 text-yellow-200">{index + 1}</span>
                    <span className="truncate max-w-[120px]">{entry.user_id.length > 14 ? `${entry.user_id.slice(0, 14)}…` : entry.user_id}</span>
                  </div>
                  <span className="font-extrabold text-yellow-300">{entry.legendary_count}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
      <style jsx>{`
        .animate-gradient-move {
          background-size: 200% 200%;
          animation: gradientMove 3s linear infinite;
        }
        @keyframes gradientMove {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        .animate-trophy-float {
          animation: trophyFloat 2.5s ease-in-out infinite;
        }
        @keyframes trophyFloat {
          0% { transform: translateY(0); }
          50% { transform: translateY(-10px); }
          100% { transform: translateY(0); }
        }
        .shadow-gold {
          box-shadow: 0 0 24px 4px #FFD70044, 0 0 8px 2px #FFD70099;
        }
      `}</style>
    </div>
  )
}
