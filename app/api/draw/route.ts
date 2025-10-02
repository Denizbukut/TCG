// ✅ app/api/draw/route.ts → korrekt für App Router
import { NextResponse } from "next/server"
import { drawCards, drawGodPacks } from "@/app/actions"
import { getSupabaseServerClient } from "@/lib/supabase"

export async function POST(req: Request) {
  try {
    const { username, cardType, count = 1 } = await req.json()
    console.log("drawapi")

    if (!username || !cardType) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    // Check if user has active Premium Pass
    let hasPremiumPass = false
    if (cardType === "regular") {
      const supabase = getSupabaseServerClient()
      const { data: premiumPassData } = await supabase
        .from("premium_passes")
        .select("active, expires_at")
        .eq("user_id", username)
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
      result = await drawCards(username, cardType, count, hasPremiumPass) 
    }
    else {
      result = await drawGodPacks(username, count)
    }
    

    return NextResponse.json(result)
  } catch (error) {
    console.error("API /draw error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
