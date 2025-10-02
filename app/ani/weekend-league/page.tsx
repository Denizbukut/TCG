"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Trophy, Crown, Medal, Users, Zap, Target, Clock, ArrowRight } from "lucide-react"
import { motion, AnimatePresence } from "framer-motion"
import { useAuth } from "@/contexts/auth-context"
import { useRouter } from "next/navigation"

interface WeekendLeaguePlayer {
  username: string
  rank: number
  prestige_points: number
  teamRating: number
  source: 'direct' | 'qualification'
}

interface WeekendLeagueMatch {
  id: string
  round: 'round16' | 'quarter' | 'semi' | 'final'
  player1: WeekendLeaguePlayer | null
  player2: WeekendLeaguePlayer | null
  player1Score: number
  player2Score: number
  winner: WeekendLeaguePlayer | null
  isSimulated: boolean
}

interface QualificationWinner {
  username: string
  originalRank: number
  prestige_points: number
  teamRating: number
}

export default function WeekendLeaguePage() {
  const { user } = useAuth()
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [directQualified, setDirectQualified] = useState<WeekendLeaguePlayer[]>([])
  const [qualificationWinners, setQualificationWinners] = useState<QualificationWinner[]>([])
  const [weekendLeagueMatches, setWeekendLeagueMatches] = useState<WeekendLeagueMatch[]>([])
  const [isSimulated, setIsSimulated] = useState(false)
  const [userParticipating, setUserParticipating] = useState(false)

  useEffect(() => {
    fetchWeekendLeagueData()
  }, [])

  const fetchWeekendLeagueData = async () => {
    try {
      setLoading(true)

      // Fetch direct qualified players (Top 2 from Battle Arena)
      const leaderboardResponse = await fetch("/api/qualification/leaderboard")
      const leaderboardData = await leaderboardResponse.json()

      if (leaderboardData.success) {
        const top2 = leaderboardData.data.slice(0, 2).map((player: any) => ({
          username: player.username,
          rank: player.rank,
          prestige_points: player.prestige_points,
          teamRating: 0, // Will be fetched separately
          source: 'direct' as const
        }))
        setDirectQualified(top2)
      }

      // Fetch qualification match winners
      const matchesResponse = await fetch("/api/qualification/matches")
      const matchesData = await matchesResponse.json()

      if (matchesData.success && matchesData.data.length > 0) {
        const winners: QualificationWinner[] = matchesData.data.map((match: any) => ({
          username: match.winner_username,
          originalRank: match.winner_username === match.player1_username ? match.player1_rank : match.player2_rank,
          prestige_points: match.winner_username === match.player1_username ? match.player1_prestige_points : match.player2_prestige_points,
          teamRating: match.winner_username === match.player1_username ? match.player1_team_rating : match.player2_team_rating
        }))
        setQualificationWinners(winners)
      }

      // Check if weekend league is already simulated
      const weekendResponse = await fetch("/api/weekend-league/matches")
      const weekendData = await weekendResponse.json()

      if (weekendData.success && weekendData.data.length > 0) {
        // Convert database format to frontend format
        const convertedMatches = weekendData.data.map((match: any) => ({
          id: match.match_id,
          round: match.round,
          player1: match.player1_username ? {
            username: match.player1_username,
            rank: match.player1_rank,
            prestige_points: match.player1_prestige_points,
            teamRating: match.player1_team_rating,
            source: 'unknown' as const
          } : null,
          player2: match.player2_username ? {
            username: match.player2_username,
            rank: match.player2_rank,
            prestige_points: match.player2_prestige_points,
            teamRating: match.player2_team_rating,
            source: 'unknown' as const
          } : null,
          player1Score: match.player1_score,
          player2Score: match.player2_score,
          winner: match.winner_username ? {
            username: match.winner_username,
            rank: match.winner_username === match.player1_username ? match.player1_rank : match.player2_rank,
            prestige_points: match.winner_username === match.player1_username ? match.player1_prestige_points : match.player2_prestige_points,
            teamRating: match.winner_username === match.player1_username ? match.player1_team_rating : match.player2_team_rating,
            source: 'unknown' as const
          } : null,
          isSimulated: match.is_simulated
        }))
        
        setWeekendLeagueMatches(convertedMatches)
        setIsSimulated(true)
      }

      // Check if user is participating
      const allParticipants = [
        ...leaderboardData.data.slice(0, 2).map((p: any) => p.username),
        ...(matchesData.success ? matchesData.data.map((m: any) => m.winner_username) : [])
      ]
      setUserParticipating(allParticipants.includes(user?.username))

    } catch (error) {
      console.error("Error fetching weekend league data:", error)
    } finally {
      setLoading(false)
    }
  }

  const simulateWeekendLeague = async () => {
    try {
      const response = await fetch("/api/weekend-league/simulate", {
        method: "POST"
      })
      const data = await response.json()

      if (data.success) {
        // Convert API response to frontend format
        const convertedMatches = data.data.map((match: any) => ({
          id: match.id,
          round: match.round,
          player1: match.player1,
          player2: match.player2,
          player1Score: match.player1Score,
          player2Score: match.player2Score,
          winner: match.winner,
          isSimulated: match.isSimulated
        }))
        
        setWeekendLeagueMatches(convertedMatches)
        setIsSimulated(true)
      }
    } catch (error) {
      console.error("Error simulating weekend league:", error)
    }
  }

  const getRoundName = (round: string) => {
    switch (round) {
      case 'round16': return 'Round of 16'
      case 'quarter': return 'Quarterfinals'
      case 'semi': return 'Semifinals'
      case 'final': return 'Final'
      default: return round
    }
  }

  const getRoundIcon = (round: string) => {
    switch (round) {
      case 'round16': return <Users className="w-4 h-4" />
      case 'quarter': return <Target className="w-4 h-4" />
      case 'semi': return <Medal className="w-4 h-4" />
      case 'final': return <Crown className="w-4 h-4" />
      default: return <Trophy className="w-4 h-4" />
    }
  }

  const getRoundColor = (round: string) => {
    switch (round) {
      case 'round16': return 'text-blue-400'
      case 'quarter': return 'text-purple-400'
      case 'semi': return 'text-orange-400'
      case 'final': return 'text-yellow-400'
      default: return 'text-gray-400'
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <Card className="bg-gradient-to-br from-purple-900/40 to-black/60 border-purple-500/30">
          <CardContent className="p-8">
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600 mx-auto mb-4"></div>
              <p className="text-gray-300">Loading Weekend League...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-black">
      {/* Header */}
      <header className="sticky top-0 z-30 backdrop-blur-md bg-white/90 border-b border-gray-100 shadow-sm w-full">
        <div className="w-full max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.back()}
            className="text-gray-600 hover:text-gray-800"
          >
            ← Back
          </Button>
          <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-yellow-400 to-yellow-600 bg-clip-text text-transparent drop-shadow-md">
            Weekend League
          </h1>
          <div></div>
        </div>
      </header>

      <div className="pt-4 pb-20 px-4 max-w-4xl mx-auto">
        {/* Title and Description */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-6"
        >
          <h2 className="text-2xl md:text-3xl font-bold text-yellow-400 mb-2 drop-shadow-lg">
            Weekend League Championship
          </h2>
          <p className="text-sm text-gray-300">
            The ultimate tournament featuring the best players from Battle Arena
          </p>
        </motion.div>


        {/* Weekend League Tournament */}
        <Card className="bg-gradient-to-br from-black/80 to-yellow-900/20 border-yellow-500/30">
          <CardHeader>
            <CardTitle className="text-white text-center">
              <div className="flex items-center justify-center gap-2">
                <Trophy className="w-5 h-5 text-yellow-400" />
                <span>Weekend League Tournament</span>
              </div>
            </CardTitle>
            <div className="text-center">
              {!isSimulated ? (
                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-400/50">
                  <Clock className="w-4 h-4 mr-1" />
                  Tournament not started yet
                </Badge>
              ) : (
                <Badge className="bg-green-500/20 text-green-400 border-green-400/50">
                  <Trophy className="w-4 h-4 mr-1" />
                  Tournament completed
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!isSimulated ? (
              <div className="text-center py-8">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Zap className="w-6 h-6 text-yellow-400" />
                  <span className="text-lg font-bold text-yellow-400">Ready to Start Tournament</span>
                </div>
                <p className="text-sm text-gray-300">
                  All participants are ready. Tournament will be simulated automatically.
                </p>
                {/* <Button
                  onClick={simulateWeekendLeague}
                  className="bg-gradient-to-r from-yellow-500 to-orange-600 hover:from-yellow-600 hover:to-orange-700 text-white font-bold py-3 px-6 rounded-lg border border-yellow-400/30 transition-all duration-200"
                >
                  <span className="flex items-center gap-2">
                    <Zap className="w-4 h-4" />
                    Start Tournament
                  </span>
                </Button> */}
              </div>
            ) : (
              <div className="space-y-6">
                {/* Group matches by round */}
                {['round16', 'quarter', 'semi', 'final'].map(round => {
                  const roundMatches = weekendLeagueMatches.filter(match => match.round === round)
                  if (roundMatches.length === 0) return null

                  return (
                    <div key={round} className="space-y-3">
                      <h3 className={`text-lg font-bold flex items-center gap-2 ${getRoundColor(round)}`}>
                        {getRoundIcon(round)}
                        {getRoundName(round)}
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {roundMatches.map((match, index) => (
                          <motion.div
                            key={match.id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: index * 0.1 }}
                            className="p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-center flex-1 min-w-0">
                                <div className="text-xs font-bold text-white truncate" title={match.player1?.username}>
                                  {match.player1?.username || 'TBD'}
                                </div>
                                <div className="text-lg font-bold text-yellow-400">{match.player1Score}</div>
                              </div>
                              
                              <div className="text-center flex-shrink-0">
                                <div className="text-xs text-gray-400">VS</div>
                              </div>
                              
                              <div className="text-center flex-1 min-w-0">
                                <div className="text-xs font-bold text-white truncate" title={match.player2?.username}>
                                  {match.player2?.username || 'TBD'}
                                </div>
                                <div className="text-lg font-bold text-yellow-400">{match.player2Score}</div>
                              </div>
                            </div>

                            {match.winner && (
                              <div className="mt-2 text-center">
                                <Badge className="bg-yellow-500/20 text-yellow-400 border-yellow-400/50 text-xs px-2 py-1">
                                  🏆 {match.winner.username} Wins
                                </Badge>
                              </div>
                            )}
                          </motion.div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info */}
        <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <h4 className="text-blue-400 font-bold mb-2 flex items-center gap-2">
            <Users className="w-4 h-4" />
            How Weekend League works:
          </h4>
          <ul className="text-sm text-gray-300 space-y-1">
            <li>• <strong>Direct Qualification:</strong> Top 2 players from Battle Arena leaderboard</li>
            <li>• <strong>Qualification Winners:</strong> 14 winners from qualification matches (places 3-30)</li>
            <li>• <strong>Tournament Format:</strong> Single elimination knockout system</li>
            <li>• <strong>Rounds:</strong> Round of 16 → Quarterfinals → Semifinals → Final</li>
            <li>• <strong>Simulation:</strong> Matches are simulated based on team ratings and level per card</li>
            <li>• <strong>Rewards:</strong> 
              <ul className="ml-4 mt-1 space-y-1">
                <li>🥇 <strong>1st Place:</strong> 100 Icon Tickets + Level 5 Ultimate Neymar </li>
                <li>🥈 <strong>2nd Place:</strong> 50 Icon Tickets</li>
                <li>🥉 <strong>3rd Place:</strong> 25 Legendary Tickets</li>
                <li>🏅 <strong>4th Place:</strong> 25 Regular Tickets</li>
              </ul>
            </li>
          </ul>
        </div>
      </div>

      <style jsx>{`
        .shadow-gold {
          box-shadow: 0 0 24px 4px #FFD70044, 0 0 8px 2px #FFD70099;
        }
      `}</style>
    </div>
  )
}
