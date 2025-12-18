"use server"

import { createClient } from "@supabase/supabase-js"

function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  })
}

export type PackType = "regular" | "legendary"
export type BoostType = "regular" | "premium"
export type BoostDuration = "1week" | "1month"

interface BoostConfig {
  legendaryBonus: number
  priceUsd: {
    "1week": number
    "1month": number
  }
}

const BOOST_CONFIGS: Record<PackType, Record<BoostType, BoostConfig>> = {
  regular: {
    regular: {
      legendaryBonus: 1,
      priceUsd: {
        "1week": 0.2,
        "1month": 0.6,
      },
    },
    premium: {
      legendaryBonus: 2,
      priceUsd: {
        "1week": 0.4,
        "1month": 1.2,
      },
    },
  },
  legendary: {
    regular: {
      legendaryBonus: 2,
      priceUsd: {
        "1week": 0.3,
        "1month": 1.0,
      },
    },
    premium: {
      legendaryBonus: 5,
      priceUsd: {
        "1week": 1.0,
        "1month": 3.0,
      },
    },
  },
}

/**
 * Check if user has an active drop rate boost
 */
export async function checkDropRateBoost(walletAddress: string, packType: PackType) {
  try {
    const supabase = createSupabaseServer()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from("drop_rate_boosts")
      .select("boost_type, active_until")
      .eq("wallet_address", walletAddress.toLowerCase())
      .eq("pack_type", packType)
      .gt("active_until", now)
      .order("active_until", { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error && error.code !== "PGRST116") {
      console.error("Error checking drop rate boost:", error)
      return { success: false, error: "Failed to check boost status" }
    }

    if (!data) {
      return { success: true, hasBoost: false, boostType: null, expiresAt: null, legendaryBonus: 0 }
    }

    const config = BOOST_CONFIGS[packType][data.boost_type as BoostType]

    return {
      success: true,
      hasBoost: true,
      boostType: data.boost_type as BoostType,
      expiresAt: data.active_until,
      legendaryBonus: config.legendaryBonus,
    }
  } catch (error) {
    console.error("Error in checkDropRateBoost:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Purchase a drop rate boost
 */
export async function purchaseDropRateBoost(
  walletAddress: string,
  packType: PackType,
  boostType: BoostType,
  duration: BoostDuration,
  priceUsd?: number,
  paymentCurrency?: string,
  paymentAmount?: number
) {
  try {
    const supabase = createSupabaseServer()
    const config = BOOST_CONFIGS[packType][boostType]
    const finalPriceUsd = priceUsd || config.priceUsd[duration]

    // Calculate expiry date
    const activeUntil = new Date()
    if (duration === "1week") {
      activeUntil.setDate(activeUntil.getDate() + 7)
    } else {
      // 1 month = 30 days
      activeUntil.setDate(activeUntil.getDate() + 30)
    }

    // Insert boost record with payment information
    const insertData: any = {
      wallet_address: walletAddress.toLowerCase(),
      pack_type: packType,
      boost_type: boostType,
      active_until: activeUntil.toISOString(),
      price_usd: finalPriceUsd,
    }

    // Add payment currency and amount if provided
    if (paymentCurrency) {
      insertData.payment_currency = paymentCurrency
    }
    if (paymentAmount !== undefined && paymentAmount !== null) {
      insertData.payment_amount = paymentAmount
    }

    const { error: insertError } = await supabase.from("drop_rate_boosts").insert(insertData)

    if (insertError) {
      console.error("Error purchasing drop rate boost:", insertError)
      return { success: false, error: "Failed to purchase boost" }
    }

    return {
      success: true,
      priceUsd: finalPriceUsd,
      expiresAt: activeUntil.toISOString(),
      legendaryBonus: config.legendaryBonus,
    }
  } catch (error) {
    console.error("Error in purchaseDropRateBoost:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Get boost configuration for display
 */
export async function getBoostConfig(packType: PackType, boostType: BoostType, duration: BoostDuration): Promise<BoostConfig> {
  return BOOST_CONFIGS[packType][boostType]
}

