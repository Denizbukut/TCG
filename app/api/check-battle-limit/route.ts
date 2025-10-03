import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const { walletAddress } = await request.json()
    
    if (!walletAddress) {
      return NextResponse.json({ 
        success: false, 
        error: 'Wallet address is required' 
      }, { status: 400 })
    }

    const supabase = createClient()

    // Get user UUID
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("id")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError || !userData) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      }, { status: 404 })
    }

    const userId = userData.id

    // Get current battle limit status
    const { data: battleLimitData, error: battleLimitError } = await supabase
      .from("user_battle_limits")
      .select("battles_used, last_reset_date")
      .eq("user_id", userId)
      .single()

    let currentBattlesUsed = 0
    let lastResetDate = new Date().toISOString().split('T')[0] // Today's date

    if (battleLimitError && battleLimitError.code !== 'PGRST116') {
      console.error('Error fetching battle limit:', battleLimitError)
    } else if (battleLimitData) {
      currentBattlesUsed = battleLimitData.battles_used || 0
      lastResetDate = battleLimitData.last_reset_date || lastResetDate
    }

    // Check if we need to reset (new day)
    const today = new Date().toISOString().split('T')[0]
    if (lastResetDate !== today) {
      // Reset for new day
      currentBattlesUsed = 0
      lastResetDate = today
    }

    // Check if battle is possible (don't increment yet)
    const dailyLimit = 5
    const canBattle = currentBattlesUsed < dailyLimit

    return NextResponse.json({
      success: true,
      canBattle,
      battlesUsed: currentBattlesUsed,
      battlesRemaining: Math.max(0, dailyLimit - currentBattlesUsed),
      dailyLimit
    })

  } catch (error) {
    console.error('Error in check-battle-limit API:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    }, { status: 500 })
  }
}
