import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"
import { incrementPremiumWheelPoints, incrementStandardWheelPoints } from "@/app/actions/weekly-contest"

// Global daily limit (for all users combined)
const GLOBAL_DAILY_LUCKY_WHEEL_LIMIT = 100

// Premium Wheel Drop Rates (must sum to 100%)
const PREMIUM_DROP_RATES = {
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

// Standard Wheel Drop Rates (must sum to 100%)
// Most common: Tickets 1 (Regular + Legendary) and Common Cards
// Maximum tickets: 3 (Tickets 4 and 5 removed)
const STANDARD_DROP_RATES = {
  regular_tickets_1: 30,
  legendary_tickets_1: 30,
  common_card: 26,
  regular_tickets_2: 2.5,
  legendary_tickets_2: 2.5,
  regular_tickets_3: 2,
  legendary_tickets_3: 2,
  rare_card: 2.5,
  epic_card: 1.5,
  legendary_card: 0.5,
  deal_of_the_day: 0.5,
} as const

// Premium Wheel Segment mapping
// IMPORTANT: Order MUST match the frontend premiumWheelSegments array in draw-content.tsx exactly!
const PREMIUM_SEGMENT_MAP = [
  // Index 0: Epic Card (19%)
  { index: 0, reward: { type: "card", rarity: "epic" }, weight: PREMIUM_DROP_RATES.epic_card },
  // Index 1: +5 Regular Tickets (17%)
  { index: 1, reward: { type: "tickets", ticketType: "regular", amount: 5 }, weight: PREMIUM_DROP_RATES.regular_tickets_5 },
  // Index 2: +5 Legendary Tickets (17%)
  { index: 2, reward: { type: "tickets", ticketType: "legendary", amount: 5 }, weight: PREMIUM_DROP_RATES.legendary_tickets_5 },
  // Index 3: Deal of the Day Bundle (7%)
  { index: 3, reward: { type: "deal", deal: "daily" }, weight: PREMIUM_DROP_RATES.deal_of_the_day },
  // Index 4: +15 Regular Tickets (9%)
  { index: 4, reward: { type: "tickets", ticketType: "regular", amount: 15 }, weight: PREMIUM_DROP_RATES.regular_tickets_10 },
  // Index 5: +15 Legendary Tickets (9%)
  { index: 5, reward: { type: "tickets", ticketType: "legendary", amount: 15 }, weight: PREMIUM_DROP_RATES.legendary_tickets_10 },
  // Index 6: Legendary Card (6%)
  { index: 6, reward: { type: "card", rarity: "legendary" }, weight: PREMIUM_DROP_RATES.legendary_card },
  // Index 7: +25 Regular Tickets (6%)
  { index: 7, reward: { type: "tickets", ticketType: "regular", amount: 25 }, weight: PREMIUM_DROP_RATES.regular_tickets_20 },
  // Index 8: +25 Legendary Tickets (6%)
  { index: 8, reward: { type: "tickets", ticketType: "legendary", amount: 25 }, weight: PREMIUM_DROP_RATES.legendary_tickets_20 },
  // Index 9: Game Pass Unlock (1%)
  { index: 9, reward: { type: "pass", pass: "premium" }, weight: PREMIUM_DROP_RATES.game_pass },
  // Index 10: +50 Regular Tickets (0.5%)
  { index: 10, reward: { type: "tickets", ticketType: "regular", amount: 50 }, weight: PREMIUM_DROP_RATES.regular_tickets_50 },
  // Index 11: +50 Legendary Tickets (0.5%)
  { index: 11, reward: { type: "tickets", ticketType: "legendary", amount: 50 }, weight: PREMIUM_DROP_RATES.legendary_tickets_50 },
  // Index 12: XP Pass Unlock (1%)
  { index: 12, reward: { type: "pass", pass: "xp" }, weight: PREMIUM_DROP_RATES.xp_pass },
  // Index 13: Special Deal Bundle (1%)
  { index: 13, reward: { type: "deal", deal: "special" }, weight: PREMIUM_DROP_RATES.special_deal },
]

// Standard Wheel Segment mapping
// IMPORTANT: Order MUST match the frontend standardWheelSegments array in draw-content.tsx exactly!
// Maximum tickets: 3 (Tickets 4 and 5 removed)
const STANDARD_SEGMENT_MAP = [
  // Index 0: +1 Regular Ticket (30%)
  { index: 0, reward: { type: "tickets", ticketType: "regular", amount: 1 }, weight: STANDARD_DROP_RATES.regular_tickets_1 },
  // Index 1: +1 Legendary Ticket (30%)
  { index: 1, reward: { type: "tickets", ticketType: "legendary", amount: 1 }, weight: STANDARD_DROP_RATES.legendary_tickets_1 },
  // Index 2: Common Card (26%)
  { index: 2, reward: { type: "card", rarity: "common" }, weight: STANDARD_DROP_RATES.common_card },
  // Index 3: +2 Regular Tickets (2.5%)
  { index: 3, reward: { type: "tickets", ticketType: "regular", amount: 2 }, weight: STANDARD_DROP_RATES.regular_tickets_2 },
  // Index 4: +2 Legendary Tickets (2.5%)
  { index: 4, reward: { type: "tickets", ticketType: "legendary", amount: 2 }, weight: STANDARD_DROP_RATES.legendary_tickets_2 },
  // Index 5: +3 Regular Tickets (2%)
  { index: 5, reward: { type: "tickets", ticketType: "regular", amount: 3 }, weight: STANDARD_DROP_RATES.regular_tickets_3 },
  // Index 6: +3 Legendary Tickets (2%)
  { index: 6, reward: { type: "tickets", ticketType: "legendary", amount: 3 }, weight: STANDARD_DROP_RATES.legendary_tickets_3 },
  // Index 7: Rare Card (2.5%)
  { index: 7, reward: { type: "card", rarity: "rare" }, weight: STANDARD_DROP_RATES.rare_card },
  // Index 8: Epic Card (1.5%)
  { index: 8, reward: { type: "card", rarity: "epic" }, weight: STANDARD_DROP_RATES.epic_card },
  // Index 9: Legendary Card (0.5%)
  { index: 9, reward: { type: "card", rarity: "legendary" }, weight: STANDARD_DROP_RATES.legendary_card },
  // Index 10: Deal of the Day Bundle (0.5%)
  { index: 10, reward: { type: "deal", deal: "daily" }, weight: STANDARD_DROP_RATES.deal_of_the_day },
]

// Calculate cumulative weights for weighted random selection
function calculateCumulativeWeights(segments: typeof PREMIUM_SEGMENT_MAP | typeof STANDARD_SEGMENT_MAP) {
  const cumulative: number[] = []
  let sum = 0
  for (const segment of segments) {
    sum += segment.weight
    cumulative.push(sum)
  }
  return cumulative
}

// Select a segment based on weighted drop rates
function selectSegment(segments: typeof PREMIUM_SEGMENT_MAP | typeof STANDARD_SEGMENT_MAP): { index: number; reward: any } {
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
    const { walletAddress, wheelType = "premium", pricePaid } = await req.json()

    if (!walletAddress) {
      return NextResponse.json(
        { success: false, error: "Missing wallet address" },
        { status: 400 },
      )
    }

    // Select the appropriate segment map based on wheel type
    const SEGMENT_MAP = wheelType === "standard" ? STANDARD_SEGMENT_MAP : PREMIUM_SEGMENT_MAP

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

    // Only check limit for Premium Wheel - Standard Wheel has no limit
    let result: any = { success: true, globalSpinsUsed: 0, globalSpinsRemaining: 0, globalDailyLimit: 0, userSpinsCount: 0 }
    
    if (wheelType === "premium") {
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
      result = incrementResult as any

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
    } else if (wheelType === "standard") {
      // Save Standard Wheel spin to database
      // Check if record exists for today
      const { data: existingUsage, error: fetchError } = await supabase
        .from("standard_wheel_daily_usage")
        .select("id, spins_count, price_paid")
        .eq("wallet_address", normalizedWalletAddress)
        .eq("usage_date", today)
        .maybeSingle()

      if (fetchError && fetchError.code !== "PGRST116") {
        console.error("Spin: Error fetching standard wheel usage:", fetchError)
        return NextResponse.json(
          {
            success: false,
            error: "Failed to check standard wheel usage",
            details: fetchError.message || "Database query failed",
          },
          { status: 500 },
        )
      }

      const currentSpins = existingUsage?.spins_count || 0
      const currentPricePaid = existingUsage?.price_paid || 0
      const newSpinsCount = currentSpins + 1
      const newPricePaid = (parseFloat(currentPricePaid.toString()) || 0) + (parseFloat(pricePaid?.toString() || "0") || 0)

      if (existingUsage) {
        // Update existing record
        const { error: updateError } = await supabase
          .from("standard_wheel_daily_usage")
          .update({
            spins_count: newSpinsCount,
            price_paid: newPricePaid,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existingUsage.id)

        if (updateError) {
          console.error("Spin: Error updating standard wheel usage:", updateError)
          return NextResponse.json(
            {
              success: false,
              error: "Failed to update standard wheel usage",
              details: updateError.message || "Database update failed",
            },
            { status: 500 },
          )
        }
      } else {
        // Create new record
        const { error: insertError } = await supabase
          .from("standard_wheel_daily_usage")
          .insert({
            wallet_address: normalizedWalletAddress,
            usage_date: today,
            spins_count: 1,
            price_paid: parseFloat(pricePaid?.toString() || "0") || 0,
          })

        if (insertError) {
          console.error("Spin: Error creating standard wheel usage:", insertError)
          return NextResponse.json(
            {
              success: false,
              error: "Failed to create standard wheel usage",
              details: insertError.message || "Database insert failed",
            },
            { status: 500 },
          )
        }
      }

      // Set user spins count for response
      result.userSpinsCount = newSpinsCount
    }

    // Select winning segment based on drop rates (server-side)
    const { index: segmentIndex, reward } = selectSegment(SEGMENT_MAP)

    // Award Weekly Contest points for Wheel spins
    if (wheelType === "premium") {
      try {
        await incrementPremiumWheelPoints(normalizedWalletAddress, 36)
      } catch (error) {
        // Log error but don't fail the spin if contest points fail
        console.error("Failed to award contest points for premium wheel spin:", error)
      }
    } else if (wheelType === "standard") {
      try {
        await incrementStandardWheelPoints(normalizedWalletAddress, 3)
      } catch (error) {
        // Log error but don't fail the spin if contest points fail
        console.error("Failed to award contest points for standard wheel spin:", error)
      }
    }

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

