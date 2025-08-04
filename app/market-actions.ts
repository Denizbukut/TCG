"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@supabase/supabase-js"

function createSupabaseServer() {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        persistSession: false,
      },
    }
  )
}

export async function listCardForSale(userId: string, cardId: string, price: number) {
  try {
    const supabase = createSupabaseServer()

    // Check if user owns the card
    const { data: userCard, error: userCardError } = await supabase
      .from("user_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("card_id", cardId)
      .single()

    if (userCardError || !userCard) {
      console.error("Error checking user card:", userCardError)
      return { success: false, error: "You don't own this card" }
    }

    if (userCard.quantity < 1) {
      return { success: false, error: "You don't have enough copies of this card" }
    }

    // Hole die Karten-Details für die Preisvalidierung
    const { data: cardDetails, error: cardDetailsError } = await supabase
      .from("cards")
      .select("rarity, overall_rating")
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

    // Preisvalidierung basierend auf Rating und Rarity (USD umgerechnet zu WLD)
    let minUsdPrice = 0.15 // Standard-Mindestpreis
    
    // Rating-basierte Preise (höhere Priorität als Rarity)
    if (cardDetails.overall_rating >= 91) {
      minUsdPrice = 3.5
    } else if (cardDetails.overall_rating >= 90) {
      minUsdPrice = 2.5
    } else if (cardDetails.overall_rating >= 89) {
      minUsdPrice = 2.0
    } else if (cardDetails.overall_rating >= 88) {
      minUsdPrice = 1.5
    } else if (cardDetails.overall_rating >= 87) {
      minUsdPrice = 0.75
    } else if (cardDetails.overall_rating >= 86) {
      minUsdPrice = 0.65
    } else if (cardDetails.overall_rating >= 85) {
      minUsdPrice = 0.55
    } else {
      // Rarity-basierte Preise (nur wenn Rating niedriger ist)
      if (cardDetails.rarity === "ultimate") {
        minUsdPrice = 1.5
      } else if (cardDetails.rarity === "legendary") {
        minUsdPrice = 1.0
      } else if (cardDetails.rarity === "elite") {
        minUsdPrice = 0.5
      }
    }

    const minWldPrice = priceUsdPerWLD ? minUsdPrice / priceUsdPerWLD : minUsdPrice

    if (price < minWldPrice) {
      let cardType = "cards"
      if (cardDetails.overall_rating >= 91) {
        cardType = `Rating ${cardDetails.overall_rating} cards`
      } else if (cardDetails.overall_rating >= 90) {
        cardType = `Rating ${cardDetails.overall_rating} cards`
      } else if (cardDetails.overall_rating >= 89) {
        cardType = `Rating ${cardDetails.overall_rating} cards`
      } else if (cardDetails.overall_rating >= 88) {
        cardType = `Rating ${cardDetails.overall_rating} cards`
      } else if (cardDetails.overall_rating >= 87) {
        cardType = `Rating ${cardDetails.overall_rating} cards`
      } else if (cardDetails.overall_rating >= 86) {
        cardType = `Rating ${cardDetails.overall_rating} cards`
      } else if (cardDetails.overall_rating >= 85) {
        cardType = `Rating ${cardDetails.overall_rating} cards`
      } else {
        cardType = cardDetails.rarity === "ultimate" ? "Ultimate" : 
                  cardDetails.rarity === "legendary" ? "Legendary" : 
                  cardDetails.rarity === "elite" ? "Elite" : "cards"
      }
      
      return {
        success: false,
        error: `${cardType} must be listed for at least ${minWldPrice.toFixed(3)} WLD ($${minUsdPrice.toFixed(2)})`
      }
    }

    // Check if card is already listed
    const { data: existingListing, error: listingError } = await supabase
      .from("market_listings")
      .select("*")
      .eq("seller_id", userId)
      .eq("card_id", cardId)
      .eq("status", "active")
      .maybeSingle()

    if (existingListing) {
      return { success: false, error: "You already have this card listed for sale" }
    }

    // Create market listing
    const { data: listing, error: createError } = await supabase
      .from("market_listings")
      .insert({
        seller_id: userId,
        card_id: cardId,
        price,
      })
      .select()
      .single()

    if (createError) {
      console.error("Error creating listing:", createError)
      return { success: false, error: "Failed to create listing" }
    }

    revalidatePath("/trades")
    return { success: true, listing }
  } catch (error) {
    console.error("Error listing card:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function cancelListing(userId: string, listingId: string) {
  try {
    const supabase = createSupabaseServer()

    // Check if listing exists and belongs to user
    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .select("*")
      .eq("id", listingId)
      .eq("seller_id", userId)
      .eq("status", "active")
      .single()

    if (listingError || !listing) {
      return { success: false, error: "Listing not found" }
    }

    // Update listing status
    const { error: updateError } = await supabase
      .from("market_listings")
      .update({ status: "cancelled" })
      .eq("id", listingId)

    if (updateError) {
      console.error("Error cancelling listing:", updateError)
      return { success: false, error: "Failed to cancel listing" }
    }

    revalidatePath("/trades")
    return { success: true }
  } catch (error) {
    console.error("Error cancelling listing:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function buyCard(userId: string, listingId: string) {
  try {
    const supabase = createSupabaseServer()

    // Get the listing
    const { data: listing, error: listingError } = await supabase
      .from("market_listings")
      .select("*, cards(*)")
      .eq("id", listingId)
      .eq("status", "active")
      .single()

    if (listingError || !listing) {
      return { success: false, error: "Listing not found" }
    }

    // Check if user is trying to buy their own card
    if (listing.seller_id === userId) {
      return { success: false, error: "You cannot buy your own card" }
    }

    // Get buyer's coins
    const { data: buyer, error: buyerError } = await supabase.from("users").select("coins").eq("id", userId).single()

    if (buyerError || !buyer) {
      return { success: false, error: "Buyer not found" }
    }

    // Check if buyer has enough coins
    if (buyer.coins < listing.price) {
      return { success: false, error: "You don't have enough coins" }
    }

    // Start transaction
    // 1. Update listing status
    const { error: updateListingError } = await supabase
      .from("market_listings")
      .update({
        status: "sold",
        buyer_id: userId,
        sold_at: new Date().toISOString(),
      })
      .eq("id", listingId)

    if (updateListingError) {
      console.error("Error updating listing:", updateListingError)
      return { success: false, error: "Failed to update listing" }
    }

    // 2. Transfer coins from buyer to seller
    const { error: updateBuyerError } = await supabase
      .from("users")
      .update({ coins: buyer.coins - listing.price })
      .eq("id", userId)

    if (updateBuyerError) {
      console.error("Error updating buyer:", updateBuyerError)
      return { success: false, error: "Failed to update buyer" }
    }

    const { data: seller, error: sellerError } = await supabase
      .from("users")
      .select("coins")
      .eq("id", listing.seller_id)
      .single()

    if (!sellerError && seller) {
      await supabase
        .from("users")
        .update({ coins: seller.coins + listing.price })
        .eq("id", listing.seller_id)
    }

    // 3. Transfer card from seller to buyer
    // Check if buyer already has this card
    const { data: existingCard, error: existingCardError } = await supabase
      .from("user_cards")
      .select("*")
      .eq("user_id", userId)
      .eq("card_id", listing.card_id)
      .maybeSingle()

    if (existingCard) {
      // Increment quantity
      await supabase
        .from("user_cards")
        .update({ quantity: existingCard.quantity + 1 })
        .eq("id", existingCard.id)
    } else {
      // Add new card to buyer's collection
      await supabase.from("user_cards").insert({
        user_id: userId,
        card_id: listing.card_id,
        quantity: 1,
      })
    }

    // 4. Decrement seller's card quantity
    const { data: sellerCard, error: sellerCardError } = await supabase
      .from("user_cards")
      .select("*")
      .eq("user_id", listing.seller_id)
      .eq("card_id", listing.card_id)
      .single()

    if (!sellerCardError && sellerCard) {
      if (sellerCard.quantity > 1) {
        await supabase
          .from("user_cards")
          .update({ quantity: sellerCard.quantity - 1 })
          .eq("id", sellerCard.id)
      } else {
        await supabase.from("user_cards").delete().eq("id", sellerCard.id)
      }
    }

    revalidatePath("/trades")
    revalidatePath("/collection")
    return {
      success: true,
      card: listing.cards,
      price: listing.price,
    }
  } catch (error) {
    console.error("Error buying card:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function getMarketListings() {
  try {
    const supabase = createSupabaseServer()

    const { data: listings, error } = await supabase
      .from("market_listings")
      .select(`
        *,
        cards(*)
      `)
      .eq("status", "active")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching listings:", error)
      return { success: false, error: "Failed to fetch listings" }
    }

    // Fetch seller usernames separately
    if (listings && listings.length > 0) {
      const sellerIds = [...new Set(listings.map((listing) => listing.seller_id))]

      const { data: sellers, error: sellersError } = await supabase
        .from("users")
        .select("id, username")
        .in("id", sellerIds)

      if (!sellersError && sellers) {
        // Create a map of seller IDs to usernames
        const sellerMap = sellers.reduce((map, seller) => {
          map[seller.id] = seller.username
          return map
        }, {})

        // Add seller username to each listing
        listings.forEach((listing) => {
          listing.seller = { username: sellerMap[listing.seller_id] || "Unknown User" }
        })
      }
    }

    return { success: true, listings }
  } catch (error) {
    console.error("Error fetching listings:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function getUserListings(userId: string) {
  try {
    const supabase = createSupabaseServer()

    const { data: listings, error } = await supabase
      .from("market_listings")
      .select(`
        *,
        cards(*)
      `)
      .eq("seller_id", userId)
      .eq("status", "active")
      .order("created_at", { ascending: false })

    if (error) {
      console.error("Error fetching user listings:", error)
      return { success: false, error: "Failed to fetch listings" }
    }

    return { success: true, listings }
  } catch (error) {
    console.error("Error fetching user listings:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function getUserPurchaseHistory(userId: string) {
  try {
    const supabase = createSupabaseServer()

    const { data: purchases, error } = await supabase
      .from("market_listings")
      .select(`
        *,
        cards(*),
        seller:seller_id(username)
      `)
      .eq("buyer_id", userId)
      .eq("status", "sold")
      .order("sold_at", { ascending: false })

    if (error) {
      console.error("Error fetching purchase history:", error)
      return { success: false, error: "Failed to fetch purchase history" }
    }

    return { success: true, purchases }
  } catch (error) {
    console.error("Error fetching purchase history:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function getUserSaleHistory(userId: string) {
  try {
    const supabase = createSupabaseServer()

    const { data: sales, error } = await supabase
      .from("market_listings")
      .select(`
        *,
        cards(*),
        buyer:buyer_id(username)
      `)
      .eq("seller_id", userId)
      .eq("status", "sold")
      .order("sold_at", { ascending: false })

    if (error) {
      console.error("Error fetching sale history:", error)
      return { success: false, error: "Failed to fetch sale history" }
    }

    return { success: true, sales }
  } catch (error) {
    console.error("Error fetching sale history:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}
