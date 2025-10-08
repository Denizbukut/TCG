'use client'
import { useState, useEffect } from "react";
import { Crown, Clock, Home, Ticket, ArrowRight, Check, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { MiniKit, Tokens, tokenToDecimals } from "@worldcoin/minikit-js";
import { useAuth } from "@/contexts/auth-context";
import { useWldPrice } from "@/contexts/WldPriceContext";

interface LevelReward {
  level: number
  iconClaimed: boolean
  isSpecialLevel?: boolean
}

interface IconPassData {
  id: string
  user_id: string
  active: boolean
  purchased_at: string
  expires_at: string
}

export default function IconPassPage() {
  const { user, updateUserTickets, refreshUserData, loading: authLoading } = useAuth();
  const { price } = useWldPrice();
  const [buying, setBuying] = useState(false);
  const [success, setSuccess] = useState(false);

  const [claimedToday, setClaimedToday] = useState(false);

  const [claimingIcon, setClaimingIcon] = useState(false);
  const [nextClaimTime, setNextClaimTime] = useState<string>('');
  const [hasIconPass, setHasIconPass] = useState(false);
  const [iconPassData, setIconPassData] = useState<IconPassData | null>(null);
  const [remainingTime, setRemainingTime] = useState<string>('');
  const [isExpired, setIsExpired] = useState(false);
  const [levelRewards, setLevelRewards] = useState<LevelReward[]>([]);
  const [isClaimingReward, setIsClaimingReward] = useState(false);
  const [unclaimedRewards, setUnclaimedRewards] = useState(0);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check if user has active Icon Pass
  useEffect(() => {
    const checkIconPass = async () => {
      if (!user?.username) {
        setDataLoading(false);
        return;
      }
      
      try {
        setError(null);
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Add timeout to prevent infinite loading
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Database request timeout')), 8000); // 8 seconds timeout
        });

        const dataPromise = supabase
          .from('icon_passes')
          .select('*')
          .eq('user_id', user.wallet_address)
          .eq('active', true)
          .single();

        const { data, error } = await Promise.race([dataPromise, timeoutPromise]) as any;

        console.log('Icon Pass check in icon-pass page:', { data, error, username: user.wallet_address })
        
        if (!error && data) {
          setHasIconPass(true)
          setIconPassData(data)
          setSuccess(true) // Set success to true if pass is already active
          console.log('✅ Icon Pass is already active!')
        } else {
          setHasIconPass(false)
          setIconPassData(null)
          console.log('❌ No active Icon Pass found')
        }
      } catch (error) {
        console.error('❌ Error checking Icon Pass:', error)
        if (error instanceof Error && error.message.includes('timeout')) {
          setError('Database connection timeout. Please check your internet connection and try again.');
        } else {
          setError('Failed to load Icon Pass data. Please refresh the page.');
        }
        setHasIconPass(false)
        setIconPassData(null)
      } finally {
        setDataLoading(false);
      }
    }

    if (!authLoading) {
      checkIconPass()
    }
  }, [user?.username, authLoading]);

  // Calculate remaining time for Icon Pass
  useEffect(() => {
    const calculateRemainingTime = () => {
      if (!iconPassData?.expires_at) {
        setRemainingTime('');
        setIsExpired(false);
        return;
      }

      const now = new Date();
      const expiryDate = new Date(iconPassData.expires_at);
      const diff = expiryDate.getTime() - now.getTime();

      if (diff <= 0) {
        // Pass has expired
        setIsExpired(true);
        setHasIconPass(false);
        setSuccess(false);
        setRemainingTime('');
        
        // Update database to mark pass as inactive
        const updatePassStatus = async () => {
          try {
            const { createClient } = await import('@supabase/supabase-js');
            const supabase = createClient(
              process.env.NEXT_PUBLIC_SUPABASE_URL!,
              process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
            );

            await supabase
              .from('icon_passes')
              .update({ active: false })
              .eq('id', iconPassData.id);
          } catch (error) {
            console.error('Error updating expired pass:', error);
          }
        };
        
        updatePassStatus();
        return;
      }

      // Calculate remaining time
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

      let timeString = '';
      if (days > 0) {
        timeString = `${days}d ${hours}h ${minutes}m`;
      } else if (hours > 0) {
        timeString = `${hours}h ${minutes}m`;
      } else {
        timeString = `${minutes}m`;
      }

      setRemainingTime(timeString);
      setIsExpired(false);
    };

    calculateRemainingTime();
    
    // Update every minute
    const interval = setInterval(calculateRemainingTime, 60000);
    
    return () => clearInterval(interval);
  }, [iconPassData]);

  // Check claimed status on page load and continuously update
  useEffect(() => {
    const checkClaimedStatus = async () => {
      if (!user?.username) return;
      
      try {
        const response = await fetch('/api/icon-pass/status', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ username: user.wallet_address }),
        });

        const data = await response.json();

        if (response.ok && data.hasActivePass) {
          console.log('🔍 Status check response:', data);
          
          // Set claimedToday based on server response
          const shouldBeClaimed = !data.claimStatus.canClaim;
          console.log('🔍 Setting claimedToday to:', shouldBeClaimed, 'because canClaim is:', data.claimStatus.canClaim);
          setClaimedToday(shouldBeClaimed);
          
          // Update next claim time
          if (data.claimStatus.timeUntilNextClaim) {
            console.log('🔍 Setting nextClaimTime from timeUntilNextClaim:', data.claimStatus.timeUntilNextClaim);
            setNextClaimTime(data.claimStatus.timeUntilNextClaim);
          } else if (data.claimStatus.nextClaimTime) {
            // Calculate time until next claim
            const now = new Date();
            const nextClaim = new Date(data.claimStatus.nextClaimTime);
            const diff = nextClaim.getTime() - now.getTime();
            
            if (diff > 0) {
              const hours = Math.floor(diff / (1000 * 60 * 60));
              const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              const timeString = `${hours}h ${minutes}m`;
              console.log('🔍 Calculated nextClaimTime:', timeString);
              setNextClaimTime(timeString);
            } else {
              console.log('🔍 No time difference, clearing nextClaimTime');
              setNextClaimTime('');
            }
          } else {
            console.log('🔍 No timeUntilNextClaim or nextClaimTime found');
          }
        } else {
          console.log('🔍 No active pass or error in response');
          setClaimedToday(false);
          setNextClaimTime('');
        }
      } catch (error) {
        console.error('Error checking claim status:', error);
        // Don't change claimedToday on error - keep current state
      }
    };

    if (!authLoading && user?.username) {
      // Check immediately
      checkClaimedStatus();
      
      // Then check every 30 seconds to keep status updated
      const interval = setInterval(checkClaimedStatus, 30000);
      
      return () => clearInterval(interval);
    }
  }, [user?.username, authLoading]);

  // Fetch claimed rewards and generate level rewards
  useEffect(() => {
    const fetchClaimedLevels = async () => {
      if (!user?.username) return;

      try {
        const { createClient } = await import('@supabase/supabase-js');
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
        );

        // Fetch claimed rewards from database
        const { data: claimedRewardsData, error: claimedRewardsError } = await supabase
          .from("claimed_rewards")
          .select("*")
          .eq("wallet_address", user.wallet_address);

        if (claimedRewardsError) {
          console.error("Error fetching claimed rewards:", claimedRewardsError);
          return;
        }

        // Create rewards array for all levels up to current level + 50 (to show future levels)
        const userLevel = user.level || 1;
        const maxLevel = Math.max(userLevel + 50, 50); // Show at least up to level 50
        const rewards: LevelReward[] = [];

        for (let i = 1; i <= maxLevel; i++) {
          const claimedReward = claimedRewardsData?.find((reward) => reward.level === i);

          // Double rewards for every 5 levels
          const isSpecialLevel = i % 5 === 0;

          rewards.push({
            level: i,
            iconClaimed: Boolean(claimedReward?.icon_claimed),
            isSpecialLevel: isSpecialLevel,
          });
        }

        setLevelRewards(rewards);

        // Calculate unclaimed rewards
        let unclaimed = 0;
        rewards.forEach((reward) => {
          if (reward.level <= userLevel) {
            if (!reward.iconClaimed) unclaimed++;
          }
        });
        setUnclaimedRewards(unclaimed);
      } catch (error) {
        console.error("Error in fetchClaimedLevels:", error);
        // Don't set error state here as it's not critical for the main functionality
      }
    };

    if (!authLoading && user?.username) {
      fetchClaimedLevels();
    }
  }, [user?.username, user?.level, authLoading]);

  // Continuous status update timer - updates every 30 seconds to keep UI in sync

  const handleBuy = async () => {
    if (!user) return;
    
    setBuying(true);
    
    try {
      // Calculate WLD amount based on $1 USD price
      const dollarPrice =3
      const fallbackWldAmount =3; // Fallback if price is not available
      const wldAmount = price ? dollarPrice / price : fallbackWldAmount;
      const roundedWldAmount = Number.parseFloat(wldAmount.toFixed(3));
      
      // Payment durchführen
      const res = await fetch("/api/initiate-payment", {
        method: "POST",
      });
      const { id } = await res.json();

      const payload = {
        reference: id,
        to: "0xDb4D9195EAcE195440fbBf6f80cA954bf782468E",
        tokens: [
          {
            symbol: Tokens.WLD,
            token_amount: tokenToDecimals(roundedWldAmount, Tokens.WLD).toString(),
          },
        ],
        description: "Buy Icon Pass",
      };

      const { finalPayload } = await MiniKit.commandsAsync.pay(payload);

      if (finalPayload.status === "success") {
        console.log("success sending icon pass payment");
        await handlePurchaseIconPass();
      } else {
        toast({ 
          title: 'Error', 
          description: 'Payment failed. Please try again.', 
          variant: 'destructive' 
        });
      }
    } catch (e) {
      console.error('Payment error:', e);
      toast({ 
        title: 'Error', 
        description: 'Payment failed. Please try again.', 
        variant: 'destructive' 
      });
    } finally {
      setBuying(false);
    }
  };

  // Handle purchasing icon pass - same logic as premium pass
  const handlePurchaseIconPass = async () => {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    if (!supabase || !user?.username) return;

    try {
      console.log('Starting icon pass purchase for user:', user.wallet_address);
      
      // Calculate expiry date (7 days from now)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 7);

      // Check if user already has an icon pass record
      const { data: existingPass, error: checkError } = await supabase
        .from("icon_passes")
        .select("*")
        .eq("user_id", user.wallet_address)
        .single();

      console.log('Check result:', { existingPass, checkError });

      if (checkError && checkError.code !== "PGRST116") {
        console.error("Error checking existing icon pass:", checkError);
        toast({
          title: "Error",
          description: `Failed to check icon pass status: ${checkError.message}`,
          variant: "destructive",
        });
        return;
      }

      let error;
      let result;

      if (existingPass) {
        console.log('Updating existing icon pass:', existingPass.id);
        // Update existing icon pass
        const { data: updateData, error: updateError } = await supabase
          .from("icon_passes")
          .update({
            active: true,
            purchased_at: new Date().toISOString(),
            expires_at: expiryDate.toISOString(),
          })
          .eq("user_id", user.wallet_address)
          .select()
          .single();

        error = updateError;
        result = updateData;
        console.log('Update result:', { updateData, updateError });
      } else {
        console.log('Creating new icon pass');
        // Create new icon pass record
        const { data: insertData, error: insertError } = await supabase
          .from("icon_passes")
          .insert({
            user_id: user.wallet_address,
            active: true,
            purchased_at: new Date().toISOString(),
            expires_at: expiryDate.toISOString(),
          })
          .select()
          .single();

        error = insertError;
        result = insertData;
        console.log('Insert result:', { insertData, insertError });
      }

      if (error) {
        console.error("Error purchasing icon pass:", error);
        toast({
          title: "Error",
          description: `Failed to purchase icon pass: ${error.message}`,
          variant: "destructive",
        });
        return;
      }

      // Update local state
      setSuccess(true);
      setHasIconPass(true);
      setIsExpired(false);
      setIconPassData({
        id: result?.id || existingPass?.id || 'new',
        user_id: user.wallet_address,
        active: true,
        purchased_at: new Date().toISOString(),
        expires_at: expiryDate.toISOString(),
      });

      toast({
        title: "Success!",
        description: existingPass
          ? "You've renewed your Icon Pass for 7 days!"
          : "You've purchased the Icon Pass for 7 days!",
      });
    } catch (error) {
      console.error("Error in handlePurchaseIconPass:", error);
      toast({
        title: "Error",
        description: `An unexpected error occurred: ${error instanceof Error ? error.message : 'Unknown error'}`,
        variant: "destructive",
      });
    }
  };





  const handleClaimIcon = async () => {
    if (!user) return;
    
    setClaimingIcon(true);
    
    try {
      // Use server-side validation for icon ticket claiming
      const response = await fetch('/api/icon-pass/claim', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user.wallet_address }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        console.log('🎯 Claim successful:', data);
        
        // Update local state with server response
        const newIconTickets = data.newTicketCount;
        await updateUserTickets(user.tickets, user.elite_tickets, newIconTickets);
        await refreshUserData?.();
        
        // Update UI state based on server response
        console.log('🎯 Setting claimedToday to true');
        setClaimedToday(true);
        
        // Calculate next claim time (24 hours from now)
        const now = new Date();
        const nextClaim = new Date(now.getTime() + (24 * 60 * 60 * 1000));
        const hours = Math.floor((24 * 60 * 60 * 1000) / (1000 * 60 * 60));
        const minutes = Math.floor(((24 * 60 * 60 * 1000) % (1000 * 60 * 60)) / (1000 * 60));
        const timeString = `${hours}h ${minutes}m`;
        console.log('🎯 Setting nextClaimTime to:', timeString);
        setNextClaimTime(timeString);
        
        toast({ 
          title: 'Claimed!', 
          description: 'You have claimed your daily icon ticket.' 
        });
      } else {
        // Show server error message
        const errorMessage = data.error || 'Failed to claim icon ticket.';
        toast({ 
          title: 'Error', 
          description: errorMessage, 
          variant: 'destructive' 
        });
        
        // If it's a cooldown error, update the UI accordingly
        if (data.error && data.error.includes('Already claimed today')) {
          console.log('⏰ Cooldown error detected:', data);
          console.log('⏰ Setting claimedToday to true');
          setClaimedToday(true);
          
          if (data.nextClaimIn) {
            console.log('⏰ Setting nextClaimTime from nextClaimIn:', data.nextClaimIn);
            setNextClaimTime(data.nextClaimIn);
          } else if (data.nextClaimAvailable) {
            // Calculate time until next claim
            const now = new Date();
            const nextClaim = new Date(data.nextClaimAvailable);
            const diff = nextClaim.getTime() - now.getTime();
            
            if (diff > 0) {
              const hours = Math.floor(diff / (1000 * 60 * 60));
              const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              const timeString = `${hours}h ${minutes}m`;
              console.log('⏰ Calculated nextClaimTime from nextClaimAvailable:', timeString);
              setNextClaimTime(timeString);
            }
          }
        }
      }
    } catch (e) {
      console.error('Claim error:', e);
      toast({ 
        title: 'Error', 
        description: 'Failed to claim icon ticket.', 
        variant: 'destructive' 
      });
    } finally {
      setClaimingIcon(false);
    }
  };

  const handleClaimAllRewards = async () => {
    if (!user?.username) return;

    setIsClaimingReward(true);

    try {
      const response = await fetch('/api/icon-pass/claim-rewards', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username: user.wallet_address }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        // Update auth context with new ticket count
        await updateUserTickets?.(user.tickets, user.elite_tickets, data.newTicketCount);

        // Update local state
        const updatedRewards = [...levelRewards];
        data.rewardsClaimed.forEach((claimedReward: { level: number; tickets: number }) => {
          const rewardIndex = updatedRewards.findIndex(r => r.level === claimedReward.level);
          if (rewardIndex !== -1) {
            updatedRewards[rewardIndex] = { ...updatedRewards[rewardIndex], iconClaimed: true };
          }
        });

        setLevelRewards(updatedRewards);
        setUnclaimedRewards(0);

        toast({
          title: "Rewards Claimed!",
          description: `You have claimed ${data.totalTicketsAdded} icon ticket${data.totalTicketsAdded > 1 ? 's' : ''}!`,
        });
      } else {
        toast({
          title: "Error",
          description: data.error || "Failed to claim rewards",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("Error claiming all rewards:", error);
      toast({
        title: "Error",
        description: "Failed to claim rewards",
        variant: "destructive",
      });
    } finally {
      setIsClaimingReward(false);
    }
  };

  // Show loading state while auth is loading or data is loading
  if (authLoading || dataLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-yellow-100 to-yellow-200 p-4 flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-yellow-600 mx-auto mb-4"></div>
          <p className="text-yellow-800 font-medium">Loading Icon Pass...</p>
        </div>
      </div>
    );
  }

  // Show login prompt if user is not authenticated
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-yellow-100 to-yellow-200 p-4 flex flex-col items-center justify-center">
        <div className="text-center max-w-md">
          <Crown className="h-16 w-16 text-yellow-600 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-yellow-800 mb-4">Login Required</h2>
          <p className="text-yellow-700 mb-6">Please log in to access the Icon Pass features.</p>
          <Link href="/login">
            <Button className="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-3">
              Go to Login
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-yellow-100 to-yellow-200 p-4 flex flex-col items-center justify-center">
        <div className="text-center max-w-md">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-red-600 mb-2">Error Loading Page</h2>
          <p className="text-yellow-800 mb-4">{error}</p>
          <Button 
            onClick={() => window.location.reload()} 
            className="bg-yellow-500 hover:bg-yellow-600 text-white"
          >
            Refresh Page
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-50 via-yellow-100 to-yellow-200 p-4 flex flex-col items-center">
      {/* Header */}
      <div className="w-full max-w-4xl flex justify-between items-center mb-6">
        <Link href="/" className="flex items-center gap-2 text-yellow-800 hover:text-yellow-900 transition-colors">
          <Home className="h-5 w-5" />
          <span className="font-semibold">Back to Home</span>
        </Link>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-orange-500" />
            <span className="text-sm font-medium text-yellow-800">{user?.tickets || 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-purple-500" />
            <span className="text-sm font-medium text-yellow-800">{user?.elite_tickets || 0}</span>
          </div>
          <div className="flex items-center gap-2">
            <Ticket className="h-4 w-4 text-blue-500" />
            <span className="text-sm font-medium text-yellow-800">{user?.icon_tickets || 0}</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="w-full max-w-4xl space-y-6">
        {/* Header Card */}
        <div className="bg-white/95 rounded-2xl shadow-xl border border-yellow-200 p-6 flex flex-col items-center">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <Crown className="h-8 w-8 text-yellow-600 animate-bounce" />
              <div className="absolute inset-0 bg-gradient-to-r from-yellow-400 to-yellow-600 rounded-full opacity-20 animate-pulse"></div>
            </div>
            <h1 className="text-3xl font-bold text-yellow-500">Icon Pass</h1>
          </div>
          
          {success && !isExpired ? (
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 mb-2">Icon Pass ACTIVE!</div>
              <div className="text-yellow-700 mb-2">Your Icon Pass is now active and you can claim daily rewards!</div>
              <div className="flex items-center justify-center gap-2 mb-4">
                <Clock className="h-4 w-4 text-yellow-600" />
                <span className="text-sm font-medium text-yellow-700">
                  Remaining time: <span className="font-bold text-yellow-800">{remainingTime}</span>
                </span>
              </div>
              {remainingTime && remainingTime.includes('h') && parseInt(remainingTime.split('h')[0]) < 24 && (
                <div className="flex items-center justify-center gap-2 mb-4 p-2 bg-orange-100 border border-orange-300 rounded-lg">
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  <span className="text-sm font-medium text-orange-700">
                    Your Icon Pass expires soon! Consider renewing to keep your benefits.
                  </span>
                </div>
              )}
              
              {/* Daily Icon Ticket Claim */}
              <div className="bg-gradient-to-r from-blue-100 to-blue-200 rounded-lg p-4 border border-blue-300 mb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Ticket className="h-6 w-6 text-blue-600" />
                    <div>
                      <div className="font-semibold text-yellow-800">Daily Icon Ticket Claim</div>
                                               <div className="text-sm text-yellow-700">
                           {claimedToday ? (
                             <span>Next claim available in: <strong>{nextClaimTime}</strong></span>
                           ) : (
                             <span>Available to claim!</span>
                           )}
                         </div>
                    </div>
                  </div>
                                       <Button
                       onClick={handleClaimIcon}
                       disabled={claimingIcon || claimedToday || isExpired}
                       className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-2 rounded-lg disabled:opacity-50"
                     >
                       {claimingIcon ? 'Claiming...' : claimedToday ? `Claimed (${nextClaimTime})` : isExpired ? 'Pass Expired' : 'Claim'}
                     </Button>
                </div>
              </div>
            </div>
          ) : isExpired ? (
            <div className="text-center">
              <div className="flex items-center justify-center gap-2 mb-4">
                <AlertTriangle className="h-6 w-6 text-red-500" />
                <div className="text-2xl font-bold text-red-600">Icon Pass EXPIRED!</div>
              </div>
              <div className="text-yellow-700 mb-6">Your Icon Pass has expired. Purchase a new one to continue enjoying the benefits!</div>
              <Button
                onClick={handleBuy}
                disabled={buying}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-8 py-3 rounded-lg text-lg font-semibold"
              >
                {buying ? 'Processing...' : (
                  <div className="flex flex-col items-center">
                    <span>Buy New Icon Pass</span>
                    <span className="text-sm">
                      {price 
                        ? `${(3 / price).toFixed(3)} WLD (~$3.00)`
                        : '3.000 WLD (~$3.00)'
                      }
                    </span>
                  </div>
                )}
              </Button>
            </div>
          ) : (
            <div className="text-center">
              <div className="text-xl text-yellow-700 mb-6">Unlock exclusive Icon Pass benefits and daily rewards!</div>
              <Button
                onClick={handleBuy}
                disabled={buying}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-8 py-3 rounded-lg text-lg font-semibold"
              >
                {buying ? 'Processing...' : (
                  <div className="flex flex-col items-center">
                    <span>Buy Icon Pass</span>
                    <span className="text-sm">
                      {price 
                        ? `${(3 / price).toFixed(3)} WLD (~$3.00)`
                        : '3.000 WLD (~$3.00)'
                      }
                    </span>
                  </div>
                )}
              </Button>
            </div>
          )}
        </div>

        {/* Benefits Section */}
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl shadow-xl border border-yellow-300 p-6">
          <h2 className="text-2xl font-bold text-yellow-800 mb-4 text-center">Icon Pass Benefits</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <Ticket className="h-6 w-6 text-blue-600 mt-1" />
              <div>
                <div className="font-semibold text-yellow-800">Daily Icon Ticket</div>
                <div className="text-sm text-yellow-700">Claim 1 Icon Ticket every 24 hours</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Ticket className="h-6 w-6 text-purple-600 mt-1" />
              <div>
                <div className="font-semibold text-yellow-800">Level Rewards</div>
                <div className="text-sm text-yellow-700">Earn Icon Tickets for each level reached</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <ArrowRight className="h-6 w-6 text-green-600 mt-1" />
              <div>
                <div className="font-semibold text-yellow-800">Improved Drop Rates</div>
                <div className="text-sm text-yellow-700">Better chances for rare cards in Elite Packs</div>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Clock className="h-6 w-6 text-yellow-600 mt-1" />
              <div>
                <div className="font-semibold text-yellow-800">7 Days Duration</div>
                <div className="text-sm text-yellow-700">Your Icon Pass is valid for 7 days from activation</div>
              </div>
            </div>
          </div>
        </div>
          
        {/* Improved Elite Pack Drop Rates Section */}
        <div className="mt-6 bg-gradient-to-r from-yellow-100 to-yellow-200 rounded-lg p-4 border border-yellow-300">
          <div className="flex items-center gap-2 mb-3">
            <Crown className="h-5 w-5 text-yellow-600" />
            <div className="font-semibold text-yellow-800 text-sm">Improved Elite Pack Drop Rates</div>
          </div>
          
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-gray-500"></div>
                <span className="text-xs text-yellow-800">Basic</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-yellow-700">10%</span>
                <ArrowRight className="h-3 w-3 text-yellow-500" />
                <span className="text-xs text-yellow-700">7%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                <span className="text-xs text-yellow-800">Rare</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-yellow-700">45%</span>
                <ArrowRight className="h-3 w-3 text-yellow-500" />
                <span className="text-xs text-yellow-700">35%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-purple-500"></div>
                <span className="text-xs text-yellow-800">Elite</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-yellow-700">35%</span>
                <ArrowRight className="h-3 w-3 text-yellow-500" />
                <span className="text-xs text-yellow-700">40%</span>
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-xs text-yellow-800">Ultimate</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-yellow-700">10%</span>
                <ArrowRight className="h-3 w-3 text-yellow-500" />
                <span className="text-xs text-yellow-700">18%</span>
              </div>
            </div>
          </div>
          
          <div className="mt-3 text-xs text-yellow-700">
            Icon Pass significantly increases your chances of getting rare, elite, and ultimate cards in Elite Packs!
          </div>
        </div>
      </div>

      {/* Icon Pass Rewards */}
      {success && !isExpired && (
        <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-2xl shadow-xl border border-yellow-300 p-6 flex flex-col items-center max-w-4xl w-full animate-fade-in mt-6">
          <div className="w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-yellow-800">Pass Rewards</h3>
              {unclaimedRewards > 0 && !isExpired && (
                <Button
                  onClick={handleClaimAllRewards}
                  disabled={isClaimingReward}
                  className="bg-purple-500 hover:bg-purple-600 text-white text-sm px-4 py-2 rounded-lg"
                >
                  {isClaimingReward ? "Claiming..." : `Claim All (${unclaimedRewards})`}
                </Button>
              )}
            </div>

            <div
              className="overflow-x-auto pb-4 hide-scrollbar"
              style={{ scrollbarWidth: "none", overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}
            >
              <div className="flex flex-col min-w-max">
                {/* Icon rewards */}
                <div className="flex mb-2">
                  {levelRewards.map((reward) => (
                    <div key={`icon-${reward.level}`} className="flex flex-col items-center w-24">
                      <div className="h-20 flex flex-col items-center justify-end pb-2">
                        <div
                          className={`
                          w-20 h-16 rounded-lg flex flex-col items-center justify-center relative
                          ${
                            reward.level <= (user?.level || 1)
                              ? reward.iconClaimed
                                ? "bg-gray-100"
                                : reward.isSpecialLevel
                                  ? "bg-blue-200"
                                  : "bg-purple-100"
                              : "bg-gray-100"
                          }
                        `}
                        >
                          <Ticket className="h-5 w-5 text-blue-500 mb-1" />
                          <span className="text-xs font-medium">{reward.isSpecialLevel ? "5" : "1"} Icon</span>
                          {reward.isSpecialLevel && !reward.iconClaimed && reward.level <= (user?.level || 1) && (
                            <span className="absolute -top-2 -right-2 bg-blue-500 text-white text-[10px] px-1 rounded-full">
                              5x
                            </span>
                          )}

                          {reward.iconClaimed && (
                            <div className="absolute -top-1 -right-1 bg-green-500 rounded-full p-0.5">
                              <Check className="h-3 w-3 text-white" />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Level markers */}
                <div className="flex items-center h-10 relative">
                  <div className="absolute left-0 right-0 h-0.5 bg-yellow-300"></div>

                  {levelRewards.map((reward) => (
                    <div
                      id={`level-${reward.level}`}
                      key={`level-${reward.level}`}
                      className={`flex flex-col items-center justify-center w-24 z-10`}
                    >
                      <div
                        className={`
                        w-6 h-6 rounded-full flex items-center justify-center
                        ${
                          reward.level === (user?.level || 1)
                            ? "bg-purple-500 text-white"
                            : reward.level < (user?.level || 1)
                              ? "bg-purple-200"
                              : "bg-gray-200"
                        }
                      `}
                      >
                        <span className="text-xs font-medium">{reward.level}</span>
                      </div>
                      <span className="text-[10px] mt-0.5 text-yellow-700">Level {reward.level}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-6 flex justify-center gap-4 text-xs text-yellow-700">
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-purple-200 mr-1"></div>
                <span>Icon Reward</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-blue-200 mr-1"></div>
                <span>Premium Reward</span>
              </div>
              <div className="flex items-center">
                <div className="w-3 h-3 rounded-full bg-green-500 mr-1"></div>
                <span>Claimed</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
} 
