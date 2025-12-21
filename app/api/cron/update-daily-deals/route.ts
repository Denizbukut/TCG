import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

// Helper function to generate random number in range
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Calculate price based on tickets, level, and rarity
function calculatePrice(
  classicTickets: number,
  eliteTickets: number,
  cardLevel: number,
  rarity: string
): number {
  // Ticket prices
  const ticketPrice = classicTickets * 0.05
  const eliteTicketPrice = eliteTickets * 0.1
  
  // Level price
  const levelPrice = cardLevel * 0.1
  
  // Rarity price
  const rarityPrices: Record<string, number> = {
    common: 0.1,
    rare: 0.15,
    epic: 0.2,
  }
  const rarityPrice = rarityPrices[rarity.toLowerCase()] || 0.1
  
  // Total price
  const totalPrice = ticketPrice + eliteTicketPrice + levelPrice + rarityPrice
  
  // Ensure price is between 0.5 and 3
  return Math.max(0.5, Math.min(totalPrice, 3))
}

export async function GET(request: NextRequest) {
  try {
    // Verify cron secret if set
    const authHeader = request.headers.get("authorization")
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getSupabaseServerClient()

    // Get all obtainable cards, excluding legendary cards
    const { data: allCards, error: cardsError } = await supabase
      .from("cards")
      .select("id, rarity")
      .eq("obtainable", true)

    if (cardsError) {
      console.error("Error fetching cards:", cardsError)
      return NextResponse.json(
        { error: "Failed to fetch cards", details: cardsError.message },
        { status: 500 }
      )
    }

    // Filter out legendary cards
    const cards = allCards?.filter((card) => card.rarity !== "legendary") || []

    if (!cards || cards.length === 0) {
      return NextResponse.json(
        { error: "No obtainable cards found" },
        { status: 404 }
      )
    }

    // Select 4 random cards with their full information
    const selectedCards: Array<{ id: string; rarity: string }> = []
    const availableCards = [...cards]
    
    for (let i = 0; i < 4 && availableCards.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableCards.length)
      selectedCards.push({
        id: availableCards[randomIndex].id,
        rarity: availableCards[randomIndex].rarity,
      })
      availableCards.splice(randomIndex, 1) // Remove to avoid duplicates
    }

    if (selectedCards.length < 4) {
      return NextResponse.json(
        { error: "Not enough cards available (need 4)" },
        { status: 400 }
      )
    }

    // Generate deals for each card
    const batchTimestamp = new Date().toISOString()
    const deals = selectedCards.map((card, index) => {
      const classicTickets = randomInt(3, 10)
      const eliteTickets = randomInt(3, 10)
      const cardLevel = randomInt(1, 5) // Random level between 1-5
      
      const price = calculatePrice(classicTickets, eliteTickets, cardLevel, card.rarity)

      return {
        batch_timestamp: batchTimestamp,
        deal_index: index,
        card_id: card.id,
        card_level: cardLevel,
        classic_tickets: classicTickets,
        elite_tickets: eliteTickets,
        normal_tickets: 0,
        legendary_tickets: 0,
        price: Number(price.toFixed(2)),
        description: `Special deal with ${classicTickets} classic tickets and ${eliteTickets} elite tickets!`,
        discount_percentage: 0,
        created_at: batchTimestamp,
        updated_at: batchTimestamp,
      }
    })

    // Delete old batches (keep only the latest)
    // First, get the latest batch timestamp
    const { data: latestBatch, error: latestError } = await supabase
      .from("daily_deals_batch")
      .select("batch_timestamp")
      .order("batch_timestamp", { ascending: false })
      .limit(1)
      .single()

    if (!latestError && latestBatch) {
      // Delete all batches except the latest one
      // Get all unique batch timestamps
      const { data: allBatches, error: fetchAllError } = await supabase
        .from("daily_deals_batch")
        .select("batch_timestamp")

      if (!fetchAllError && allBatches && allBatches.length > 0) {
        // Get unique batch timestamps and filter out the latest
        const uniqueTimestamps = [...new Set(allBatches.map((b) => b.batch_timestamp))]
        const oldTimestamps = uniqueTimestamps.filter((ts) => ts !== latestBatch.batch_timestamp)
        
        // Delete each old batch
        for (const timestamp of oldTimestamps) {
          const { error: deleteError } = await supabase
            .from("daily_deals_batch")
            .delete()
            .eq("batch_timestamp", timestamp)

          if (deleteError) {
            console.error("Error deleting old batch:", deleteError)
            // Continue anyway, not critical
          }
        }
      }
    }

    // Insert new deals
    const { data: insertedDeals, error: insertError } = await supabase
      .from("daily_deals_batch")
      .insert(deals)
      .select()

    if (insertError) {
      console.error("Error inserting deals:", insertError)
      return NextResponse.json(
        { error: "Failed to insert deals", details: insertError.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      message: `Successfully created ${insertedDeals?.length || 0} deals`,
      batch_timestamp: batchTimestamp,
      deals: insertedDeals,
    })
  } catch (error) {
    console.error("Error in update-daily-deals cron job:", error)
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    )
  }
}

