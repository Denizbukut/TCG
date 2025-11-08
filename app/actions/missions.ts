"use server"

import { createClient } from "@supabase/supabase-js"
import { DAILY_MISSIONS, type DailyMissionDefinition, type MissionReward } from "@/lib/daily-mission-definition"

const PROGRESS_TABLE = "daily_mission_progress"
const BONUS_TABLE = "daily_mission_bonus"
const USERS_TABLE = "users"

function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  })
}

const todayIsoDate = () => new Date().toISOString().split("T")[0]
const startOfTodayIso = () => {
  const now = new Date()
  now.setUTCHours(0, 0, 0, 0)
  return now.toISOString()
}

const normalizeWallet = (walletAddress?: string | null) => walletAddress?.trim() ?? ""

const toNumber = (value: unknown) => {
  if (typeof value === "number") return value
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const missionDefinitionMap = new Map<string, DailyMissionDefinition>(
  DAILY_MISSIONS.map((mission) => [mission.key, mission]),
)

type MissionRow = {
  mission_key: string
  progress: number
  reward_claimed: boolean
  goal: number
}

type MissionState = DailyMissionDefinition & {
  progress: number
  reward_claimed: boolean
}

const buildDefaultMissionState = (): MissionState[] =>
  DAILY_MISSIONS.map((mission) => ({
    ...mission,
    progress: 0,
    reward_claimed: false,
  }))

export async function getDailyMissions(walletAddress: string) {
  const normalizedWallet = normalizeWallet(walletAddress)
  const today = todayIsoDate()

  if (!normalizedWallet) {
    return {
      missions: buildDefaultMissionState(),
      bonusClaimed: false,
    }
  }

  const supabase = createSupabaseServer()

  const { data: progressRows, error: progressError } = (await supabase
    .from(PROGRESS_TABLE)
    .select("mission_key, progress, reward_claimed, goal")
    .eq("wallet_address", normalizedWallet)
    .eq("mission_date", today)) as unknown as {
    data: MissionRow[] | null
    error: { code?: string; message: string } | null
  }

  if (progressError && progressError.code !== "PGRST116") {
    console.error("❌ [daily-missions] Failed to load mission progress:", progressError)
  }

  const progressMap = new Map<string, MissionRow>()
  progressRows?.forEach((row) => {
    progressMap.set(row.mission_key, row)
  })

  // Auto-complete missions that can be derived from other data sources
  await ensureDerivedMissionProgress({
    supabase,
    normalizedWallet,
    today,
    progressMap,
  })

  const missions: MissionState[] = DAILY_MISSIONS.map((mission) => {
    const row = progressMap.get(mission.key)
    return {
      ...mission,
      progress: toNumber(row?.progress ?? 0),
      reward_claimed: row?.reward_claimed ?? false,
    }
  })

  const { data: bonusRow, error: bonusError } = (await supabase
    .from(BONUS_TABLE)
    .select("bonus_claimed")
    .eq("wallet_address", normalizedWallet)
    .eq("mission_date", today)
    .maybeSingle()) as unknown as {
    data: { bonus_claimed: boolean } | null
    error: { code?: string; message: string } | null
  }

  if (bonusError && bonusError.code !== "PGRST116") {
    console.error("❌ [daily-missions] Failed to load bonus state:", bonusError)
  }
  
  return {
    missions,
    bonusClaimed: bonusRow?.bonus_claimed ?? false,
  }
}

interface DerivedMissionContext {
  supabase: ReturnType<typeof createSupabaseServer>
  normalizedWallet: string
  today: string
  progressMap: Map<string, MissionRow>
}

async function ensureDerivedMissionProgress(ctx: DerivedMissionContext) {
  await ensureTradeMarketPurchaseMissionProgress(ctx)
  await ensureTicketShopBulkMissionProgress(ctx)
  await ensureSpecialDealMissionProgress(ctx)
  await ensureDailyDealMissionProgress(ctx)
}

async function ensureTradeMarketPurchaseMissionProgress({
  supabase,
  normalizedWallet,
  today,
  progressMap,
}: DerivedMissionContext) {
  if (!normalizedWallet) return

  const { count, error } = await supabase
    .from("market_listings")
    .select("id", { count: "exact", head: true })
    .eq("buyer_wallet_address", normalizedWallet)
    .gte("sold_at", startOfTodayIso())

  if (error) {
    console.error("❌ [daily-missions] Failed to check trade market purchases:", error)
    return
  }

  if ((count ?? 0) > 0) {
    await upsertMissionProgress({
      supabase,
      normalizedWallet,
      today,
      progressMap,
      missionKey: "trade_market_purchase",
      progress: 1,
    })
  }
}

async function ensureTicketShopBulkMissionProgress(ctx: DerivedMissionContext) {
  const { supabase, normalizedWallet, today, progressMap } = ctx
  if (!normalizedWallet) return

  const { count, error } = await supabase
    .from("ticket_purchases")
    .select("id", { count: "exact", head: true })
    .eq("wallet_address", normalizedWallet)
    .eq("ticket_type", "classic")
    .gte("amount", 5)
    .gte("created_at", startOfTodayIso())

  if (error) {
    console.error("❌ [daily-missions] Failed to evaluate ticket shop purchases:", error)
    return
  }

  if ((count ?? 0) > 0) {
    await upsertMissionProgress({
      supabase,
      normalizedWallet,
      today,
      progressMap,
      missionKey: "ticket_shop_bulk_purchase",
      progress: 1,
    })
  }
}

async function ensureSpecialDealMissionProgress(ctx: DerivedMissionContext) {
  const { supabase, normalizedWallet, today, progressMap } = ctx
  if (!normalizedWallet) return

  const { count, error } = await supabase
    .from("special_deal_purchases")
    .select("id", { count: "exact", head: true })
    .eq("wallet_address", normalizedWallet)
    .gte("purchased_at", startOfTodayIso())

  if (error) {
    console.error("❌ [daily-missions] Failed to check special deal purchases:", error)
    return
  }

  if ((count ?? 0) > 0) {
    await upsertMissionProgress({
      supabase,
      normalizedWallet,
      today,
      progressMap,
      missionKey: "special_deal_purchase",
      progress: 1,
    })
  }
}

async function ensureDailyDealMissionProgress(ctx: DerivedMissionContext) {
  const { supabase, normalizedWallet, today, progressMap } = ctx
  if (!normalizedWallet) return

  const { count, error } = await supabase
    .from("deal_purchases")
    .select("id", { count: "exact", head: true })
    .eq("wallet_address", normalizedWallet)
    .gte("purchased_at", startOfTodayIso())

  if (error) {
    console.error("❌ [daily-missions] Failed to check daily deal purchases:", error)
    return
  }

  if ((count ?? 0) > 0) {
    await upsertMissionProgress({
      supabase,
      normalizedWallet,
      today,
      progressMap,
      missionKey: "daily_deal_purchase",
      progress: 1,
    })
  }
}

async function upsertMissionProgress({
  supabase,
  normalizedWallet,
  today,
  progressMap,
  missionKey,
  progress,
}: DerivedMissionContext & { missionKey: string; progress: number }) {
  const mission = missionDefinitionMap.get(missionKey)
  if (!mission) return

  const clampedProgress = Math.min(progress, mission.goal)
  if (clampedProgress <= 0) return

  const existingRow = progressMap.get(missionKey)

  if (!existingRow) {
    const { error: insertError } = await supabase.from(PROGRESS_TABLE).insert({
      wallet_address: normalizedWallet,
      mission_date: today,
      mission_key: missionKey,
      progress: clampedProgress,
      goal: mission.goal,
      reward_claimed: false,
    })

    if (insertError) {
      console.error(`❌ [daily-missions] Failed to insert progress for ${missionKey}:`, insertError)
      return
    }

    progressMap.set(missionKey, {
      mission_key: missionKey,
      progress: clampedProgress,
      reward_claimed: false,
      goal: mission.goal,
    })
    return
  }

  if (clampedProgress > existingRow.progress || existingRow.goal !== mission.goal) {
    const { error: updateError } = await supabase
      .from(PROGRESS_TABLE)
      .update({ progress: clampedProgress, goal: mission.goal })
      .eq("wallet_address", normalizedWallet)
      .eq("mission_date", today)
      .eq("mission_key", missionKey)

    if (updateError) {
      console.error(`❌ [daily-missions] Failed to update progress for ${missionKey}:`, updateError)
      return
    }

    progressMap.set(missionKey, {
      mission_key: missionKey,
      progress: clampedProgress,
      reward_claimed: existingRow.reward_claimed,
      goal: mission.goal,
    })
  } else {
    progressMap.set(missionKey, existingRow)
  }
}

export async function incrementMission(walletAddress: string, key: string, amount = 1) {
  const mission = missionDefinitionMap.get(key)
  if (!mission) {
    console.warn(`⚠️ [daily-missions] Unknown mission key: ${key}`)
    return { success: false, error: "Unknown mission" }
  }

  const normalizedWallet = normalizeWallet(walletAddress)
  if (!normalizedWallet) {
    return { success: false, error: "Missing wallet address" }
  }

  const supabase = createSupabaseServer()
  const today = todayIsoDate()

  const { data: existingRow, error: fetchError } = (await supabase
    .from(PROGRESS_TABLE)
    .select("progress, reward_claimed")
    .eq("wallet_address", normalizedWallet)
    .eq("mission_date", today)
    .eq("mission_key", mission.key)
    .maybeSingle()) as unknown as {
    data: { progress: number; reward_claimed: boolean } | null
    error: { code?: string; message: string } | null
  }

  if (fetchError && fetchError.code !== "PGRST116") {
    console.error("❌ [daily-missions] Could not fetch mission progress:", fetchError)
    return { success: false, error: "Failed to fetch mission progress" }
  }

  const currentProgress = toNumber(existingRow?.progress ?? 0)
  const newProgress = Math.min(currentProgress + amount, mission.goal)

  try {
    if (!existingRow) {
      const { error: insertError } = await supabase.from(PROGRESS_TABLE).insert({
        wallet_address: normalizedWallet,
        mission_date: today,
        mission_key: mission.key,
        progress: newProgress,
        goal: mission.goal,
        reward_claimed: false,
      })

      if (insertError) {
        console.error("❌ [daily-missions] Failed to insert mission progress:", insertError)
        return { success: false, error: "Failed to insert mission progress" }
      }
    } else if (newProgress !== currentProgress) {
      const { error: updateError } = await supabase
        .from(PROGRESS_TABLE)
        .update({ progress: newProgress, goal: mission.goal })
        .eq("wallet_address", normalizedWallet)
        .eq("mission_date", today)
        .eq("mission_key", mission.key)

      if (updateError) {
        console.error("❌ [daily-missions] Failed to update mission progress:", updateError)
        return { success: false, error: "Failed to update mission progress" }
      }
    }
  } catch (error) {
    console.error("❌ [daily-missions] Unknown error while updating mission progress:", error)
    return { success: false, error: "Unexpected error while updating mission" }
}

  return { success: true, progress: newProgress, completed: newProgress >= mission.goal }
}

export async function claimMissionReward(walletAddress: string, key: string) {
  const mission = missionDefinitionMap.get(key)
  if (!mission) {
    return { success: false, error: "Unknown mission" }
  }

  const normalizedWallet = normalizeWallet(walletAddress)
  if (!normalizedWallet) {
    return { success: false, error: "Missing wallet address" }
  }

  const supabase = createSupabaseServer()
  const today = todayIsoDate()

  const { data: missionRow, error: missionError } = (await supabase
    .from(PROGRESS_TABLE)
    .select("progress, goal, reward_claimed")
    .eq("wallet_address", normalizedWallet)
    .eq("mission_date", today)
    .eq("mission_key", mission.key)
    .maybeSingle()) as unknown as {
    data: { progress: number; goal: number; reward_claimed: boolean } | null
    error: { code?: string; message: string } | null
  }

  if (missionError && missionError.code !== "PGRST116") {
    console.error("❌ [daily-missions] Failed to load mission before claiming:", missionError)
    return { success: false, error: "Failed to load mission" }
  }

  if (!missionRow) {
    return { success: false, error: "Mission not started" }
  }

  const currentProgress = toNumber(missionRow.progress)
  const goal = mission.goal

  if (missionRow.reward_claimed) {
    return { success: false, error: "Reward already claimed" }
  }

  if (currentProgress < goal) {
    return { success: false, error: "Mission not yet completed" }
  }

  const { data: userData, error: userError } = (await supabase
    .from(USERS_TABLE)
    .select("tickets, elite_tickets, experience")
    .eq("wallet_address", normalizedWallet)
    .single()) as unknown as {
    data: { tickets: number; elite_tickets: number; experience: number } | null
    error: { message: string } | null
  }

  if (userError || !userData) {
    console.error("❌ [daily-missions] Failed to load user for reward claim:", userError)
    return { success: false, error: "Failed to load user" }
  }

  const updates: Record<string, number> = {}

  const applyTicketReward = (reward: MissionReward) => {
    if (reward.tickets) {
      updates.tickets = toNumber(userData.tickets) + reward.tickets
    }
    if (reward.eliteTickets) {
      updates.elite_tickets = toNumber(userData.elite_tickets) + reward.eliteTickets
    }
    if (reward.xp) {
      updates.experience = toNumber(userData.experience) + reward.xp
    }
  }

  applyTicketReward(mission.reward)

  if (Object.keys(updates).length > 0) {
    const { error: userUpdateError } = await supabase
      .from(USERS_TABLE)
      .update(updates)
      .eq("wallet_address", normalizedWallet)

    if (userUpdateError) {
      console.error("❌ [daily-missions] Failed to update user while claiming mission reward:", userUpdateError)
      return { success: false, error: "Failed to apply reward" }
    }
  }

  const { error: progressUpdateError } = await supabase
    .from(PROGRESS_TABLE)
    .update({ reward_claimed: true })
    .eq("wallet_address", normalizedWallet)
    .eq("mission_date", today)
    .eq("mission_key", mission.key)

  if (progressUpdateError) {
    console.error("❌ [daily-missions] Failed to mark mission as claimed:", progressUpdateError)
    return { success: false, error: "Failed to finalize mission" }
  }

  return { success: true, reward: mission.reward }
}

export async function claimBonusReward(walletAddress: string) {
  const normalizedWallet = normalizeWallet(walletAddress)
  if (!normalizedWallet) {
    return { success: false, error: "Missing wallet address" }
  }

  const supabase = createSupabaseServer()
  const today = todayIsoDate()

  const { data: bonusRow, error: bonusError } = (await supabase
    .from(BONUS_TABLE)
    .select("bonus_claimed")
    .eq("wallet_address", normalizedWallet)
    .eq("mission_date", today)
    .maybeSingle()) as unknown as {
    data: { bonus_claimed: boolean } | null
    error: { code?: string; message: string } | null
  }

  if (bonusError && bonusError.code !== "PGRST116") {
    console.error("❌ [daily-missions] Failed to load bonus state:", bonusError)
    return { success: false, error: "Failed to load bonus state" }
  }

  if (bonusRow?.bonus_claimed) {
    return { success: false, error: "Bonus already claimed" }
  }

  const { data: missionRows, error: missionRowsError } = (await supabase
    .from(PROGRESS_TABLE)
    .select("progress, goal")
    .eq("wallet_address", normalizedWallet)
    .eq("mission_date", today)) as unknown as {
    data: { progress: number; goal: number }[] | null
    error: { code?: string; message: string } | null
  }

  if (missionRowsError && missionRowsError.code !== "PGRST116") {
    console.error("❌ [daily-missions] Failed to fetch mission rows for bonus:", missionRowsError)
    return { success: false, error: "Failed to evaluate bonus" }
  }

  const completedMissions = missionRows?.filter((row) => toNumber(row.progress) >= toNumber(row.goal)).length ?? 0

  const requiredMissions = 5

  if (completedMissions < requiredMissions) {
    return { success: false, error: "Not enough missions completed" }
  }

  const { data: userData, error: userError } = (await supabase
    .from(USERS_TABLE)
    .select("elite_tickets")
    .eq("wallet_address", normalizedWallet)
    .single()) as unknown as {
    data: { elite_tickets: number } | null
    error: { message: string } | null
  }

  if (userError || !userData) {
    console.error("❌ [daily-missions] Failed to load user for bonus reward:", userError)
    return { success: false, error: "Failed to load user" }
  }

  const bonusLegendaryTickets = 3
  const newEliteTickets = toNumber(userData.elite_tickets) + bonusLegendaryTickets

  const { error: userUpdateError } = await supabase
    .from(USERS_TABLE)
    .update({ elite_tickets: newEliteTickets })
    .eq("wallet_address", normalizedWallet)

  if (userUpdateError) {
    console.error("❌ [daily-missions] Failed to apply bonus reward:", userUpdateError)
    return { success: false, error: "Failed to apply bonus reward" }
  }

  const { error: bonusUpdateError } = await supabase
    .from(BONUS_TABLE)
    .upsert(
      {
        wallet_address: normalizedWallet,
        mission_date: today,
        bonus_claimed: true,
        claimed_at: new Date().toISOString(),
      },
      { onConflict: "wallet_address,mission_date" }
    )

  if (bonusUpdateError) {
    console.error("❌ [daily-missions] Failed to record bonus claim:", bonusUpdateError)
    return { success: false, error: "Failed to record bonus" }
  }

  return { success: true }
}
