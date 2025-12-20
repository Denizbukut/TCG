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
      console.error("Cancel spin: Database connection failed:", dbError)
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

    // Use atomic RPC function to cancel a reserved spin
    // NOTE: The PostgreSQL function 'cancel_lucky_wheel_spin' must be deployed first
    const { data: cancelResult, error: rpcError } = await supabase
      .rpc("cancel_lucky_wheel_spin", {
        p_wallet_address: normalizedWalletAddress,
        p_usage_date: today,
        p_global_limit: GLOBAL_DAILY_LUCKY_WHEEL_LIMIT,
      })

    if (rpcError) {
      console.error("Cancel spin: Error calling cancel function:", {
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
      })
      return NextResponse.json(
        {
          success: false,
          error: "Failed to cancel spin",
          details: rpcError.message || "Database function call failed",
        },
        { status: 500 },
      )
    }

    // Parse the JSONB result from the function
    const result = cancelResult as any

    return NextResponse.json({
      success: result.success,
      globalSpinsUsed: result.globalSpinsUsed,
      globalSpinsRemaining: result.globalSpinsRemaining,
      globalDailyLimit: result.globalDailyLimit,
      userSpinsCount: result.userSpinsCount,
      cancelled: result.cancelled,
      message: result.message,
    })
  } catch (error) {
    console.error("Cancel spin error:", {
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

