import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

// Global daily limit (for all users combined)
const GLOBAL_DAILY_LUCKY_WHEEL_LIMIT = 25

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
// Frontend order: Epic Card, Legendary Card, +5 Regular, +5 Legendary, +10 Regular, +10 Legendary,
//                 +20 Regular, +20 Legendary, +50 Regular, +50 Legendary, Game Pass, XP Pass,
//                 Deal of the Day, Special Deal
const SEGMENT_MAP = [
  // Index 0: Epic Card (19%)
  { index: 0, reward: { type: "card", rarity: "epic" }, weight: DROP_RATES.epic_card },
  // Index 1: Legendary Card (6%)
  { index: 1, reward: { type: "card", rarity: "legendary" }, weight: DROP_RATES.legendary_card },
  // Index 2: +5 Regular Tickets (17%)
  { index: 2, reward: { type: "tickets", ticketType: "regular", amount: 5 }, weight: DROP_RATES.regular_tickets_5 },
  // Index 3: +5 Legendary Tickets (17%)
  { index: 3, reward: { type: "tickets", ticketType: "legendary", amount: 5 }, weight: DROP_RATES.legendary_tickets_5 },
  // Index 4: +15 Regular Tickets (9%)
  { index: 4, reward: { type: "tickets", ticketType: "regular", amount: 15 }, weight: DROP_RATES.regular_tickets_10 },
  // Index 5: +15 Legendary Tickets (9%)
  { index: 5, reward: { type: "tickets", ticketType: "legendary", amount: 15 }, weight: DROP_RATES.legendary_tickets_10 },
  // Index 6: +25 Regular Tickets (6%)
  { index: 6, reward: { type: "tickets", ticketType: "regular", amount: 25 }, weight: DROP_RATES.regular_tickets_20 },
  // Index 7: +25 Legendary Tickets (6%)
  { index: 7, reward: { type: "tickets", ticketType: "legendary", amount: 25 }, weight: DROP_RATES.legendary_tickets_20 },
  // Index 8: +50 Regular Tickets (0.5%)
  { index: 8, reward: { type: "tickets", ticketType: "regular", amount: 50 }, weight: DROP_RATES.regular_tickets_50 },
  // Index 9: +50 Legendary Tickets (0.5%)
  { index: 9, reward: { type: "tickets", ticketType: "legendary", amount: 50 }, weight: DROP_RATES.legendary_tickets_50 },
  // Index 10: Game Pass Unlock (1%)
  { index: 10, reward: { type: "pass", pass: "premium" }, weight: DROP_RATES.game_pass },
  // Index 11: XP Pass Unlock (1%)
  { index: 11, reward: { type: "pass", pass: "xp" }, weight: DROP_RATES.xp_pass },
  // Index 12: Deal of the Day Bundle (7%)
  { index: 12, reward: { type: "deal", deal: "daily" }, weight: DROP_RATES.deal_of_the_day },
  // Index 13: Special Deal Bundle (1%)
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
      console.error("Spin: Database connection failed:", dbError)
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

    // Use atomic RPC function to check limit and increment spin count
    // This prevents race conditions where multiple users can spin simultaneously
    // NOTE: The PostgreSQL function 'try_increment_lucky_wheel_spin' must be deployed first
    // See: scripts/create-lucky-wheel-atomic-function.sql
    const { data: incrementResult, error: rpcError } = await supabase
      .rpc("try_increment_lucky_wheel_spin", {
        p_wallet_address: normalizedWalletAddress,
        p_usage_date: today,
        p_global_limit: GLOBAL_DAILY_LUCKY_WHEEL_LIMIT,
      })

    if (rpcError) {
      console.error("Spin: Error calling atomic increment function:", {
        code: rpcError.code,
        message: rpcError.message,
        details: rpcError.details,
        hint: rpcError.hint,
      })
      return NextResponse.json(
        {
          success: false,
          error: "Failed to process spin",
          details: rpcError.message || "Database function call failed",
        },
        { status: 500 },
      )
    }

    // Parse the JSONB result from the function
    const result = incrementResult as any

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
    console.error("Lucky wheel spin error:", {
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

