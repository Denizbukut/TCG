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
  seller_wallet_address: string
  card_id: string
  price: number
  created_at: string
  status: "active" | "sold" | "cancelled" | "blocked"
  buyer_wallet_address?: string
  sold_at?: string
  user_card_id: number | string
  card_level: number
  seller_world_id?: string
  blocked_at?: string
}

type Card = {
  id: string
  name: string
  character: string
  image_url?: string
  rarity: "common" | "rare" | "epic" | "legendary" | "goat" // | "wbc" // Commented out
  creator_address?: string
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
    
    // Entferne abgelaufene Blocks vor dem Laden der Listings
    await unblockExpiredListings()

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

    // Build the base query for fetching (include blocked for display)
    let baseQuery = supabase.from("market_listings").select("*, seller_world_id").in("status", ["active", "blocked"])

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
        baseQuery = baseQuery.ilike("seller_wallet_address", `%${searchTerm}%`)
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

    // Get total count with a separate query (include blocked for display)
    const countQuery = supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .in("status", ["active", "blocked"])

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
        countQuery.ilike("seller_wallet_address", `%${searchTerm}%`)
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
    const sellerIds = [...new Set(listings.map((listing: MarketListing) => listing.seller_wallet_address))]

    // 2. Fetch card details in a single query
    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity, creator_address")
      .in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // 3. Fetch seller details in a single query
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("username, world_id, wallet_address")
      .in("wallet_address", sellerIds)

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
    users?.forEach((user: { username: string; world_id: string; wallet_address: string }) => {
      userMap.set(user.wallet_address, user)
    })

    // 5. Apply rarity filter if needed (now that we have card data)
    // This is no longer needed as we filter at the database level
    const filteredListings = listings

    // 6. Combine the data
    const listingsWithDetails = filteredListings.map((listing: MarketListing) => {
      const card = cardMap.get(listing.card_id)
      const seller = userMap.get(listing.seller_wallet_address)

      return {
        ...listing,
        card,
        seller_username: seller?.username || listing.seller_wallet_address,
        seller_world_id: listing.seller_world_id || seller?.world_id,
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
export async function getUserListings(walletAddress: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  try {
    const supabase = createSupabaseServer()
    const offset = (page - 1) * pageSize

    // Count total user listings with a separate query
    const { count, error: countError } = await supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .eq("seller_wallet_address", walletAddress)
      .eq("status", "active")

    if (countError) {
      console.error("Error counting user listings:", countError)
      return { success: false, error: "Failed to count your listings" }
    }

    // Fetch paginated listings
    const { data: listings, error } = await supabase
      .from("market_listings")
      .select("*")
      .eq("seller_wallet_address", walletAddress)
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

    // Efficiently fetch card details and user details
    const cardIds = [...new Set(listings.map((listing: MarketListing) => listing.card_id))]

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    // Fetch user details
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("username, world_id")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      console.error("Error fetching user details:", userError)
      return { success: false, error: "Failed to fetch user details" }
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
        seller_username: userData?.username || walletAddress,
        seller_world_id: userData?.world_id,
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
export async function checkUserListingLimit(walletAddress: string) {
  try {
    const supabase = createSupabaseServer()

    // Zähle die aktiven Listings des Benutzers
    const { count, error } = await supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .eq("seller_wallet_address", walletAddress)
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

// Ändere die createListing-Funktion, um mit wallet_address zu arbeiten
export async function createListing(
  walletAddress: string,
  userCardId: number | string,
  cardId: string,
  price: number,
  cardLevel: number,
) {
  try {
    // Detailliertes Logging für Debugging
    console.log("=== CREATE LISTING START ===")
    console.log("Parameters:", { walletAddress, userCardId, cardId, price, cardLevel })

    const supabase = createSupabaseServer()

    // Überprüfe zuerst, ob der Benutzer das Limit erreicht hat
    const { count, error: countError } = await supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .eq("seller_wallet_address", walletAddress)
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
      .eq("wallet_address", walletAddress)
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

    // Hole die Benutzerinformationen (walletAddress ist bereits die ID)
    console.log("Fetching user data for:", walletAddress)
    const { data: initialUserData, error: userError } = await supabase
      .from("users")
      .select("world_id")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      console.error("Error fetching user:", userError)
      return { success: false, error: "User not found: " + userError.message }
    }

    if (!initialUserData) {
      console.error("User data is null for walletAddress:", walletAddress)
      return { success: false, error: "User not found in database" }
    }

    console.log("User data:", initialUserData)
    const worldId = initialUserData.world_id || null
    console.log("World ID for listing:", worldId) 

    // Überprüfe, ob der Benutzer die Karte besitzt
    console.log("Checking if user owns card:", { userCardId, walletAddress })
    const { data: userCard, error: userCardError } = await supabase
      .from("user_card_instances")
      .select("id, level")
      .eq("id", userCardId)
      .eq("wallet_address", walletAddress)
      .maybeSingle()

    if (userCardError) {
      console.error("Error checking user card:", userCardError)
      return { success: false, error: "Error checking if you own this card. Please refresh and try again." }
    }

    if (!userCard) {
      console.error("User card not found:", { userCardId, walletAddress })
      return { success: false, error: "This card is no longer in your collection. Please refresh the page." }
    }

    console.log("User card data:", userCard)

    // user_card_instances hat keine quantity Spalte - jede Instanz ist eine Karte

    // Überprüfe, ob der Benutzer bereits eine Karte dieser Art (unabhängig vom Level) zum Verkauf anbietet
    console.log("Checking if user has already listed this card type:", { cardId, walletAddress })
    const { data: existingListings, error: existingListingsError } = await supabase
      .from("market_listings")
      .select("id, card_level")
      .eq("card_id", cardId)
      .eq("seller_wallet_address", walletAddress)
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

    // Mindestpreis wird mit dem Level multipliziert
    minUsdPrice = minUsdPrice * cardLevel

    const minWldPrice = priceUsdPerWLD ? minUsdPrice / priceUsdPerWLD : minUsdPrice
    // Round down to 2 decimal places to match what users see in the UI
    const minWldPriceRounded = Math.floor(minWldPrice * 100) / 100

    // Compare with rounded minimum price
    if (price < minWldPriceRounded) {
      let cardType = "cards"
      cardType = cardDetails.rarity === "legendary" ? "Legendary" : 
                cardDetails.rarity === "epic" ? "Epic" : 
                cardDetails.rarity === "rare" ? "Rare" : 
                cardDetails.rarity === "common" ? "Common" : "cards"
      
      return {
        success: false,
        error: `${cardType} Level ${cardLevel} cards must be listed for at least $${minUsdPrice.toFixed(2)} (~${minWldPriceRounded.toFixed(2)} WLD)`
      }
    }

    // Erstelle das Listing ZUERST
    console.log("Creating listing with data:", {
      seller_wallet_address: walletAddress, // Verwende wallet_address als seller_wallet_address
      seller_world_id: worldId,
      card_id: cardId,
      price: price,
      priceType: typeof price,
      user_card_id: userCardId,
      card_level: cardLevel || userCard.level,
    })
    console.log("World ID being saved:", worldId, "Type:", typeof worldId)

    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .insert({
        seller_wallet_address: walletAddress, // Verwende wallet_address als seller_wallet_address
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
    console.log("Price in created listing:", listing.price, "Type:", typeof listing.price)
    console.log("Seller world ID in created listing:", listing.seller_world_id)

    // Entferne die Karte aus der Collection (wird beim Kauf übertragen oder beim Cancel zurückgegeben)
    console.log("Removing card from seller collection:", { userCardId, walletAddress })
    const { error: deleteCardError } = await supabase
      .from("user_card_instances")
      .delete()
      .eq("id", userCardId)
      .eq("wallet_address", walletAddress)

    if (deleteCardError) {
      console.error("Error removing card from collection:", deleteCardError)
      // Rollback: Lösche das gerade erstellte Listing
      await supabase.from("market_listings").delete().eq("id", listing.id)
      return { success: false, error: "Failed to remove card from collection" }
    }

    console.log("Card removed from collection successfully")

    // JETZT Score reduzieren (nach erfolgreichem Listing)
    const scoreForCard = getScoreForRarity(cardDetails.rarity as CardRarity)
    const { data: scoreUserData, error: userScoreError } = await supabase
      .from("users")
      .select("score")
      .eq("wallet_address", walletAddress)
      .single()

    if (userScoreError) {
      console.error("Error fetching user score:", userScoreError)
      // Nicht kritisch - Listing ist bereits erstellt
    } else {
      const currentScore = scoreUserData.score || 0
      const newScore = Math.max(0, currentScore - scoreForCard)
      
      console.log(`Deducting score for listing: ${walletAddress}: ${currentScore} -> ${newScore} (-${scoreForCard} points)`)

      const { error: updateScoreError } = await supabase
        .from("users")
        .update({ score: newScore })
        .eq("wallet_address", walletAddress)

      if (updateScoreError) {
        console.error("Error updating score for listing:", updateScoreError)
        // Nicht kritisch - Listing ist bereits erstellt
      }
    }

    console.log("=== CREATE LISTING COMPLETE ===")

    // Nur Trade-Seite neu laden, Collection wird über onSuccess callback aktualisiert
    revalidatePath("/trade")
    revalidatePath("/collection")
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
/**
 * Entfernt abgelaufene Blocks (älter als 1 Minute) automatisch
 */
export async function unblockExpiredListings() {
  try {
    const supabase = createSupabaseServer()
    const twentySecondsAgo = new Date(Date.now() - 20000).toISOString() // 20 Sekunden

    console.log("🔓 Checking for expired blocks older than:", twentySecondsAgo)

    // NUR abgelaufene Blocks freigeben (älter als 20 Sekunden)
    const { data: expiredBlockedListings, error: fetchError } = await supabase
      .from("market_listings")
      .select("id, blocked_at, status")
      .eq("status", "blocked")
      .lt("blocked_at", twentySecondsAgo) // Nur älter als 20 Sekunden

    if (fetchError) {
      console.error("Error fetching expired blocked listings:", fetchError)
      return
    }

    if (expiredBlockedListings && expiredBlockedListings.length > 0) {
      console.log("🔓 Found", expiredBlockedListings.length, "expired blocked listings - unblocking...")

    const { error } = await supabase
      .from("market_listings")
      .update({ 
        status: "active", 
        blocked_at: null 
      })
      .eq("status", "blocked")
        .lt("blocked_at", twentySecondsAgo)

    if (error) {
      console.error("Error unblocking expired listings:", error)
    } else {
        console.log("🔓 Successfully unblocked", expiredBlockedListings.length, "expired blocked listings!")
      }
    } else {
      console.log("🔓 No expired blocked listings found")
    }
  } catch (error) {
    console.error("Error in unblockExpiredListings:", error)
  }
}

/**
 * Blockiert eine Karte für 1 Minute um gleichzeitige Käufe zu verhindern
 */
export async function blockListingForPurchase(listingId: string) {
  try {
    console.log("blockListingForPurchase called with listingId:", listingId)
    const supabase = createSupabaseServer()

    // Bereinige abgelaufene Blocks zuerst
    await unblockExpiredListings()

    // Prüfe ob die Karte noch verfügbar ist
    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .select("*")
      .eq("id", listingId)
      .single()

    console.log("Listing query result (all statuses):", { listing, listingError })

    if (listingError || !listing) {
      console.error("Listing not found:", { listingId, error: listingError })
      return { success: false, error: "Listing not found" }
    }

    console.log("Listing status:", listing.status)

    if (listing.status !== "active") {
      console.error("Listing not active:", { listingId, status: listing.status })
      return { success: false, error: `Card is not available (status: ${listing.status})` }
    }

    // Prüfe ob die Karte bereits blockiert ist
    console.log("🔍 Checking if listing is already blocked...")
    const { data: blockedListing, error: blockedError } = await supabase
      .from("market_listings")
      .select("*")
      .eq("id", listingId)
      .eq("status", "blocked")
      .single()

    console.log("🔍 Blocked listing check result:", { blockedListing, blockedError })

    if (blockedListing && !blockedError) {
      console.log("🔍 Found blocked listing:", {
        id: blockedListing.id,
        status: blockedListing.status,
        blocked_at: blockedListing.blocked_at,
        seller: blockedListing.seller_wallet_address
      })
      
      // Prüfe ob der Block älter als 30 Sekunden ist
      const blockedAt = new Date(blockedListing.blocked_at)
      const now = new Date()
      const timeDiff = now.getTime() - blockedAt.getTime()
      
      console.log("🔍 Block timing:", {
        blockedAt: blockedAt.toISOString(),
        now: now.toISOString(),
        timeDiffMs: timeDiff,
        timeDiffSeconds: Math.floor(timeDiff / 1000)
      })
      
      if (timeDiff < 30000) { // 30 Sekunden = 30000ms
        const remainingTime = Math.ceil((30000 - timeDiff) / 1000)
        console.log("🔍 Block is still valid, remaining time:", remainingTime, "seconds")
        return { 
          success: false, 
          error: `Card is currently being purchased by another user. Please wait ${remainingTime} seconds.` 
        }
      } else {
        console.log("🔍 Block is expired, will be cleared")
      }
    }

    // Blockiere die Karte
    console.log("Attempting to block listing with status 'blocked'")
    
    // Blockiere die Karte mit blocked_at timestamp
    console.log("Attempting to block listing with timestamp:", {
      listingId,
      currentStatus: listing.status,
      updateData: {
        status: "blocked",
        blocked_at: new Date().toISOString()
      }
    })
    
    const { data: updateResult, error: blockError } = await supabase
      .from("market_listings")
      .update({
        status: "blocked",
        blocked_at: new Date().toISOString()
      })
      .eq("id", listingId)
      .eq("status", "active")
      .select()

    console.log("Block update result:", { 
      updateResult, 
      blockError,
      errorMessage: blockError?.message,
      errorCode: blockError?.code,
      errorDetails: blockError?.details
    })

    if (blockError) {
      console.error("Failed to block listing - detailed error:", {
        message: blockError.message,
        code: blockError.code,
        details: blockError.details,
        hint: blockError.hint
      })
      return { success: false, error: `Failed to reserve card: ${blockError.message}` }
    }

    if (!updateResult || updateResult.length === 0) {
      console.error("No rows updated - listing might have changed status")
      return { success: false, error: "Card status changed, please try again" }
    }

    console.log("Successfully blocked listing:", listingId)
    return { success: true, message: "Card reserved for purchase" }
  } catch (error) {
    console.error("Error blocking listing:", error)
    return { success: false, error: "An unexpected error occurred while reserving the card" }
  }
}

export async function purchaseCard(walletAddress: string, listingId: string) {
  try {
    const supabase = createSupabaseServer()

    // Bereinige abgelaufene Blocks zuerst
    await unblockExpiredListings()

    // Vereinfachte parallele Abfragen
    const [buyerResult, listingResult] = await Promise.all([
      // Käuferdaten
      supabase
        .from("users")
        .select("coins, score")
        .eq("wallet_address", walletAddress)
        .single(),
      
      // Listing
      supabase
        .from("market_listings")
        .select("*")
        .eq("id", listingId)
        .in("status", ["active", "blocked"])
        .single()
    ])

    const { data: buyerData, error: buyerError } = buyerResult
    const { data: listing, error: listingError } = listingResult

    if (buyerError || !buyerData) {
      return { success: false, error: "Buyer not found" }
    }

    if (listingError || !listing) {
      console.error("Listing not found:", { listingId, error: listingError })
      return { success: false, error: "Listing not found or already sold" }
    }

    // Selbstkauf verhindern
    if (listing.seller_wallet_address === walletAddress) {
      return { success: false, error: "You cannot buy your own card" }
    }

    // Card-Details mit korrekter card_id holen (inkl. creator_address und contract_address)
    const { data: cardDetails, error: cardError } = await supabase
      .from("cards")
      .select("rarity, creator_address, contract_address")
      .eq("id", listing.card_id)
      .single()

    if (cardError || !cardDetails) {
      return { success: false, error: "Failed to fetch card details" }
    }

    const scoreForCard = getScoreForRarity(cardDetails.rarity)

    // Calculate revenue split
    const { getMarketRevenueSplit, calculateDevMarketRevenue, calculateCreatorMarketRevenue } = await import("@/lib/creator-revenue")
    const revenueSplit = getMarketRevenueSplit(cardDetails.rarity as any)
    
    const sellerRevenue = listing.price * revenueSplit.sellerShare
    const devRevenue = calculateDevMarketRevenue(listing.price, cardDetails.rarity as any)
    const creatorRevenue = cardDetails.creator_address 
      ? calculateCreatorMarketRevenue(listing.price, cardDetails.rarity as any)
      : devRevenue // If no creator, dev gets the creator's share too
    
    console.log(`Calculating marketplace revenue for purchase:`, {
      listingId,
      price: listing.price,
      rarity: cardDetails.rarity,
      sellerRevenue,
      devRevenue,
      creatorRevenue,
      creatorAddress: cardDetails.creator_address || 'none'
    })

    // Verkäuferdaten parallel holen
    const { data: sellerData, error: sellerError } = await supabase
      .from("users")
      .select("score, cards_sold_since_last_purchase")
      .eq("wallet_address", listing.seller_wallet_address)
      .single()

    if (sellerError || !sellerData) {
      return { success: false, error: "Failed to fetch seller data" }
    }

    const sellerScore = sellerData?.score ?? 0
    const buyerScore = buyerData?.score ?? 0
    const currentSoldCount = sellerData.cards_sold_since_last_purchase ?? 0
    const newSoldCount = currentSoldCount + 1

    // Vereinfachte sequenzielle Updates für Stabilität
    const currentTime = new Date().toISOString()
    
    // 1. Käufer cards_sold_since_last_purchase auf 0 setzen
    await supabase
      .from("users")
      .update({ cards_sold_since_last_purchase: 0 })
      .eq("wallet_address", walletAddress)
    
    // 2. Verkäufer Score reduzieren
    await supabase
      .from("users")
      .update({ score: Math.max(0, sellerScore - scoreForCard) })
      .eq("wallet_address", listing.seller_wallet_address)
    
    // 3. Käufer Score erhöhen
    await supabase
      .from("users")
      .update({ score: buyerScore + scoreForCard })
      .eq("wallet_address", walletAddress)
    
    // 4. Verkäufer Zähler hochzählen
    await supabase
      .from("users")
      .update({ cards_sold_since_last_purchase: newSoldCount })
      .eq("wallet_address", listing.seller_wallet_address)
    
    // 5. Neue Karteninstanz für den Käufer erstellen
    const { data: newCard, error: createError } = await supabase
      .from("user_card_instances")
      .insert({
        wallet_address: walletAddress,
        card_id: listing.card_id,
        level: listing.card_level || 1,
        favorite: false,
        obtained_at: currentTime.split("T")[0],
      })
      .select()
      .single()

    if (createError || !newCard) {
      console.error("Failed to create new card instance:", createError)
      return { success: false, error: "Failed to create card instance for buyer" }
    }
    
    // 6. Listing als verkauft markieren
    const { data: updateResult, error: updateListingError } = await supabase
      .from("market_listings")
      .update({
        status: "sold",
        buyer_wallet_address: walletAddress,
        sold_at: currentTime,
      })
      .eq("id", listingId)
      .in("status", ["active", "blocked"])
      .select()

    if (updateListingError) {
      console.error("Failed to update listing status:", updateListingError)
      return { success: false, error: "Failed to update listing status" }
    }

    if (!updateResult || updateResult.length === 0) {
      console.error("No rows updated - card was already sold by another user")
      return { success: false, error: "Card was already purchased by another user" }
    }
    
    // 7. Update seller's coins (seller gets 90%)
    const { data: currentSeller } = await supabase
      .from("users")
      .select("coins")
      .eq("wallet_address", listing.seller_wallet_address)
      .single()
    
    if (currentSeller) {
      await supabase
        .from("users")
        .update({ coins: (currentSeller.coins || 0) + sellerRevenue })
        .eq("wallet_address", listing.seller_wallet_address)
    }
    
    // 8. Update creator's coins if card has creator
    try {
      if (cardDetails.creator_address) {
        const { data: currentCreator, error: creatorLookupError } = await supabase
          .from("users")
          .select("coins")
          .eq("wallet_address", cardDetails.creator_address.toLowerCase())
          .single()
        
        if (creatorLookupError) {
          console.error("Error fetching creator data:", creatorLookupError)
        }
        
        if (currentCreator) {
          const { error: updateError } = await supabase
            .from("users")
            .update({ coins: (currentCreator.coins || 0) + creatorRevenue })
            .eq("wallet_address", cardDetails.creator_address.toLowerCase())
          
          if (updateError) {
            console.error("Error updating creator coins:", updateError)
          } else {
            console.log(`Successfully paid creator ${creatorRevenue} coins. New total: ${(currentCreator.coins || 0) + creatorRevenue}`)
          }

          // Update card_creations.earned_amount if contract_address exists
          if (cardDetails.contract_address) {
            console.log(`🔍 [Marketplace] Attempting to update earned_amount for card with contract_address: ${cardDetails.contract_address.toLowerCase()}`)
            try {
              const { data: existingCreation, error: fetchError } = await (supabase
                .from("card_creations")
                .select("earned_amount")
                .eq("token_address", cardDetails.contract_address.toLowerCase())
                .single() as any)
              
              console.log(`📊 [Marketplace] Fetch result:`, { existingCreation, fetchError })
              
              if (fetchError && (fetchError as any).code !== "PGRST116") {
                console.error("Error fetching card_creation:", fetchError)
              } else if (existingCreation) {
                const currentEarned = typeof existingCreation.earned_amount === 'number' 
                  ? existingCreation.earned_amount 
                  : parseFloat(existingCreation.earned_amount || '0') || 0
                const newEarnedAmount = Number((currentEarned + creatorRevenue).toFixed(5))
                
                console.log(`💰 [Marketplace] Earned amount calculation:`, {
                  currentEarned,
                  creatorRevenue,
                  newEarnedAmount
                })
                
                const { error: earnedUpdateError } = await (supabase
                  .from("card_creations") as any)
                  .update({ earned_amount: newEarnedAmount })
                  .eq("token_address", cardDetails.contract_address.toLowerCase())
                
                if (earnedUpdateError) {
                  console.error("Error updating earned_amount:", earnedUpdateError)
                } else {
                  console.log(`✅ [Marketplace] Successfully updated earned_amount to ${newEarnedAmount} for card ${cardDetails.contract_address}`)
                }
              } else {
                console.log(`⚠️ [Marketplace] No card_creation found for token_address ${cardDetails.contract_address}`)
              }
            } catch (earnedError) {
              console.error("Error updating earned_amount (non-fatal):", earnedError)
            }
          } else {
            console.log(`⚠️ [Marketplace] Card has no contract_address, skipping earned_amount update`)
          }
        } else {
          console.log("Creator address not found in users table, skipping payment")
        }
      }
    } catch (creatorError) {
      // Don't fail the entire purchase if creator payment fails
      console.error("Error processing creator revenue (non-fatal):", creatorError)
    }
    
    // 8b. Update market_fees with creator and dev split if exists
    const { data: existingFee } = await supabase
      .from("market_fees")
      .select("*")
      .eq("market_listing_id", listingId)
      .single()
    
    if (existingFee) {
      await supabase
        .from("market_fees")
        .update({
          dev_fees: devRevenue,
          creator_fees: cardDetails.creator_address ? creatorRevenue : devRevenue,
        })
        .eq("id", existingFee.id)
    } else {
      // Create fee record if it doesn't exist
      await supabase
        .from("market_fees")
        .insert({
          market_listing_id: listingId,
          fees: devRevenue + (cardDetails.creator_address ? creatorRevenue : devRevenue),
          dev_fees: devRevenue,
          creator_fees: cardDetails.creator_address ? creatorRevenue : devRevenue,
        })
    }
    
    // 9. Trade in der Datenbank speichern
    await supabase.from("trades").insert({
      seller_wallet_address: listing.seller_wallet_address,
      buyer_wallet_address: walletAddress,
      user_card_id: listing.user_card_id,
      card_id: listing.card_id,
      price: listing.price,
      created_at: currentTime,
    })

    // Verkäufer Zähler hochzählen (falls nötig) - NACH dem Hauptkauf
    if (newSoldCount === 3) {
      const { data: activeListings, error: listingsError } = await supabase
        .from("market_listings")
        .select("id")
        .eq("seller_id", listing.seller_id)
        .eq("status", "active")

      if (!listingsError && activeListings?.length > 0) {
        // Parallel alle anderen Listings stornieren
        const cancelPromises = activeListings
          .filter(l => l.id !== listingId)
          .map(l => cancelListing(listing.seller_id, l.id))
        await Promise.all(cancelPromises)
      }
    }

    // Revalidate paths asynchron (nicht blockierend)
    Promise.all([
      revalidatePath("/trade"),
      revalidatePath("/collection")
    ]).catch(console.error)

    return { success: true, message: "Card purchased successfully" }
  } catch (error) {
    console.error("Error in purchaseCard:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}


/**
 * Storniert ein Listing und gibt die Karte zurück
 * ATOMIC TRANSACTION - Alles oder Nichts
 */
export async function cancelListing(walletAddress: string, listingId: string) {
  try {
    const supabase = createSupabaseServer()

    // ✅ ATOMIC TRANSACTION - Alles oder Nichts
    const { error } = await supabase.rpc('cancel_listing_atomic', {
      p_wallet_address: walletAddress,
      p_listing_id: listingId
    })
    
    if (error) {
      console.error("Error in cancelListing atomic transaction:", error)
      return { success: false, error: error.message }
    }
    
    // Revalidate paths after successful cancellation
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
export async function updateListingPrice(walletAddress: string, listingId: string, newPrice: number) {
  try {
    const supabase = createSupabaseServer()

    // Hole das Listing (ohne seller_wallet_address Filter, um bessere Fehlermeldungen zu ermöglichen)
    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .select("*")
      .eq("id", listingId)
      .single()

    if (listingError || !listing) {
      console.error("Error fetching listing:", listingError)
      return { success: false, error: "Listing not found" }
    }

    // Überprüfe, ob das Listing dem Benutzer gehört
    if (listing.seller_wallet_address !== walletAddress) {
      console.error("User does not own this listing")
      return { success: false, error: "You do not have permission to update this listing" }
    }

    // Überprüfe, ob das Listing aktiv ist
    if (listing.status !== "active") {
      console.error("Listing is not active, status:", listing.status)
      return { success: false, error: "Listing is not active or already sold" }
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

    // Mindestpreis wird mit dem Level multipliziert
    minUsdPrice = minUsdPrice * listing.card_level

    const minWldPrice = priceUsdPerWLD ? minUsdPrice / priceUsdPerWLD : minUsdPrice
    // Round down to 2 decimal places to match what users see in the UI
    const minWldPriceRounded = Math.floor(minWldPrice * 100) / 100

    // Compare with rounded minimum price
    if (newPrice < minWldPriceRounded) {
      let cardType = "cards"
      cardType = cardDetails.rarity === "legendary" ? "Legendary" : 
                cardDetails.rarity === "epic" ? "Epic" : 
                cardDetails.rarity === "rare" ? "Rare" : 
                cardDetails.rarity === "common" ? "Common" : "cards"
      
      return {
        success: false,
        error: `${cardType} Level ${listing.card_level} cards must be listed for at least $${minUsdPrice.toFixed(2)} (~${minWldPriceRounded.toFixed(2)} WLD)`
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
export async function getTransactionHistory(walletAddress: string, page = 1, pageSize = DEFAULT_PAGE_SIZE) {
  try {
    const supabase = createSupabaseServer()
    const offset = (page - 1) * pageSize

    // Count total transactions with a separate query
    const { count, error: countError } = await supabase
      .from("market_listings")
      .select("*", { count: "exact", head: true })
      .or(`seller_wallet_address.eq.${walletAddress},buyer_wallet_address.eq.${walletAddress}`)
      .eq("status", "sold")

    if (countError) {
      console.error("Error counting transactions:", countError)
      return { success: false, error: "Failed to count your transactions" }
    }

    // Fetch paginated transactions
    const { data: listings, error } = await supabase
      .from("market_listings")
      .select("*")
      .or(`seller_wallet_address.eq.${walletAddress},buyer_wallet_address.eq.${walletAddress}`)
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

    // Efficiently fetch card details and user details
    const cardIds = [...new Set(listings.map((listing: MarketListing) => listing.card_id))]
    const sellerIds = [...new Set(listings.map((listing: MarketListing) => listing.seller_wallet_address))]
    const buyerIds = [...new Set(listings.map((listing: MarketListing) => listing.buyer_wallet_address).filter(Boolean))]
    
    // Alle eindeutigen Wallet-Adressen sammeln (Verkäufer und Käufer)
    const allWalletAddresses = [...new Set([...sellerIds, ...buyerIds])]

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("username, world_id, wallet_address")
      .in("wallet_address", allWalletAddresses)

    if (usersError) {
      console.error("Error fetching user details:", usersError)
      return { success: false, error: "Failed to fetch user details" }
    }

    // Create maps for efficient lookups
    const cardMap = new Map()
    cards?.forEach((card: Card) => {
      cardMap.set(card.id, card)
    })

    const userMap = new Map()
    users?.forEach((user: { username: string; world_id: string; wallet_address: string }) => {
      userMap.set(user.wallet_address, user)
    })

    // Combine the data
    const transactionsWithDetails = listings.map((listing: MarketListing) => {
      const card = cardMap.get(listing.card_id)
      const seller = userMap.get(listing.seller_wallet_address)
      const buyer = userMap.get(listing.buyer_wallet_address)
      const isSeller = listing.seller_wallet_address === walletAddress

      return {
        ...listing,
        card,
        transaction_type: isSeller ? "sold" : "purchased",
        other_party: isSeller ? listing.buyer_wallet_address : listing.seller_wallet_address,
        other_party_username: isSeller 
          ? (buyer?.username || listing.buyer_wallet_address) 
          : (seller?.username || listing.seller_wallet_address),
        seller_username: seller?.username || listing.seller_wallet_address,
        seller_world_id: seller?.world_id,
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
        baseQuery = baseQuery.or(`seller_wallet_address.ilike.%${searchTerm}%,buyer_wallet_address.ilike.%${searchTerm}%`)
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
        query = query.or(`seller_wallet_address.ilike.%${searchTerm}%,buyer_wallet_address.ilike.%${searchTerm}%`)
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

    // Hole die Kartendetails und Benutzerdetails (Seller + Buyer) effizient
    const cardIds = [...new Set(sales.map((sale: any) => sale.card_id))]
    const sellerIds = [...new Set(sales.map((sale: any) => sale.seller_wallet_address))]
    const buyerIds = [...new Set(sales.map((sale: any) => sale.buyer_wallet_address).filter(Boolean))]
    
    // Kombiniere alle Benutzer-IDs (Seller + Buyer)
    const allUserIds = [...new Set([...sellerIds, ...buyerIds])]
    console.log(`Fetching details for ${cardIds.length} unique cards and ${allUserIds.length} unique users (sellers + buyers)`)

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .in("id", cardIds)

    if (cardsError) {
      console.error("Error fetching card details:", cardsError)
      return { success: false, error: "Failed to fetch card details" }
    }

    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("username, world_id, wallet_address")
      .in("wallet_address", allUserIds)

    if (usersError) {
      console.error("Error fetching user details:", usersError)
      return { success: false, error: "Failed to fetch user details" }
    }

    console.log(`Fetched details for ${cards?.length || 0} cards and ${users?.length || 0} users`)

    // Erstelle Maps für effiziente Lookups
    const cardMap = new Map()
    cards?.forEach((card: Card) => {
      cardMap.set(card.id, card)
    })

    const userMap = new Map()
    users?.forEach((user: { username: string; world_id: string; wallet_address: string }) => {
      userMap.set(user.wallet_address, user)
    })

    // Kombiniere die Daten
    const salesWithDetails = sales.map((sale: any) => {
      const card = cardMap.get(sale.card_id)
      const seller = userMap.get(sale.seller_wallet_address)
      const buyer = userMap.get(sale.buyer_wallet_address)
      return {
        ...sale,
        card,
        seller_username: seller?.username || sale.seller_wallet_address,
        seller_world_id: seller?.world_id,
        buyer_username: buyer?.username || sale.buyer_wallet_address,
        buyer_world_id: buyer?.world_id,
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