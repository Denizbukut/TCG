// actions/missions.ts (vollständiger Backend-Code für 5 Daily Missions mit Bonus)

"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { DAILY_MISSIONS } from "@/lib/daily-mission-definition"


function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  })
}

type MissionReward = {
  xp?: number
  tickets?: number
}

type MissionDefinition = {
  key: string
  label: string
  goal: number
  reward: MissionReward
}



export async function getDailyMissions(username: string) {
  const supabase = createSupabaseServer()
  const today = new Date().toISOString().split("T")[0]

  await supabase
    .from("daily_mission_progress")
    .delete()
    .neq("mission_date", today)
    .eq("user_id", username)

    await supabase
    .from("daily_mission_bonus")
    .delete()
    .neq("mission_date", today)
    .eq("user_id", username)


  const getRewardLabel = (reward: MissionReward): string => {
  const parts = []
  if (reward.xp) parts.push(`+${reward.xp} XP`)
  if (reward.tickets) parts.push(`+${reward.tickets} Ticket${reward.tickets > 1 ? "s" : ""}`)
  return parts.join(" & ") || "Mystery Reward"
}

const promises = DAILY_MISSIONS.map(async (mission) => {
  const { data, error } = await supabase
    .from("daily_mission_progress")
    .select("*")
    .eq("user_id", username)
    .eq("mission_date", today)
    .eq("mission_key", mission.key)
    .single()

  const base = {
    key: mission.key,
    label: mission.label,
    goal: mission.goal,
    reward: mission.reward,
    reward_label: getRewardLabel(mission.reward),
  }

  if (error && error.code === "PGRST116") {
    const { data: inserted } = await supabase
      .from("daily_mission_progress")
      .insert({
        user_id: username,
        mission_key: mission.key,
        goal: mission.goal,
        progress: 0,
        reward_claimed: false,
        mission_date: today,
      })
      .select()
      .single()

    return {
      ...base,
      progress: inserted?.progress || 0,
      reward_claimed: inserted?.reward_claimed || false,
    }
  } else if (data) {
    return {
      ...base,
      progress: data.progress,
      reward_claimed: data.reward_claimed,
    }
  } else {
    return {
      ...base,
      progress: 0,
      reward_claimed: false,
    }
  }
})


  const missions = await Promise.all(promises)

  // Bonus-Daten
  const { data: bonusRow } = await supabase
    .from("daily_mission_bonus")
    .select("*")
    .eq("user_id", username)
    .eq("mission_date", today)
    .single()

  const bonusClaimed = bonusRow?.bonus_claimed || false

  return { success: true, missions, bonusClaimed }
}

export async function incrementMission(walletAddress: string, key: string, amount = 1) {
  const supabase = createSupabaseServer()
  const today = new Date().toISOString().split("T")[0]

  const { data: existing, error } = await supabase
    .from("daily_mission_progress")
    .select("*")
    .eq("user_id", username)
    .eq("mission_date", today)
    .eq("mission_key", key)
    .single()

  if (error && error.code === "PGRST116") {
    const mission = DAILY_MISSIONS.find((m) => m.key === key)
    if (!mission) return { success: false }

    const progress = Math.min(amount, mission.goal)

    await supabase.from("daily_mission_progress").insert({
      user_id: username,
      mission_key: key,
      goal: mission.goal,
      progress,
      reward_claimed: false,
      mission_date: today,
    })
  } else if (existing) {
    const newProgress = Math.min((existing.progress || 0) + amount, existing.goal)

    await supabase
      .from("daily_mission_progress")
      .update({
        progress: newProgress,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", username)
      .eq("mission_date", today)
      .eq("mission_key", key)
  }

  return { success: true }
}


export async function claimMissionReward(walletAddress: string, key: string) {
  const supabase = createSupabaseServer()
  const today = new Date().toISOString().split("T")[0]

  const { data: mission } = await supabase
    .from("daily_mission_progress")
    .select("*")
    .eq("user_id", username)
    .eq("mission_date", today)
    .eq("mission_key", key)
    .single()

  if (!mission || mission.reward_claimed || mission.progress < mission.goal) {
    return { success: false, error: "Not eligible" }
  }

  const reward: MissionReward = DAILY_MISSIONS.find((m) => m.key === key)?.reward || {}
  console.log("Matching mission:", DAILY_MISSIONS.find((m) => m.key === key))


  const updates: any = {}
  if (reward.xp) {
    const { data: user } = await supabase.from("users").select("experience").eq("username", username).single()
    updates.experience = (user?.experience || 0) + reward.xp
  }
  if (reward.tickets) {
    const { data: user } = await supabase.from("users").select("tickets").eq("username", username).single()
    updates.tickets = (user?.tickets || 0) + reward.tickets
  }

  await supabase.from("users").update(updates).eq("username", username)
  await supabase
    .from("daily_mission_progress")
    .update({ reward_claimed: true })
    .eq("user_id", username)
    .eq("mission_date", today)
    .eq("mission_key", key)

  revalidatePath("/missions")
  return { success: true }
}

export async function claimBonusReward(walletAddress: string) {
  const supabase = createSupabaseServer()
  const today = new Date().toISOString().split("T")[0]

  const { data: completed } = await supabase
    .from("daily_mission_progress")
    .select("reward_claimed")
    .eq("user_id", username)
    .eq("mission_date", today)
    .eq("reward_claimed", true)

  if (!completed || completed.length < 4) {
    return { success: false, error: "Not enough completed" }
  }

  const { data: bonusRow } = await supabase
    .from("daily_mission_bonus")
    .select("*")
    .eq("user_id", username)
    .eq("mission_date", today)
    .single()

  if (bonusRow && bonusRow.bonus_claimed) {
    return { success: false, error: "Already claimed" }
  }

  const { data: user } = await supabase
  .from("users")
  .select("elite_tickets")
      .eq("wallet_address", walletAddress)
  .single()

await supabase
  .from("users")
  .update({ elite_tickets: (user?.elite_tickets || 0) + 1 })
      .eq("wallet_address", walletAddress)

  if (!bonusRow) {
    await supabase.from("daily_mission_bonus").insert({ user_id: username, bonus_claimed: true, claimed_at: new Date().toISOString() })
  } else {
    await supabase.from("daily_mission_bonus").update({ bonus_claimed: true, claimed_at: new Date().toISOString() })
      .eq("user_id", username).eq("mission_date", today)
  }

  revalidatePath("/missions")
  return { success: true }
}
