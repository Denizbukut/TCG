import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json();

    if (!username) {
      return NextResponse.json(
        { error: 'Username is required' },
        { status: 400 }
      );
    }

    // Initialize Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Check if user has an active icon pass
    const { data: iconPass, error: iconPassError } = await supabase
      .from('icon_passes')
      .select('*')
      .eq('user_id', username)
      .eq('active', true)
      .single();

    if (iconPassError || !iconPass) {
      return NextResponse.json(
        { error: 'No active icon pass found' },
        { status: 400 }
      );
    }

    // Check if pass has expired
    if (new Date() > new Date(iconPass.expires_at)) {
      // Mark pass as inactive
      await supabase
        .from('icon_passes')
        .update({ active: false })
        .eq('id', iconPass.id);

      return NextResponse.json(
        { error: 'Icon pass has expired' },
        { status: 400 }
      );
    }

    // Get user's current level
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('level, icon_tickets')
      .eq('username', username)
      .single();

    if (userError || !user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 }
      );
    }

    const userLevel = user.level || 1;
    const currentIconTickets = user.icon_tickets || 0;

    // Get all claimed rewards for this user
    const { data: claimedRewards, error: claimedRewardsError } = await supabase
      .from('claimed_rewards')
      .select('*')
      .eq('wallet_address', username);

    if (claimedRewardsError) {
      console.error('Error fetching claimed rewards:', claimedRewardsError);
      return NextResponse.json(
        { error: 'Failed to fetch claimed rewards' },
        { status: 500 }
      );
    }

    let totalTicketsToAdd = 0;
    const rewardsToClaim: Array<{ level: number; tickets: number }> = [];

    // Calculate unclaimed rewards up to user's current level
    for (let level = 1; level <= userLevel; level++) {
      const claimedReward = claimedRewards?.find(reward => reward.level === level);
      const isSpecialLevel = level % 5 === 0;
      const ticketsForLevel = isSpecialLevel ? 5 : 1;

      if (!claimedReward || !claimedReward.icon_claimed) {
        totalTicketsToAdd += ticketsForLevel;
        rewardsToClaim.push({ level, tickets: ticketsForLevel });
      }
    }

    if (totalTicketsToAdd === 0) {
      return NextResponse.json(
        { error: 'No rewards to claim' },
        { status: 400 }
      );
    }

    // Update claimed rewards in database
    for (const reward of rewardsToClaim) {
      const existingReward = claimedRewards?.find(r => r.level === reward.level);

      if (existingReward) {
        // Update existing reward
        const { error: updateError } = await supabase
          .from('claimed_rewards')
          .update({ icon_claimed: true })
          .eq('id', existingReward.id);

        if (updateError) {
          console.error(`Error updating reward for level ${reward.level}:`, updateError);
        }
      } else {
        // Create new reward record
        const { error: insertError } = await supabase
          .from('claimed_rewards')
          .insert({
            wallet_address: username, // This is now wallet_address passed as username parameter
            level: reward.level,
            icon_claimed: true,
            standard_claimed: false,
            premium_claimed: false,
            claimed_at: new Date().toISOString()
          });

        if (insertError) {
          console.error(`Error creating reward record for level ${reward.level}:`, insertError);
        }
      }
    }

    // Update user's icon tickets
    const newIconTicketCount = currentIconTickets + totalTicketsToAdd;
    const { error: ticketUpdateError } = await supabase
      .from('users')
      .update({ icon_tickets: newIconTicketCount })
      .eq('username', username);

    if (ticketUpdateError) {
      console.error('Error updating user tickets:', ticketUpdateError);
      return NextResponse.json(
        { error: 'Failed to update tickets' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Successfully claimed ${totalTicketsToAdd} icon ticket${totalTicketsToAdd > 1 ? 's' : ''}`,
      newTicketCount: newIconTicketCount,
      rewardsClaimed: rewardsToClaim,
      totalTicketsAdded: totalTicketsToAdd
    });

  } catch (error) {
    console.error('Error in icon pass claim rewards:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
