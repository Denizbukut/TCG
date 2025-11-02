"use server"

import { createClient } from "@supabase/supabase-js"
import { WEEKLY_CONTEST_CONFIG, getContestEndDate } from "@/lib/weekly-contest-config"

function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  })
}

export async function incrementLegendaryDraw(walletAddress: string, count: number = 1) {
  const supabase = createSupabaseServer()
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
  const contestEnd = getContestEndDate()
  const now = new Date()

  if (now > contestEnd) {
    return { success: false, error: "The contest has ended. No more entries allowed." }
  }

  const { data, error } = await supabase
    .from("weekly_contest_entries")
    .select("legendary_count")
    .eq("wallet_address", walletAddress)
    .eq("week_start_date", weekStart)
    .single()

  if (error && error.code === "PGRST116") {
    await supabase.from("weekly_contest_entries").insert({
      wallet_address: walletAddress,
      week_start_date: weekStart,
      legendary_count: count,
    })
  } else if (data) {
    const currentCount = data?.legendary_count || 0
    const newCount = currentCount + count
    await supabase
      .from("weekly_contest_entries")
      .update({ legendary_count: newCount })
      .eq("wallet_address", walletAddress)
      .eq("week_start_date", weekStart)
  }

  return { success: true }
}
