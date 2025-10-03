// ✅ app/api/draw/route.ts → korrekt für App Router
import { NextResponse } from "next/server"
import { drawCards, drawGodPacks } from "@/app/actions"
import { drawCardsIndividual } from "@/app/actions/individual-cards"
import { getSupabaseServerClient } from "@/lib/supabase"

export async function POST(req: Request) {
  try {
    const { walletAddress, cardType, count = 1 } = await req.json()
    console.log("drawapi")

    if (!walletAddress || !cardType) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    // Check if user has active Premium Pass (only for regular packs)
    let hasPremiumPass = false
    if (cardType === "regular") {
      const supabase = getSupabaseServerClient()
      const { data: premiumPassData } = await supabase
        .from("premium_passes")
        .select("active, expires_at")
        .eq("wallet_address", walletAddress)
        .eq("active", true)
        .single()

      if (premiumPassData) {
        // Check if premium pass has expired
        const now = new Date()
        const expiresAt = new Date(premiumPassData.expires_at)
        hasPremiumPass = expiresAt > now
      }
    }

    let result = {}
    if(cardType !== "god") {
      // Use individual card system - each card gets its own ID
      result = await drawCardsIndividual(walletAddress, cardType, count, hasPremiumPass) 
    }
    else {
      result = await drawGodPacks(walletAddress, count)
    }
    

    return NextResponse.json(result)
  } catch (error) {
    console.error("API /draw error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
