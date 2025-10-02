"use server"

import { getSupabaseServerClient } from "@/lib/supabase"
import { revalidatePath } from "next/cache"
import { isUserBanned } from "@/lib/banned-users"

type CardRarity = "common" | "rare" | "epic" | "legendary" | "ultimate"

// Helper function to get score for rarity
function getScoreForRarity(rarity: CardRarity): number {
  switch (rarity) {
    case "common": return 1
    case "rare": return 3
    case "epic": return 8
    case "legendary": return 20
    case "ultimate": return 50
    default: return 1
  }
}

// Helper function to determine card rarity based on pack type
function determineRarity(packType: string, hasPremiumPass = false): CardRarity {
  const random = Math.random() * 100

  if (packType === "legendary") {
    // Legendary pack with updated odds:
    // 5% legendary, 30% epic, 50% rare, 15% common
    if (random < 5) return "legendary"
    if (random < 35) return "epic" // 5 + 30 = 35
    if (random < 85) return "rare" // 35 + 50 = 85
    return "common" // Remaining 15%
  } else {
    // Regular pack with updated odds:
    if (hasPremiumPass) {
      // With Premium Pass: 2% legendary, 14% epic, 34% rare, 50% common
      if (random < 2) return "legendary"
      if (random < 16) return "epic" // 2 + 14 = 16
      if (random < 50) return "rare" // 16 + 34 = 50
      return "common" // Remaining 50%
    } else {
      // Without Premium Pass: 1% legendary, 5% epic, 34% rare, 60% common
      if (random < 1) return "legendary"
      if (random < 6) return "epic" // 1 + 5 = 6
      if (random < 40) return "rare" // 6 + 34 = 40
      return "common" // Remaining 60%
    }
  }
}

// Function to add a card instance to user's collection
async function addCardInstance(
  supabase: any,
  username: string,
  cardId: string,
  level: number = 1,
  favorite: boolean = false
): Promise<{ success: boolean; error?: string; instanceId?: number }> {
  try {
    const { data: insertedCard, error: insertCardError } = await supabase
      .from("user_card_instances")
      .insert({
        user_id: username,
        card_id: cardId,
        level: level,
        favorite: favorite,
        obtained_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertCardError) {
      console.error("Error adding card instance:", insertCardError)
      return { success: false, error: insertCardError.message }
    }

    return { success: true, instanceId: insertedCard.id }
  } catch (error) {
    console.error("Error in addCardInstance:", error)
    return { success: false, error: "Failed to add card instance" }
  }
}

// Main function to draw cards with individual instances
export async function drawCardsIndividual(username: string, packType: string, count = 1, hasPremiumPass = false) {
  try {
    const supabase = getSupabaseServerClient()
    console.log("Supabase client created successfully")

    // Check if user is banned
    if (isUserBanned(username)) {
      return { success: false, error: "You are banned from drawing packs." }
    }

    // Get user data
    console.log("Fetching user data for username:", username)
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("tickets, elite_tickets, score, clan_id")
      .eq("username", username)
      .single()
    
    console.log("User data result:", { userData, userError })

    if (userError) {
      console.error("Error fetching user data:", userError)
      console.error("Error details:", JSON.stringify(userError, null, 2))
      return { success: false, error: `Failed to fetch user data: ${userError.message || 'Unknown error'}` }
    }
    
    if (!userData) {
      return { success: false, error: "User not found" }
    }

    const isLegendary = packType === "legendary"
    const requiredTickets = isLegendary ? userData.elite_tickets : userData.tickets

    if (requiredTickets < count) {
      return { 
        success: false, 
        error: `Not enough ${isLegendary ? "elite " : ""}tickets. You need ${count} but only have ${requiredTickets}.` 
      }
    }

    // Get available cards (optimized - only fetch what we need)
    console.log("Fetching available cards...")
    const { data: availableCards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")

    console.log("Cards result:", { availableCards, cardsError })

    if (cardsError) {
      console.error("Error fetching cards:", cardsError)
      return { success: false, error: `Failed to fetch available cards: ${cardsError.message}` }
    }
    
    if (!availableCards || availableCards.length === 0) {
      return { success: false, error: "No cards available in database" }
    }

    console.log(`Found ${availableCards.length} cards in database`)

    // Pre-group cards by rarity for faster access
    const cardsByRarity = {
      common: availableCards.filter((card: any) => card.rarity === "common"),
      rare: availableCards.filter((card: any) => card.rarity === "rare"),
      epic: availableCards.filter((card: any) => card.rarity === "epic"),
      legendary: availableCards.filter((card: any) => card.rarity === "legendary"),
      ultimate: availableCards.filter((card: any) => card.rarity === "ultimate")
    }

    // Generate random cards based on rarity chances
    const drawnCards: any[] = []
    let totalScoreToAdd = 0
    const cardInstancesToInsert = []

    for (let i = 0; i < count; i++) {
      let rarity: CardRarity
      let cardPool: any[]

      if (!isLegendary) {
        // Use rarity-based system
        rarity = determineRarity("regular", hasPremiumPass)
        cardPool = cardsByRarity[rarity] || availableCards
      } else {
        // Legendary pack logic (rarity-based)
        rarity = determineRarity("legendary", hasPremiumPass)
        cardPool = cardsByRarity[rarity] || availableCards
      }

      // Fallback: if no cards of the determined rarity, use all available cards
      if (!cardPool || cardPool.length === 0) {
        console.log(`No cards found for rarity ${rarity}, using all available cards`)
        cardPool = availableCards
      }

      const selectedCard = cardPool[Math.floor(Math.random() * cardPool.length)]
      drawnCards.push(selectedCard)

      // Calculate score for this card
      const cardPoints = getScoreForRarity(selectedCard.rarity)
      totalScoreToAdd += cardPoints

      // Prepare card instance for batch insert
      cardInstancesToInsert.push({
        user_id: username,
        card_id: selectedCard.id,
        level: 1,
        favorite: false,
        obtained_at: new Date().toISOString(),
      })
    }

    // Batch insert all card instances at once
    console.log("Inserting card instances:", cardInstancesToInsert.length, "instances")
    const { data: insertedInstances, error: batchInsertError } = await supabase
      .from("user_card_instances")
      .insert(cardInstancesToInsert)
      .select("id, card_id")

    console.log("Batch insert result:", { insertedInstances, batchInsertError })

    if (batchInsertError) {
      console.error("Error batch inserting card instances:", batchInsertError)
      return { success: false, error: `Failed to add card instances: ${batchInsertError.message}` }
    }

    // Create addedInstances array for response
    const addedInstances = insertedInstances?.map((instance, index) => ({
      cardId: instance.card_id,
      instanceId: instance.id,
      rarity: drawnCards[index].rarity
    })) || []

    // Update user's tickets and score
    const newTicketCount = isLegendary 
      ? userData.elite_tickets - count 
      : userData.tickets - count
    const newScore = userData.score + totalScoreToAdd

    const { error: updateError } = await supabase
      .from("users")
      .update({
        [isLegendary ? "elite_tickets" : "tickets"]: newTicketCount,
        score: newScore
      })
      .eq("username", username)

    if (updateError) {
      console.error("Error updating user data:", updateError)
      return { success: false, error: "Failed to update user data" }
    }

    revalidatePath("/leaderboard")

    return {
      success: true,
      drawnCards,
      addedInstances,
      newTicketCount,
      newScore,
      scoreAdded: totalScoreToAdd
    }
  } catch (error) {
    console.error("Error drawing cards:", error)
    return { success: false, error: "Failed to draw cards" }
  }
}

// Function to get user's cards with individual instances
export async function getUserCardsIndividual(username: string) {
  try {
    const supabase = getSupabaseServerClient()

    // Get user's card instances with card details
    const { data: userCardInstances, error: instancesError } = await supabase
      .from("user_card_instances")
      .select(`
        id,
        card_id,
        level,
        favorite,
        obtained_at,
        cards (
          id,
          name,
          character,
          image_url,
          rarity
        )
      `)
      .eq("user_id", username)
      .order("obtained_at", { ascending: false })

    if (instancesError) {
      console.error("Error fetching user card instances:", instancesError)
      return { success: false, error: "Failed to fetch card instances" }
    }

    // Group instances by card_id and level for display
    const groupedCards = new Map()
    
    userCardInstances?.forEach(instance => {
      const key = `${instance.card_id}-${instance.level}`
      const cardDetails = instance.cards
      
      if (!groupedCards.has(key)) {
        groupedCards.set(key, {
          card_id: instance.card_id,
          level: instance.level,
          quantity: 0,
          instances: [],
          cardDetails: cardDetails
        })
      }
      
      const group = groupedCards.get(key)
      group.quantity += 1
      group.instances.push({
        id: instance.id,
        favorite: instance.favorite,
        obtained_at: instance.obtained_at
      })
    })

    const cards = Array.from(groupedCards.values()).map(group => ({
      id: group.card_id, // Use card_id as the main identifier
      card_id: group.card_id,
      name: group.cardDetails.name,
      character: group.cardDetails.character,
      image_url: group.cardDetails.image_url,
      rarity: group.cardDetails.rarity,
      level: group.level,
      quantity: group.quantity,
      instances: group.instances,
      favorite: group.instances.some((inst: any) => inst.favorite)
    }))

    return { success: true, cards }
  } catch (error) {
    console.error("Error in getUserCardsIndividual:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Function to level up cards (combine two cards of same type and level)
export async function levelUpCardIndividual(username: string, cardId: string, level: number) {
  try {
    const supabase = getSupabaseServerClient()
    console.log(`Attempting to level up card ${cardId} for user ${username} from level ${level}`)

    // Get two instances of the same card and level
    const { data: instances, error: fetchError } = await supabase
      .from("user_card_instances")
      .select("id")
      .eq("user_id", username)
      .eq("card_id", cardId)
      .eq("level", level)
      .limit(2)

    console.log("Found instances for level up:", { instances, fetchError })

    if (fetchError) {
      console.error("Error fetching card instances:", fetchError)
      return { success: false, error: `Failed to fetch card instances: ${fetchError.message}` }
    }

    if (!instances || instances.length < 2) {
      return { 
        success: false, 
        error: `Not enough cards to level up. You need 2 cards of level ${level}, but only have ${instances?.length || 0}.` 
      }
    }

    // Remove the two instances
    const { error: deleteError } = await supabase
      .from("user_card_instances")
      .delete()
      .in("id", instances.map(inst => inst.id))

    if (deleteError) {
      console.error("Error deleting card instances:", deleteError)
      return { success: false, error: `Failed to remove cards: ${deleteError.message}` }
    }

    // Add one instance of the next level
    const addResult = await addCardInstance(supabase, username, cardId, level + 1, false)
    
    if (!addResult.success) {
      console.error("Failed to add leveled up card:", addResult.error)
      return { success: false, error: addResult.error }
    }

    console.log(`Successfully leveled up card ${cardId} to level ${level + 1}`)
    return { success: true, message: `Card successfully leveled up to level ${level + 1}` }
  } catch (error) {
    console.error("Error in levelUpCardIndividual:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Test function to manually test level up
export async function testLevelUp(username: string) {
  try {
    console.log(`Testing level up for user: ${username}`)
    
    const supabase = getSupabaseServerClient()
    
    // First, let's see all instances
    const { data: allInstances, error: allError } = await supabase
      .from("user_card_instances")
      .select("id, card_id, level")
      .eq("user_id", username)
      .order("id", { ascending: true })
    
    console.log("All instances for user:", { allInstances, allError })
    
    if (allError) {
      return { success: false, error: `Database error: ${allError.message}` }
    }
    
    // Group by card_id and level
    const grouped: { [key: string]: any[] } = {}
    allInstances?.forEach(inst => {
      const key = `${inst.card_id}-${inst.level}`
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(inst)
    })
    
    console.log("Grouped instances:", grouped)
    
    // Find a group with at least 2 instances
    const suitableGroup = Object.values(grouped).find((group: any) => group.length >= 2)
    
    if (!suitableGroup) {
      return { success: false, error: `No suitable cards found for level up. Available groups: ${JSON.stringify(Object.keys(grouped))}` }
    }
    
    const cardId = (suitableGroup as any[])[0].card_id
    const level = (suitableGroup as any[])[0].level
    
    console.log(`Found suitable group: cardId=${cardId}, level=${level}, count=${(suitableGroup as any[]).length}`)
    
    return await levelUpCardIndividual(username, cardId, level)
  } catch (error) {
    console.error("Error in testLevelUp:", error)
    return { success: false, error: `Test failed: ${error instanceof Error ? error.message : String(error)}` }
  }
}
