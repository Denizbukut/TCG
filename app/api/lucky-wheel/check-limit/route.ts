import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

// Global daily limit (for all users combined)
const GLOBAL_DAILY_LUCKY_WHEEL_LIMIT = 25

export async function POST(req: Request) {
  try {
    const { walletAddress } = await req.json()

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: "Missing wallet address" },
        { status: 400 },
      )
    }

    let supabase
    try {
      supabase = getSupabaseServerClient()
    } catch (dbError) {
      console.error("Check limit: Database connection failed:", dbError)
      return NextResponse.json(
        { 
          success: false, 
          error: "Database connection failed",
          details: dbError instanceof Error ? dbError.message : "Unknown database error"
        },
        { status: 500 },
      )
    }

    // Normalize wallet address to lowercase for consistency
    const normalizedWalletAddress = walletAddress.toLowerCase().trim()
    const today = new Date().toISOString().split("T")[0]

    // Check global daily usage (sum all spins_count for today)
    const { data: allUsageData, error: fetchError } = await supabase
      .from("lucky_wheel_global_daily_usage")
      .select("spins_count")
      .eq("usage_date", today)

    if (fetchError) {
      console.error("Check limit: Error checking global usage:", {
        code: fetchError.code,
        message: fetchError.message,
        details: fetchError.details,
        hint: fetchError.hint,
      })
      return NextResponse.json(
        { 
          success: false, 
          error: "Failed to check global usage",
          details: fetchError.message || "Database query failed"
        },
        { status: 500 },
      )
    }

    // Sum all spins_count for global limit
    const globalSpinsUsed = allUsageData?.reduce((sum, row) => sum + (row.spins_count || 0), 0) || 0
    const globalSpinsRemaining = GLOBAL_DAILY_LUCKY_WHEEL_LIMIT - globalSpinsUsed

    // Check user-specific usage
    const { data: userUsageData, error: userUsageError } = await supabase
      .from("lucky_wheel_global_daily_usage")
      .select("spins_count")
      .eq("wallet_address", normalizedWalletAddress)
      .eq("usage_date", today)
      .maybeSingle()

    if (userUsageError && userUsageError.code !== "PGRST116") {
      console.error("Check limit: Error checking user usage:", userUsageError)
      // Don't fail, just use 0 for user spins
    }

    const userSpinsCount = userUsageData?.spins_count || 0
    const canSpin = globalSpinsRemaining > 0

    return NextResponse.json({
      success: true,
      canSpin, // Can't spin if global limit reached
      // Global limit data
      globalSpinsUsed,
      globalSpinsRemaining: Math.max(0, globalSpinsRemaining),
      globalDailyLimit: GLOBAL_DAILY_LUCKY_WHEEL_LIMIT,
      // User tracking data
      userSpinsCount,
      hasPendingSpin: false,
    })
  } catch (error) {
    console.error("Lucky wheel limit check error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 },
    )
  }
}

