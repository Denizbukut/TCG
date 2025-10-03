"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@supabase/supabase-js"

// Create a server-side Supabase client
function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: {
      persistSession: false,
    },
  })
}

/**
 * Claims daily token for a user
 */
export async function claimDailyToken(walletAddress: string) {
  try {
    const supabase = createSupabaseServer()

    // Get current user data
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("username, tokens, token_last_claimed")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      // Create user if not found
      const { error: createError } = await supabase.from("users").insert({
        username: username,
        tokens: 1,
        token_last_claimed: new Date().toISOString(),
      })

      if (createError) {
        console.error("Error creating user:", createError)
        return { success: false, error: "Failed to create user" }
      }

      return { success: true, newTokenCount: 1 }
    }

    // Check if user has already claimed within the last 24 hours
    if (userData.token_last_claimed) {
      const lastClaimed = new Date(userData.token_last_claimed as string)
      const now = new Date()
      const hoursSinceLastClaim = (now.getTime() - lastClaimed.getTime()) / (1000 * 60 * 60)

      if (hoursSinceLastClaim < 24) {
        const timeUntilNextClaim = 24 * 60 * 60 * 1000 - (now.getTime() - lastClaimed.getTime())
        return {
          success: false,
          error: "Already claimed within the last 24 hours",
          alreadyClaimed: true,
          timeUntilNextClaim,
          nextClaimTime: new Date(lastClaimed.getTime() + 24 * 60 * 60 * 1000).toISOString(),
        }
      }
    }

    // Award token (1 token per claim)
    const newTokenCount = (typeof userData.tokens === "number" ? userData.tokens : 0) + 1

    // Update user
    const { error: updateError } = await supabase
      .from("users")
      .update({
        tokens: newTokenCount,
        token_last_claimed: new Date().toISOString(),
      })
      .eq("username", userData.username)

    if (updateError) {
      return { success: false, error: "Failed to update tokens" }
    }

    revalidatePath("/")
    return {
      success: true,
      newTokenCount: newTokenCount || 0,
      nextClaimTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }
  } catch (error) {
    console.error("Error claiming daily token:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}