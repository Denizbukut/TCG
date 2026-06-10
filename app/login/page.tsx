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
  const t = (key: string) => key // Fallback function
  
  useEffect(() => {
    if (typeof window !== "undefined") {
      const urlParams = new URLSearchParams(window.location.search)
      const ref = urlParams.get("ref")
      if (ref) setReferralCode(ref)
    }
  }, [])


  const { user } = useAuth()

  useEffect(() => {
    // Check if user is already logged in - if yes, redirect to home
    if (user) {
      router.push("/")
    }
  }, [user, router])


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
        // Mark user as verified as human (for persistent login)
        localStorage.setItem("isVerifiedAsHuman", "true")

        // Check if user exists in database and create if not
        try {
          // Create Supabase client
          const supabase = createClient(
            "https://lyqscqywaxqhodhzjued.supabase.co",
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

          // Don't create user here - let auth-context handle it with referral logic
          if (existingUser) {
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

        // Login with the auth context (including referral code)
        const loginResult = await login(address, userIdentifier, referralCode)

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
    <div className="min-h-screen relative flex items-end justify-center overflow-hidden bg-[#0b1026]">
      {/* Pure CSS background — no network requests, no external image */}
      <div className="absolute inset-0 z-0">
        {/* Base gradient */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#1b1040] via-[#0b1026] to-black" />
        {/* Glow blobs */}
        <div className="absolute -top-24 -left-24 h-80 w-80 rounded-full bg-purple-600/30 blur-3xl" />
        <div className="absolute top-1/3 -right-24 h-80 w-80 rounded-full bg-blue-500/25 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-72 w-72 rounded-full bg-pink-500/20 blur-3xl" />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.08]"
          style={{
            backgroundImage:
              "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />
        {/* Darken toward the bottom so the form stays readable */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
      </div>

      {/* Title */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="absolute top-24 left-0 right-0 z-10 px-4 text-center"
      >
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-lg sm:text-4xl">
          Anime World <span className="text-purple-400">TCG</span>
        </h1>
        <p className="mt-2 text-sm text-white/70">Collect, trade and battle anime cards</p>
      </motion.div>

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
      placeholder="Enter Referral Code"
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