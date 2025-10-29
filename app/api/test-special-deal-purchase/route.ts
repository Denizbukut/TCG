import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function createSupabaseServer() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Supabase configuration is missing')
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  })
}

export async function POST(request: Request) {
  try {
    const { username } = await request.json()
    
    if (!username) {
      return NextResponse.json({ 
        success: false, 
        error: 'Username is required' 
      })
    }

    const supabase = createSupabaseServer()
    const today = new Date().toISOString().split('T')[0]
    
    // Get user wallet address from username
    const { data: user, error: userFetchError } = await supabase
      .from('users')
      .select('wallet_address, elite_tickets, icon_tickets')
      .eq('username', username)
      .single()

    if (userFetchError || !user) {
      return NextResponse.json({ 
        success: false, 
        error: 'User not found' 
      })
    }

    const walletAddress = user.wallet_address
    
    // 1. Get today's special deal
    const { data: deal, error: dealError } = await supabase
      .from('special_offer')
      .select('*')
      .eq('date', today)
      .single()

    if (dealError || !deal) {
      return NextResponse.json({ 
        success: false, 
        error: 'No special deal found for today',
        today 
      })
    }

    // 2. Record purchase
    const { error: purchaseError } = await supabase
      .from('special_deal_purchases')
      .insert({
        wallet_address: walletAddress,
        special_deal_id: deal.id,
        purchased_at: new Date().toISOString(),
      })

    if (purchaseError) {
      console.error('Error recording purchase:', purchaseError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to record purchase' 
      })
    }

    // 3. Add card to collection (using user_card_instances with wallet_address)
    const { error: insertError } = await supabase.from('user_card_instances').insert({
      wallet_address: walletAddress, // ✅ FIXED: Use wallet_address instead of user_id
      card_id: deal.card_id,
      level: deal.card_level || 1,
      favorite: false,
      obtained_at: new Date().toISOString().split('T')[0], // Use date only format YYYY-MM-DD
    })
    
    if (insertError) {
      console.error('Error adding card:', insertError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to add card to collection: ' + insertError.message 
      })
    }

    // 4. Add tickets
    const currentEliteTickets = Number(user.elite_tickets) || 0
    const currentIconTickets = Number(user.icon_tickets) || 0
    
    const newEliteTickets = currentEliteTickets + deal.elite_tickets
    const newIconTickets = currentIconTickets + (deal.icon_tickets || 0)

    const { error: updateError } = await supabase
      .from('users')
      .update({
        elite_tickets: newEliteTickets,
        icon_tickets: newIconTickets,
      })
      .eq('username', username)

    if (updateError) {
      console.error('Error updating tickets:', updateError)
      return NextResponse.json({ 
        success: false, 
        error: 'Failed to update tickets' 
      })
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Special deal purchase completed successfully',
      deal,
      newEliteTickets,
      newIconTickets,
      cardAdded: true
    })

  } catch (error) {
    console.error('Error in test-special-deal-purchase:', error)
    return NextResponse.json({ 
      success: false, 
      error: 'Internal server error' 
    })
  }
}
