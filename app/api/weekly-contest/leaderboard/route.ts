import { createClient } from "@supabase/supabase-js"
import { NextResponse } from "next/server"
import { WEEKLY_CONTEST_CONFIG } from "@/lib/weekly-contest-config"

export async function GET() {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart

  try {
    // Top 20 Weekly - Join mit users-Tabelle um username zu bekommen
    const { data: entries, error } = await supabase
      .from("weekly_contest_entries")
      .select("wallet_address, legendary_count")
      .eq("week_start_date", weekStart)
      .order("legendary_count", { ascending: false })
      .limit(20)

    if (error) {
      console.error("Leaderboard query error:", error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    }

    // Hole usernames für alle wallet_addresses
    const walletAddresses = entries?.map(e => e.wallet_address) || []
    const { data: users } = await supabase
      .from("users")
      .select("wallet_address, username")
      .in("wallet_address", walletAddresses)

    // Erstelle eine Map für schnellen Zugriff
    const usernameMap = new Map(users?.map(u => [u.wallet_address, u.username]) || [])

    // Formatiere die Daten
    const formattedData = entries?.map(entry => ({
      user_id: usernameMap.get(entry.wallet_address) || entry.wallet_address.slice(0, 10) + "...",
      legendary_count: entry.legendary_count,
      wallet_address: entry.wallet_address
    })) || []

    return NextResponse.json({ success: true, data: formattedData })
  } catch (error) {
    console.error("Leaderboard error:", error)
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
