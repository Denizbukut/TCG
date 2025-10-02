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

    console.log("Calling levelUpCardIndividual function...")
    const result = await levelUpCardIndividual(username, cardId, level)
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
