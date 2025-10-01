"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@supabase/supabase-js"
import {  incrementMission } from "@/app/actions/missions"
import { isUserBanned } from "@/lib/banned-users"

// Card rarity types
type CardRarity = "common" | "rare" | "epic" | "legendary" | "goat"

// Define types for our data
type UserCard = {
  id: string
  user_id: string
  card_id: string
  quantity: number
  level?: number
  favorite?: boolean
  obtained_at: string
}

type Card = {
  id: string
  name: string
  character: string
  image_url?: string
  rarity: CardRarity
  type?: string
  description?: string
}

interface XpPass {
  id: string
  user_id: string
  active: boolean
  purchased_at: string
  expires_at: string
}

  const max_godpacks_daily = 100;


// Create a server-side Supabase client
function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: {
      persistSession: false,
    },
  })
}

/**
 * Claims daily login bonus for a user
 */
export async function claimDailyBonus(username: string) {
  try {
    const supabase = createSupabaseServer()

    // Get current user data including clan info
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("username, tickets, ticket_last_claimed, clan_id")
      .eq("username", username)
      .single()

    if (userError) {
      // Create user if not found
      const { error: createError } = await supabase.from("users").insert({
        username: username,
        tickets: 10,
        legendary_tickets: 2,
        ticket_last_claimed: new Date().toISOString(),
      })

      if (createError) {
        console.error("Error creating user:", createError)
        return { success: false, error: "Failed to create user" }
      }

      return { success: true, newTicketCount: 11 } // 10 initial + 1 bonus
    }

    // Check if user has already claimed within the last 24 hours
    if (userData.ticket_last_claimed) {
      const lastClaimed = new Date(userData.ticket_last_claimed as string)
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

    // Base tickets (1 ticket per claim)
    let ticketsToAward = 1

    // Check if user is in a clan and if clan is level 2+
    if (userData.clan_id) {
      const { data: clanData, error: clanError } = await supabase
        .from("clans")
        .select("level")
        .eq("id", userData.clan_id)
        .single()

      if (!clanError && clanData && clanData.level >= 2) {
        // Level 2+ clan bonus: +1 ticket per day
        ticketsToAward += 1
      }
    }

    const newTicketCount = (typeof userData.tickets === "number" ? userData.tickets : 0) + ticketsToAward

    // Update user
    const { error: updateError } = await supabase
      .from("users")
      .update({
        tickets: newTicketCount,
        ticket_last_claimed: new Date().toISOString(),
      })
      .eq("username", userData.username)

    if (updateError) {
      return { success: false, error: "Failed to update tickets" }
    }

    revalidatePath("/")
    return {
      success: true,
      newTicketCount: newTicketCount || 0,
      nextClaimTime: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      clanBonus: ticketsToAward > 3,
    }
  } catch (error) {
    console.error("Error claiming daily bonus:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Helper function to generate a random card based on rarity
function generateRandomCard(rarity: CardRarity): Card {
  // Placeholder implementation - replace with your actual card generation logic
  const cardNames = {
    common: ["Common Card 1", "Common Card 2"],
    rare: ["Rare Card 1", "Rare Card 2"],
    epic: ["Epic Card 1", "Epic Card 2"],
    legendary: ["Legendary Card 1", "Legendary Card 2"],
  }
  let fallback: keyof typeof cardNames = "common";
  if (rarity === "rare") fallback = "rare";
  if (rarity === "epic") fallback = "epic";
  if (rarity === "legendary" || rarity === "goat") fallback = "legendary";
  const name = cardNames[fallback][Math.floor(Math.random() * cardNames[fallback].length)]
  return {
    id: Math.random().toString(36).substring(2, 15), // Generate a random ID
    name: name,
    character: "Placeholder Character",
    rarity: rarity,
  }
}

// Funktion, um Punkte für eine Kartenrarität zu erhalten
function getScoreForRarity(rarity: CardRarity): number {
  switch (rarity) {
    case "legendary":
      return 100 // Legendary-Karten geben 100 Punkte
    case "epic":
      return 50 // Epic-Karten geben 50 Punkte
    case "rare":
      return 25 // Rare-Karten geben 25 Punkte
    case "common":
      return 5 // Common-Karten geben 5 Punkte
    default:
      return 0
  }
}

export async function drawCards(username: string, packType: string, count = 1) {
  try {
    const supabase = createSupabaseServer()

    // Check if user is banned
    if (isUserBanned(username)) {
      return { success: false, error: "You are banned from drawing packs." }
    }

    // Remove cards with quantity 0
    console.log(`Removing cards with quantity 0 for user ${username}...`)
    const { data: removedCards, error: removeError } = await supabase
      .from("user_cards")
      .delete()
      .eq("user_id", username)
      .eq("quantity", 0)
      .select()

    if (removeError) {
      console.error("Error removing cards with quantity 0:", removeError)
    } else {
      console.log(`Successfully removed ${removedCards?.length || 0} cards with quantity 0`)
    }

    // Get user data from database including clan info and avatar
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*, clan_id, avatar_id")
      .eq("username", username)
      .single()

    if (userError) {
      console.error("Error fetching user data:", userError)
      return { success: false, error: "User not found" }
    }

    // Check if user has Epic Avatar for bonus Ultimate drop rate
    let hasEpicAvatar = false
    let hasGodAvatar = false
    if (userData.avatar_id) {
      const { data: avatarData, error: avatarError } = await supabase
        .from("avatars")
        .select("rarity")
        .eq("id", userData.avatar_id)
        .single()
      
      if (!avatarError && avatarData) {
        if (avatarData.rarity === "epic") {
          hasEpicAvatar = true
          console.log(`🎭 Epic Avatar detected for user ${username} - Ultimate drop rate bonus active!`)
        } else if (avatarData.rarity === "god") {
          hasGodAvatar = true
          console.log(`👑 God Avatar detected for user ${username} - Icon Pack drop rate bonus active!`)
        }
      }
    }

    // Get user's clan role if they're in a clan
    let userClanRole = null
    let clanLevel = 0
    if (userData.clan_id) {
      const { data: memberData, error: memberError } = await supabase
        .from("clan_members")
        .select("role")
        .eq("clan_id", userData.clan_id)
        .eq("user_id", username)
        .single()

      if (!memberError && memberData) {
        userClanRole = memberData.role
      }

      // Get clan level
      const { data: clanData, error: clanError } = await supabase
        .from("clans")
        .select("level")
        .eq("id", userData.clan_id)
        .single()

      if (!clanError && clanData) {
        clanLevel = clanData.level
      }
    }

    // Check if user has enough tickets
    const isLegendary = packType === "legendary"
    const isIcon = packType === "icon"
    // Für Elite Packs elite_tickets verwenden
    const ticketField = isLegendary ? "elite_tickets" : isIcon ? "icon_tickets" : "tickets"
    const currentTickets = userData[ticketField] || 0

    if (currentTickets < count) {
      return {
        success: false,
        error: `Not enough ${isLegendary ? "legendary " : isIcon ? "icon " : ""}tickets`,
      }
    }

    // Tickets abziehen
    const newTicketCount = currentTickets - count

    // Update-Daten vorbereiten
    const updateData: Record<string, any> = {}
    if (isLegendary) {
      updateData.elite_tickets = newTicketCount
    } else if (isIcon) {
      updateData.icon_tickets = newTicketCount
    } else {
      updateData.tickets = newTicketCount
    }

    // Update user tickets in database
    const { error: updateError } = await supabase.from("users").update(updateData).eq("username", username)

    if (updateError) {
      console.error("Error updating tickets:", updateError)
      return { success: false, error: "Failed to update tickets" }
    }

    // Check if user has premium pass
    const hasPremium = userData.has_premium || false

    // Check if user has active Icon Pass
    let hasIconPass = false
    try {
      const { data: iconPassData, error: iconPassError } = await supabase
        .from('icon_passes')
        .select('*')
        .eq('user_id', username)
        .eq('active', true)
        .single()

      if (!iconPassError && iconPassData) {
        // Check if pass is not expired
        const now = new Date()
        const expiryDate = new Date(iconPassData.expires_at)
        hasIconPass = expiryDate > now
        
        if (hasIconPass) {
          console.log(`✅ Icon Pass active for user ${username}, expires: ${expiryDate}`)
        } else {
          console.log(`❌ Icon Pass expired for user ${username}, expired: ${expiryDate}`)
        }
      } else {
        console.log(`❌ No active Icon Pass found for user ${username}`)
      }
    } catch (error) {
      console.error('Error checking Icon Pass:', error)
      hasIconPass = false
    }

    // Get available cards from database
    const { data: availableCards, error: cardsError } = await supabase
      .from("cards")
      .select("*")
      .eq("obtainable", true)

    if (cardsError || !availableCards || availableCards.length === 0) {
      console.error("Error fetching available cards:", cardsError)
      return { success: false, error: "Failed to fetch cards" }
    }

    // Filter cards by rarity for each pack type
    const commonCards = availableCards.filter((card) => card.rarity === "common")
    const rareCards = availableCards.filter((card) => card.rarity === "rare")
    const epicCards = availableCards.filter((card) => card.rarity === "epic")
    const legendaryCards = availableCards.filter((card) => card.rarity === "legendary")
    const goatCards = availableCards.filter((card) => card.rarity === "goat" || card.rarity === "godlike")

    // Generate random cards based on rarity chances
    const drawnCards = []
    let totalScoreToAdd = 0

    for (let i = 0; i < count; i++) {
      const random = Math.random() * 100
      let rarity: CardRarity
      let cardPool: any[]

      if (!isLegendary && !isIcon) {
        await incrementMission(username, "open_regular_pack")
        
        // Epic Avatar Bonus: 1% bessere Ultimate-Karten Drop-Rate (Rating 88-91)
        let epicAvatarBonus = 0;
        if (hasEpicAvatar) {
          epicAvatarBonus = 1; // 1% Bonus
          console.log(`🎭 Epic Avatar Bonus applied: +${epicAvatarBonus}% Ultimate drop rate (Rating 88-91) for user ${username}`);
        }
        
        // Neue Draw Rates für Classic Packs mit Epic Avatar Bonus
        // 75–79: 58.3%
        // 80–84: 25.08%
        // 85: 9.72%
        // 86: 3.00%
        // 87: 2.00%
        // 88: 1.00% + (epicAvatarBonus * 0.5)% (mehr Bonus)
        // 89: 0.25% + (epicAvatarBonus * 0.3)% (mittlerer Bonus)
        // 90: 0.1% + (epicAvatarBonus * 0.2)% (weniger Bonus)
        // 91: 0.0000000005555% (kein Bonus)
        // 92+: 0.000000000000000000000444444%
        let rating = 0;
        if (random < 58.3) {
          rating = Math.floor(Math.random() * 5) + 75; // 75–79
        } else if (random < 58.3 + 25.08) {
          rating = Math.floor(Math.random() * 5) + 80; // 80–84
        } else if (random < 58.3 + 25.08 + 9.72) {
          rating = 85;
        } else if (random < 58.3 + 25.08 + 9.72 + 3.00) {
          rating = 86;
        } else if (random < 58.3 + 25.08 + 9.72 + 3.00 + 2.00) {
          rating = 87;
        } else if (random < 58.3 + 25.08 + 9.72 + 3.00 + 2.00 + (1.00 + epicAvatarBonus * 0.5)) {
          rating = 88;
        } else if (random < 58.3 + 25.08 + 9.72 + 3.00 + 2.00 + (1.00 + epicAvatarBonus * 0.5) + (0.25 + epicAvatarBonus * 0.3)) {
          rating = 89;
        } else if (random < 58.3 + 25.08 + 9.72 + 3.00 + 2.00 + (1.00 + epicAvatarBonus * 0.5) + (0.25 + epicAvatarBonus * 0.3) + (0.1 + epicAvatarBonus * 0.2)) {
          rating = 90;
        } else if (random < 58.3 + 25.08 + 9.72 + 3.00 + 2.00 + (1.00 + epicAvatarBonus * 0.5) + (0.25 + epicAvatarBonus * 0.3) + (0.1 + epicAvatarBonus * 0.2) + 0.0000000005555) {
          rating = 91;
        } else {
          rating = 92;
        }
        // Filter cards nach rating
        let cardPool = availableCards.filter(card => card.overall_rating == rating);
        // Fallback falls keine Karte mit rating vorhanden
        if (!cardPool || cardPool.length === 0) {
          cardPool = commonCards.length > 0 ? commonCards : availableCards;
        }
        rarity = cardPool[0]?.rarity || "common";
        const selectedCard = cardPool[Math.floor(Math.random() * cardPool.length)];
        drawnCards.push(selectedCard);
        if (selectedCard.rarity === "ultimate") {
          await incrementMission(username, "draw_legendary_card");
        }
        // Calculate score for this card
        const cardPoints = getScoreForRarity(selectedCard.rarity);
        totalScoreToAdd += cardPoints;
        // Add card to user's collection
        const today = new Date().toISOString().split("T")[0];
        const { data: existingCard, error: existingCardError } = await supabase
          .from("user_cards")
          .select("*")
          .eq("user_id", username)
          .eq("card_id", selectedCard.id)
          .eq("level", 1)
          .single();
        if (existingCardError && existingCardError.code !== "PGRST116") {
          console.error("Error checking existing card:", existingCardError);
        }
        if (existingCard) {
          const newQuantity = (existingCard.quantity || 0) + 1;
          const { error: updateCardError } = await supabase
            .from("user_cards")
            .update({ quantity: newQuantity })
            .eq("id", existingCard.id)
            .eq("level", 1);
          if (updateCardError) {
            console.error("Error updating card quantity:", updateCardError);
          }
        } else {
          const { data: insertedCard, error: insertCardError } = await supabase
            .from("user_cards")
            .insert({
              user_id: username,
              card_id: selectedCard.id,
              quantity: 1,
              level: 1,
              favorite: false,
              obtained_at: today,
            })
            .select();
          if (insertCardError) {
            console.error("Error adding card to collection:", insertCardError);
          }
        }
        continue;
      }

      if (isLegendary) {
        // Neue Draw Rates für Icon Packs (Elite Packs)
        // Rating 75-79: 30.35%
        // Rating 80-84: 26%
        // Rating 85: 14%
        // Rating 86: 11.5%
        // Rating 87: 10%
        // Rating 88: 6.75%
        // Rating 89: 1.15%
        // Rating 90: 0.40%
        // Rating 91: 0.15%
        // Rating 92+: 0.000000000000000000000444444%
        
        let rating = 0;
        console.log(`📊 Using Icon Pack rates for user ${username}`)
        
        if (random < 30.35) {
          rating = Math.floor(Math.random() * 5) + 75; // 75–79
        } else if (random < 30.35 + 26) {
          rating = Math.floor(Math.random() * 5) + 80; // 80–84
        } else if (random < 30.35 + 26 + 14) {
          rating = 85;
        } else if (random < 30.35 + 26 + 14 + 11.5) {
          rating = 86;
        } else if (random < 30.35 + 26 + 14 + 11.5 + 10) {
          rating = 87;
        } else if (random < 30.35 + 26 + 14 + 11.5 + 10 + 6.75) {
          rating = 88;
        } else if (random < 30.35 + 26 + 14 + 11.5 + 10 + 6.75 + 1.15) {
          rating = 89;
        } else if (random < 30.35 + 26 + 14 + 11.5 + 10 + 6.75 + 1.15 + 0.40) {
          rating = 90;
        } else if (random < 30.35 + 26 + 14 + 11.5 + 10 + 6.75 + 1.15 + 0.40 + 0.15) {
          rating = 91;
        } else {
          rating = 92;
        }
        // Filter cards nach overall_rating
        let cardPool = availableCards.filter(card => card.overall_rating == rating);
        // Fallback falls keine Karte mit rating vorhanden
        if (!cardPool || cardPool.length === 0) {
          cardPool = epicCards.length > 0 ? epicCards : availableCards;
        }
        rarity = cardPool[0]?.rarity || "epic";
        const selectedCard = cardPool[Math.floor(Math.random() * cardPool.length)];
        drawnCards.push(selectedCard);
        if (selectedCard.rarity === "ultimate") {
          await incrementMission(username, "draw_legendary_card");
        }
        // Calculate score for this card
        const cardPoints = getScoreForRarity(selectedCard.rarity);
        totalScoreToAdd += cardPoints;
        // Add card to user's collection
        const today = new Date().toISOString().split("T")[0];
        const { data: existingCard, error: existingCardError } = await supabase
          .from("user_cards")
          .select("*")
          .eq("user_id", username)
          .eq("card_id", selectedCard.id)
          .eq("level", 1)
          .single();
        if (existingCardError && existingCardError.code !== "PGRST116") {
          console.error("Error checking existing card:", existingCardError);
        }
        if (existingCard) {
          const newQuantity = (existingCard.quantity || 0) + 1;
          const { error: updateCardError } = await supabase
            .from("user_cards")
            .update({ quantity: newQuantity })
            .eq("id", existingCard.id)
            .eq("level", 1);
          if (updateCardError) {
            console.error("Error updating card quantity:", updateCardError);
          }
        } else {
          const { data: insertedCard, error: insertCardError } = await supabase
            .from("user_cards")
            .insert({
              user_id: username,
              card_id: selectedCard.id,
              quantity: 1,
              level: 1,
              favorite: false,
              obtained_at: today,
            })
            .select();
          if (insertCardError) {
            console.error("Error adding card to collection:", insertCardError);
          }
        }
        continue;
      } else if (isIcon) {
        // God Avatar Bonus: 1.5% bessere Drop-Rate für Icon Packs (auf Rating 88-89 verteilt)
        let godAvatarBonus = 0;
        if (hasGodAvatar) {
          godAvatarBonus = 1.5; // 1.5% Bonus
          console.log(`👑 God Avatar Bonus applied: +${godAvatarBonus}% Icon Pack drop rate (Rating 88-89) for user ${username}`);
        }
        
        // Neue Draw Rates für Icon Packs (nur Backend, nicht im UI anzeigen)
        // 75–78: 5%
        // 79–84: 19,75%
        // 85: 22%
        // 86: 19%
        // 87: 16,5%
        // 88: 10,5% + (godAvatarBonus * 0.5)% (0.75% Bonus)
        // 89: 4% + (godAvatarBonus * 0.5)% (0.75% Bonus)
        // 90: 1,5%
        // 91: 0,75%
        // 92+: 0.000000000000000000000444444
        let rating = 0;
        if (random < 5) {
          rating = Math.floor(Math.random() * 4) + 75; // 75–78
        } else if (random < 5 + 19.75) {
          rating = Math.floor(Math.random() * 6) + 79; // 79–84
        } else if (random < 5 + 19.75 + 22) {
          rating = 85;
        } else if (random < 5 + 19.75 + 22 + 19) {
          rating = 86;
        } else if (random < 5 + 19.75 + 22 + 19 + 16.5) {
          rating = 87;
        } else if (random < 5 + 19.75 + 22 + 19 + 16.5 + (10.5 + godAvatarBonus * 0.5)) {
          rating = 88;
        } else if (random < 5 + 19.75 + 22 + 19 + 16.5 + (10.5 + godAvatarBonus * 0.5) + (4 + godAvatarBonus * 0.5)) {
          rating = 89;
        } else if (random < 5 + 19.75 + 22 + 19 + 16.5 + (10.5 + godAvatarBonus * 0.5) + (4 + godAvatarBonus * 0.5) + 1.5) {
          rating = 90;
        } else if (random < 5 + 19.75 + 22 + 19 + 16.5 + (10.5 + godAvatarBonus * 0.5) + (4 + godAvatarBonus * 0.5) + 1.5 + 0.75) {
          rating = 91;
        } else {
          rating = 92;
        }
        // Filter cards nach overall_rating
        let cardPool = availableCards.filter(card => card.overall_rating == rating);
        // Fallback falls keine Karte mit rating vorhanden
        if (!cardPool || cardPool.length === 0) {
          cardPool = epicCards.length > 0 ? epicCards : availableCards;
        }
        rarity = cardPool[0]?.rarity || "epic";
        const selectedCard = cardPool[Math.floor(Math.random() * cardPool.length)];
        drawnCards.push(selectedCard);
        if (selectedCard.rarity === "ultimate") {
          await incrementMission(username, "draw_legendary_card");
        }
        // Calculate score for this card
        const cardPoints = getScoreForRarity(selectedCard.rarity);
        totalScoreToAdd += cardPoints;
        // Add card to user's collection
        const today = new Date().toISOString().split("T")[0];
        const { data: existingCard, error: existingCardError } = await supabase
          .from("user_cards")
          .select("*")
          .eq("user_id", username)
          .eq("card_id", selectedCard.id)
          .eq("level", 1)
          .single();
        if (existingCardError && existingCardError.code !== "PGRST116") {
          console.error("Error checking existing card:", existingCardError);
        }
        if (existingCard) {
          const newQuantity = (existingCard.quantity || 0) + 1;
          const { error: updateCardError } = await supabase
            .from("user_cards")
            .update({ quantity: newQuantity })
            .eq("id", existingCard.id)
            .eq("level", 1);
          if (updateCardError) {
            console.error("Error updating card quantity:", updateCardError);
          }
        } else {
          const { data: insertedCard, error: insertCardError } = await supabase
            .from("user_cards")
            .insert({
              user_id: username,
              card_id: selectedCard.id,
              quantity: 1,
              level: 1,
              favorite: false,
              obtained_at: today,
            })
            .select();
          if (insertCardError) {
            console.error("Error adding card to collection:", insertCardError);
          }
        }
        continue;
      } else if (hasPremium) {
        // Premium user regular pack with Lucky Star bonus
        let legendaryChance = 5
        if (userClanRole === "lucky_star" || userClanRole === "leader") {
          legendaryChance += 2
        }

        if (random < 35) {
          rarity = "common"
          cardPool = commonCards
        } else if (random < 75) {
          rarity = "rare"
          cardPool = rareCards
        } else if (random < 95 + (legendaryChance - 5)) {
          rarity = "epic"
          cardPool = epicCards
        } else {
          rarity = "legendary"
          cardPool = legendaryCards
        }
      } else {
        // Regular pack with Lucky Star bonus
        let legendaryChance = 2
        if (userClanRole === "lucky_star" || userClanRole === "leader") {
          legendaryChance += 2
        }

        if (random < 50) {
          rarity = "common"
          cardPool = commonCards
        } else if (random < 84) {
          rarity = "rare"
          cardPool = rareCards
        } else if (random < 98 + (legendaryChance - 2)) {
          rarity = "epic"
          cardPool = epicCards
        } else {
          rarity = "legendary"
          cardPool = legendaryCards
        }
      }

      // If no cards of the selected rarity, fall back to common
      if (!cardPool || cardPool.length === 0) {
        rarity = "common"
        cardPool = commonCards.length > 0 ? commonCards : availableCards
      }

      // Select a random card from the pool
      const selectedCard = cardPool[Math.floor(Math.random() * cardPool.length)]
      drawnCards.push(selectedCard)

      if (selectedCard.rarity === "ultimate") {
        await incrementMission(username, "draw_legendary_card")
      }

      // Calculate score for this card
      const cardPoints = getScoreForRarity(selectedCard.rarity)
      totalScoreToAdd += cardPoints

      // Add card to user's collection
      const today = new Date().toISOString().split("T")[0]

      // Check if user already has this card
      const { data: existingCard, error: existingCardError } = await supabase
        .from("user_cards")
        .select("*")
        .eq("user_id", username)
        .eq("card_id", selectedCard.id)
        .eq("level", 1)
        .single()

      if (existingCardError && existingCardError.code !== "PGRST116") {
        console.error("Error checking existing card:", existingCardError)
      }

      if (existingCard) {
        // Update quantity if user already has this card
        const newQuantity = (existingCard.quantity || 0) + 1

        console.log(
          `Updating existing card: ${selectedCard.name}, ID: ${existingCard.id}, Old quantity: ${existingCard.quantity}, New quantity: ${newQuantity}`,
        )

        const { error: updateCardError } = await supabase
          .from("user_cards")
          .update({ quantity: newQuantity })
          .eq("id", existingCard.id)
          .eq("level", 1)

        if (updateCardError) {
          console.error("Error updating card quantity:", updateCardError)
        } else {
          console.log(`Successfully updated card quantity for ${selectedCard.name} to ${newQuantity}`)
        }
      } else {
        // Add new card to user's collection
        console.log(`Adding new card to collection: ${selectedCard.name}`)

        const { data: insertedCard, error: insertCardError } = await supabase
          .from("user_cards")
          .insert({
            user_id: username,
            card_id: selectedCard.id,
            quantity: 1,
            level: 1,
            favorite: false,
            obtained_at: today,
          })
          .select()

        if (insertCardError) {
          console.error("Error adding card to collection:", insertCardError)
        } else {
          console.log(`Successfully added new card to collection: ${selectedCard.name}, ID: ${insertedCard?.[0]?.id}`)
        }
      }
    }

    // Calculate XP with clan bonuses
    let xpAmount = isLegendary ? 100 * count : 50 * count

    // Special case for jiraiya user
    if (username === "jiraiya") {
      xpAmount = 10 * count
    }

    // XP Hunter bonus: +5% XP from packs
    if (userClanRole === "xp_hunter") {
      xpAmount = Math.floor(xpAmount * 1.05)
    }

    // Founder bonus: +5% XP from all pack openings
    if (userClanRole === "leader" || (userData.clan_id && userData.username === userData.founder_id)) {
      xpAmount = Math.floor(xpAmount * 1.05)
    }

    // XP Pass bonus
    const { data: xpPassData } = await supabase
      .from("xp_passes")
      .select("active")
      .eq("user_id", username)
      .eq("active", true)
      .single()

    if (xpPassData?.active) {
      xpAmount = Math.floor(xpAmount * 1.2)
    }

    totalScoreToAdd = Math.round(totalScoreToAdd)

    // Update score in database
    const { data: currentUserData, error: currentUserError } = await supabase
      .from("users")
      .select("score")
      .eq("username", username)
      .single()

    if (currentUserError) {
      console.error("Error fetching current user score:", currentUserError)
      return { success: false, error: "Failed to fetch current user score" }
    }

    const currentScore = currentUserData.score || 0
    const newScore = Math.floor(currentScore + totalScoreToAdd)

    console.log(`UPDATING SCORE: ${username} - Current: ${currentScore}, Adding: ${totalScoreToAdd}, New: ${newScore}`)

    const { error: scoreUpdateError } = await supabase
      .from("users")
      .update({ score: newScore })
      .eq("username", username)

    if (scoreUpdateError) {
      console.error("Error updating score:", scoreUpdateError)
      return { success: false, error: "Failed to update score" }
    }

    // Update clan experience if user belongs to a clan
    const clanLevels = [
  { level: 1, required_xp: 0, reward: "Clan created" },
  { level: 2, required_xp: 5000, reward: "+1 regular ticket per day for everyone" },
  { level: 3, required_xp: 20000, reward: "Role limits increased to 5" },
  { level: 4, required_xp: 50000, reward: "Cheap Hustler role unlocked" },
]

    if (userData.clan_id) {
      const { data: clanData, error: clanError } = await supabase
  .from("clans")
  .select("xp, level")
  .eq("id", userData.clan_id)
  .single()

if (!clanError && clanData) {
  const xpGain = (isLegendary ? 2 : 1) * count
  let currentXp = clanData.xp || 0
  let currentLevel = clanData.level || 1

  let newXpTotal = currentXp + xpGain
  let newLevel = currentLevel

  for (let i = clanLevels.length - 1; i >= 0; i--) {
    if (newXpTotal >= clanLevels[i].required_xp) {
      newLevel = clanLevels[i].level
      break
    }
  }

  await supabase
    .from("clans")
    .update({ xp: newXpTotal, level: newLevel })
    .eq("id", userData.clan_id)
}

    }

    revalidatePath("/leaderboard")

    // Get updated ticket counts
    const { data: updatedUser, error: updatedUserError } = await supabase
      .from("users")
      .select("tickets, elite_tickets, icon_tickets, score")
      .eq("username", username)
      .single()

    if (updatedUserError) {
      console.error("Error fetching updated user data:", updatedUserError)
    }

    return {
      success: true,
      drawnCards,
      newTicketCount: !isLegendary && !isIcon ? newTicketCount : updatedUser?.tickets || userData.tickets,
      newEliteTicketCount: isLegendary ? newTicketCount : updatedUser?.elite_tickets || userData.elite_tickets,
      newIconTicketCount: isIcon ? newTicketCount : updatedUser?.icon_tickets || userData.icon_tickets,
      scoreAdded: totalScoreToAdd,
      newScore: updatedUser?.score || newScore,
      removedZeroQuantityCards: removedCards?.length || 0,
      xpGained: xpAmount,
      clanBonuses: {
        xpHunter: userClanRole === "xp_hunter",
        luckystar: userClanRole === "lucky_star",
        founder: userClanRole === "leader",
      },
      avatarBonuses: {
        epicAvatar: hasEpicAvatar,
        godAvatar: hasGodAvatar,
      },
    }
  } catch (error) {
    console.error("Error drawing cards:", error)
    return { success: false, error: "Failed to draw cards" }
  }
}

/**
 * Gets all cards in a user's collection
 */
export async function getUserCards(username: string) {
  try {
    const supabase = createSupabaseServer()

    // Ändere die Abfrage, um die ID aus der user_cards-Tabelle zurückzugeben
    // Wichtig: Wir holen nur Karten mit quantity > 0, da nur diese in der Sammlung angezeigt werden sollen
    const { data: userCards, error: userCardsError } = await supabase
      .from("user_cards")
      .select(`
        id,
        card_id,
        level,
        quantity,
        favorite,
        obtained_at
      `)
      .eq("user_id", username)
      .gt("quantity", 0)

    if (userCardsError) {
      console.error("Error fetching user cards:", userCardsError)
      return { success: false, error: "Failed to fetch user cards" }
    }

    if (!userCards || userCards.length === 0) {
      return { success: true, cards: [] }
    }

    // Extrahiere die card_ids
    const cardIds = userCards.map((item) => item.card_id)

    // Hole die Kartendetails für diese IDs
    const { data: cardsData, error: cardsError } = await supabase.from("cards").select("*").in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // Erstelle eine Map der Kartendetails nach ID für einfachen Zugriff
    const cardDetailsMap = new Map()
    cardsData?.forEach((card) => {
      cardDetailsMap.set(card.id, card)
    })

    // Kombiniere die Benutzerkarten mit ihren Details
    const cards = userCards
      .map((userCard) => {
        const cardDetails = cardDetailsMap.get(userCard.card_id)
        if (!cardDetails) return null

        return {
          id: userCard.id, // Die eindeutige ID aus der user_cards-Tabelle
          card_id: userCard.card_id,
          name: cardDetails.name,
          character: cardDetails.character,
          image_url: cardDetails.image_url,
          rarity: cardDetails.rarity,
          type: cardDetails.type,
          description: cardDetails.description,
          level: userCard.level || 1,
          quantity: userCard.quantity || 1,
          favorite: userCard.favorite || false,
          obtained_at: userCard.obtained_at,
        }
      })
      .filter(Boolean) // Entferne alle null-Einträge

    return { success: true, cards }
  } catch (error) {
    console.error("Error in getUserCards:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Helper function to determine card rarity based on pack type
function determineRarity(packType: string): CardRarity {
  const random = Math.random() * 100 // Random number between 0-100

  if (packType === "legendary") {
    // Legendary pack with updated odds:
    // 10% legendary, 40% epic, 40% elite, 10% common
    if (random < 10) return "legendary"
    if (random < 50) return "epic" // 10 + 40 = 50
    if (random < 90) return "rare" // 50 + 40 = 90
    return "common" // Remaining 10%
  } else if (packType === "icon") {
    // ICON pack with 15% better odds than legendary:
    // 30% legendary, 38% epic, 30% elite, 2% common
    if (random < 30) return "legendary"
    if (random < 68) return "epic" // 30 + 38 = 68
    if (random < 98) return "rare" // 68 + 30 = 98
    return "common" // Remaining 2%
  } else {
    // Regular pack with updated odds:
    // 1% legendary, 5% epic, 34% elite, 60% common
    if (random < 1) return "legendary"
    if (random < 6) return "epic" // 1 + 5 = 6
    if (random < 40) return "rare" // 6 + 34 = 40
    return "common" // Remaining 60%
  }
}

/**
 * Utility-Funktion zum Bereinigen von Karten mit Quantity 0
 * Diese Funktion kann verwendet werden, um Karten mit Quantity 0 zu entfernen oder auf 1 zu setzen
 */
export async function cleanupZeroQuantityCards(username: string, action: 'remove' | 'fix' = 'fix') {
  try {
    const supabase = createSupabaseServer()
    
    // Finde alle Karten mit Quantity 0
    const { data: zeroCards, error: fetchError } = await supabase
      .from("user_cards")
      .select("*")
      .eq("user_id", username)
      .eq("quantity", 0)
    
    if (fetchError) {
      console.error("Error fetching zero quantity cards:", fetchError)
      return { success: false, error: "Failed to fetch cards with zero quantity" }
    }
    
    if (!zeroCards || zeroCards.length === 0) {
      return { success: true, message: "No cards with zero quantity found", count: 0 }
    }
    
    let successCount = 0;
    
    if (action === 'remove') {
      // Entferne alle Karten mit Quantity 0
      const { error: deleteError } = await supabase
        .from("user_cards")
        .delete()
        .eq("user_id", username)
        .eq("quantity", 0)
      
      if (deleteError) {
        console.error("Error removing zero quantity cards:", deleteError)
        return { success: false, error: "Failed to remove cards with zero quantity" }
      }
      
      successCount = zeroCards.length;
    } else {
      // Setze Quantity auf 1 für alle Karten mit Quantity 0
      for (const card of zeroCards) {
        const { error: updateError } = await supabase
          .from("user_cards")
          .update({ quantity: 1 })
          .eq("id", card.id)
        
        if (!updateError) {
          successCount++;
        } else {
          console.error(`Error fixing card ${card.id}:`, updateError)
        }
      }
    }
    
    return { 
      success: true, 
      message: `Successfully ${action === 'remove' ? 'removed' : 'fixed'} ${successCount} cards with zero quantity`,
      count: successCount,
      totalFound: zeroCards.length
    }
  } catch (error) {
    console.error(`Error in cleanupZeroQuantityCards:`, error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function drawGodPacks(username: string, count = 1) {
  try {
    const supabase = createSupabaseServer()

    // Check if user is banned
    if (isUserBanned(username)) {
      return { success: false, error: "You are banned from drawing packs." }
    }

    // Remove cards with quantity 0
    await supabase.from("user_cards").delete().eq("user_id", username).eq("quantity", 0)

    // Get user data + clan info
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("*, clan_id")
      .eq("username", username)
      .single()

    if (userError || !userData) return { success: false, error: "User not found" }

    let userClanRole = null
    if (userData.clan_id) {
      const { data: memberData } = await supabase
        .from("clan_members")
        .select("role")
        .eq("clan_id", userData.clan_id)
        .eq("user_id", username)
        .single()

      userClanRole = memberData?.role || null
    }

    // Give 3 Icon Tickets per GOAT Pack purchase
    const newIconTicketCount = (Number(userData.icon_tickets) || 0) + (3 * count)
    //  Speichere neuen Wert in DB
    const { error: updateError } = await supabase
      .from("users")
      .update({ icon_tickets: newIconTicketCount })
      .eq("username", username)

    if (updateError) throw new Error("Could not update icon tickets")

    // Check daily God Pack limit
    const today = new Date().toISOString().split("T")[0]
    const { data: usageData } = await supabase
      .from("god_pack_daily_usage")
      .select("*")
      .eq("user_id", username)
      .eq("usage_date", today)
      .single()

    const alreadyOpened = usageData?.packs_opened || 0
    const remaining = max_godpacks_daily - alreadyOpened

    if (remaining <= 0) {
      return { success: false, error: "Daily God Pack limit reached" }
    }

    const drawCount = Math.min(count, remaining)

    // Fetch available cards (including goat/godlike)
    const { data: cards } = await supabase
      .from("cards")
      .select("*")
      .eq("obtainable", true)
    // Ziehe nur aus goat/godlike/elite/ultimate Karten mit overall_rating >= 84
    const goatCards = (cards || []).filter((c) => {
      const r = c.rarity;
      const rating = Number(c.overall_rating);
      return (
        (r === "goat" || r === "godlike" || r === "elite" || r === "ultimate") && rating >= 84
      );
    });
    const drawnCards = []
    let totalScoreToAdd = 0
    // Draw-Rate-Definition
    const drawRates = [
      { rating: 84, chance: 9 },
      { rating: 85, chance: 11 },
      { rating: 86, chance: 13 },
      { rating: 87, chance: 15 },
      { rating: 88, chance: 17 },
      { rating: 89, chance: 14 },
      { rating: 90, chance: 11 },
      { rating: 91, chance: 8 },
      { rating: 92, chance: 0.75 },
      { rating: 93, chance: 0.475 },
      { rating: 94, chance: 0.0475 },
      { rating: 95, chance: 0.12 },
      { rating: 96, chance: 0.09 },
      { rating: 97, chance: 0.07 },
      { rating: 98, chance: 0.05 },
      { rating: 99, chance: 0.02 },
    ]
    // Summierte Wahrscheinlichkeiten für die Ziehung
    const totalChance = drawRates.reduce((sum, r) => sum + r.chance, 0)
    for (let i = 0; i < count; i++) {
      const rand = Math.random() * totalChance
      let acc = 0
      let selectedRating = 84
      for (const entry of drawRates) {
        acc += entry.chance
        if (rand < acc) {
          selectedRating = entry.rating
          break
        }
      }
      // Ziehe aus goatCards mit passendem overall_rating
      let pool = goatCards.filter(card => Number(card.overall_rating) === selectedRating)
      if (!pool || pool.length === 0) {
        // Fallback: Ziehe aus allen goatCards
        pool = goatCards
      }
      const selectedCard = pool[Math.floor(Math.random() * pool.length)]
      drawnCards.push(selectedCard)
      // Score
      totalScoreToAdd += getScoreForRarity(selectedCard.rarity)
      // Insert/update user_cards
      const { data: existingCard } = await supabase
        .from("user_cards")
        .select("*")
        .eq("user_id", username)
        .eq("card_id", selectedCard.id)
        .eq("level", 1)
        .single()
      if (existingCard) {
        await supabase
          .from("user_cards")
          .update({ quantity: existingCard.quantity + 1 })
          .eq("id", existingCard.id)
      } else {
        await supabase.from("user_cards").insert({
          user_id: username,
          card_id: selectedCard.id,
          quantity: 1,
          level: 1,
          favorite: false,
          obtained_at: today,
        })
      }
    }

    // Update god_pack_daily_usage
    if (usageData) {
      await supabase
        .from("god_pack_daily_usage")
        .update({ packs_opened: Math.min(alreadyOpened + drawCount, max_godpacks_daily), updated_at: new Date().toISOString() })
        .eq("id", usageData.id)
    } else {
      await supabase.from("god_pack_daily_usage").insert({
        user_id: username,
        usage_date: today,
        packs_opened: drawCount,
      })
    }

    // Update score
    const cardScore = Math.round(totalScoreToAdd)
    const { data: userScoreData } = await supabase.from("users").select("score").eq("username", username).single()
    const newScore = (userScoreData?.score || 0) + cardScore

    await supabase.from("users").update({ score: newScore }).eq("username", username)

    // Update clan XP
    if (userData.clan_id) {
      const { data: clanData } = await supabase
        .from("clans")
        .select("xp, level")
        .eq("id", userData.clan_id)
        .single()

      const clanLevels = [
        { level: 1, required_xp: 0 },
        { level: 2, required_xp: 5000 },
        { level: 3, required_xp: 20000 },
        { level: 4, required_xp: 50000 },
      ]

      const xpGain = drawCount * 5
      const newClanXp = (clanData?.xp || 0) + xpGain

      let newLevel = clanData?.level || 1
      for (let i = clanLevels.length - 1; i >= 0; i--) {
        if (newClanXp >= clanLevels[i].required_xp) {
          newLevel = clanLevels[i].level
          break
        }
      }

      await supabase.from("clans").update({ xp: newClanXp, level: newLevel }).eq("id", userData.clan_id)
    }

    // Calculate XP with bonuses
    let xpAmount = 200 * drawCount
    if (userClanRole === "xp_hunter") xpAmount = Math.floor(xpAmount * 1.05)
    if (userClanRole === "leader" || userData.username === userData.founder_id) xpAmount = Math.floor(xpAmount * 1.05)

    const { data: xpPass } = await supabase
      .from("xp_passes")
      .select("active")
      .eq("user_id", username)
      .eq("active", true)
      .single()

    if (xpPass?.active) xpAmount = Math.floor(xpAmount * 1.2)

    return {
      success: true,
      drawnCards,
      newScore,
      scoreAdded: cardScore,
      xpGained: xpAmount,
      godPacksUsedToday: alreadyOpened + drawCount,
      remainingToday: max_godpacks_daily - (alreadyOpened + drawCount),
    }
  } catch (error) {
    console.error("Error in drawGodPacks:", error)
    return { success: false, error: "Unexpected error drawing God Pack" }
  }
}
