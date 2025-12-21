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

    // Get card information including creator_address and contract_address
    const { data: card, error: cardError } = await (supabase.from("cards").select("*, creator_address, contract_address").eq("id", deal.card_id).single() as any)

    if (cardError) {
      console.error("Error fetching card details:", cardError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // Calculate creator revenue if card has creator
    try {
      if (card.creator_address) {
        const { calculateCreatorDealRevenue } = await import("@/lib/creator-revenue")
        const creatorRevenue = calculateCreatorDealRevenue(Number(deal.price), card.rarity as any)
        
        console.log(`Calculating creator revenue for deal purchase:`, {
          cardId: deal.card_id,
          creatorAddress: card.creator_address,
          price: deal.price,
          rarity: card.rarity,
          revenue: creatorRevenue
        })
        
        // Update creator's coins (if creator is a user in the system)
        const { data: creatorData, error: creatorLookupError } = await supabase
          .from("users")
          .select("coins")
          .eq("wallet_address", card.creator_address.toLowerCase())
          .single()
        
        if (creatorLookupError) {
          console.error("Error fetching creator data:", creatorLookupError)
        }
        
        if (creatorData) {
          const newCreatorCoins = (creatorData.coins || 0) + creatorRevenue
          const { error: updateError } = await supabase
            .from("users")
            .update({ coins: newCreatorCoins })
            .eq("wallet_address", card.creator_address.toLowerCase())
          
          if (updateError) {
            console.error("Error updating creator coins:", updateError)
          } else {
            console.log(`Successfully paid creator ${creatorRevenue} coins. New total: ${newCreatorCoins}`)
          }

          // Update card_creations.earned_amount if contract_address exists
          if (card.contract_address) {
            console.log(`🔍 Attempting to update earned_amount for card with contract_address: ${card.contract_address.toLowerCase()}`)
            try {
              const { data: existingCreation, error: fetchError } = await (supabase
                .from("card_creations")
                .select("earned_amount")
                .eq("token_address", card.contract_address.toLowerCase())
                .single() as any)
              
              console.log(`📊 Fetch result:`, { existingCreation, fetchError })
              
              if (fetchError && (fetchError as any).code !== "PGRST116") {
                console.error("Error fetching card_creation:", fetchError)
              } else if (existingCreation) {
                const currentEarned = typeof existingCreation.earned_amount === 'number' 
                  ? existingCreation.earned_amount 
                  : parseFloat(existingCreation.earned_amount || '0') || 0
                const newEarnedAmount = Number((currentEarned + creatorRevenue).toFixed(5))
                
                console.log(`💰 Earned amount calculation:`, {
                  currentEarned,
                  creatorRevenue,
                  newEarnedAmount
                })
                
                const { error: earnedUpdateError } = await (supabase
                  .from("card_creations") as any)
                  .update({ earned_amount: newEarnedAmount })
                  .eq("token_address", card.contract_address.toLowerCase())
                
                if (earnedUpdateError) {
                  console.error("Error updating earned_amount:", earnedUpdateError)
                } else {
                  console.log(`✅ Successfully updated earned_amount to ${newEarnedAmount} for card ${card.contract_address}`)
                }
              } else {
                console.log(`⚠️ No card_creation found for token_address ${card.contract_address}`)
              }
            } catch (earnedError) {
              console.error("Error updating earned_amount (non-fatal):", earnedError)
            }
          } else {
            console.log(`⚠️ Card has no contract_address, skipping earned_amount update`)
          }
        } else {
          console.log("Creator address not found in users table, skipping payment")
        }
      }
    } catch (creatorError) {
      // Don't fail the entire purchase if creator payment fails
      console.error("Error processing creator revenue (non-fatal):", creatorError)
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

// Get the latest batch of 4 daily deals
export const getDailyDealsBatch = async () => {
  try {
    const supabase = createSupabaseServer()

    // Get the latest batch (most recent batch_timestamp)
    const { data: latestBatch, error: batchError } = await supabase
      .from("daily_deals_batch")
      .select("batch_timestamp")
      .order("batch_timestamp", { ascending: false })
      .limit(1)
      .single()

    if (batchError || !latestBatch) {
      console.log("No batch deals available:", batchError)
      return { success: false, error: "No batch deals available" }
    }

    // Get all 4 deals for this batch
    const { data: deals, error: dealsError } = await supabase
      .from("daily_deals_batch")
      .select("*")
      .eq("batch_timestamp", latestBatch.batch_timestamp)
      .order("deal_index", { ascending: true })

    if (dealsError || !deals || deals.length === 0) {
      console.error("Error fetching batch deals:", dealsError)
      return { success: false, error: "Failed to fetch batch deals" }
    }

    // Get card information for each deal
    const dealsWithCards = await Promise.all(
      deals.map(async (deal) => {
        const { data: card, error: cardError } = await supabase
          .from("cards")
          .select("*")
          .eq("id", deal.card_id)
          .single()

        if (cardError || !card) {
          console.error(`Error fetching card ${deal.card_id}:`, cardError)
          return null
        }

        return {
          ...deal,
          card_name: card.name,
          card_image_url: card.image_url,
          card_rarity: card.rarity,
          card_character: card.character,
          creator_address: card.creator_address,
        }
      })
    )

    // Filter out any null results
    const validDeals = dealsWithCards.filter((deal) => deal !== null)

    if (validDeals.length === 0) {
      return { success: false, error: "No valid deals found" }
    }

    return {
      success: true,
      deals: validDeals,
      batch_timestamp: latestBatch.batch_timestamp,
    }
  } catch (error) {
    console.error("Error in getDailyDealsBatch:", error)
    return { success: false, error: "Failed to fetch batch deals" }
  }
}

// Purchase a batch deal
export async function purchaseBatchDeal(walletAddress: string, batchDealId: number) {
  try {
    const supabase = createSupabaseServer()

    // Get the batch deal details
    const { data: deal, error: dealError } = await supabase
      .from("daily_deals_batch")
      .select("*")
      .eq("id", batchDealId)
      .single()

    if (dealError || !deal) {
      console.error("Error fetching batch deal for purchase:", dealError)
      return { success: false, error: "Deal not found" }
    }

    // Get card information including creator_address and contract_address
    const { data: card, error: cardError } = await (supabase
      .from("cards")
      .select("*, creator_address, contract_address")
      .eq("id", deal.card_id)
      .single() as any)

    if (cardError) {
      console.error("Error fetching card details:", cardError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // Calculate creator revenue if card has creator
    try {
      if (card.creator_address) {
        const { calculateCreatorDealRevenue } = await import("@/lib/creator-revenue")
        const creatorRevenue = calculateCreatorDealRevenue(Number(deal.price), card.rarity as any)

        console.log(`Calculating creator revenue for batch deal purchase:`, {
          cardId: deal.card_id,
          creatorAddress: card.creator_address,
          price: deal.price,
          rarity: card.rarity,
          revenue: creatorRevenue,
        })

        // Update creator's coins (if creator is a user in the system)
        const { data: creatorData, error: creatorLookupError } = await supabase
          .from("users")
          .select("coins")
          .eq("wallet_address", card.creator_address.toLowerCase())
          .single()

        if (creatorLookupError) {
          console.error("Error fetching creator data:", creatorLookupError)
        }

        if (creatorData) {
          const newCreatorCoins = (creatorData.coins || 0) + creatorRevenue
          const { error: updateError } = await supabase
            .from("users")
            .update({ coins: newCreatorCoins })
            .eq("wallet_address", card.creator_address.toLowerCase())

          if (updateError) {
            console.error("Error updating creator coins:", updateError)
          } else {
            console.log(`Successfully paid creator ${creatorRevenue} coins. New total: ${newCreatorCoins}`)
          }

          // Update card_creations.earned_amount if contract_address exists
          if (card.contract_address) {
            console.log(
              `🔍 Attempting to update earned_amount for card with contract_address: ${card.contract_address.toLowerCase()}`
            )
            try {
              const { data: existingCreation, error: fetchError } = await (supabase
                .from("card_creations")
                .select("earned_amount")
                .eq("token_address", card.contract_address.toLowerCase())
                .single() as any)

              console.log(`📊 Fetch result:`, { existingCreation, fetchError })

              if (fetchError && (fetchError as any).code !== "PGRST116") {
                console.error("Error fetching card_creation:", fetchError)
              } else if (existingCreation) {
                const currentEarned =
                  typeof existingCreation.earned_amount === "number"
                    ? existingCreation.earned_amount
                    : parseFloat(existingCreation.earned_amount || "0") || 0
                const newEarnedAmount = Number((currentEarned + creatorRevenue).toFixed(5))

                console.log(`💰 Earned amount calculation:`, {
                  currentEarned,
                  creatorRevenue,
                  newEarnedAmount,
                })

                const { error: earnedUpdateError } = await (supabase.from("card_creations") as any)
                  .update({ earned_amount: newEarnedAmount })
                  .eq("token_address", card.contract_address.toLowerCase())

                if (earnedUpdateError) {
                  console.error("Error updating earned_amount:", earnedUpdateError)
                } else {
                  console.log(
                    `✅ Successfully updated earned_amount to ${newEarnedAmount} for card ${card.contract_address}`
                  )
                }
              } else {
                console.log(`⚠️ No card_creation found for token_address ${card.contract_address}`)
              }
            } catch (earnedError) {
              console.error("Error updating earned_amount (non-fatal):", earnedError)
            }
          } else {
            console.log(`⚠️ Card has no contract_address, skipping earned_amount update`)
          }
        } else {
          console.log("Creator address not found in users table, skipping payment")
        }
      }
    } catch (creatorError) {
      // Don't fail the entire purchase if creator payment fails
      console.error("Error processing creator revenue (non-fatal):", creatorError)
    }

    // 1. Record the purchase in daily_deals_batch_purchases
    const { error: purchaseError } = await supabase.from("daily_deals_batch_purchases").insert({
      wallet_address: walletAddress,
      batch_deal_id: batchDealId,
      purchased_at: new Date().toISOString(),
    })

    if (purchaseError) {
      console.error("Error recording batch deal purchase:", purchaseError)
      return { success: false, error: "Failed to record purchase" }
    }

    // 2. Add the card to user's collection
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

    // 3. Add tickets to user's account
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("tickets, elite_tickets")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      console.error("Error fetching user data:", userError)
      return { success: false, error: "User not found" }
    }

    // Add classic_tickets to tickets and elite_tickets to elite_tickets
    const newTickets = (userData.tickets || 0) + (deal.classic_tickets || 0)
    const newEliteTickets = (userData.elite_tickets || 0) + (deal.elite_tickets || 0)

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
    console.error("Error in purchaseBatchDeal:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}