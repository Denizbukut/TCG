"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@supabase/supabase-js"

// Supabase Server-Client erstellen
function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: {
      persistSession: false,
    },
  })
}

// Typ-Definitionen
type MarketListing = {
  id: string
  seller_id: string
  card_id: string
  price: number
  created_at: string
  status: "active" | "sold" | "cancelled"
  buyer_id?: string
  sold_at?: string
  user_card_id: number | string
  card_level: number
  seller_world_id?: string
}

type Card = {
  id: string
  name: string
  character: string
  image_url?: string
  rarity: "common" | "rare" | "epic" | "legendary" | "goat" // | "wbc" // Commented out
}

type MarketListingWithDetails = MarketListing & {
  card: Card
  seller_username: string
}

// Maximum number of cards a user can list
const MAX_USER_LISTINGS = 3

// Default page size for pagination
const DEFAULT_PAGE_SIZE = 20

// Card rarity type
type CardRarity = "common" | "rare" | "epic" | "legendary" | "goat" // | "wbc" // Commented out

// Function to calculate score based on card rarity
function getScoreForRarity(rarity: CardRarity): number {
  switch (rarity) {
    case "goat":
      return 200
    case "legendary":
      return 100
    case "epic":
      return 50
    case "rare":
      return 25
    case "common":
      return 5
    // case "wbc":
    //   return 250 // WBC-Karten sind sehr wertvoll // Commented out
    default:
      return 0
  }
}

/**
 * Holt alle aktiven Marketplace-Listings mit Pagination
 */
export async function getMarketListings(page = 1, pageSize = DEFAULT_PAGE_SIZE, filters: any = {}) {
  try {
    const supabase = createSupabaseServer()

    // First, we need to get all card IDs that match the search term if search is provided
    let matchingCardIds: string[] = []
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()

      // Search in cards table for matching names or characters
      const { data: matchingCards, error: searchError } = await supabase
        .from("cards")
        .select("id")
        .or(`name.ilike.%${searchTerm}%,character.ilike.%${searchTerm}%`)

      if (searchError) {
        console.error("Error searching cards:", searchError)
        return { success: false, error: "Failed to search cards" }
      }

      // Extract the card IDs
      matchingCardIds = matchingCards?.map((card) => card.id) || []

      // If no cards match and it's not a seller search, return empty results early
      if (matchingCardIds.length === 0 && !searchTerm.includes("@")) {
        return {
          success: true,
          listings: [],
          pagination: {
            total: 0,
            page,
            pageSize,
            totalPages: 1,
          },
        }
      }
    }

    // Build the base query for fetching
    let baseQuery = supabase.from("market_listings").select("*").eq("status", "active")

    // Apply filters to the base query
    if (filters.minPrice !== undefined) {
      baseQuery = baseQuery.gte("price", filters.minPrice)
    }

    if (filters.maxPrice !== undefined) {
      baseQuery = baseQuery.lte("price", filters.maxPrice)
    }

    // Apply search filter at database level
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()

      // If it looks like a username search
      if (searchTerm.includes("@")) {
        baseQuery = baseQuery.ilike("seller_id", `%${searchTerm}%`)
      }
      // Otherwise, filter by the matching card IDs we found
      else if (matchingCardIds.length > 0) {
        baseQuery = baseQuery.in("card_id", matchingCardIds)
      }
    }

    // Get all card IDs for rarity filtering if needed
    let cardIdsByRarity: string[] = []
    if (filters.rarity && filters.rarity !== "all") {
      const { data: rarityCards, error: rarityError } = await supabase
        .from("cards")
        .select("id")
        .eq("rarity", filters.rarity)

      if (rarityError) {
        console.error("Error fetching cards by rarity:", rarityError)
        return { success: false, error: "Failed to filter by rarity" }
      }

      cardIdsByRarity = rarityCards?.map((card) => card.id) || []

      // Apply rarity filter at database level
      if (cardIdsByRarity.length > 0) {
        baseQuery = baseQuery.in("card_id", cardIdsByRarity)
      } else {
        // If no cards match the rarity, return empty results
        return {
          success: true,
          listings: [],
          pagination: {
            total: 0,
            page,
            pageSize,
            totalPages: 1,
          },
        }
      }
    }

    // Get total count with a separate query
    const countQuery = supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .eq("status", "active")

    // Apply the same filters to the count query
    if (filters.minPrice !== undefined) {
      countQuery.gte("price", filters.minPrice)
    }

    if (filters.maxPrice !== undefined) {
      countQuery.lte("price", filters.maxPrice)
    }

    if (filters.search) {
      const searchTerm = filters.search.toLowerCase()
      if (searchTerm.includes("@")) {
        countQuery.ilike("seller_id", `%${searchTerm}%`)
      } else if (matchingCardIds.length > 0) {
        countQuery.in("card_id", matchingCardIds)
      }
    }

    // Apply rarity filter to count query
    if (filters.rarity && filters.rarity !== "all" && cardIdsByRarity.length > 0) {
      countQuery.in("card_id", cardIdsByRarity)
    }

    const { count: totalCount, error: countError } = await countQuery

    if (countError) {
      console.error("Error counting filtered market listings:", countError)
      return { success: false, error: "Failed to count market listings" }
    }

    // Calculate pagination
    const offset = (page - 1) * pageSize
    const totalPages = Math.ceil((totalCount || 0) / pageSize) || 1

    // If page is out of bounds, adjust to last page
    const adjustedPage = page > totalPages ? totalPages : page
    const adjustedOffset = (adjustedPage - 1) * pageSize

    // Apply sorting based on the sort option
    let sortedQuery = baseQuery

    // Apply sorting based on the sort option
    if (filters.sort === "level_high") {
      sortedQuery = baseQuery.order("card_level", { ascending: false })
    } else if (filters.sort === "level_low") {
      sortedQuery = baseQuery.order("card_level", { ascending: true })
    } else if (filters.sort === "price_low") {
      sortedQuery = baseQuery.order("price", { ascending: true })
    } else if (filters.sort === "price_high") {
      sortedQuery = baseQuery.order("price", { ascending: false })
    } else if (filters.sort === "oldest") {
      sortedQuery = baseQuery.order("created_at", { ascending: true })
    } else {
      // Default: newest first
      sortedQuery = baseQuery.order("created_at", { ascending: false })
    }


    // Fetch the listings with pagination
    const { data: listings, error } = await sortedQuery.range(adjustedOffset, adjustedOffset + pageSize - 1)

    if (error) {
      console.error("Error fetching market listings:", error)
      return { success: false, error: "Failed to fetch market listings" }
    }

    if (!listings || listings.length === 0) {
      return {
        success: true,
        listings: [],
        pagination: {
          total: totalCount || 0,
          page: adjustedPage,
          pageSize,
          totalPages,
        },
      }
    }

    // Efficiently fetch related data in batches
    // 1. Extract unique IDs for related data
    const cardIds = [...new Set(listings.map((listing: MarketListing) => listing.card_id))]
    const sellerIds = [...new Set(listings.map((listing: MarketListing) => listing.seller_id))]

    // 2. Fetch card details in a single query
    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // 3. Fetch seller details in a single query
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("username, world_id")
      .in("username", sellerIds)

    if (usersError) {
      console.error("Error fetching user details:", usersError)
      return { success: false, error: "Failed to fetch user details" }
    }

    // 4. Create maps for efficient lookups
    const cardMap = new Map()
    cards?.forEach((card: Card) => {
      cardMap.set(card.id, card)
    })

    const userMap = new Map()
    users?.forEach((user: { username: string; world_id: string }) => {
      userMap.set(user.username, user)
    })

    // 5. Apply rarity filter if needed (now that we have card data)
    // This is no longer needed as we filter at the database level
    const filteredListings = listings

    // 6. Combine the data
    const listingsWithDetails = filteredListings.map((listing: MarketListing) => {
      const card = cardMap.get(listing.card_id)
      const seller = userMap.get(listing.seller_id)

      return {
        ...listing,
        card,
        seller_username: seller?.username || listing.seller_id,
        seller_world_id: seller?.world_id || null,
      }
    })

    // 7. Apply client-side sorting for rarity and level if needed
    const sortedListings = [...listingsWithDetails]
    if (filters.sort === "rarity") {
      const rarityOrder = { common: 0, rare: 1, epic: 2, legendary: 3 }
      sortedListings.sort((a, b) => {
        return (
          rarityOrder[b.card.rarity as keyof typeof rarityOrder] -
          rarityOrder[a.card.rarity as keyof typeof rarityOrder]
        )
      })
    }

    // Calculate final pagination info based on filtered results
    const filteredCount = totalCount || 0
    const filteredTotalPages = Math.ceil(filteredCount / pageSize) || 1

    return {
      success: true,
      listings: sortedListings,
      pagination: {
        total: filteredCount,
        page: adjustedPage,
        pageSize,
        totalPages: filteredTotalPages,
      },
    }
  } catch (error) {
    console.error("Error in getMarketListings:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Holt die Marketplace-Listings eines bestimmten Benutzers
 */
export async function getUserListings(username: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  try {
    const supabase = createSupabaseServer()
    const offset = (page - 1) * pageSize

    // Count total user listings with a separate query
    const { count, error: countError } = await supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", username)
      .eq("status", "active")

    if (countError) {
      console.error("Error counting user listings:", countError)
      return { success: false, error: "Failed to count your listings" }
    }

    // Fetch paginated listings
    const { data: listings, error } = await supabase
      .from("market_listings")
      .select("*")
      .eq("seller_id", username)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("Error fetching user listings:", error)
      return { success: false, error: "Failed to fetch your listings" }
    }

    if (!listings || listings.length === 0) {
      return {
        success: true,
        listings: [],
        listingCount: count || 0,
        maxListings: MAX_USER_LISTINGS,
        pagination: {
          total: count || 0,
          page,
          pageSize,
          totalPages: Math.ceil((count || 0) / pageSize) || 1,
        },
      }
    }

    // Efficiently fetch card details
    const cardIds = [...new Set(listings.map((listing: MarketListing) => listing.card_id))]

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // Create map for efficient lookups
    const cardMap = new Map()
    cards?.forEach((card: Card) => {
      cardMap.set(card.id, card)
    })

    // Combine the data
    const listingsWithDetails = listings.map((listing: MarketListing) => {
      const card = cardMap.get(listing.card_id)

      return {
        ...listing,
        card,
        seller_username: username,
      }
    })

    return {
      success: true,
      listings: listingsWithDetails,
      listingCount: count || 0,
      maxListings: MAX_USER_LISTINGS,
      pagination: {
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize) || 1,
      },
    }
  } catch (error) {
    console.error("Error in getUserListings:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Überprüft, ob ein Benutzer das Limit für Listings erreicht hat
 */
export async function checkUserListingLimit(username: string) {
  try {
    const supabase = createSupabaseServer()

    // Zähle die aktiven Listings des Benutzers
    const { count, error } = await supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", username)
      .eq("status", "active")

    if (error) {
      console.error("Error checking user listing limit:", error)
      return { success: false, error: "Failed to check your listing limit" }
    }

    return {
      success: true,
      canList: (count || 0) < MAX_USER_LISTINGS,
      listingCount: count || 0,
      maxListings: MAX_USER_LISTINGS,
    }
  } catch (error) {
    console.error("Error in checkUserListingLimit:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Ändere die createListing-Funktion, um mit username als ID zu arbeiten
export async function createListing(
  username: string,
  userCardId: number | string,
  cardId: string,
  price: number,
  cardLevel: number,
) {
  try {
    // Detailliertes Logging für Debugging
    console.log("=== CREATE LISTING START ===")
    console.log("Parameters:", { username, userCardId, cardId, price, cardLevel })

    const supabase = createSupabaseServer()

    // Überprüfe zuerst, ob der Benutzer das Limit erreicht hat
    const { count, error: countError } = await supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .eq("seller_id", username)
      .eq("status", "active")

    if (countError) {
      console.error("Error checking user listing count:", countError)
      return { success: false, error: "Failed to check your listing count" }
    }

    if ((count || 0) >= MAX_USER_LISTINGS) {
      return {
        success: false,
        error: `You can only list a maximum of ${MAX_USER_LISTINGS} cards at a time. Please remove some listings before adding more.`,
      }
    }

    // Prüfe auf Verkaufslimit (3 Verkäufe seit letztem Kauf)
    const { data: userData, error: userErr } = await supabase
      .from("users")
      .select("cards_sold_since_last_purchase")
      .eq("username", username)
      .single()

    if (userErr || !userData) {
      return { success: false, error: "User not found." }
    }

    if (userData.cards_sold_since_last_purchase >= 3) {
      return {
        success: false,
        error: "You must buy a card from the marketplace before listing more cards.",
      }
    }

    // Hole die Benutzerinformationen (username ist bereits die ID)
    console.log("Fetching user data for:", username)
    const { data: initialUserData, error: userError } = await supabase
      .from("users")
      .select("world_id")
      .eq("username", username)
      .single()

    if (userError) {
      console.error("Error fetching user:", userError)
      return { success: false, error: "User not found: " + userError.message }
    }

    if (!initialUserData) {
      console.error("User data is null for username:", username)
      return { success: false, error: "User not found in database" }
    }

    console.log("User data:", initialUserData)
    const worldId = initialUserData.world_id

    // Überprüfe, ob der Benutzer die Karte besitzt
    console.log("Checking if user owns card:", { userCardId, username })
    const { data: userCard, error: userCardError } = await supabase
      .from("user_cards")
      .select("quantity, level")
      .eq("id", userCardId)
      .eq("user_id", username)
      .maybeSingle()

    if (userCardError) {
      console.error("Error checking user card:", userCardError)
      return { success: false, error: "Error checking if you own this card: " + userCardError.message }
    }

    if (!userCard) {
      console.error("User card not found:", { userCardId, username })
      return { success: false, error: "Card not found in your collection" }
    }

    console.log("User card data:", userCard)

    if (userCard.quantity < 1) {
      return { success: false, error: "You don't have enough copies of this card" }
    }

    // Überprüfe, ob der Benutzer bereits eine Karte dieser Art (unabhängig vom Level) zum Verkauf anbietet
    console.log("Checking if user has already listed this card type:", { cardId, username })
    const { data: existingListings, error: existingListingsError } = await supabase
      .from("market_listings")
      .select("id, card_level")
      .eq("card_id", cardId)
      .eq("seller_id", username)
      .eq("status", "active")

    if (existingListingsError) {
      console.error("Error checking existing listings:", existingListingsError)
      return { success: false, error: "Error checking your existing listings: " + existingListingsError.message }
    }

    if (existingListings && existingListings.length > 0) {
      console.log("User already has this card type listed:", existingListings)
      return {
        success: false,
        error:
          "You can only list one card of each type at a time. You already have this card listed (Level " +
          existingListings[0].card_level +
          ").",
      }
    }

    // Get the card details to determine rarity and calculate score
    const { data: cardDetails, error: cardDetailsError } = await supabase
      .from("cards")
      .select("rarity")
      .eq("id", cardId)
      .single()

    if (cardDetailsError || !cardDetails) {
      console.error("Error fetching card details:", cardDetailsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // WLD-Preis abrufen für USD-zu-WLD Umrechnung
    let priceUsdPerWLD = null
    try {
      const res = await fetch("https://app-backend.worldcoin.dev/public/v1/miniapps/prices?cryptoCurrencies=WLD&fiatCurrencies=USD")
      const json = await res.json()
      const amountStr = json?.result?.prices?.WLD?.USD?.amount
      const decimals = json?.result?.prices?.WLD?.USD?.decimals
      if (amountStr && typeof decimals === "number") {
        priceUsdPerWLD = parseFloat(amountStr) / 10 ** decimals
      }
    } catch (error) {
      console.error("Error fetching WLD price:", error)
    }

    // Preisvalidierung basierend auf Rarity (USD umgerechnet zu WLD)
    let minUsdPrice = 0.15 // Standard-Mindestpreis
    
    // Rarity-basierte Preise
    if (cardDetails.rarity === "legendary") {
      minUsdPrice = 1.5
    } else if (cardDetails.rarity === "epic") {
      minUsdPrice = 1.0
    } else if (cardDetails.rarity === "rare") {
      minUsdPrice = 0.5
    } else if (cardDetails.rarity === "common") {
      minUsdPrice = 0.15
    }

    const minWldPrice = priceUsdPerWLD ? minUsdPrice / priceUsdPerWLD : minUsdPrice

    if (price < minWldPrice) {
      let cardType = "cards"
      cardType = cardDetails.rarity === "legendary" ? "Legendary" : 
                cardDetails.rarity === "epic" ? "Epic" : 
                cardDetails.rarity === "rare" ? "Rare" : 
                cardDetails.rarity === "common" ? "Common" : "cards"
      
      return {
        success: false,
        error: `${cardType} must be listed for at least $${minUsdPrice.toFixed(2)} (~${minWldPrice.toFixed(3)} WLD)`
      }
    }

    // Calculate score based on card rarity
    const scoreForCard = getScoreForRarity(cardDetails.rarity as CardRarity)

    // Get user's current score
    const { data: scoreUserData, error: userScoreError } = await supabase
      .from("users")
      .select("score")
      .eq("username", username)
      .single()

    if (userScoreError) {
      console.error("Error fetching user score:", userScoreError)
      return { success: false, error: "Failed to fetch user score" }
    }

    // Calculate new score (deduct the points)
    const currentScore = scoreUserData.score || 0
    const newScore = Math.max(0, currentScore - scoreForCard) // Ensure score doesn't go below 0

    console.log(`Deducting score for listing: ${username}: ${currentScore} -> ${newScore} (-${scoreForCard} points)`)

    // Update user's score
    const { error: updateScoreError } = await supabase
      .from("users")
      .update({ score: newScore })
      .eq("username", username)

    if (updateScoreError) {
      console.error("Error updating score for listing:", updateScoreError)
      return { success: false, error: "Failed to update user score" }
    }

    // Erstelle das Listing
    console.log("Creating listing with data:", {
      seller_id: username, // Verwende username als seller_id
      seller_world_id: worldId,
      card_id: cardId,
      price,
      user_card_id: userCardId,
      card_level: cardLevel || userCard.level,
    })

    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .insert({
        seller_id: username, // Verwende username als seller_id
        seller_world_id: worldId,
        card_id: cardId,
        price,
        user_card_id: userCardId,
        card_level: cardLevel || userCard.level,
        status: "active",
        created_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (listingError) {
      console.error("Error creating listing:", listingError)
      return { success: false, error: "Failed to create listing: " + listingError.message }
    }

    console.log("Listing created successfully:", listing)

    // Reduziere die Kartenanzahl des Benutzers um 1
    console.log("Updating user card quantity:", { userCardId, username, newQuantity: userCard.quantity - 1 })
    const { error: updateError } = await supabase
      .from("user_cards")
      .update({ quantity: userCard.quantity - 1 })
      .eq("id", userCardId)
      .eq("user_id", username)

    if (updateError) {
      console.error("Error updating user card quantity:", updateError)
      // Rollback das Listing, wenn die Aktualisierung fehlschlägt
      console.log("Rolling back listing due to error")
      await supabase.from("market_listings").delete().eq("id", listing.id)
      return { success: false, error: "Failed to update card quantity: " + updateError.message }
    }

    console.log("Card quantity updated successfully")
    console.log("=== CREATE LISTING COMPLETE ===")

    // Nur Trade-Seite neu laden, Collection wird über onSuccess callback aktualisiert
    revalidatePath("/trade")
    return { success: true, listing }
  } catch (error) {
    console.error("Unexpected error in createListing:", error)
    return {
      success: false,
      error: "An unexpected error occurred: " + (error instanceof Error ? error.message : String(error)),
    }
  }
}

/**
 * Kauft eine Karte vom Marketplace
 */
export async function purchaseCard(username: string, listingId: string) {
  try {
    const supabase = createSupabaseServer()

    // 1. Käuferdaten aufräumen
    await supabase
      .from("user_cards")
      .delete()
      .eq("user_id", username)
      .eq("quantity", 0)

    // 2. Käuferdaten holen
    const { data: buyerData, error: buyerError } = await supabase
      .from("users")
      .select("coins, score")
      .eq("username", username)
      .single()

    if (buyerError || !buyerData) {
      return { success: false, error: "Buyer not found" }
    }

    // 3. Listing holen
    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .select("*")
      .eq("id", listingId)
      .eq("status", "active")
      .single()

    if (listingError || !listing) {
      return { success: false, error: "Listing not found or already sold" }
    }

    // 4. Selbstkauf verhindern
    if (listing.seller_id === username) {
      return { success: false, error: "You cannot buy your own card" }
    }
     // Käufer cards_sold_since_last_purchase auf 0 setzen
    await supabase
      .from("users")
      .update({ cards_sold_since_last_purchase: 0 })
      .eq("username", username)

    // 5. Score vorbereiten
    const { data: cardDetails, error: cardError } = await supabase
      .from("cards")
      .select("rarity")
      .eq("id", listing.card_id)
      .single()

    if (cardError || !cardDetails) {
      return { success: false, error: "Failed to fetch card details" }
    }

    const scoreForCard = getScoreForRarity(cardDetails.rarity)

    // 6. Verkäuferdaten
    const { data: sellerData, error: sellerError } = await supabase
      .from("users")
      .select("score, cards_sold_since_last_purchase")
      .eq("username", listing.seller_id)
      .single()

    const sellerScore = sellerData?.score ?? 0
    const buyerScore = buyerData?.score ?? 0
    if (sellerError || !sellerData) {
      return { success: false, error: "Failed to fetch seller data" }
    }
    const currentSoldCount = sellerData.cards_sold_since_last_purchase ?? 0
const newSoldCount = currentSoldCount + 1

// Zuerst prüfen:
if (newSoldCount === 3) {
  const { data: activeListings, error: listingsError } = await supabase
    .from("market_listings")
    .select("id")
    .eq("seller_id", listing.seller_id)
    .eq("status", "active")

  if (!listingsError && activeListings?.length > 0) {
    for (const l of activeListings) {
      if (l.id !== listingId) {
        await cancelListing(listing.seller_id, l.id)
      }
    }
  }
}

// Dann den Zähler hochzählen
await supabase
  .from("users")
  .update({ cards_sold_since_last_purchase: newSoldCount })
  .eq("username", listing.seller_id)


    await supabase
      .from("users")
      .update({ score: Math.max(0, sellerScore - scoreForCard) })
      .eq("username", listing.seller_id)

    await supabase
      .from("users")
      .update({ score: buyerScore + scoreForCard })
      .eq("username", username)

    // 7. Verkäuferkarte bearbeiten
    let { data: sellerCard, error: sellerCardError } = await supabase
      .from("user_cards")
      .select("id, quantity")
      .eq("id", listing.user_card_id)
      .eq("user_id", listing.seller_id)
      .eq("card_id", listing.card_id)
      .eq("level", listing.card_level)
      .single()

    if (sellerCardError || !sellerCard) {
      console.warn("Seller card not found by user_card_id – creating fallback card...")

      const { error: recreateError } = await supabase.from("user_cards").insert({
        id: listing.user_card_id, // gleiche ID wie im Listing
        user_id: listing.seller_id,
        card_id: listing.card_id,
        quantity: 1,
        level: listing.card_level || 1,
        favorite: false,
        obtained_at: new Date().toISOString().split("T")[0],
      })
      if (recreateError) {
    return { success: false, error: "Failed to recreate seller's card entry: " + recreateError.message }
  }

  // Jetzt sellerCard neu laden
  const { data: recreatedCard, error: refetchError } = await supabase
    .from("user_cards")
    .select("id, quantity")
    .eq("id", listing.user_card_id)
    .eq("user_id", listing.seller_id)
    .eq("card_id", listing.card_id)
    .eq("level", listing.card_level)
    .single()

  if (refetchError || !recreatedCard) {
    return { success: false, error: "Card recreated, but failed to fetch it again." }
  }

  sellerCard = recreatedCard // 🧠 Setze sellerCard, damit der folgende Code funktioniert
}

    if (sellerCard.quantity > 1) {
      await supabase
        .from("user_cards")
        .update({ quantity: sellerCard.quantity - 1 })
        .eq("id", sellerCard.id)
        .eq("level", listing.card_level)
    } else {
      await supabase
        .from("user_cards")
        .delete()
        .eq("id", sellerCard.id)
        .eq("level", listing.card_level)
    }

    // 8. Käuferkarte prüfen: gleiche card_id + level
    const { data: buyerCard, error: buyerCardError } = await supabase
      .from("user_cards")
      .select("id, quantity")
      .eq("user_id", username)
      .eq("card_id", listing.card_id)
      .eq("level", listing.card_level)
      .single()

    if (buyerCard && !buyerCardError) {
      // Karte existiert → quantity erhöhen
      await supabase
        .from("user_cards")
        .update({ quantity: buyerCard.quantity + 1 })
        .eq("id", buyerCard.id)
        .eq("level", listing.card_level)
    } else {
      // Neue Karte anlegen
      const { error: insertError } = await supabase.from("user_cards").insert({
        user_id: username,
        card_id: listing.card_id,
        quantity: 1,
        level: listing.card_level || 1,
        favorite: false,
        obtained_at: new Date().toISOString().split("T")[0],
      })

      if (insertError) {
        return { success: false, error: "Failed to add card to your collection" }
      }
    }

    // 9. Listing aktualisieren
    await supabase
      .from("market_listings")
      .update({
        status: "sold",
        buyer_id: username,
        sold_at: new Date().toISOString(),
      })
      .eq("id", listingId)

    // 10. Trade speichern
    await supabase.from("trades").insert({
      seller_id: listing.seller_id,
      buyer_id: username,
      user_card_id: listing.user_card_id,
      card_id: listing.card_id,
      price: listing.price,
      created_at: new Date().toISOString(),
    })

    revalidatePath("/trade")
    revalidatePath("/collection")

    return { success: true, message: "Card purchased successfully" }
  } catch (error) {
    console.error("Error in purchaseCard:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}


/**
 * Storniert ein Listing und gibt die Karte zurück
 * Jetzt wird der Eintrag komplett aus der Datenbank gelöscht
 */
export async function cancelListing(username: string, listingId: string) {
  try {
    const supabase = createSupabaseServer()

    // Hole das Listing
    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .select("*")
      .eq("id", listingId)
      .eq("seller_id", username)
      .eq("status", "active")
      .single()

    if (listingError || !listing) {
      console.error("Error fetching listing:", listingError)
      return { success: false, error: "Listing not found or already sold" }
    }

    // Get the card details to determine rarity and calculate score
    const { data: cardDetails, error: cardDetailsError } = await supabase
      .from("cards")
      .select("rarity")
      .eq("id", listing.card_id)
      .single()

    if (cardDetailsError || !cardDetails) {
      console.error("Error fetching card details:", cardDetailsError)
      // Continue with cancellation even if score update fails
    } else {
      // Calculate score based on card rarity
      const scoreForCard = getScoreForRarity(cardDetails.rarity as CardRarity)

      // Get seller's current score
      const { data: sellerData, error: sellerError } = await supabase
        .from("users")
        .select("score")
        .eq("username", username)
        .single()

      if (sellerError || !sellerData) {
        console.error("Error fetching seller score:", sellerError)
        // Continue with cancellation even if score update fails
      } else {
        // Calculate new score (restore the points)
        const currentScore = sellerData.score || 0
        const newScore = currentScore + scoreForCard

        console.log(`Restoring score on cancellation: ${username}: ${currentScore} -> ${newScore}`)

        // Update seller's score
        const { error: updateScoreError } = await supabase
          .from("users")
          .update({ score: newScore })
          .eq("username", username)

        if (updateScoreError) {
          console.error("Error restoring score on cancellation:", updateScoreError)
          // Continue with cancellation even if score update fails
        }
      }
    }

    // Gib die Karte zurück
    // Prüfe zuerst, ob der Benutzer die Karte bereits besitzt
    const { data: existingCard, error: existingCardError } = await supabase
      .from("user_cards")
      .select("id, quantity")
      .eq("user_id", username)
      .eq("card_id", listing.card_id)
      .eq("level", listing.card_level)
      .single()

    if (existingCardError && existingCardError.code !== "PGRST116") {
      console.error("Error checking existing card:", existingCardError)
      return { success: false, error: "Failed to check if you already own this card" }
    }

    if (existingCard) {
      // Aktualisiere die Anzahl, wenn der Benutzer die Karte bereits besitzt
      const { error: updateCardError } = await supabase
        .from("user_cards")
        .update({ quantity: existingCard.quantity + 1 })
        .eq("id", existingCard.id)

      if (updateCardError) {
        console.error("Error updating card quantity:", updateCardError)
        return { success: false, error: "Failed to return card to your collection" }
      }
    } else {
      // Füge eine neue Karte hinzu, wenn der Benutzer sie nicht mehr besitzt
      const { error: insertCardError } = await supabase.from("user_cards").insert({
        user_id: username,
        card_id: listing.card_id,
        quantity: 1,
        level: listing.card_level || 1,
        favorite: false,
        obtained_at: new Date().toISOString().split("T")[0], // Format as YYYY-MM-DD
      })

      if (insertCardError) {
        console.error("Error adding card to collection:", insertCardError)
        return { success: false, error: "Failed to return card to your collection" }
      }
    }

    // Lösche das Listing komplett aus der Datenbank
    const { error: deleteError } = await supabase.from("market_listings").delete().eq("id", listingId)

    if (deleteError) {
      console.error("Error deleting listing:", deleteError)
      return { success: false, error: "Failed to delete listing" }
    }

    revalidatePath("/trade")
    revalidatePath("/collection")
    return { success: true, message: "Listing cancelled successfully" }
  } catch (error) {
    console.error("Error in cancelListing:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Aktualisiert den Preis eines Listings
 */
export async function updateListingPrice(username: string, listingId: string, newPrice: number) {
  try {
    const supabase = createSupabaseServer()

    // Hole das Listing
    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .select("*")
      .eq("id", listingId)
      .eq("seller_id", username)
      .eq("status", "active")
      .single()

    if (listingError || !listing) {
      console.error("Error fetching listing:", listingError)
      return { success: false, error: "Listing not found or already sold" }
    }

    // Hole die Karten-Details für die Preisvalidierung
    const { data: cardDetails, error: cardDetailsError } = await supabase
      .from("cards")
      .select("rarity")
      .eq("id", listing.card_id)
      .single()

    if (cardDetailsError || !cardDetails) {
      console.error("Error fetching card details:", cardDetailsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // WLD-Preis abrufen für USD-zu-WLD Umrechnung
    let priceUsdPerWLD = null
    try {
      const res = await fetch("https://app-backend.worldcoin.dev/public/v1/miniapps/prices?cryptoCurrencies=WLD&fiatCurrencies=USD")
      const json = await res.json()
      const amountStr = json?.result?.prices?.WLD?.USD?.amount
      const decimals = json?.result?.prices?.WLD?.USD?.decimals
      if (amountStr && typeof decimals === "number") {
        priceUsdPerWLD = parseFloat(amountStr) / 10 ** decimals
      }
    } catch (error) {
      console.error("Error fetching WLD price:", error)
    }

    // Preisvalidierung basierend auf Rating und Rarity (USD umgerechnet zu WLD)
    let minUsdPrice = 0.15 // Standard-Mindestpreis
    
    // Rarity-basierte Preise
    if (cardDetails.rarity === "legendary") {
      minUsdPrice = 1.5
    } else if (cardDetails.rarity === "epic") {
      minUsdPrice = 1.0
    } else if (cardDetails.rarity === "rare") {
      minUsdPrice = 0.5
    } else if (cardDetails.rarity === "common") {
      minUsdPrice = 0.15
    }

    const minWldPrice = priceUsdPerWLD ? minUsdPrice / priceUsdPerWLD : minUsdPrice

    if (newPrice < minWldPrice) {
      let cardType = "cards"
      cardType = cardDetails.rarity === "legendary" ? "Legendary" : 
                cardDetails.rarity === "epic" ? "Epic" : 
                cardDetails.rarity === "rare" ? "Rare" : 
                cardDetails.rarity === "common" ? "Common" : "cards"
      
      return {
        success: false,
        error: `${cardType} must be listed for at least $${minUsdPrice.toFixed(2)} (~${minWldPrice.toFixed(3)} WLD)`
      }
    }

    // Allgemeine Preisvalidierung
    if (newPrice <= 0 || newPrice > 500) {
      return { success: false, error: "Invalid price. Price must be between 0.1 and 500 WLD" }
    }

    // Aktualisiere den Preis
    const { error: updateError } = await supabase
      .from("market_listings")
      .update({ price: newPrice })
      .eq("id", listingId)

    if (updateError) {
      console.error("Error updating listing price:", updateError)
      return { success: false, error: "Failed to update listing price" }
    }

    revalidatePath("/trade")
    return { success: true, message: "Listing price updated successfully" }
  } catch (error) {
    console.error("Error in updateListingPrice:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

/**
 * Holt den Transaktionsverlauf eines Benutzers mit Pagination
 */
export async function getTransactionHistory(username: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  try {
    const supabase = createSupabaseServer()
    const offset = (page - 1) * pageSize

    // Count total transactions with a separate query
    const { count, error: countError } = await supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .or(`seller_id.eq.${username},buyer_id.eq.${username}`)
      .eq("status", "sold")

    if (countError) {
      console.error("Error counting transactions:", countError)
      return { success: false, error: "Failed to count your transactions" }
    }

    // Fetch paginated transactions
    const { data: listings, error } = await supabase
      .from("market_listings")
      .select("*")
      .or(`seller_id.eq.${username},buyer_id.eq.${username}`)
      .eq("status", "sold")
      .order("sold_at", { ascending: false })
      .range(offset, offset + pageSize - 1)

    if (error) {
      console.error("Error fetching transaction history:", error)
      return { success: false, error: "Failed to fetch transaction history" }
    }

    if (!listings || listings.length === 0) {
      return {
        success: true,
        transactions: [],
        pagination: {
          total: count || 0,
          page,
          pageSize,
          totalPages: Math.ceil((count || 0) / pageSize) || 1,
        },
      }
    }

    // Efficiently fetch card details
    const cardIds = [...new Set(listings.map((listing: MarketListing) => listing.card_id))]

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // Create map for efficient lookups
    const cardMap = new Map()
    cards?.forEach((card: Card) => {
      cardMap.set(card.id, card)
    })

    // Combine the data
    const transactionsWithDetails = listings.map((listing: MarketListing) => {
      const card = cardMap.get(listing.card_id)
      const isSeller = listing.seller_id === username

      return {
        ...listing,
        card,
        transaction_type: isSeller ? "sold" : "purchased",
        other_party: isSeller ? listing.buyer_id : listing.seller_id,
        seller_username: listing.seller_id, // Add seller_username to match the Transaction type
      }
    })

    return {
      success: true,
      transactions: transactionsWithDetails,
      pagination: {
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize) || 1,
      },
    }
  } catch (error) {
    console.error("Error in getTransactionHistory:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Add the getRecentSales function after the getTransactionHistory function

/**
 * Holt die kürzlich verkauften Karten mit Pagination
 */
export async function getRecentSales(page = 1, pageSize = DEFAULT_PAGE_SIZE, searchTerm = "") {
  try {
    console.log("=== GET RECENT SALES START ===")
    console.log("Parameters:", { page, pageSize, searchTerm })

    const supabase = createSupabaseServer()
    const offset = (page - 1) * pageSize

    console.log("Calculated offset:", offset)

    // Wenn ein Suchbegriff vorhanden ist, suche zuerst nach passenden Karten
    let matchingCardIds: string[] = []
    if (searchTerm) {
      console.log("Searching for cards matching:", searchTerm)
      const { data: matchingCards, error: searchError } = await supabase
        .from("cards")
        .select("id")
        .or(`name.ilike.%${searchTerm}%,character.ilike.%${searchTerm}%`)

      if (searchError) {
        console.error("Error searching cards:", searchError)
        return { success: false, error: "Failed to search cards" }
      }

      matchingCardIds = matchingCards?.map((card) => card.id) || []
      console.log(`Found ${matchingCardIds.length} matching cards for search term`)

      // Wenn keine Karten gefunden wurden und es keine Benutzersuche ist, gib leere Ergebnisse zurück
      if (matchingCardIds.length === 0 && !searchTerm.includes("@")) {
        console.log("No matching cards found, returning empty results")
        return {
          success: true,
          sales: [],
          pagination: {
            total: 0,
            page,
            pageSize,
            totalPages: 1,
          },
        }
      }
    }

    // Basisabfrage erstellen
    let baseQuery = supabase.from("market_listings").select("*", { count: "exact" }).eq("status", "sold")

    // Suchfilter anwenden, wenn vorhanden
    if (searchTerm) {
      if (searchTerm.includes("@")) {
        // Benutzersuche (Verkäufer oder Käufer)
        console.log("Searching for users:", searchTerm)
        baseQuery = baseQuery.or(`seller_id.ilike.%${searchTerm}%,buyer_id.ilike.%${searchTerm}%`)
      } else if (matchingCardIds.length > 0) {
        // Kartensuche
        console.log("Filtering by matching card IDs")
        baseQuery = baseQuery.in("card_id", matchingCardIds)
      }
    }

    // Zähle die Gesamtanzahl der gefilterten Verkäufe
    const { count, error: countError } = await baseQuery

    if (countError) {
      console.error("Error counting recent sales:", countError)
      return { success: false, error: "Failed to count recent sales" }
    }

    console.log(`Total matching sales: ${count}`)

    // Hole die paginierten Verkäufe
    let query = supabase.from("market_listings").select("*").eq("status", "sold").order("sold_at", { ascending: false })

    // Wende die gleichen Suchfilter an
    if (searchTerm) {
      if (searchTerm.includes("@")) {
        query = query.or(`seller_id.ilike.%${searchTerm}%,buyer_id.ilike.%${searchTerm}%`)
      } else if (matchingCardIds.length > 0) {
        query = query.in("card_id", matchingCardIds)
      }
    }

    // Pagination anwenden
    const { data: sales, error } = await query.range(offset, offset + pageSize - 1)

    if (error) {
      console.error("Error fetching recent sales:", error)
      return { success: false, error: "Failed to fetch recent sales" }
    }

    console.log(`Fetched ${sales?.length || 0} sales for page ${page}`)

    if (!sales || sales.length === 0) {
      console.log("No sales found for this page")
      return {
        success: true,
        sales: [],
        pagination: {
          total: count || 0,
          page,
          pageSize,
          totalPages: Math.ceil((count || 0) / pageSize) || 1,
        },
      }
    }

    // Hole die Kartendetails effizient
    const cardIds = [...new Set(sales.map((sale: any) => sale.card_id))]
    console.log(`Fetching details for ${cardIds.length} unique cards`)

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    console.log(`Fetched details for ${cards?.length || 0} cards`)

    // Erstelle eine Map für effiziente Lookups
    const cardMap = new Map()
    cards?.forEach((card: Card) => {
      cardMap.set(card.id, card)
    })

    // Kombiniere die Daten
    const salesWithDetails = sales.map((sale: any) => {
      const card = cardMap.get(sale.card_id)
      return {
        ...sale,
        card,
      }
    })

    console.log("=== GET RECENT SALES COMPLETE ===")

    return {
      success: true,
      sales: salesWithDetails,
      pagination: {
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize) || 1,
      },
    }
  } catch (error) {
    console.error("Error in getRecentSales:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}