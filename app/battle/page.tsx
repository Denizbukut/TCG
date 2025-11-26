"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import BattleStageSelection from "@/components/battle/battle-stage-selection"
import BattleArena from "@/components/battle/battle-arena"
import PvpBattleArena from "@/components/battle/pvp-battle-arena"
import BattleModeSelector from "@/components/battle/battle-mode-selector"
import PvpLeaderboard from "@/components/battle/pvp-leaderboard"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { checkBattleLimit, incrementBattleCount, getBattleLimitStatus } from "../battle-limit-actions"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { motion } from "framer-motion"
import { toast } from "@/components/ui/use-toast"
import { Button } from "@/components/ui/button"
import { ArrowLeft, Info, X } from "lucide-react"
import WeekendLeagueCountdown from "@/components/weekend-league-countdown"
import { useRouter } from "next/navigation"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export default function BattlePage() {
  const { user } = useAuth()
  const router = useRouter()
  const [activeTab, setActiveTab] = useState("story")
  const [selectedStage, setSelectedStage] = useState<any>(null)
  const [battleStarted, setBattleStarted] = useState(false)
  const [pvpBattleStarted, setPvpBattleStarted] = useState(false)
  const [stages, setStages] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [userTeam, setUserTeam] = useState<any>(null)
  const [userCards, setUserCards] = useState<any[]>([])
  const [teamLoading, setTeamLoading] = useState(true)
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([])
  const [playersLoading, setPlayersLoading] = useState(true)
  const [selectedBattleMode, setSelectedBattleMode] = useState<any>(null)
  const [showModeSelector, setShowModeSelector] = useState(false)
  const [prestigePoints, setPrestigePoints] = useState(100)
  const [selectedOpponent, setSelectedOpponent] = useState<string | null>(null)
  const [showInfoDialog, setShowInfoDialog] = useState(false)
  const [battleLimit, setBattleLimit] = useState<{
    battlesUsed: number
    battlesRemaining: number
    dailyLimit: number
    canBattle: boolean
  } | null>(null)

  useEffect(() => {
    if (user) {
      fetchStages()
      fetchUserTeam()
      fetchAvailablePlayers()
      fetchPrestigePoints()
      fetchBattleLimit()
    }
  }, [user])

  const fetchBattleLimit = async () => {
    if (!user?.username) return
    
    try {
      const result = await getBattleLimitStatus(user.username)
      if (result.success) {
        setBattleLimit({
          battlesUsed: result.battlesUsed || 0,
          battlesRemaining: result.battlesRemaining || 0,
          dailyLimit: result.dailyLimit || 5,
          canBattle: result.canBattle || false
        })
      }
    } catch (error) {
      console.error("Error fetching battle limit:", error)
    }
  }

  const fetchStages = async () => {
    setLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { data, error } = await supabase
        .from("battle_stages")
        .select("*")
        .order("stage_number")
        .order("level_number")

      if (error) {
        console.error("Error fetching battle stages:", error)
        // Don't return, just set empty array
        setStages([])
      } else {
        // Group stages by stage_number
        const groupedStages: Record<number, any[]> = {}
        data?.forEach((stage) => {
          const stageNumber = stage.stage_number as number
          if (!groupedStages[stageNumber]) {
            groupedStages[stageNumber] = []
          }
          groupedStages[stageNumber].push(stage)
        })

        setStages(Object.values(groupedStages))
      }
    } catch (error) {
      console.error("Error:", error)
      setStages([])
    } finally {
      setLoading(false)
    }
  }

  const handleStageSelect = async (stage: any) => {
    // Story mode is disabled - no battle limit check needed
    setSelectedStage(stage)
    setBattleStarted(true)
  }

  const handleBattleEnd = async () => {
    setBattleStarted(false)
    setSelectedStage(null)
    
    // Refresh battle limit status and prestige points after battle ends
    if (user?.username) {
      await fetchBattleLimit()
      await fetchPrestigePoints()
    }
  }



    const handlePvpBattleStart = async (opponentUsername?: string) => {
    if (!user?.username) return

    if (!selectedBattleMode) {
      // Store the opponent for later use
      if (opponentUsername) {
        setSelectedOpponent(opponentUsername)
      }
      setShowModeSelector(true)
      
      // Scroll to top after a short delay to ensure the mode selector is rendered
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' })
      }, 100)
      
      return
    }

    // If battle mode is already selected, start the battle immediately
    // Battle limit check and increment will happen in handleBattleModeSelect
  }

  const handleBattleModeSelect = async (mode: any) => {
    setSelectedBattleMode(mode)
    setShowModeSelector(false)
    
    // If we have a selected opponent, start the battle immediately
    if (selectedOpponent) {
      setPvpBattleStarted(true)
      localStorage.setItem('pvp_opponent', selectedOpponent)
      localStorage.setItem('selected_battle_mode', JSON.stringify(mode))
      setSelectedOpponent(null) // Reset for next time
    }
  }

  const handlePvpBattleEnd = async () => {
    setPvpBattleStarted(false)
    
    // Refresh battle limit status, prestige points, and available players after battle ends
    if (user?.username) {
      await fetchBattleLimit()
      await fetchPrestigePoints()
      await fetchAvailablePlayers() // Update opponent prestige points
      
      // Force a small delay to ensure database updates are processed
      setTimeout(async () => {
        await fetchPrestigePoints()
      }, 500)
    }
  }

  const fetchPrestigePoints = async () => {
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const { data, error } = await supabase
        .from("users")
        .select("prestige_points")
        .eq("username", user!.username)
        .single()

      if (!error && data) {
        setPrestigePoints(data.prestige_points as number || 100)
      }
    } catch (error) {
      console.error("Error fetching prestige points:", error)
    }
  }

  const fetchUserTeam = async () => {
    setTeamLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      // Load current user's team
      const { data: userTeamData, error: userError } = await supabase
        .from("user_team")
        .select("*")
        .eq("user_id", user!.username)
        .single()

      if (userError && userError.code !== "PGRST116") {
        console.error("Error fetching user team:", userError)
      } else if (userTeamData) {
        setUserTeam(userTeamData)
        await loadUserTeamCards(userTeamData)
      }
    } catch (error) {
      console.error("Error loading user team:", error)
    } finally {
      setTeamLoading(false)
    }
  }

  const loadUserTeamCards = async (team: any) => {
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      const cardIds = Object.entries(team)
        .filter(([key, value]) => key.startsWith('slot_') && typeof value === 'string' && value)
        .map(([key, value]) => value as string)

      if (cardIds.length === 0) {
        setUserCards([])
        return
      }

      const { data: cardsData, error } = await supabase
        .from("cards")
        .select("id, name, overall_rating, rarity")
        .in("id", cardIds)

      if (error) {
        console.error("Error fetching team cards:", error)
        setUserCards([])
      } else {
        setUserCards((cardsData as any[]) || [])
      }
    } catch (error) {
      console.error("Error loading team cards:", error)
      setUserCards([])
    }
  }

  const fetchAvailablePlayers = async () => {
    setPlayersLoading(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return

      // Get users with similar prestige points (±20 range from current user's prestige)
      const userPrestige = prestigePoints
      const minPrestige = Math.max(0, userPrestige - 20)
      const maxPrestige = userPrestige + 20
      
      console.log(`Looking for users with prestige points between ${minPrestige}-${maxPrestige} (current user: ${userPrestige})`)
      
      // First, let's check what prestige points the current user actually has
      console.log(`Current user prestige points: ${prestigePoints}`)
      
      // Get current user's actual prestige points from database
      const { data: currentUserData, error: currentUserError } = await supabase
        .from("users")
        .select("prestige_points")
        .eq("username", user!.username)
        .single()
      
      const actualUserPrestige = (currentUserData?.prestige_points as number) || 100
      console.log(`Actual user prestige points from database: ${actualUserPrestige}`)
      
              // Calculate range based on actual prestige points (40 points down, 40 points up)
        const actualMinPrestige = Math.max(0, actualUserPrestige - 40)
        const actualMaxPrestige = actualUserPrestige + 40
      
      console.log(`Looking for users with prestige points between ${actualMinPrestige}-${actualMaxPrestige} (actual user: ${actualUserPrestige})`)
      
      // Search for users with similar prestige points
      let { data: usersWithSimilarPrestige, error: usersError } = await supabase
        .from("users")
        .select("username, level, avatar_id, prestige_points")
        .gte("prestige_points", actualMinPrestige)
        .lte("prestige_points", actualMaxPrestige)
        .neq("username", user!.username) // Exclude current user
        .limit(200)
      


      // Only search for users with similar prestige points, not specific values
      console.log("Searching only for users with similar prestige points")

      if (usersError) {
        console.error("Error fetching users with similar prestige points:", usersError)
        return
      }

      if (!usersWithSimilarPrestige || usersWithSimilarPrestige.length === 0) {
        console.log(`No users found with prestige points between ${minPrestige}-${maxPrestige}`)
        setAvailablePlayers([])
        return
      }

      console.log(`Found ${usersWithSimilarPrestige.length} users with prestige points between ${minPrestige}-${maxPrestige}`)
      
      // Debug: Show all found users
      usersWithSimilarPrestige.forEach(user => {
        console.log(`Found user: ${user.username} with ${user.prestige_points} prestige points`)
      })

      // Get teams for these users
      const allUsers = usersWithSimilarPrestige
      const usernames = allUsers.map(u => u.username)
      console.log(`Looking for teams for usernames:`, usernames)
      
      const { data: allTeams, error: teamsError } = await supabase
        .from("user_team")
        .select("*")
        .in("user_id", usernames)

      if (teamsError) {
        console.error("Error fetching teams:", teamsError)
        return
      }

      console.log("Total teams found:", allTeams?.length || 0)
      
      // Check each team for completeness and add only complete teams
      const availablePlayers = []

      // Add users with complete teams (11/11 only)
      for (const team of allTeams || []) {
        // Count filled slots - check for slot_0 through slot_10
        const filledSlots = Object.entries(team)
          .filter(([key, value]) => {
            // Check if it's a slot field (slot_0 to slot_10)
            const isSlot = /^slot_\d+$/.test(key) && parseInt(key.split('_')[1]) <= 10
            // Check if the value is not null, undefined, empty string, or just whitespace
            return isSlot && value !== null && value !== undefined && value !== '' && value.toString().trim() !== ''
          })
          .length

        // Debug: Log the first few slots to see what's in them
        const slotValues = Object.entries(team)
          .filter(([key, value]) => /^slot_\d+$/.test(key) && parseInt(key.split('_')[1]) <= 10)
          .slice(0, 3) // Show first 3 slots
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ')
        
        console.log(`Team ${team.user_id}: ${filledSlots}/11 slots filled - Sample slots: ${slotValues}`)

        // Find user data from our earlier query
        const userData = allUsers.find(u => u.username === team.user_id)
        
        // Only add users with complete teams (11/11)
        if (userData && filledSlots === 11) {
          availablePlayers.push({
            username: userData.username,
            level: userData.level || 1,
            avatar_id: userData.avatar_id,
            team_id: team.id,
            prestige_points: userData.prestige_points || 100,
            team_completeness: filledSlots // Add team completeness info
          })
          console.log(`Added complete team for: ${userData.username} (${filledSlots}/11 slots) Prestige: ${userData.prestige_points}`)
        } else if (userData) {
          console.log(`Skipped incomplete team for: ${userData.username} (${filledSlots}/11 slots) Prestige: ${userData.prestige_points}`)
        }
      }

      // Show how many users were skipped (for debugging)
      const usersWithTeams = allTeams?.map(team => team.user_id) || []
      const skippedUsers = allUsers.filter(user => !usersWithTeams.includes(user.username))
      console.log(`Skipped ${skippedUsers.length} users without teams:`, skippedUsers.map(u => `${u.username} (0/11 slots) Prestige: ${u.prestige_points}`))

      console.log("Total available players found:", availablePlayers.length)
      
      // Limit to 20 random players
      const shuffledPlayers = availablePlayers.sort(() => Math.random() - 0.5)
      const limitedPlayers = shuffledPlayers.slice(0, 20)
      
      console.log("Limited to 20 random players:", limitedPlayers.length)
      setAvailablePlayers(limitedPlayers)
    } catch (error) {
      console.error("Error fetching available players:", error)
    } finally {
      setPlayersLoading(false)
    }
  }

  const seedBattleStages = async () => {
    try {
      const response = await fetch("/api/seed-battle-stages")
      const data = await response.json()
      if (data.success) {
        toast({
          title: "Success",
          description: `Added ${data.message}`,
        })
        fetchStages()
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to add battle stages",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error seeding battle stages:", error)
      toast({
        title: "Error",
        description: "Failed to add battle stages",
        variant: "destructive",
      })
    }
  }

  const seedCardAbilities = async () => {
    try {
      const response = await fetch("/api/seed-abilities")
      const data = await response.json()
      if (data.success) {
        toast({
          title: "Success",
          description: data.message,
        })
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to add card abilities",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error seeding card abilities:", error)
      toast({
        title: "Error",
        description: "Failed to add card abilities",
        variant: "destructive",
      })
    }
  }

  return (
    <ProtectedRoute>
      <div className="pb-20 min-h-screen bg-cover bg-center bg-no-repeat overflow-x-hidden" style={{ backgroundImage: 'url(/hintergrund.webp.webp)' }}>
        <header className="bg-orange-600 text-white p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Button
                onClick={() => router.push("/ani")}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20 p-2"
                disabled={pvpBattleStarted || battleStarted}
              >
                                  <ArrowLeft className={`w-5 h-5 ${(pvpBattleStarted || battleStarted) ? 'opacity-50' : ''}`} />
              </Button>
              <h1 className="text-2xl font-bold">Battle Arena</h1>
            </div>
            <div className="flex items-center gap-2">
              <div className="bg-white/20 px-2 py-1 rounded-md text-sm">Prestige: {prestigePoints}</div>
              {battleLimit && (
                <div className={`px-2 py-1 rounded-md text-sm ${
                  battleLimit.battlesRemaining > 0 
                    ? 'bg-green-500/20 text-green-200' 
                    : 'bg-red-500/20 text-red-200'
                }`}>
                  Battles: {battleLimit.battlesUsed}/{battleLimit.dailyLimit}
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="p-4 overflow-x-hidden">
          {pvpBattleStarted ? (
            <PvpBattleArena 
              onBackToBattle={() => setPvpBattleStarted(false)} 
              onBattleEnd={handlePvpBattleEnd}
            />
          ) : battleStarted && selectedStage ? (
            <BattleArena stage={selectedStage} onBattleEnd={handleBattleEnd} />
          ) : (
            <>
              <PvpLeaderboard currentUsername={user?.username} />

              <Tabs defaultValue="pvp" className="w-full" onValueChange={setActiveTab}>
              <TabsList className="grid w-full grid-cols-1">
                {/* <TabsTrigger value="story">Story Mode</TabsTrigger> */}
                <div className="flex items-center justify-center gap-2">
                  <TabsTrigger value="pvp">PvP Battles</TabsTrigger>
                  <Button
                    onClick={() => setShowInfoDialog(true)}
                    variant="ghost"
                    size="sm"
                    className="bg-white hover:bg-gray-100 text-black p-2 rounded-full border-2 border-black shadow-lg"
                  >
                    <Info className="w-4 h-4" />
                  </Button>
                </div>
              </TabsList>

              {/* <TabsContent value="story" className="mt-4 space-y-4">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
                  <div className="text-center py-8">
                    <p className="text-muted-foreground mb-4">Story Mode coming soon!</p>
                  </div>
                </motion.div>
              </TabsContent> */}

                            <TabsContent value="pvp" className="mt-4">
                <div className="space-y-4">
                  {/* Battle Mode Selection */}
                  {showModeSelector && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6"
                    >
                      <BattleModeSelector 
                        onModeSelect={handleBattleModeSelect}
                        selectedMode={selectedBattleMode}
                      />
                    </motion.div>
                  )}

                  {/* Selected Battle Mode Display */}
                  {selectedBattleMode && !showModeSelector && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="mb-4 p-4 bg-gradient-to-r from-orange-500 to-red-500 rounded-lg border-2 border-orange-400 shadow-2xl relative z-10"
                    >
                                              <div className="flex items-center justify-between">
                          <div>
                            <h3 className="text-lg font-semibold text-white drop-shadow-lg">{selectedBattleMode.name}</h3>
                            <p className="text-sm text-gray-100 drop-shadow-lg">{selectedBattleMode.description}</p>
                          </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowModeSelector(true)}
                          className="text-orange-400 border-orange-400 hover:bg-orange-400/20"
                        >
                          Change Mode
                        </Button>
                      </div>
                    </motion.div>
                  )}

                  <h3 className="text-lg font-semibold text-center mb-4 text-white">Available Players</h3>
                  
                  {/* Need More Battles Message */}
                  {!battleLimit?.canBattle && (
                    <motion.div
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mb-6 p-4 bg-gradient-to-r from-red-900/40 to-black/60 rounded-lg border border-red-500/30 text-center"
                    >
                      <div className="flex items-center justify-center gap-3 mb-3">
                        <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">!</span>
                        </div>
                        <h4 className="text-lg font-bold text-red-400">Need More Battles?</h4>
                      </div>
                      <p className="text-sm text-gray-300 mb-4">
                        You've used all your daily battles. Purchase more battles in the shop to continue playing!
                      </p>
                      <Button
                        onClick={() => router.push("/shop?tab=pvp")}
                        className="bg-gradient-to-r from-red-500 to-orange-600 hover:from-red-600 hover:to-orange-700 text-white font-bold py-2 px-6 rounded-lg"
                      >
                        Go to Shop
                      </Button>
                    </motion.div>
                  )}
                  
                  {playersLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600 mx-auto mb-4"></div>
                      <p className="text-gray-300">Loading available players...</p>
                    </div>
                  ) : availablePlayers.length === 0 ? (
                    <div className="text-center py-8">
                      <p className="text-gray-300">No players with complete teams available for battle.</p>
                    </div>
                  ) : (
                    availablePlayers.map((player, index) => (
                      <div key={player.username} className="bg-black/50 rounded-lg shadow-md p-4 border border-orange-500/30 backdrop-blur-sm">
                        <div className="flex items-center justify-between gap-3">
                                                      <div className="flex items-center gap-3 min-w-0 flex-1">
                                                              <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-yellow-500 rounded-full flex items-center justify-center flex-shrink-0">
                                  <span className="text-white font-bold text-sm">
                                    {player.username.charAt(0).toUpperCase()}
                                  </span>
                                </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="font-semibold text-white truncate max-w-[120px]">{player.username}</h4>
                                <p className="text-sm text-gray-300">
                                Level {player.level} • Prestige Points: {player.prestige_points}
                                {player.team_completeness && (
                                  <span className={`ml-2 px-2 py-1 rounded text-xs ${
                                    player.team_completeness === 11 
                                      ? 'bg-green-100 text-green-800' 
                                      : player.team_completeness >= 8
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-red-100 text-red-800'
                                  }`}>
                                    {player.team_completeness}/11
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>
                          {!teamLoading && userCards.length === 11 ? (
                            <Button 
                              className={`flex-shrink-0 ${
                                battleLimit?.canBattle 
                                  ? 'bg-orange-600 hover:bg-orange-700' 
                                  : 'bg-gray-600 cursor-not-allowed'
                              } text-white`}
                              onClick={() => handlePvpBattleStart(player.username)}
                              disabled={!battleLimit?.canBattle}
                            >
                              {battleLimit?.canBattle ? 'Challenge' : 'No Battles Left'}
                            </Button>
                          ) : (
                            <div className="text-sm text-gray-400">
                              {teamLoading ? "Loading..." : `${userCards.length}/11 players`}
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </TabsContent>
            </Tabs>
            </>
          )}
        </main>

        {!pvpBattleStarted && <MobileNav />}

        {/* Info Dialog */}
        <Dialog open={showInfoDialog} onOpenChange={setShowInfoDialog}>
          <DialogContent className="bg-gradient-to-br from-blue-900 to-black border-blue-500/30 text-white max-w-4xl max-h-[90vh] overflow-hidden [&>button]:hidden">
            <DialogHeader className="sticky top-0 bg-gradient-to-br from-blue-900 to-black z-10 pb-4">
              <div className="flex justify-between items-start">
                <DialogTitle className="text-xl font-bold text-white">
                  <div className="flex items-center gap-2">
                    <Info className="w-6 h-6 text-blue-400" />
                    <span>Battle Info</span>
                  </div>
                </DialogTitle>
                <Button
                  onClick={() => setShowInfoDialog(false)}
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/20 p-1 h-auto"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            </DialogHeader>
            <div className="text-center space-y-4 overflow-y-auto max-h-[70vh] px-4 pb-4 scrollbar-thin scrollbar-thumb-blue-500 scrollbar-track-transparent">
              <div className="bg-blue-800/30 p-4 rounded-lg border border-blue-500/30">
                <p className="text-lg font-semibold text-blue-200">
                  The better the team rating and player levels, the better your team!!!
                </p>
              </div>
              <div className="text-sm text-gray-300">
                <p>• Higher overall ratings increase your chances of winning</p>
                <p>• Card levels provide additional bonuses</p>
                <p>• Only users with a complete team (11 players) can participate in PvP battles</p>
                <p>• Battle limits reset daily at midnight - you get 5 new battles every day</p>
                <p>• To start a battle: Click "Challenge" on a player, then select your battle mode</p>
                <p>• Basic Cards: +0.1 rating per level</p>
                <p>• Rare Cards: +0.15 rating per level</p>
                <p>• Elite Cards: +0.2 rating per level</p>
                <p>• Ultimate Cards: +0.35 rating per level</p>
                <p>• GOAT Cards: +1.0 rating per level</p>
              </div>
              
              <div className="bg-orange-800/30 p-4 rounded-lg border border-orange-500/30 mt-4">
                <p className="text-lg font-semibold text-orange-200">
                  Collect as many prestige points as possible to qualify for the weekend league playoffs!
                </p>
                <p className="text-sm text-orange-300 mt-2">
                  The top 30 users will qualify for the playoffs!!!
                </p>
                <p className="text-sm text-yellow-300 mt-2">
                  🏆 Places 1 and 2 directly qualify for the weekend league!
                </p>
              </div>
              
              <WeekendLeagueCountdown />
              

            </div>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  )
}
