import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

const SCORE_BY_RARITY: Record<string, number> = {
  epic: 8,
  legendary: 20,
}

export async function POST(req: Request) {
  try {
    const { walletAddress, rarity } = await req.json()

    if (!walletAddress || !rarity) {
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 },
      )
    }

    if (!["epic", "legendary"].includes(rarity)) {
      return NextResponse.json(
        { success: false, error: "Unsupported rarity for wheel reward" },
        { status: 400 },
      )
    }

    const supabase = getSupabaseServerClient()

    const { data: cards, error: cardsError } = await supabase
      .from("cards")
      .select("id, name, character, image_url, rarity")
      .eq("rarity", rarity)

    if (cardsError) {
      return NextResponse.json(
        { success: false, error: `Failed to fetch cards: ${cardsError.message}` },
        { status: 500 },
      )
    }

    if (!cards || cards.length === 0) {
      return NextResponse.json(
        { success: false, error: "No cards available for the specified rarity" },
        { status: 404 },
      )
    }

    const selectedCard = cards[Math.floor(Math.random() * cards.length)]

    const { error: insertError } = await supabase.from("user_card_instances").insert({
      wallet_address: walletAddress,
      card_id: selectedCard.id,
      level: 1,
      favorite: false,
      obtained_at: new Date().toISOString(),
    })

    if (insertError) {
      return NextResponse.json(
        { success: false, error: `Failed to add card to collection: ${insertError.message}` },
        { status: 500 },
      )
    }

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("score")
      .eq("wallet_address", walletAddress)
      .single()

    if (!userError && userData) {
      const scoreToAdd = SCORE_BY_RARITY[rarity] ?? 0
      if (scoreToAdd > 0) {
        await supabase
          .from("users")
          .update({ score: (userData.score ?? 0) + scoreToAdd })
          .eq("wallet_address", walletAddress)
      }
    }

    return NextResponse.json({
      success: true,
      card: selectedCard,
    })
  } catch (error) {
    console.error("Lucky wheel card reward error:", error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "An unexpected error occurred while awarding the card.",
      },
      { status: 500 },
    )
  }
}


