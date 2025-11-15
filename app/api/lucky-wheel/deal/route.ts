import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"
import { updateScoreForCards } from "@/app/actions/update-score"

export async function POST(req: Request) {
  try {
    const { walletAddress, dealType } = await req.json()

    if (!walletAddress || !dealType) {
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 },
      )
    }

    if (dealType !== "daily" && dealType !== "special") {
      return NextResponse.json(
        { success: false, error: "Invalid deal type" },
        { status: 400 },
      )
    }

    const supabase = getSupabaseServerClient()
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database connection failed" },
        { status: 500 },
      )
    }

    const today = new Date().toISOString().split("T")[0]

    // Get today's deal based on type
    const tableName = dealType === "daily" ? "daily_deals" : "special_offer"
    const { data: deal, error: dealError } = await supabase
      .from(tableName)
      .select("*")
      .eq("date", today)
      .single()

    if (dealError || !deal) {
      return NextResponse.json(
        { success: false, error: `No ${dealType} deal available for today` },
        { status: 404 },
      )
    }

    // Get card information
    const { data: card, error: cardError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .eq("id", deal.card_id)
      .single()

    if (cardError || !card) {
      return NextResponse.json(
        { success: false, error: "Failed to fetch card details" },
        { status: 500 },
      )
    }

    // Normalize wallet address to lowercase for consistency
    const normalizedWalletAddress = walletAddress.toLowerCase()

    // Record the purchase (for tracking and missions)
    const purchaseTableName = dealType === "daily" ? "deal_purchases" : "special_deal_purchases"
    const purchaseRecord = dealType === "daily" 
      ? { wallet_address: normalizedWalletAddress, deal_id: deal.id, purchased_at: new Date().toISOString() }
      : { wallet_address: normalizedWalletAddress, special_deal_id: deal.id, purchased_at: new Date().toISOString() }
    
    const { error: purchaseError } = await supabase
      .from(purchaseTableName)
      .insert(purchaseRecord)

    if (purchaseError) {
      console.error("Error recording deal purchase:", purchaseError)
      // Don't fail the entire operation if purchase recording fails, just log it
    }

    // Add the card to user's collection with the specified level
    // (wallet address already normalized above)
    const { data: insertedCard, error: insertCardError } = await supabase
      .from("user_card_instances")
      .insert({
        wallet_address: normalizedWalletAddress,
        card_id: deal.card_id,
        level: deal.card_level || 1,
        favorite: false,
        obtained_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertCardError) {
      console.error("Error adding card to collection:", insertCardError)
      console.error("Error details:", {
        message: insertCardError.message,
        code: insertCardError.code,
        details: insertCardError.details,
        hint: insertCardError.hint,
        wallet_address: normalizedWalletAddress,
        card_id: deal.card_id,
      })
      return NextResponse.json(
        { success: false, error: `Failed to add card to collection: ${insertCardError.message}` },
        { status: 500 },
      )
    }

    console.log("Card added to collection successfully:", {
      card_id: deal.card_id,
      level: deal.card_level || 1,
      instance_id: insertedCard?.id,
      wallet_address: normalizedWalletAddress,
    })

    // Update user tickets (use normalized wallet address)
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("tickets, elite_tickets, score")
      .eq("wallet_address", normalizedWalletAddress)
      .single()

    if (userError) {
      console.error("Error fetching user data:", userError)
      return NextResponse.json(
        { success: false, error: "User not found" },
        { status: 500 },
      )
    }

    const newTickets = (userData.tickets || 0) + (deal.classic_tickets || 0)
    const newEliteTickets = (userData.elite_tickets || 0) + (deal.elite_tickets || 0)

    // Update tickets
    const { error: updateTicketsError } = await supabase
      .from("users")
      .update({
        tickets: newTickets,
        elite_tickets: newEliteTickets,
      })
      .eq("wallet_address", normalizedWalletAddress)

    if (updateTicketsError) {
      console.error("Error updating user tickets:", updateTicketsError)
      return NextResponse.json(
        { success: false, error: "Failed to update user tickets" },
        { status: 500 },
      )
    }

    // Update score for the card (use normalized wallet address)
    const scoreResult = await updateScoreForCards(normalizedWalletAddress, [card])
    if (!scoreResult.success) {
      console.warn(`Failed to update score for deal card: ${scoreResult.error}`)
    }

    return NextResponse.json({
      success: true,
      deal: {
        card: card,
        cardLevel: deal.card_level || 1,
        classicTickets: deal.classic_tickets || 0,
        eliteTickets: deal.elite_tickets || 0,
      },
      newTickets,
      newEliteTickets,
      scoreAdded: scoreResult.addedScore || 0,
    })
  } catch (error) {
    console.error("Lucky wheel deal reward error:", error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while awarding the deal.",
      },
      { status: 500 },
    )
  }
}

