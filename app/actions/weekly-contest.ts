"use server"

import { createClient } from "@supabase/supabase-js"
import { WEEKLY_CONTEST_CONFIG, getContestEndDate } from "@/lib/weekly-contest-config"

function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  })
}

export async function incrementLegendaryDraw(walletAddress: string, count: number = 1) {
  console.log("incrementLegendaryDraw called with:", { walletAddress, count })
  const supabase = createSupabaseServer()
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
  const contestEnd = getContestEndDate()
  const now = new Date()

  console.log("Contest dates:", { weekStart, contestEnd, now })

  if (now > contestEnd) {
    console.log("Contest has ended")
    return { success: false, error: "The contest has ended. No more entries allowed." }
  }

  const { data, error } = await supabase
    .from("weekly_contest_entries")
    .select("legendary_count")
    .eq("wallet_address", walletAddress)
    .eq("week_start_date", weekStart)
    .single()

  console.log("Query result:", { data, error })

  if (error && error.code === "PGRST116") {
    console.log("Creating new entry")
    const { data: insertData, error: insertError } = await supabase.from("weekly_contest_entries").insert({
      wallet_address: walletAddress,
      week_start_date: weekStart,
      legendary_count: count,
    })
    console.log("Insert result:", { insertData, insertError })
  } else {
    const currentCount = data?.legendary_count || 0
    const newCount = currentCount + count
    console.log("Updating existing entry from", currentCount, "to", newCount)
    const { data: updateData, error: updateError } = await supabase
      .from("weekly_contest_entries")
      .update({ legendary_count: newCount })
      .eq("wallet_address", walletAddress)
      .eq("week_start_date", weekStart)
    console.log("Update result:", { updateData, updateError })
  }

  return { success: true }
}
