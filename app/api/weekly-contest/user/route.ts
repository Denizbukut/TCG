import { createClient } from "@supabase/supabase-js"
import { type NextRequest, NextResponse } from "next/server"
import { WEEKLY_CONTEST_CONFIG } from "@/lib/weekly-contest-config"

export async function GET(request: NextRequest) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart

  const { searchParams } = new URL(request.url)
  let walletAddress = searchParams.get("walletAddress")
  const username = searchParams.get("username")

  // Wenn username übergeben wurde, hole die wallet_address aus der users-Tabelle
  if (!walletAddress && username) {
    const { data: userData } = await supabase
      .from("users")
      .select("wallet_address")
      .eq("username", username)
      .single()
    
    walletAddress = userData?.wallet_address
  }

  if (!walletAddress) {
    return NextResponse.json({ success: false, error: "Wallet address or username is required" }, { status: 400 })
  }

  try {
    // Benutzerdaten abrufen
    // WICHTIG: trade_points fließen jetzt direkt in legendary_count
    const { data: userEntry, error: userError } = await supabase
      .from("weekly_contest_entries")
      .select("legendary_count")
      .eq("week_start_date", weekStart)
      .eq("wallet_address", walletAddress)
      .single()

    if (userError && userError.code !== "PGRST116") {
      // PGRST116 = no rows returned
      return NextResponse.json({ success: false, error: userError.message }, { status: 500 })
    }

    // Wenn kein Eintrag gefunden wurde
    if (!userEntry) {
      return NextResponse.json({
        success: true,
        data: { legendary_count: 0, rank: null },
      })
    }

    const userLegendaryCount = userEntry.legendary_count || 0

    // Rang des Benutzers berechnen basierend auf legendary_count (enthält jetzt auch Trade-Punkte)
    const { data: allEntries, error: allEntriesError } = await supabase
      .from("weekly_contest_entries")
      .select("legendary_count")
      .eq("week_start_date", weekStart)

    if (allEntriesError) {
      return NextResponse.json({ success: false, error: allEntriesError.message }, { status: 500 })
    }

    // Berechne Rang basierend auf legendary_count
    const rank = allEntries?.filter(entry => {
      const entryCount = entry.legendary_count || 0
      return entryCount > userLegendaryCount
    }).length || 0

    return NextResponse.json({
      success: true,
      data: {
        legendary_count: userLegendaryCount,
        rank: rank + 1,
      },
    })
  } catch (error) {
    return NextResponse.json({ success: false, error: "Internal server error" }, { status: 500 })
  }
}
