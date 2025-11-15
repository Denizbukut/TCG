import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

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
      console.error("Complete spin: Database connection failed:", dbError)
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

    // Get user's usage record with retry logic
    let userUsageData = null
    let retries = 0
    const maxRetries = 3

    while (retries < maxRetries) {
      const { data, error: userUsageError } = await supabase
        .from("lucky_wheel_global_daily_usage")
        .select("id, spins_count, wallet_address, usage_date")
        .eq("wallet_address", normalizedWalletAddress)
        .eq("usage_date", today)
        .maybeSingle()

      if (userUsageError && userUsageError.code !== "PGRST116") {
        console.error(`Complete spin: Error fetching usage (attempt ${retries + 1}):`, {
          code: userUsageError.code,
          message: userUsageError.message,
          details: userUsageError.details,
          hint: userUsageError.hint,
        })
        retries++
        if (retries >= maxRetries) {
          console.error("Complete spin: Failed to check user usage after retries:", {
            walletAddress: normalizedWalletAddress,
            date: today,
            error: userUsageError,
          })
          return NextResponse.json(
            { 
              success: false, 
              error: "Failed to check user usage",
              details: userUsageError.message || "Database query failed after retries"
            },
            { status: 500 },
          )
        }
        // Wait 100ms before retry
        await new Promise((resolve) => setTimeout(resolve, 100))
        continue
      }

      userUsageData = data
      break
    }

    if (!userUsageData) {
      // No record exists, nothing to complete
      return NextResponse.json({
        success: true,
        userSpinsCount: 0,
        hasPendingSpin: false,
      })
    }

    const userSpinsCount = userUsageData.spins_count || 0

    // Spin is complete - just return the current state
    return NextResponse.json({
      success: true,
      userSpinsCount,
      hasPendingSpin: false,
    })
  } catch (error) {
    console.error("Complete spin: Unexpected error:", {
      error,
      message: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
    })
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
        details: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    )
  }
}

