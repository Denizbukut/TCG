import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { WEEKLY_CONTEST_CONFIG, getContestEndDate } from "@/lib/weekly-contest-config"

function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  })
}

export async function POST(request: NextRequest) {
  try {
    const { referrerWalletAddress } = await request.json()

    if (!referrerWalletAddress) {
      return NextResponse.json({ success: false, error: "Referrer wallet address is required" }, { status: 400 })
    }

    console.log("🎯 Awarding Weekly Contest points for new referral signup to:", referrerWalletAddress)

    const supabase = createSupabaseServer()
    const now = new Date()

    // 🔒 SECURITY: Find the most recent unused referral
    const { data: referral, error: referralError } = await supabase
      .from("referrals")
      .select("id, created_at, contest_points_awarded")
      .eq("referrer_wallet_address", referrerWalletAddress)
      .eq("contest_points_awarded", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()

    if (referralError || !referral) {
      console.error("❌ No unused referral found:", referralError)
      return NextResponse.json({ 
        success: false, 
        error: "No valid unused referral found" 
      }, { status: 400 })
    }

    // 🔒 SECURITY: Check if referral was created recently (within last 5 minutes)
    const referralAge = now.getTime() - new Date(referral.created_at).getTime()
    const MAX_AGE = 5 * 60 * 1000 // 5 minutes
    
    if (referralAge > MAX_AGE) {
      console.error("❌ Referral entry too old:", referralAge / 1000, "seconds")
      return NextResponse.json({ 
        success: false, 
        error: "Referral entry expired. Please try again." 
      }, { status: 400 })
    }

    console.log("✅ Valid unused referral found, age:", Math.floor(referralAge / 1000), "seconds")

    const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
    const contestEnd = getContestEndDate()

    // Check if contest is still active
    if (now > contestEnd) {
      console.log("⚠️ Contest has ended, but signup is still valid")
      // Mark referral as processed even though no points awarded
      await supabase
        .from("referrals")
        .update({ contest_points_awarded: true })
        .eq("id", referral.id)
      return NextResponse.json({ success: true, message: "Contest ended, no points awarded" })
    }

    // Get current contest entry
    const { data, error } = await supabase
      .from("weekly_contest_entries")
      .select("legendary_count")
      .eq("wallet_address", referrerWalletAddress)
      .eq("week_start_date", weekStart)
      .single()

    if (error && error.code === "PGRST116") {
      // No entry exists, create new one
      console.log("Creating new contest entry with 5 points (referral)")
      const { error: insertError } = await supabase.from("weekly_contest_entries").insert({
        wallet_address: referrerWalletAddress,
        week_start_date: weekStart,
        legendary_count: 5, // 5 points for referral
      })

      if (insertError) {
        console.error("❌ Error creating contest entry:", insertError)
        return NextResponse.json({ success: false, error: insertError.message }, { status: 500 })
      }

      console.log("✅ Contest entry created successfully")
      return NextResponse.json({ success: true, points: 5 })
    } else if (error) {
      console.error("❌ Error fetching contest entry:", error)
      return NextResponse.json({ success: false, error: error.message }, { status: 500 })
    } else {
      // Entry exists, update it
      const currentCount = data?.legendary_count || 0
      const newCount = currentCount + 5

      console.log(`Updating contest entry from ${currentCount} to ${newCount}`)

      const { error: updateError } = await supabase
        .from("weekly_contest_entries")
        .update({ legendary_count: newCount })
        .eq("wallet_address", referrerWalletAddress)
        .eq("week_start_date", weekStart)

      if (updateError) {
        console.error("❌ Error updating contest entry:", updateError)
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 })
      }

      console.log("✅ Contest entry updated successfully")
      
      // 🔒 SECURITY: Mark referral as used to prevent double-claiming
      const { error: markError } = await supabase
        .from("referrals")
        .update({ contest_points_awarded: true })
        .eq("id", referral.id)

      if (markError) {
        console.error("⚠️ Warning: Could not mark referral as used:", markError)
        // Don't fail the request, points were already awarded
      } else {
        console.log("✅ Referral marked as used (contest_points_awarded = true)")
      }

      return NextResponse.json({ success: true, points: 5 })
    }
  } catch (error) {
    console.error("❌ Unexpected error in referral-signup API:", error)
    return NextResponse.json({ success: false, error: "An unexpected error occurred" }, { status: 500 })
  }
}

