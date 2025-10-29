"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

// Create a server-side Supabase client
function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: {
      persistSession: false,
    },
  })
}

// Get the daily deal (cache removed to allow real-time updates)
export const getDailyDeal = async (walletAddress: string) => {
  try {
    const supabase = createSupabaseServer()
    const today = new Date().toISOString().split("T")[0]

    // Get today's deal only (no fallback to old deals)
    const { data: deal, error: dealError } = await supabase
      .from("daily_deals")
      .select("*")
      .eq("date", today)
      .single()

    if (dealError || !deal) {
      console.log("No deal available for today:", dealError)
      return { success: false, error: "No deal available" }
    }

    console.log("=== getDailyDeal DEBUG ===")
    console.log("Found deal for today:", deal)
    console.log("Today's date:", today)

    // Get card information
    const { data: card, error: cardError } = await supabase.from("cards").select("*").eq("id", deal.card_id).single()

    if (cardError) {
      console.error("Error fetching card details:", cardError)
      return { success: false, error: "Failed to fetch card details" }
    }


    // Format the deal data to include card information
    const formattedDeal = {
      ...deal,
      card_name: card.name,
      card_image_url: card.image_url,
      card_rarity: card.rarity,
      card_character: card.character,
    }


    // Check if user has already interacted with this deal
    // Get the most recent interaction, prioritizing purchased ones
    const { data: interactions, error: interactionError } = await supabase
      .from("deal_interactions")
      .select("*")
      .eq("wallet_address", walletAddress)
      .eq("deal_id", deal.id)
      .order("purchased", { ascending: false }) // purchased=true first
      .order("interaction_date", { ascending: false }) // then by date
      .limit(1)

    const interaction = interactions?.[0]

    // If no interaction record exists, create one with seen=false and dismissed=false
    if (interactionError || !interaction) {
      const { error: insertError } = await supabase.from("deal_interactions").insert({
        wallet_address: walletAddress,
        deal_id: deal.id,
        seen: false,
        dismissed: false,
        purchased: false,
      })

      if (insertError) {
        console.error("Error creating deal interaction:", insertError)
        return { success: false, error: "Failed to create deal interaction" }
      }

      return {
        success: true,
        deal: formattedDeal,
        interaction: {
          seen: false,
          dismissed: false,
          purchased: false,
        },
      }
    } else if (interactionError) {
      console.error("Error fetching deal interaction:", interactionError)
      return { success: false, error: "Failed to fetch deal interaction" }
    }

    // Check if deal should be shown based on interaction status
    console.log("=== getDailyDeal DEBUG ===")
    console.log("Wallet Address:", walletAddress)
    console.log("Deal ID:", deal.id)
    console.log("Interaction:", interaction)
    
    if (interaction) {
      console.log("Interaction found:", {
        seen: interaction.seen,
        dismissed: interaction.dismissed,
        purchased: interaction.purchased
      })
      
      // Show deal even if purchased, but with interaction status
      console.log("Deal should be shown with interaction status")
    } else {
      console.log("No interaction found - deal should be shown")
    }

    console.log("=== getDailyDeal FINAL RESULT ===")
    console.log("Formatted deal:", formattedDeal)
    console.log("Interaction:", interaction)
    
    return {
      success: true,
      deal: formattedDeal,
      interaction: interaction || {
        seen: false,
        dismissed: false,
        purchased: false,
      },
    }
  } catch (error) {
    console.error("Error in getDailyDeal:", error)
    return { success: false, error: "Failed to fetch daily deal" }
  }
}

// Mark deal as seen
export async function markDealAsSeen(walletAddress: string, dealId: number) {
  try {
    console.log("=== markDealAsSeen START ===")
    console.log("Parameters:", { walletAddress, dealId })
    
    const supabase = createSupabaseServer()

    // First, check if record already exists and is already seen
    // Get the most recent interaction, prioritizing purchased ones
    const { data: interactions, error: fetchError } = await supabase
      .from("deal_interactions")
      .select("*")
      .eq("wallet_address", walletAddress)
      .eq("deal_id", dealId)
      .order("purchased", { ascending: false }) // purchased=true first
      .order("interaction_date", { ascending: false }) // then by date
      .limit(1)

    const existingData = interactions?.[0]

    console.log("Existing record:", { existingData, fetchError })

    // If record exists and is already seen, don't do anything
    if (existingData && existingData.seen) {
      console.log("Deal already marked as seen, skipping")
      return { success: true }
    }

    if (fetchError) {
      console.error("Error fetching existing record:", fetchError)
      return { success: false, error: "Failed to fetch existing record" }
    }

    let result;
    if (existingData) {
      // Update existing record
      result = await supabase
        .from("deal_interactions")
        .update({
          seen: true,
          dismissed: false,
          purchased: false,
        })
        .eq("wallet_address", walletAddress)
        .eq("deal_id", dealId)
        .select()
    } else {
      // Create new record
      result = await supabase
        .from("deal_interactions")
        .insert({
          wallet_address: walletAddress,
          deal_id: dealId,
          seen: true,
          dismissed: false,
          purchased: false,
        })
        .select()
    }

    console.log("Database operation result:", result)

    if (result.error) {
      console.error("Error in database operation:", result.error)
      return { success: false, error: "Failed to update deal status" }
    }

    console.log("=== markDealAsSeen SUCCESS ===")
    return { success: true }
  } catch (error) {
    console.error("=== markDealAsSeen ERROR ===")
    console.error("Error in markDealAsSeen:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Mark deal as dismissed
export async function markDealAsDismissed(walletAddress: string, dealId: number) {
  try {
    console.log("=== markDealAsDismissed START ===")
    console.log("Parameters:", { walletAddress, dealId })
    
    const supabase = createSupabaseServer()

    // First, check if record already exists and is already dismissed
    const { data: existingData, error: fetchError } = await supabase
      .from("deal_interactions")
      .select("*")
      .eq("wallet_address", walletAddress)
      .eq("deal_id", dealId)
      .single()

    console.log("Existing record for dismiss:", { existingData, fetchError })

    // If record exists and is already dismissed, don't do anything
    if (existingData && existingData.dismissed) {
      console.log("Deal already marked as dismissed, skipping")
      return { success: true }
    }

    if (fetchError && fetchError.code !== "PGRST116") {
      console.error("Error fetching existing record for dismiss:", fetchError)
      return { success: false, error: "Failed to fetch existing record" }
    }

    let result;
    if (existingData) {
      // Update existing record
      result = await supabase
        .from("deal_interactions")
        .update({
          seen: false,
          dismissed: true,
          purchased: false,
        })
        .eq("wallet_address", walletAddress)
        .eq("deal_id", dealId)
        .select()
    } else {
      // Create new record
      result = await supabase
        .from("deal_interactions")
        .insert({
          wallet_address: walletAddress,
          deal_id: dealId,
          seen: false,
          dismissed: true,
          purchased: false,
        })
        .select()
    }

    console.log("Database operation result for dismiss:", result)

    if (result.error) {
      console.error("Error in database operation for dismiss:", result.error)
      return { success: false, error: "Failed to update deal status" }
    }

    console.log("=== markDealAsDismissed SUCCESS ===")
    return { success: true }
  } catch (error) {
    console.error("=== markDealAsDismissed ERROR ===")
    console.error("Error in markDealAsDismissed:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Purchase deal
export async function purchaseDeal(walletAddress: string, dealId: number) {
  try {
    const supabase = createSupabaseServer()
    // Remove this section - user_card_instances doesn't have quantity column
    // await supabase
    //     .from("user_card_instances")
    //     .delete()
    //     .eq("wallet_address", walletAddress)
    //     .eq("quantity", 0)
    // Get the deal details
    const { data: deal, error: dealError } = await supabase.from("daily_deals").select("*").eq("id", dealId).single()

    if (dealError) {
      console.error("Error fetching deal for purchase:", dealError)
      return { success: false, error: "Deal not found" }
    }

    // Get card information
    const { data: card, error: cardError } = await supabase.from("cards").select("*").eq("id", deal.card_id).single()

    if (cardError) {
      console.error("Error fetching card details:", cardError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // Start a transaction to ensure all operations succeed or fail together
    // 1. Record the purchase
    const { error: purchaseError } = await supabase.from("deal_purchases").insert({
      wallet_address: walletAddress,
      deal_id: dealId,
      purchased_at: new Date().toISOString(),
    })

    if (purchaseError) {
      console.error("Error recording deal purchase:", purchaseError)
      return { success: false, error: "Failed to record purchase" }
    }

    // 2. Add the card to user's collection (using user_card_instances)
    const { error: insertCardError } = await supabase.from("user_card_instances").insert({
      wallet_address: walletAddress,
      card_id: deal.card_id,
      level: deal.card_level,
      favorite: false,
      obtained_at: new Date().toISOString(),
    })

    if (insertCardError) {
      console.error("Error adding card to collection:", insertCardError)
      return { success: false, error: "Failed to add card to your collection" }
    }

    // 3. Update deal_interactions to mark as purchased
    const { error: interactionError } = await supabase
      .from("deal_interactions")
      .upsert({
        wallet_address: walletAddress,
        deal_id: dealId,
        seen: true,
        dismissed: false,
        purchased: true,
      })

    if (interactionError) {
      console.error("Error updating deal interaction:", interactionError)
      // Don't fail the purchase if this fails, just log it
    }

    // 4. Add tickets to user's account
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("tickets, elite_tickets")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      console.error("Error fetching user data:", userError)
      return { success: false, error: "User not found" }
    }

    const newTickets = (userData.tickets || 0) + deal.classic_tickets
    const newEliteTickets = (userData.elite_tickets || 0) + deal.elite_tickets

    const { error: updateError } = await supabase
      .from("users")
      .update({
        tickets: newTickets,
        elite_tickets: newEliteTickets,
      })
      .eq("wallet_address", walletAddress)

    if (updateError) {
      console.error("Error updating user tickets:", updateError)
      return { success: false, error: "Failed to update user tickets" }
    }

    // Revalidate relevant paths
    revalidatePath("/")

    return {
      success: true,
      newTickets,
      newEliteTickets,
    }
  } catch (error) {
    console.error("Error in purchaseDeal:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export const getSpecialDeal = async (walletAddress: string) => {
  try {
    const supabase = createSupabaseServer();
    const today = new Date().toISOString().split("T")[0];
    // Get today's special deal
    const { data: deal, error: dealError } = await supabase.from("special_offer").select("*").eq("date", today).single();
    if (dealError || !deal) return { success: false };
    // Get card information
    const { data: card } = await supabase.from("cards").select("*").eq("id", deal.card_id).single();
    return {
      success: true,
      deal: { ...deal, card_name: card?.name, card_image_url: card?.image_url, card_rarity: card?.rarity, card_character: card?.character },
      interaction: { seen: false, dismissed: false, purchased: false }
    };
  } catch (error) {
    return { success: false };
  }
};
