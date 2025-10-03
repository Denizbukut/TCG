import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const walletAddress = searchParams.get('walletAddress')
    
    if (!walletAddress) {
      return NextResponse.json({ error: 'Wallet address parameter required' }, { status: 400 })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get user's cards with rarity information
    const { data: userCards, error: userCardsError } = await supabase
      .from('user_cards')
      .select(`
        id, 
        card_id, 
        quantity, 
        level,
        cards!inner(
          id, 
          name, 
          rarity, 
          character
        )
      `)
      .eq('wallet_address', walletAddress)
      .gt('quantity', 0)

    if (userCardsError) {
      console.error('Error fetching user cards:', userCardsError)
      return NextResponse.json({ error: 'Failed to fetch user cards' }, { status: 500 })
    }

    // Group by rarity to see the distribution
    const rarityDistribution = userCards?.reduce((acc: any, userCard: any) => {
      const rarity = userCard.cards?.rarity
      if (rarity) {
        acc[rarity] = (acc[rarity] || 0) + (userCard.quantity || 0)
      }
      return acc
    }, {})

    // Get all unique rarity values
    const uniqueRarities = [...new Set(userCards?.map((uc: any) => uc.cards?.rarity).filter(Boolean))]

    return NextResponse.json({
      success: true,
      walletAddress,
      totalCards: userCards?.length || 0,
      uniqueRarities,
      rarityDistribution,
      sampleCards: userCards?.slice(0, 5).map((uc: any) => ({
        name: uc.cards?.name,
        rarity: uc.cards?.rarity,
        quantity: uc.quantity,
        character: uc.cards?.character
      }))
    })

  } catch (error) {
    console.error('Debug rarities error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
} 