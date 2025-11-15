import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

// Default daily limit (should match check-limit route)
const DAILY_LUCKY_WHEEL_LIMIT = 10

export async function POST(req: Request) {
  try {
    const { walletAddress } = await req.json()

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: "Missing wallet address" },
        { status: 400 },
      )
    }

    const supabase = getSupabaseServerClient()
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database connection failed" },
        { status: 500 },
      )
    }

    const today = new Date().toISOString().split("T")[0]

    // Check current usage for today (with lock to prevent race conditions)
    const { data: usageData, error: usageError } = await supabase
      .from("lucky_wheel_daily_usage")
      .select("*")
      .eq("wallet_address", walletAddress)
      .eq("usage_date", today)
      .maybeSingle()

    if (usageError && usageError.code !== "PGRST116") {
      console.error("Error checking lucky wheel usage:", usageError)
      return NextResponse.json(
        { success: false, error: "Failed to check usage" },
        { status: 500 },
      )
    }

    const spinsUsed = usageData?.spins_count || 0

    // Check if limit is reached
    if (spinsUsed >= DAILY_LUCKY_WHEEL_LIMIT) {
      return NextResponse.json(
        {
          success: false,
          error: "Daily Lucky Wheel limit reached",
          spinsUsed,
          dailyLimit: DAILY_LUCKY_WHEEL_LIMIT,
        },
        { status: 429 },
      )
    }

    // Increment usage count
    if (usageData) {
      // Update existing record
      const { error: updateError } = await supabase
        .from("lucky_wheel_daily_usage")
        .update({
          spins_count: spinsUsed + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", usageData.id)

      if (updateError) {
        console.error("Error updating lucky wheel usage:", updateError)
        return NextResponse.json(
          { success: false, error: "Failed to update usage" },
          { status: 500 },
        )
      }
    } else {
      // Create new record
      const { error: insertError } = await supabase
        .from("lucky_wheel_daily_usage")
        .insert({
          wallet_address: walletAddress,
          usage_date: today,
          spins_count: 1,
        })

      if (insertError) {
        console.error("Error creating lucky wheel usage:", insertError)
        return NextResponse.json(
          { success: false, error: "Failed to create usage record" },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({
      success: true,
      spinsUsed: spinsUsed + 1,
      spinsRemaining: DAILY_LUCKY_WHEEL_LIMIT - (spinsUsed + 1),
      dailyLimit: DAILY_LUCKY_WHEEL_LIMIT,
    })
  } catch (error) {
    console.error("Lucky wheel increment usage error:", error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
      },
      { status: 500 },
    )
  }
}

