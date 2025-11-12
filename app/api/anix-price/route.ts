import { NextResponse } from "next/server"

const ANIX_TOKEN_ADDRESS = "0xcd7abb83918984a0bb10a02f8656923041777369"

export async function GET() {
  try {
    const res = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${ANIX_TOKEN_ADDRESS}`,
      { next: { revalidate: 60 } },
    )

    if (!res.ok) {
      console.error("Failed to fetch ANIX price", res.status, res.statusText)
      return NextResponse.json({ price: null }, { status: 200 })
    }

    const data = await res.json()
    const pair = data?.pairs?.[0]
    const priceUsd = pair?.priceUsd ? Number(pair.priceUsd) : null

    return NextResponse.json({ price: priceUsd ?? null })
  } catch (error) {
    console.error("Error in ANIX price endpoint:", error)
    return NextResponse.json({ price: null }, { status: 200 })
  }
}

