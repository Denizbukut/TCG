import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

// Global daily limit (for all users combined)
const GLOBAL_DAILY_LUCKY_WHEEL_LIMIT = 100

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
      console.error("Reserve spin: Database connection failed:", dbError)
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

    // Use atomic RPC function to reserve a spin slot
    // NOTE: The PostgreSQL function 'reserve_lucky_wheel_spin' must be deployed first
    const { data: reserveResult, error: rpcError } = await supabase
      .rpc("reserve_lucky_wheel_spin", {
        p_wallet_address: normalizedWalletAddress,
        p_usage_date: today,
        p_global_limit: GLOBAL_DAILY_LUCKY_WHEEL_LIMIT,
      })

    if (rpcError) {
      console.error("Reserve spin: Error calling reserve function:", {
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
      })
      return NextResponse.json(
        {
          success: false,
          error: "Failed to reserve spin",
          details: rpcError.message || "Database function call failed",
        },
        { status: 500 },
      )
    }

    // Parse the JSONB result from the function
    const result = reserveResult as any

    if (!result.success) {
      // Global limit reached
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Global Lucky Wheel limit reached for today",
          globalSpinsUsed: result.globalSpinsUsed,
          globalDailyLimit: result.globalDailyLimit,
          globalSpinsRemaining: result.globalSpinsRemaining || 0,
        },
        { status: 429 },
      )
    }

    return NextResponse.json({
      success: true,
      globalSpinsUsed: result.globalSpinsUsed,
      globalSpinsRemaining: result.globalSpinsRemaining,
      globalDailyLimit: result.globalDailyLimit,
      reserved: true,
    })
  } catch (error) {
    console.error("Reserve spin error:", {
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

