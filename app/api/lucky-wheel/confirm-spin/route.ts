import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

// Global daily limit (for all users combined)
const GLOBAL_DAILY_LUCKY_WHEEL_LIMIT = 100

// Drop Rates (must sum to 100%)
const DROP_RATES = {
  epic_card: 19,
  regular_tickets_5: 17,
  legendary_tickets_5: 17,
  regular_tickets_10: 9,
  legendary_tickets_10: 9,
  deal_of_the_day: 7,
  regular_tickets_20: 6,
  legendary_tickets_20: 6,
  legendary_card: 6,
  special_deal: 1,
  game_pass: 1,
  xp_pass: 1,
  regular_tickets_50: 0.5,
  legendary_tickets_50: 0.5,
} as const

// Segment mapping based on drop rates
// IMPORTANT: Order MUST match the frontend segments array in draw-content.tsx exactly!
const SEGMENT_MAP = [
  { index: 0, reward: { type: "card", rarity: "epic" }, weight: DROP_RATES.epic_card },
  { index: 1, reward: { type: "card", rarity: "legendary" }, weight: DROP_RATES.legendary_card },
  { index: 2, reward: { type: "tickets", ticketType: "regular", amount: 5 }, weight: DROP_RATES.regular_tickets_5 },
  { index: 3, reward: { type: "tickets", ticketType: "legendary", amount: 5 }, weight: DROP_RATES.legendary_tickets_5 },
  { index: 4, reward: { type: "tickets", ticketType: "regular", amount: 15 }, weight: DROP_RATES.regular_tickets_10 },
  { index: 5, reward: { type: "tickets", ticketType: "legendary", amount: 15 }, weight: DROP_RATES.legendary_tickets_10 },
  { index: 6, reward: { type: "tickets", ticketType: "regular", amount: 25 }, weight: DROP_RATES.regular_tickets_20 },
  { index: 7, reward: { type: "tickets", ticketType: "legendary", amount: 25 }, weight: DROP_RATES.legendary_tickets_20 },
  { index: 8, reward: { type: "tickets", ticketType: "regular", amount: 50 }, weight: DROP_RATES.regular_tickets_50 },
  { index: 9, reward: { type: "tickets", ticketType: "legendary", amount: 50 }, weight: DROP_RATES.legendary_tickets_50 },
  { index: 10, reward: { type: "pass", pass: "premium" }, weight: DROP_RATES.game_pass },
  { index: 11, reward: { type: "pass", pass: "xp" }, weight: DROP_RATES.xp_pass },
  { index: 12, reward: { type: "deal", deal: "daily" }, weight: DROP_RATES.deal_of_the_day },
  { index: 13, reward: { type: "deal", deal: "special" }, weight: DROP_RATES.special_deal },
]

// Calculate cumulative weights for weighted random selection
function calculateCumulativeWeights(segments: typeof SEGMENT_MAP) {
  const cumulative: number[] = []
  let sum = 0
  for (const segment of segments) {
    sum += segment.weight
    cumulative.push(sum)
  }
  return cumulative
}

// Select a segment based on weighted drop rates
function selectSegment(segments: typeof SEGMENT_MAP): { index: number; reward: any } {
  const cumulative = calculateCumulativeWeights(segments)
  const random = Math.random() * 100 // 0-100
  
  for (let i = 0; i < cumulative.length; i++) {
    if (random < cumulative[i]) {
      return { index: segments[i].index, reward: segments[i].reward }
    }
  }
  
  // Fallback to first segment (should never happen)
  return { index: segments[0].index, reward: segments[0].reward }
}

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
      console.error("Confirm spin: Database connection failed:", dbError)
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

    // Use atomic RPC function to confirm the reserved spin (increment count)
    // NOTE: The PostgreSQL function 'confirm_lucky_wheel_spin' must be deployed first
    const { data: confirmResult, error: rpcError } = await supabase
      .rpc("confirm_lucky_wheel_spin", {
        p_wallet_address: normalizedWalletAddress,
        p_usage_date: today,
        p_global_limit: GLOBAL_DAILY_LUCKY_WHEEL_LIMIT,
      })

    if (rpcError) {
      console.error("Confirm spin: Error calling confirm function:", {
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
      })
      return NextResponse.json(
        {
          success: false,
          error: "Failed to confirm spin",
          details: rpcError.message || "Database function call failed",
        },
        { status: 500 },
      )
    }

    // Parse the JSONB result from the function
    const result = confirmResult as any

    if (!result.success) {
      // Global limit reached (should rarely happen if reserve was successful)
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

    // Select winning segment based on drop rates (server-side)
    const { index: segmentIndex, reward } = selectSegment(SEGMENT_MAP)

    return NextResponse.json({
      success: true,
      segmentIndex,
      reward,
      globalSpinsUsed: result.globalSpinsUsed,
      globalSpinsRemaining: result.globalSpinsRemaining,
      globalDailyLimit: result.globalDailyLimit,
      userSpinsCount: result.userSpinsCount,
    })
  } catch (error) {
    console.error("Confirm spin error:", {
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

