"use client"

import { getSupabaseBrowserClient } from "@/lib/supabase"
import { DAILY_MISSIONS } from "@/lib/daily-mission-definition"

const PROGRESS_TABLE = "daily_mission_progress"

const todayIsoDate = () => new Date().toISOString().split("T")[0]

const normalizeWallet = (walletAddress?: string | null) => walletAddress?.trim() ?? ""

/**
 * Client-side function to check if there are any claimable missions
 * This avoids server-side API calls and reduces Edge Requests
 */
export async function checkClaimableMissions(walletAddress: string | null | undefined): Promise<boolean> {
  const normalizedWallet = normalizeWallet(walletAddress)
  const today = todayIsoDate()

  if (!normalizedWallet) {
    return false
  }

  const supabase = getSupabaseBrowserClient()
  if (!supabase) {
    return false
  }

  try {
    // Fetch mission progress for today
    const { data: progressRows, error } = await supabase
      .from(PROGRESS_TABLE)
      .select("mission_key, progress, reward_claimed, goal")
      .eq("wallet_address", normalizedWallet)
      .eq("mission_date", today)

    if (error) {
      // Silently fail - missions might not exist yet
      if (process.env.NODE_ENV === 'development') {
        console.warn("Failed to check claimable missions:", error)
      }
      return false
    }

    if (!progressRows || progressRows.length === 0) {
      return false
    }

    // Check if any mission is claimable (progress >= goal && !reward_claimed)
    const hasClaimable = progressRows.some(
      (row) => Number(row.progress) >= Number(row.goal) && !row.reward_claimed
    )

    return hasClaimable
  } catch (error) {
    if (process.env.NODE_ENV === 'development') {
      console.error("Error checking claimable missions:", error)
    }
    return false
  }
}

