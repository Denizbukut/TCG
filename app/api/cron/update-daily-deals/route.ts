import { NextRequest, NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

// Helper function to generate random number in range
function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

// Calculate price based on tickets and card level
function calculatePrice(
  normalTickets: number,
  legendaryTickets: number,
  classicTickets: number,
  eliteTickets: number,
  cardLevel: number
): number {
  // Base price between 0.5-2.5
  let basePrice = 0.5 + Math.random() * 2 // 0.5-2.5
  
  // Add price for tickets (reduced multipliers)
  const ticketPrice = (normalTickets + legendaryTickets) * 0.05 + (classicTickets + eliteTickets) * 0.08
  
  // Add price for card level (higher level = more expensive, reduced multiplier)
  const levelPrice = (cardLevel - 1) * 0.1
  
  const totalPrice = basePrice + ticketPrice + levelPrice
  
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

    // Select 4 random cards
    const selectedCards: string[] = []
    const availableCards = [...cards]
    
    for (let i = 0; i < 4 && availableCards.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableCards.length)
      selectedCards.push(availableCards[randomIndex].id)
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
    const deals = selectedCards.map((cardId, index) => {
      const normalTickets = randomInt(2, 5)
      const legendaryTickets = randomInt(2, 5)
      const classicTickets = randomInt(3, 10)
      const eliteTickets = randomInt(3, 10)
      const cardLevel = randomInt(1, 5) // Random level between 1-5
      
      const price = calculatePrice(normalTickets, legendaryTickets, classicTickets, eliteTickets, cardLevel)

      return {
        batch_timestamp: batchTimestamp,
        deal_index: index,
        card_id: cardId,
        card_level: cardLevel,
        classic_tickets: classicTickets,
        elite_tickets: eliteTickets,
        normal_tickets: normalTickets,
        legendary_tickets: legendaryTickets,
        price: Number(price.toFixed(2)),
        description: `Special deal with ${normalTickets} normal tickets, ${legendaryTickets} legendary tickets, ${classicTickets} classic tickets, and ${eliteTickets} elite tickets!`,
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

