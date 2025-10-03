"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { useAuth } from "@/contexts/auth-context"
import { motion } from "framer-motion"
import { createClient } from "@supabase/supabase-js"
// Removed Next.js Image import - using regular img tags
import { Globe } from "lucide-react"
import { Input } from "@/components/ui/input"
import { useEffect } from "react"
import { MiniKit } from "@worldcoin/minikit-js"
import { incrementLegendaryDraw } from "../actions/weekly-contest"


export default function LoginPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [referralWarning, setReferralWarning] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [referralCode, setReferralCode] = useState("")
  const router = useRouter()
  const { login } = useAuth()
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search)
      const ref = urlParams.get("ref")
      if (ref) setReferralCode(ref)
    }
  }, [])


  useEffect(() => {
    // Entferne evtl. alte Tokens
    localStorage.removeItem("worldId_userId")
    localStorage.removeItem("animeworld_user")
  }, [])


  const signInWithWallet = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/nonce`)
      const { nonce } = await res.json()

      const { commandPayload: generateMessageResult, finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: nonce,
        expirationTime: new Date(new Date().getTime() + 7 * 24 * 60 * 60 * 1000),
        notBefore: new Date(new Date().getTime() - 24 * 60 * 60 * 1000),
      })

      const address = MiniKit.user?.walletAddress
      const username = MiniKit.user?.username

      console.log("MiniKit user:", MiniKit.user)
      console.log("MiniKit username:", username)
      console.log("MiniKit wallet address:", address)

      if (address) {
        // Always use the username from MiniKit if available
        const userIdentifier = username || address
        console.log("Using identifier for login:", userIdentifier)

        // Store the World ID username in localStorage for future reference
        localStorage.setItem("worldId_userId", userIdentifier)

        // Check if user exists in database and create if not
        try {
          // Create Supabase client
          const supabase = createClient(
            "https://jrfevsjtghhnefoditrn.supabase.co",
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpyZmV2c2p0Z2hobmVmb2RpdHJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTEzODg2MjgsImV4cCI6MjA2Njk2NDYyOH0.O2yaqEdZ-UMwvwn326qc6M9Kc2Qb9uF_K8_PbI9Dh_g",
          )

          // Check if user exists
          const { data: existingUser, error: fetchError } = await supabase
            .from("users")
            .select("wallet_address, username")
            .eq("wallet_address", address)
            .single()

          if (fetchError && fetchError.code !== "PGRST116") {
            console.error("Error checking if user exists:", fetchError)
          }

          // If user doesn't exist, create a new user
          if (!existingUser) {
            console.log("User doesn't exist, creating new user:", userIdentifier)
            const { data: newUser, error: insertError } = await supabase
            .from("users")
            .insert([
              {
                wallet_address: address,
                username: userIdentifier,
                tickets: 5,
                coins: 1000,
                level: 1,
                experience: 0,
                world_id: address,
                elite_tickets: 2,
                icon_tickets: 0,
                has_premium: false,
                next_level_exp: 100,
                score: 0,
                tokens: 0,
                clan_id: null,
                has_xp_pass: false,
                cards_sold_since_last_purchase: 0,
                avatar_id: 1,
                prestige_points: 100,
              },
            ])
            .select()

            if (insertError) {
              console.error("Error creating new user:", insertError)
            } else {
              console.log("New user created successfully:", newUser)
              if (referralCode.trim().toLowerCase()) {
      const { data: referrer, error: referrerError } = await supabase
        .from("users")
        .select("wallet_address")
        .eq("username", referralCode)
        .single()
        // Note: incrementLegendaryDraw needs to be updated to use wallet_address instead of username
        // await incrementLegendaryDraw(referrer.wallet_address, 0)

      if (referrer && !referrerError) {
        await supabase.from("referrals").insert({
          referrer_wallet_address: referrer.wallet_address,
          referred_wallet_address: address,
        })
      } else {
        setReferralWarning("This referral code is invalid.")
      }
    }
  


            }
          } else {
            console.log("User already exists:", existingUser)

            // Update the last_login timestamp
            const { error: updateError } = await supabase
            .from("users")
            .update({
              last_login: new Date().toISOString(),
            })
            .eq("wallet_address", address)

            if (updateError) {
              console.error("Error updating last login:", updateError)
            }
          }
        } catch (dbError) {
          console.error("Database operation failed:", dbError)
          // Continue with login even if database operations fail
        }

        // Login with the auth context
        const loginResult = await login(address, userIdentifier)

        if (loginResult.success) {
          // Navigate to home page
          router.push("/")
          return true
        } else {
          setError(loginResult.error || "Login failed. Please try again.")
          return false
        }
      } else {
        setError("Could not get wallet address. Please try again.")
        return false
      }
    } catch (error) {
      console.error("Error verifying wallet:", error)
      setError("Failed to verify wallet. Please try again.")
      return false
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-end justify-center">
      
      {/* Full screen background image using Next.js Image component for better optimization */}
      <div className="absolute inset-0 z-0">
        <img
          src="/login.jpg"
          alt="Login background"
          className="absolute inset-0 w-full h-full object-cover"
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="mb-20 w-full max-w-xs px-4 z-10"
      >
        {error && <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">{error}</div>}
        <div className="mb-6">
  <label htmlFor="referral" className="block text-sm font-medium text-gray-700 mb-1">
    
  </label>
  <div className="relative">
    <input
      id="referral"
      type="text"
      placeholder="Enter referral code (optional)"
      value={referralCode}
      onChange={(e) => setReferralCode(e.target.value)}
      className="w-full rounded-xl border border-gray-300 bg-white py-3 px-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-black focus:border-transparent transition duration-200"
    />
    <div className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-gray-400">
      #
    </div>
  </div>
</div>

        {referralWarning && (
  <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 px-3 py-2 rounded mb-3 text-sm">
    {referralWarning}
  </div>
)}

        <button
          onClick={signInWithWallet}
          style={{ backgroundColor: "#2E5283" }}
          className="w-full text-white border border-black font-medium py-4 rounded-xl mb-6 hover:from-black hover:to-gray-800 transition-all duration-300 flex items-center justify-center gap-2 shadow-md"
          disabled={isLoading}
        >
          {isLoading ? (
            "Connecting..."
          ) : (
            <>
              <Globe className="text-white" size={20} />
              Connect Wallet
            </>
          )}
        </button>

      </motion.div>
    </div>
  )
}