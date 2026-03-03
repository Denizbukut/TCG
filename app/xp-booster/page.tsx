'use client'
import { Sparkles, CheckCircle, Clock, Zap, Home, Star, TrendingUp, Target, Award, ArrowLeft } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/use-toast";
import { MiniKit } from "@worldcoin/minikit-js";
import Link from "next/link";
import { useAuth } from "@/contexts/auth-context";
import { getSupabaseBrowserClient } from "@/lib/supabase/supabase-browser";
import { useWldPrice } from "@/contexts/WldPriceContext"
import { useI18n } from "@/contexts/i18n-context"
import { PaymentCurrencyToggle } from "@/components/payment-currency-toggle"
import { usePaymentCurrency } from "@/contexts/payment-currency-context"
import { ERC20_TRANSFER_ABI, PAYMENT_RECIPIENT, getTransferDetails } from "@/lib/payment-utils"
import { useAnixPrice } from "@/contexts/AnixPriceContext"
import { useRouter } from "next/navigation"
import ProtectedRoute from "@/components/protected-route"
import { motion } from "framer-motion"

const benefitList = [
  {
    icon: <Zap className="h-5 w-5 text-blue-500" />,
    title: 'Double XP',
    desc: '7 days',
  },
  {
    icon: <Clock className="h-5 w-5 text-blue-500" />,
    title: 'Faster Rewards',
    desc: 'Unlock quicker',
  },
];

const featureList = [
  {
    icon: <Star className="h-4 w-4 text-yellow-500" />,
    title: 'Level Up Faster',
    desc: 'Gain experience twice as fast'
  },
  {
    icon: <TrendingUp className="h-4 w-4 text-green-500" />,
    title: 'Better Progress',
    desc: 'Unlock rewards quicker'
  },
  {
    icon: <Target className="h-4 w-4 text-red-500" />,
    title: 'Achieve Goals',
    desc: 'Reach milestones faster'
  },
  {
    icon: <Award className="h-4 w-4 text-purple-500" />,
    title: 'Exclusive Benefits',
    desc: 'Access premium features'
  }
];

export default function XpBoosterPage() {
  const { user } = useAuth();
  const { price } = useWldPrice();
  const { price: anixPrice } = useAnixPrice();
  const { t } = useI18n();
  const router = useRouter();
  const [buying, setBuying] = useState(false);
  const [hasXpPass, setHasXpPass] = useState(false);
  const [xpPassExpiryDate, setXpPassExpiryDate] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const { currency: paymentCurrency } = usePaymentCurrency()

  // Calculate WLD amount based on fixed $5.00 USD price
  const fixedUsdPrice = 5.00;
  const priceDetails = useMemo(() => {
    if (paymentCurrency === "WLD" && (!price || price <= 0)) return null
    if (paymentCurrency === "ANIX" && (!anixPrice || anixPrice <= 0)) return null
    return getTransferDetails({
      usdAmount: fixedUsdPrice,
      currency: paymentCurrency,
      wldPrice: price,
      anixPrice,
    })
  }, [paymentCurrency, price, anixPrice])

  const priceDisplay = priceDetails?.displayAmount ?? `$${fixedUsdPrice.toFixed(2)} USD`

  // Load XP pass status on component mount
  useEffect(() => {
    const loadXpPassStatus = async () => {
      if (!user?.username) {
        setLoading(false);
        return;
      }

      try {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          setLoading(false);
          return;
        }

        // Fetch XP pass status from database
        const { data: xpData, error: xpError } = await (supabase
          .from("xp_passes") as any)
          .select("*")
          .eq("wallet_address", user.wallet_address)
          .eq("active", true)
          .single();

        console.log("XP Pass data from database:", { xpData, xpError });

        if (xpData) {
          const expiry = new Date(String(xpData.expires_at));
          const now = new Date();

          if (now > expiry) {
            // XP Pass is expired - deactivate
            console.log("XP Pass expired, deactivating...");
            await ((supabase
              .from("xp_passes") as any)
              .update({ active: false })
              .eq("wallet_address", user.wallet_address)
              .eq("id", xpData.id as string) as any);

            setHasXpPass(false);
            setXpPassExpiryDate(null);
          } else {
            // XP Pass is active
            console.log("XP Pass is active, expiry:", expiry);
            setHasXpPass(true);
            setXpPassExpiryDate(expiry);
          }
        } else {
          console.log("No active XP pass found");
          setHasXpPass(false);
          setXpPassExpiryDate(null);
        }
      } catch (error) {
        console.error("Error loading XP pass status:", error);
        setHasXpPass(false);
        setXpPassExpiryDate(null);
      } finally {
        setLoading(false);
      }
    };

    loadXpPassStatus();
  }, [user?.wallet_address]);

  const handleBuy = async () => {
    if (!user?.wallet_address) {
      toast({ title: 'Login Required', description: 'Please log in to purchase XP Pass', variant: 'destructive' });
      return;
    }
    if (!priceDetails) {
      toast({
        title: "Price unavailable",
        description: "Unable to load the price for the selected currency. Please try again later.",
        variant: "destructive",
      })
      return
    }

    setBuying(true);
    try {
      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: priceDetails.tokenAddress,
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [PAYMENT_RECIPIENT, priceDetails.rawAmount],
          },
        ],
      });
      
      if (finalPayload.status === "success") {
        // Payment successful, now save XP pass to database
        console.log("Payment successful, saving XP pass to database");
        
        // Import the server action to save XP pass
        const { purchaseXpPass } = await import("@/app/actions/xp-pass");
        const purchaseResult = await purchaseXpPass(user?.wallet_address || "");
        
        if (purchaseResult.success) {
          console.log("XP pass saved successfully");
          setHasXpPass(true);
          setXpPassExpiryDate(new Date(purchaseResult.expiryDate || new Date().toISOString()));
          toast({ title: 'XP Pass Purchased!', description: 'Successfully activated!' });
        } else {
          console.error("Failed to save XP pass:", purchaseResult.error);
          toast({ title: 'Payment successful but activation failed', description: 'Please contact support', variant: 'destructive' });
        }
      } else {
        toast({ title: 'Payment failed', description: 'Please try again', variant: 'destructive' });
      }
    } catch (e) {
      console.error("Error in handleBuy:", e);
      toast({ title: 'Payment failed', description: 'Please try again', variant: 'destructive' });
    } finally {
      setBuying(false);
    }
  };

  return (
    <ProtectedRoute>
      <div className="flex flex-col min-h-screen text-white relative bg-[#0a0a0a] overflow-y-auto">
        {/* Premium Header - Coinbase Style */}
        <header className="sticky top-0 z-30 backdrop-blur-xl bg-[#0a0a0a]/80 border-b border-[#1a1a1a]">
          <div className="w-full px-4 py-2.5 flex items-center justify-between max-w-2xl mx-auto">
            {/* Left: Back Button + Title */}
            <div className="flex items-center gap-3">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => router.push("/")}
                className="w-8 h-8 rounded-lg bg-white/5 backdrop-blur-sm border border-white/10 hover:bg-white/10"
              >
                <ArrowLeft className="h-4 w-4 text-white/70" />
              </Button>
              <h1 className="text-base font-semibold tracking-tight text-white">
                {t("xp_pass.title", "XP Pass")}
              </h1>
            </div>
          </div>
        </header>

        <main className="w-full px-4 pb-32 flex-1 max-w-2xl mx-auto">
          <div className="space-y-3 mt-4">
            {/* Main Card - Glassmorphism */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="relative rounded-2xl p-6 backdrop-blur-xl bg-white/5 border border-white/10"
            >
              <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-[#d4af37] to-transparent"></div>
              {/* Header Section */}
              <div className="flex flex-col items-center mb-6">
                <div className="flex items-center gap-3 mb-4">
                  <h1 className="text-xl font-semibold text-white">{t("xp_pass.title", "XP Pass")}</h1>
                </div>
                <p className="text-white/70 text-center text-sm max-w-sm mb-6">{t("xp_pass.boost_text", "Boost your XP gain and unlock rewards faster!")}</p>
                
                {/* Main Benefits */}
                <div className="grid grid-cols-2 gap-3 w-full max-w-md mb-6">
                  {benefitList.map((b, i) => (
                    <motion.div 
                      key={b.title} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1 }}
                      className="flex flex-col items-center p-3 rounded-xl bg-white/5 border border-white/10 text-white transition-transform hover:scale-105"
                    >
                      <div className="mb-2">{b.icon}</div>
                      <div className="font-semibold text-xs mb-1">{b.title === 'Double XP' ? t("xp_pass.double_xp", "Double XP") : t("xp_pass.faster_rewards", "Faster Rewards")}</div>
                      <div className="text-[10px] opacity-70 text-center">{b.desc === '7 days' ? t("xp_pass.seven_days", "7 days") : t("xp_pass.unlock_quicker", "Unlock quicker")}</div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Features Grid */}
              <div className="w-full mb-6">
                <h2 className="text-base font-semibold text-white text-center mb-4">{t("xp_pass.boost_your_xp", "Boost your XP!")}</h2>
                <div className="grid grid-cols-2 gap-3">
                  {featureList.map((feature, index) => (
                    <motion.div 
                      key={feature.title} 
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1 }}
                      className="bg-white/5 backdrop-blur-sm rounded-lg p-3 border border-white/10 hover:bg-white/10 transition-all duration-200"
                    >
                      <div className="flex flex-col items-center text-center">
                        <h3 className="font-semibold text-xs text-white mb-1">
                          {feature.title === 'Level Up Faster' ? t("xp_pass.level_up_faster", "Level Up Faster") :
                           feature.title === 'Better Progress' ? t("xp_pass.better_progress", "Better Progress") :
                           feature.title === 'Achieve Goals' ? t("xp_pass.achieve_goals", "Achieve Goals") :
                           t("xp_pass.exclusive_benefits", "Exclusive Benefits")}
                        </h3>
                        <p className="text-[10px] text-white/60">
                          {feature.desc === 'Gain experience twice as fast' ? t("xp_pass.gain_twice_fast", "Gain experience twice as fast") :
                           feature.desc === 'Unlock rewards quicker' ? t("xp_pass.unlock_rewards_quicker", "Unlock rewards quicker") :
                           feature.desc === 'Reach milestones faster' ? t("xp_pass.reach_milestones", "Reach milestones faster") :
                           t("xp_pass.access_premium", "Access premium features")}
                        </p>
                      </div>
                    </motion.div>
                  ))}
                </div>
              </div>

              {/* Purchase Section */}
              <div className="w-full max-w-md">
                {loading ? (
                  <div className="flex flex-col items-center gap-2 mt-2">
                    <div className="animate-spin h-8 w-8 border-2 border-t-transparent border-[#d4af37] rounded-full"></div>
                    <div className="text-white/70 text-sm">{t("xp_pass.loading_status", "Loading XP Pass status...")}</div>
                  </div>
                ) : hasXpPass ? (
                  <div className="flex flex-col items-center gap-4 mt-2">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-8 w-8 text-[#10b981]" />
                      <div className="text-[#10b981] font-semibold text-lg">{t("xp_pass.active_status", "XP Pass Active!")}</div>
                    </div>
                    {xpPassExpiryDate && (
                      <div className="text-center">
                        <div className="text-white/70 text-sm">{t("xp_pass.expires_on", "Expires on")}</div>
                        <div className="text-[#d4af37] font-semibold">
                          {xpPassExpiryDate.toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'long',
                            day: 'numeric'
                          })} at {xpPassExpiryDate.toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                        <div className="text-white/60 text-xs mt-1">
                          {t("xp_pass.days_remaining", "{days} days remaining", { days: Math.ceil((xpPassExpiryDate.getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)) })}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="mb-4 flex justify-center">
                      <PaymentCurrencyToggle size="sm" />
                    </div>
                    <div className="mb-4">
                      <div className="text-lg font-semibold text-[#d4af37]">
                        {priceDisplay}
                      </div>
                      <div className="text-sm text-white/60">
                        (~${fixedUsdPrice.toFixed(2)} USD)
                      </div>
                    </div>
                    <Button
                      onClick={handleBuy}
                      disabled={buying || !priceDetails}
                      className="w-full py-3 text-base font-semibold rounded-lg bg-gradient-to-r from-[#d4af37] to-[#f4d03f] hover:from-[#f4d03f] hover:to-[#d4af37] text-black shadow-xl transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
                    >
                      {buying ? (
                        <span className="flex items-center gap-2">
                          <span className="animate-spin h-5 w-5 border-2 border-t-transparent border-black rounded-full"></span> 
                          {t("common.processing", "Processing...")}
                        </span>
                      ) : (
                        <span>{t("xp_pass.buy_xp_pass", "Purchase XP Pass")}</span>
                      )}
                    </Button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  );
} 