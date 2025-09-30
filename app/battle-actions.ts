"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseServerClient } from "@/lib/supabase"

export async function saveBattleResult(battleData: {
  userId: string
  stageId: string
  userCards: { id: string; finalHp: number }[]
  opponentCards: { id: string; finalHp: number }[]
  result: "win" | "loss" | "draw"
  rewardCoins: number
  rewardExp: number
}) {
  try {
    const supabase = getSupabaseServerClient()

    // Save battle history
    const { data, error } = await supabase
      .from("battle_history")
      .insert({
        user_id: battleData.userId,
        stage_id: battleData.stageId,
        is_pvp: false,
        user_cards: battleData.userCards,
        opponent_cards: battleData.opponentCards,
        result: battleData.result,
        reward_coins: battleData.rewardCoins,
        reward_exp: battleData.rewardExp,
      })
      .select()

    if (error) {
      console.error("Error saving battle result:", error)
      return { success: false, error: "Failed to save battle result" }
    }

    // Update user coins if they won
    if (battleData.result === "win" && battleData.rewardCoins > 0) {
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("coins")
        .eq("id", battleData.userId)
        .single()

      if (!userError && userData) {
        await supabase
          .from("users")
          .update({ coins: userData.coins + battleData.rewardCoins })
          .eq("id", battleData.userId)
      }
    }

    // Update user experience
    if (battleData.rewardExp > 0) {
      const { data: levelData, error: levelError } = await supabase
        .from("user_levels")
        .select("level, experience")
        .eq("user_id", battleData.userId)
        .single()

      if (!levelError && levelData) {
        const newExp = levelData.experience + battleData.rewardExp
        let newLevel = levelData.level

        // Calculate experience needed for next level (same formula as main system)
        const nextLevelExp = levelData.level <= 1 ? 500 : 500 + (levelData.level - 1) * 1500

        // Check if user leveled up
        if (newExp >= nextLevelExp) {
          newLevel++
        }

        await supabase
          .from("user_levels")
          .update({
            level: newLevel,
            experience: newExp,
            updated_at: new Date().toISOString(),
          })
          .eq("user_id", battleData.userId)
      }
    }

    revalidatePath("/battle")
    return { success: true, data }
  } catch (error) {
    console.error("Error in saveBattleResult:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function savePvpBattleResult(battleData: {
  userId: string
  opponentId: string
  userCards: any[]
  opponentCards: any[]
  result: "win" | "loss" | "draw"
  homeScore: number
  awayScore: number
  possession: { home: number; away: number }
  shots: { home: number; away: number }
  shotsOnTarget: { home: number; away: number }
  battleModeId?: number
}) {
  try {
    console.log("🔄 Starting savePvpBattleResult with data:", {
      userId: battleData.userId,
      opponentId: battleData.opponentId,
      result: battleData.result,
      battleModeId: battleData.battleModeId
    })

    const supabase = getSupabaseServerClient()

    // First, get the actual user UUIDs from the users table
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("username", battleData.userId)
      .single()

    const { data: opponentData, error: opponentError } = await supabase
      .from("users")
      .select("id")
      .eq("username", battleData.opponentId)
      .single()

    if (userError || opponentError) {
      console.error("❌ Error fetching user UUIDs:", { userError, opponentError })
      return { success: false, error: "Failed to fetch user UUIDs" }
    }

    // Get the correct battle mode ID for PvP battles
    const { data: battleModeData, error: battleModeError } = await supabase
      .from("battle_modes")
      .select("id")
      .eq("name", "PvP Battle")
      .single()

    if (battleModeError) {
      console.error("❌ Error fetching battle mode:", battleModeError)
      return { success: false, error: "Failed to fetch battle mode" }
    }

    // Prepare insert data with proper UUIDs
    const insertData = {
      user_id: userData.id, // Use actual UUID from users table
      stage_id: null, // PvP battles don't have stage_id
      is_pvp: true,
      opponent_id: opponentData.id, // Use actual UUID from users table
      user_cards: battleData.userCards,
      opponent_cards: battleData.opponentCards,
      result: battleData.result,
      reward_coins: 0, // PvP battles don't give coins
      reward_exp: 0, // PvP battles don't give exp
      battle_mode_id: battleData.battleModeId || battleModeData.id, // Use actual battle mode ID
    }

    console.log("📝 Inserting data:", insertData)

    // Save PvP battle history
    const { data, error } = await supabase
      .from("battle_history")
      .insert(insertData)
      .select()

    if (error) {
      console.error("❌ Error saving PvP battle result:", error)
      return { success: false, error: "Failed to save PvP battle result" }
    }

    console.log("✅ PvP battle result saved successfully:", data)

    // Update prestige points for winner and loser (only if not already updated)
    if (battleData.result !== 'draw') {
      console.log("🎯 Processing prestige points for result:", battleData.result)
      const winnerUsername = battleData.result === 'win' ? battleData.userId : battleData.opponentId
      const loserUsername = battleData.result === 'win' ? battleData.opponentId : battleData.userId
      
      try {
        // Check if this battle was already processed by looking for recent battle history
        const { data: recentBattles } = await supabase
          .from('battle_history')
          .select('created_at')
          .eq('user_id', userData.id)
          .eq('opponent_id', opponentData.id)
          .eq('result', battleData.result)
          .gte('created_at', new Date(Date.now() - 60000).toISOString()) // Last 60 seconds
          .order('created_at', { ascending: false })
        
        console.log("🔍 Found recent battles:", recentBattles?.length || 0)
        
        // If we already have a recent battle with the same result, skip prestige update
        if (recentBattles && recentBattles.length > 1) {
          console.log("⏭️ Skipping prestige points update - battle already processed")
          return { success: true, data, prestigeSkipped: true }
        }
        
        // Additional check: if we already have a battle in the last 1 second, skip
        if (recentBattles && recentBattles.length > 0) {
          const lastBattleTime = new Date(recentBattles[0].created_at).getTime()
          const currentTime = Date.now()
          const timeDiff = currentTime - lastBattleTime
          
          if (timeDiff < 1000) { // 1 second
            console.log("⏭️ Skipping prestige points update - battle too recent (", timeDiff, "ms ago)")
            return { success: true, data, prestigeSkipped: true }
          }
        }
        
        // Get current prestige points
        const { data: winnerData } = await supabase
          .from('users')
          .select('prestige_points')
          .eq('username', winnerUsername)
          .single()
        
        const { data: loserData } = await supabase
          .from('users')
          .select('prestige_points')
          .eq('username', loserUsername)
          .single()
        
        // Calculate new prestige points based on battle mode configuration
        const currentWinnerPoints = winnerData?.prestige_points || 100
        const currentLoserPoints = loserData?.prestige_points || 100
        
        // Use the values from battle_modes table: +10 for winner, -5 for loser
        const newWinnerPoints = Math.max(0, currentWinnerPoints + 10) // +10 for winner
        const newLoserPoints = Math.max(0, currentLoserPoints - 5)   // -5 for loser
        
        // Update both users
        await supabase
          .from('users')
          .upsert([
            { username: winnerUsername, prestige_points: newWinnerPoints },
            { username: loserUsername, prestige_points: newLoserPoints }
          ])
        
        console.log("🏆 Prestige points updated:", {
          winner: winnerUsername,
          winnerPoints: `${currentWinnerPoints} → ${newWinnerPoints}`,
          loser: loserUsername,
          loserPoints: `${currentLoserPoints} → ${newLoserPoints}`
        })
      } catch (error) {
        console.error("❌ Error updating prestige points:", error)
      }
    }

    revalidatePath("/battle")
    return { success: true, data }
  } catch (error) {
    console.error("💥 Error in savePvpBattleResult:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function getUserBattleHistory(userId: string) {
  try {
    const supabase = getSupabaseServerClient()

    const { data, error } = await supabase
      .from("battle_history")
      .select(`
        *,
        battle_stages(name, stage_number, level_number),
        opponent_id(username)
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching battle history:", error)
      return { success: false, error: "Failed to fetch battle history" }
    }

    return { success: true, data }
  } catch (error) {
    console.error("Error in getUserBattleHistory:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function getUserPvpStats(username: string) {
  try {
    console.log("🔍 getUserPvpStats called with username:", username)
    const supabase = getSupabaseServerClient()

    // First get the user UUID from username
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("username", username)
      .single()

    console.log("👤 User lookup result:", { userData, userError })

    if (userError || !userData) {
      console.error("❌ Error fetching user:", userError)
      return { success: false, error: "User not found" }
    }

    // Try to get all battles first to see if the table exists
    const { data: allBattles, error: allBattlesError } = await supabase
      .from("battle_history")
      .select("*")
      .eq("user_id", userData.id)
      .limit(1)

    console.log("🔍 Checking if battle_history table exists:", { allBattles, allBattlesError })

    if (allBattlesError) {
      console.error("❌ battle_history table doesn't exist or has issues:", allBattlesError)
      // Return default stats if table doesn't exist
      return {
        success: true,
        data: {
          totalBattles: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          recentBattles: []
        }
      }
    }

    // Now try to get PvP battles specifically - BOTH as player AND as opponent
    let pvpBattles: any[] = []
    let battleError: any = null

    try {
      // Get all PvP battles where user is either player or opponent
      const { data: pvpData, error: pvpError } = await supabase
        .from("battle_history")
        .select(`
          result,
          created_at,
          opponent_id,
          user_id
        `)
        .or(`user_id.eq.${userData.id},opponent_id.eq.${userData.id}`)
        .eq("is_pvp", true)
        .order("created_at", { ascending: false })

      if (!pvpError && pvpData) {
        console.log("✅ Found PvP battles:", pvpData.length)
        
        // Get all unique opponent IDs to fetch usernames
        const opponentIds = [...new Set(pvpData.map(battle => 
          battle.user_id === userData.id ? battle.opponent_id : battle.user_id
        ))]
        
        // Fetch usernames for all opponents
        const { data: opponentUsers, error: opponentError } = await supabase
          .from("users")
          .select("id, username")
          .in("id", opponentIds)

        if (!opponentError && opponentUsers) {
          // Create a map of user IDs to usernames
          const usernameMap = opponentUsers.reduce((map, user) => {
            map[user.id] = user.username
            return map
          }, {} as Record<string, string>)

          // Transform the data to normalize results
          pvpBattles = pvpData.map(battle => {
            const isUserPlayer = battle.user_id === userData.id
            const opponentId = isUserPlayer ? battle.opponent_id : battle.user_id
            const opponentUsername = usernameMap[opponentId] || "Unknown Player"
            
            return {
              result: isUserPlayer ? battle.result : 
                battle.result === 'win' ? 'loss' : 
                battle.result === 'loss' ? 'win' : 'draw',
              created_at: battle.created_at,
              opponent_id: { username: opponentUsername }
            }
          })
          
          console.log("✅ Processed PvP battles with usernames:", pvpBattles.length)
        } else {
          console.error("❌ Error fetching opponent usernames:", opponentError)
          battleError = opponentError
        }
      } else {
        console.error("❌ Error fetching PvP battles:", pvpError)
        battleError = pvpError
      }
    } catch (err) {
      battleError = err
      console.error("❌ Error in PvP battles query:", err)
    }

    console.log("⚔️ PvP battles lookup result:", { pvpBattles, battleError })

    if (battleError) {
      console.error("❌ Error fetching PvP battles:", battleError)
      // Return default stats instead of error
      return {
        success: true,
        data: {
          totalBattles: 0,
          wins: 0,
          losses: 0,
          draws: 0,
          winRate: 0,
          recentBattles: []
        }
      }
    }

    // Calculate statistics
    const totalBattles = pvpBattles?.length || 0
    const wins = pvpBattles?.filter(battle => battle.result === 'win').length || 0
    const losses = pvpBattles?.filter(battle => battle.result === 'loss').length || 0
    const draws = pvpBattles?.filter(battle => battle.result === 'draw').length || 0
    const winRate = totalBattles > 0 ? Math.round((wins / totalBattles) * 100) : 0

    // Get recent battles (last 5)
    const recentBattles = pvpBattles?.slice(0, 5) || []

    const result = {
      success: true,
      data: {
        totalBattles,
        wins,
        losses,
        draws,
        winRate,
        recentBattles
      }
    }

    console.log("✅ getUserPvpStats result:", result)
    return result
  } catch (error) {
    console.error("💥 Error in getUserPvpStats:", error)
    // Return default stats instead of error
    return {
      success: true,
      data: {
        totalBattles: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        winRate: 0,
        recentBattles: []
      }
    }
  }
}
