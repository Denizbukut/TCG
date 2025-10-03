import { NextResponse } from "next/server"
import { levelUpCardIndividual } from "@/app/actions/individual-cards"

export async function POST(req: Request) {
  try {
    const { username, cardId, level } = await req.json()
    console.log("Level-up API called with:", { username, cardId, level })

    if (!username || !cardId || level === undefined) {
      console.log("Missing parameters in level-up request")
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 })
    }

    // Convert username to wallet_address if needed
    let walletAddress = username
    
    // Check if username is actually a wallet address (starts with 0x)
    if (!username.startsWith('0x')) {
      console.log("Username is not a wallet address, looking up wallet_address...")
      const { getSupabaseServerClient } = await import("@/lib/supabase")
      const supabase = getSupabaseServerClient()
      
      const { data: userData, error: userError } = await supabase
        .from("users")
        .select("wallet_address")
        .eq("username", username)
        .single()
      
      if (userError || !userData) {
        console.error("Error finding user by username:", userError)
        return NextResponse.json({ error: "User not found" }, { status: 404 })
      }
      
      walletAddress = userData.wallet_address
      console.log("Found wallet_address:", walletAddress)
    }

    console.log("Calling levelUpCardIndividual function with wallet_address:", walletAddress)
    const result = await levelUpCardIndividual(walletAddress, cardId, level)
    console.log("Level-up result:", result)

    if (result.success) {
      return NextResponse.json(result)
    } else {
      return NextResponse.json(result, { status: 400 })
    }
  } catch (error) {
    console.error("API /level-up error:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
