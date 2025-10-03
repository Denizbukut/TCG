"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@supabase/supabase-js"

function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: {
      persistSession: false,
    },
  })
}

// Debug function to check referrals table
export async function debugReferralsTable() {
  try {
    const supabase = createSupabaseServer()
    
    console.log("🔍 Debugging referrals table...")
    
    // Check if table exists and get all data
    const { data, error } = await supabase
      .from("referrals")
      .select("*")
    
    if (error) {
      console.error("❌ Error accessing referrals table:", error)
      return { success: false, error: error.message }
    }
    
    console.log("✅ Referrals table accessible")
    console.log("📊 Total referrals:", data?.length || 0)
    console.log("📋 All referrals data:", data)
    
    return { success: true, data }
  } catch (error) {
    console.error("❌ Unexpected error in debugReferralsTable:", error)
    return { success: false, error: String(error) }
  }
}

export async function claimReferralRewardForUser(referrerWalletAddress: string, referredWalletAddress: string) {
  try {
    const supabase = createSupabaseServer()

    // Check if referred user reached level 10
    const { data: referredUser, error: referredUserError } = await supabase
      .from("users")
      .select("level")
      .eq("username", referredUsername)
      .single()

    if (referredUserError) {
      console.error("Error fetching referred user:", referredUserError)
      return { success: false, error: "Failed to fetch referred user data." }
    }

    if (!referredUser || referredUser.level < 10) {
      return { success: false, error: "User has not reached level 10 yet." }
    }

    // Get referral record
    const { data: referral, error: referralError } = await supabase
      .from("referrals")
      .select("id, reward_claimed")
      .eq("referrer_wallet_address", referrerWalletAddress)
      .eq("referred_wallet_address", referredWalletAddress)
      .single()

    if (referralError) {
      console.error("Error fetching referral record:", referralError)
      return { success: false, error: "Failed to fetch referral record." }
    }

    if (!referral || referral.reward_claimed) {
      return { success: false, error: "Reward already claimed or referral not found." }
    }

    // Get referrer's current tickets
    const { data: userData, error: userDataError } = await supabase
      .from("users")
      .select("tickets, legendary_tickets")
      .eq("username", referrerUsername)
      .single()

    if (userDataError) {
      console.error("Error fetching user data:", userDataError)
      return { success: false, error: "Failed to fetch user data." }
    }

    const newTicketCount = (userData?.tickets ?? 0) + 5
    const newLegendaryTicketCount = (userData?.legendary_tickets ?? 0) + 3

    // Update tickets
    const { error: updateError } = await supabase
      .from("users")
      .update({
        tickets: newTicketCount,
        legendary_tickets: newLegendaryTicketCount,
      })
      .eq("username", referrerUsername)

    if (updateError) {
      console.error("Error updating user tickets:", updateError)
      return { success: false, error: "Failed to update user tickets." }
    }

    // Mark referral as claimed
    const { error: claimError } = await supabase
      .from("referrals")
      .update({ reward_claimed: true, claimed_at: new Date().toISOString() })
      .eq("id", referral.id)

    if (claimError) {
      console.error("Error marking referral as claimed:", claimError)
      return { success: false, error: "Failed to mark referral as claimed." }
    }

    // ✅ Return updated counts for UI update
    return {
      success: true,
      newTicketCount: newTicketCount,
      newLegendaryTicketCount: newLegendaryTicketCount,
    }
  } catch (error) {
    console.error("Unexpected error in claimReferralRewardForUser:", error)
    return { success: false, error: "An unexpected error occurred." }
  }
}

export async function getReferredUsers(referrerWalletAddress: string) {
  try {
    console.log("🔍 getReferredUsers called for:", referrerUsername)
    const supabase = createSupabaseServer()
    
    // Get referrals for this specific user
    const { data, error } = await supabase
      .from("referrals")
      .select("id, referred_username, reward_claimed, created_at")
      .eq("referrer_wallet_address", referrerWalletAddress)

    console.log("🔍 Query for referrer_username:", referrerUsername)
    console.log("📊 Found referrals:", data?.length || 0)
    console.log("📋 Referrals data:", data)

    if (error) {
      console.error("❌ Error fetching referrals:", error)
      return []
    }

    if (!data || data.length === 0) {
      console.log("⚠️ No referrals found for user:", referrerUsername)
      return []
    }

    console.log("🔄 Processing", data.length, "referrals...")

    // Get user levels in a single query for better performance
    const referredUsernames = data.map(ref => ref.referred_username)
    const { data: userLevels, error: userLevelsError } = await supabase
      .from("users")
      .select("username, level")
      .in("username", referredUsernames)

    if (userLevelsError) {
      console.error("❌ Error fetching user levels:", userLevelsError)
    } else {
      console.log("📊 User levels fetched:", userLevels)
    }

    // Create a map for quick lookup
    const levelMap = new Map()
    if (userLevels) {
      userLevels.forEach(user => {
        levelMap.set(user.username, user.level)
      })
    }

    const detailed = data.map((ref) => {
      const level = levelMap.get(ref.referred_username) || 1
      console.log(`✅ User ${ref.referred_username} level:`, level)
      
      return {
        id: ref.id,
        username: ref.referred_username,
        level: level,
        reward_claimed: ref.reward_claimed ?? false,
        created_at: ref.created_at
      }
    })

    console.log("✅ Final detailed referrals:", detailed)
    return detailed
  } catch (error) {
    console.error("❌ Unexpected error in getReferredUsers:", error)
    return []
  }
}