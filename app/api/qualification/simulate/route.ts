import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { simulateAllQualificationMatches, type QualificationMatch } from "@/lib/qualification-simulation"

export async function POST() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

  try {
    // Get top 30 users by prestige points
    const { data: leaderboardData, error: leaderboardError } = await supabase
      .from("users")
      .select("username, prestige_points")
      .order("prestige_points", { ascending: false })
      .limit(30)

    if (leaderboardError) {
      return NextResponse.json({ success: false, error: leaderboardError.message }, { status: 500 })
    }

    // Get squad ratings for all users
    const usernames = leaderboardData.map(user => user.username)
    const squadRatings: {[key: string]: number} = {}

    for (const username of usernames) {
      // Get user's team
      const { data: teamData } = await supabase
        .from("user_team")
        .select("*")
        .eq("user_id", username)
        .single()

      if (teamData) {
        // Get card IDs from team slots
        const cardIds = Object.entries(teamData)
          .filter(([key, value]) => key.startsWith('slot_') && typeof value === 'string' && value)
          .map(([key, value]) => value as string)

        if (cardIds.length > 0) {
          // Get card details
          const { data: cardsData } = await supabase
            .from("cards")
            .select("id, name, rarity")
            .in("id", cardIds)

          if (cardsData && cardsData.length > 0) {
            // Calculate rating based on rarity
            const rarityScores = { legendary: 90, epic: 80, rare: 70, common: 60 }
            const validCards = cardsData.filter(card => card.rarity && rarityScores[card.rarity as keyof typeof rarityScores])
            if (validCards.length > 0) {
              const totalRating = validCards.reduce((sum, card) => sum + (rarityScores[card.rarity as keyof typeof rarityScores] || 60), 0)
              const averageRating = totalRating / validCards.length
              squadRatings[username] = Math.round(averageRating * 10) / 10
            }
          }
        }
      }
      
      // Default rating if no team found
      if (!squadRatings[username]) {
        squadRatings[username] = 70
      }
    }

    // Generate qualification matches
    const qualificationMatches: QualificationMatch[] = []
    for (let i = 2; i < 16; i++) { // i=2 entspricht Platz 3, i=15 entspricht Platz 16
      const player1 = leaderboardData[i] // Platz 3, 4, 5, ...
      const player2 = leaderboardData[31 - i] // Platz 30, 29, 28, ...
      
      if (player1 && player2) {
        qualificationMatches.push({
          player1: {
            username: player1.username,
            rank: i + 1,
            prestige_points: player1.prestige_points || 100,
            teamRating: squadRatings[player1.username] || 70
          },
          player2: {
            username: player2.username,
            rank: 32 - i,
            prestige_points: player2.prestige_points || 100,
            teamRating: squadRatings[player2.username] || 70
          },
          matchId: `match-${i + 1}-${32 - i}`
        })
      }
    }

    // Simulate all matches
    const matchResults = simulateAllQualificationMatches(qualificationMatches)

    // Convert to database format
    const dbMatches = matchResults.map(result => ({
      match_id: result.matchId,
      player1_username: result.player1,
      player2_username: result.player2,
      player1_score: result.player1Score,
      player2_score: result.player2Score,
      winner_username: result.winner,
      player1_rank: qualificationMatches.find(m => m.matchId === result.matchId)?.player1.rank || 0,
      player2_rank: qualificationMatches.find(m => m.matchId === result.matchId)?.player2.rank || 0,
      player1_prestige_points: qualificationMatches.find(m => m.matchId === result.matchId)?.player1.prestige_points || 100,
      player2_prestige_points: qualificationMatches.find(m => m.matchId === result.matchId)?.player2.prestige_points || 100,
      player1_team_rating: qualificationMatches.find(m => m.matchId === result.matchId)?.player1.teamRating || 70,
      player2_team_rating: qualificationMatches.find(m => m.matchId === result.matchId)?.player2.teamRating || 70,
      possession_player1: result.possession.player1,
      possession_player2: result.possession.player2,
      shots_player1: result.shots.player1,
      shots_player2: result.shots.player2,
      events: result.events,
      hidden: true // Set all matches as hidden by default
    }))

    // Clear existing matches and insert new ones
    await supabase
      .from("qualification_matches")
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000")

    const { data: insertedMatches, error: insertError } = await supabase
      .from("qualification_matches")
      .insert(dbMatches)
      .select()

    if (insertError) {
      return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ 
      success: true, 
      data: insertedMatches,
      message: `Successfully simulated and saved ${dbMatches.length} qualification matches`
    })
  } catch (error) {
    console.error("Error simulating qualification matches:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
