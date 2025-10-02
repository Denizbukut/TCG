"use client"

import { useState, useEffect, useRef } from "react"
import { MiniKit } from "@worldcoin/minikit-js"
import { ethers } from "ethers"
import { motion } from "framer-motion"
import { Client, Multicall3 } from "@holdstation/worldchain-ethers-v6"
import {
  config,
  HoldSo,
  SwapHelper,
  TokenProvider,
  ZeroX,
  inmemoryTokenStorage,
  type SwapParams,
} from "@holdstation/worldchain-sdk"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { CheckCircle, ArrowUpDown, Ticket, Wallet, ArrowRight } from "lucide-react"
import MobileNav from "@/components/mobile-nav"
import { useWldPrice } from "@/contexts/WldPriceContext"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { toast } from "@/components/ui/use-toast"
import AniBanner from "@/components/ani-banner"

const discount = false // Set to true to show discounts, false to hide them

const TOKENS = [
  {
    address: "0x2cFc85d8E48F8EAB294be644d9E25C3030863003",
    symbol: "WLD",
    name: "Worldcoin",
    decimals: 18,
    logo: "https://ani-labs.xyz/worldcoin-org-wld-logo.png",
    color: "#000000",
  },
  {
    address: "0x4d0f53f8810221579627eF6Dd4d64Ca107b2BEF8",
    symbol: "ANI",
    name: "Ani Token",
    decimals: 18,
    logo: "https://ani-labs.xyz/ani_labs_black.png",
    color: "#FFFFFF",
  },
]

const RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public"

const provider = new ethers.JsonRpcProvider(
  RPC_URL,
  { chainId: 480, name: "worldchain" },
  { staticNetwork: true },
)

const client = new Client(provider)
config.client = client
config.multicall3 = new Multicall3(provider)

const swapHelper = new SwapHelper(client, { tokenStorage: inmemoryTokenStorage })
const tokenProvider = new TokenProvider({ client, multicall3: config.multicall3 })
const zeroX = new ZeroX(tokenProvider, inmemoryTokenStorage)
const worldSwap = new HoldSo(tokenProvider, inmemoryTokenStorage)

swapHelper.load(zeroX)
swapHelper.load(worldSwap)

const balanceAbi = ["function balanceOf(address) view returns (uint256)"]
const decimalsAbi = ["function decimals() view returns (uint8)"]
const waitTimeAbi = ["function timeUntilNextMint(address) view returns (uint256)"]

export default function AniPage() {
  const { user, refreshUserData } = useAuth()
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [tokenBalance, setTokenBalance] = useState<string | null>(null)
  const [aniDisplayBalance, setAniDisplayBalance] = useState("0")
  const [secondsToWait, setSecondsToWait] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [showSwapSuccess, setShowSwapSuccess] = useState(false)
  const [amountIn, setAmountIn] = useState("")
  const [amountOut, setAmountOut] = useState("")
  const [isGettingQuote, setIsGettingQuote] = useState(false)
  const [quote, setQuote] = useState<any>(null)
  const [tokenBalances, setTokenBalances] = useState<Record<string, string>>({})
  const [isExchanging, setIsExchanging] = useState(false)
  const [showExchangeSuccess, setShowExchangeSuccess] = useState(false)
  const { price: wldPrice } = useWldPrice()
  const [canAniSwap, setCanAniSwap] = useState(true)
  const [aniSwapCooldown, setAniSwapCooldown] = useState<number | null>(null)
  const [aniSwapTimerDisplay, setAniSwapTimerDisplay] = useState("00:00:00")
  const [lastSwapTime, setLastSwapTime] = useState<Date | null>(null)
  const [swapCooldown, setSwapCooldown] = useState<number | null>(null)
  const [swapTimerDisplay, setSwapTimerDisplay] = useState("00:00:00")
  const swapInterval = 6 * 60 * 60 * 1000 // 6h in ms
  const [canSwap, setCanSwap] = useState(true)
  const [aniBalance, setAniBalance] = useState<string>("0")
  const [isAniExchangeLoading, setIsAniExchangeLoading] = useState(false)
  const [aniExchangeCooldown, setAniExchangeCooldown] = useState<number | null>(null)
  const [aniExchangeTimerDisplay, setAniExchangeTimerDisplay] = useState("00:00:00")
  const aniExchangeRef = useRef<NodeJS.Timeout | null>(null)

  const wldToken = TOKENS.find((t) => t.symbol === "WLD")!
  const aniToken = TOKENS.find((t) => t.symbol === "ANI")!

  const { user: authUser, refreshUserData: authRefreshUserData } = useAuth()

  // On mount: check if user.world_id exists
  useEffect(() => {
    const fetchWallet = async () => {
      if (!authUser?.username) return
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return
      const { data } = await supabase
        .from("users")
        .select("world_id, last_ani_swap")
        .eq("username", authUser.username)
        .single()
      if (typeof data?.world_id === "string" && data.world_id.length > 0) {
        setWalletAddress(data.world_id)
        // Load $ANI balance
        await loadAniBalance(data.world_id)
        // Cooldown
        if (typeof data?.last_ani_swap === "string" || typeof data?.last_ani_swap === "number") {
          const last = new Date(data.last_ani_swap)
          const diff = new Date().getTime() - last.getTime()
          const interval = 6 * 60 * 60 * 1000 // 6 Stunden
          if (diff < interval) {
            setAniExchangeCooldown(interval - diff)
            setAniExchangeTimerDisplay(formatTimeRemaining(interval - diff))
          }
        }
      }
    }
    fetchWallet()
  }, [authUser?.username])

  // Timer for cooldown
  useEffect(() => {
    if (!aniExchangeCooldown || aniExchangeCooldown <= 0) return
    if (aniExchangeRef.current) clearInterval(aniExchangeRef.current)
    aniExchangeRef.current = setInterval(() => {
      setAniExchangeCooldown((prev) => {
        if (!prev || prev <= 1000) {
          clearInterval(aniExchangeRef.current!)
          setAniExchangeTimerDisplay("00:00:00")
          return null
        }
        const updated = prev - 1000
        setAniExchangeTimerDisplay(formatTimeRemaining(updated))
        return updated
      })
    }, 1000)
    return () => {
      if (aniExchangeRef.current) clearInterval(aniExchangeRef.current)
    }
  }, [aniExchangeCooldown])

  const formatTimeRemaining = (milliseconds: number) => {
    if (!milliseconds || milliseconds <= 0) return "00:00:00"
    milliseconds = Math.max(0, milliseconds)
    const hours = Math.floor(milliseconds / (1000 * 60 * 60))
    const minutes = Math.floor((milliseconds % (1000 * 60 * 60)) / (1000 * 60))
    const seconds = Math.floor((milliseconds % (1000 * 60)) / 1000)
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`
  }

  const loadAniBalance = async (address: string) => {
    // Use ethers to get $ANI balance
    try {
      const contract = new ethers.Contract(
        "0x4d0f53f8810221579627eF6Dd4d64Ca107b2BEF8",
        ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"],
        provider
      )
      const rawBalance = await contract.balanceOf(address)
      const decimals = await contract.decimals()
      setAniBalance(ethers.formatUnits(rawBalance, decimals))
      // Also update WLD and ANI balances for the swap window
      await loadTokenBalances(address)
    } catch (err) {
      setAniBalance("0")
      // Still try to update swap balances
      await loadTokenBalances(address)
    }
  }

  const handleConnectWallet = async () => {
    setIsLoading(true)
    try {
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: crypto.randomUUID(),
        expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notBefore: new Date(Date.now() - 60 * 1000),
      })
      const address = MiniKit.user?.walletAddress
      if (address && authUser?.username) {
        setWalletAddress(address)
        await loadAniBalance(address)
        // Save to DB
        const supabase = getSupabaseBrowserClient()
        if (supabase) {
          await supabase.from("users").update({ world_id: address }).eq("username", authUser.username)
        }
      }
    } catch (error) {
      toast({ title: "Wallet Connect Error", description: "Could not connect wallet.", variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleAniExchange = async () => {
    if (!walletAddress || !authUser?.username) return
    if (parseFloat(aniBalance) < 100) {
      toast({ title: "Not enough $ANI", description: "You need at least 100 $ANI.", variant: "destructive" })
      return
    }
    
    // Check if 6 hours have passed since last claim
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return
    
    try {
      // Erst: Versuche Benutzer über username zu finden
      let { data: userData, error } = await supabase
        .from("users")
        .select("last_ani_swap")
        .eq("username", authUser.username)
        .single()

      // Fallback: Suche Benutzer über world_id
      if (error || !userData) {
        console.warn("User not found via username, trying world_id fallback...")
        const { data: userByWorldId, error: fallbackError } = await supabase
          .from("users")
          .select("last_ani_swap")
          .eq("world_id", walletAddress)
          .single()

        if (!fallbackError && userByWorldId) {
          userData = userByWorldId
          error = null
        }
      }

      if (!error && userData?.last_ani_swap && typeof userData.last_ani_swap === 'string') {
        const lastSwap = new Date(userData.last_ani_swap)
        const now = new Date()
        const timeDiff = now.getTime() - lastSwap.getTime()
        const sixHours = 6 * 60 * 60 * 1000 // 6 hours in milliseconds
        
        if (timeDiff < sixHours) {
          const remainingTime = sixHours - timeDiff
          const remainingHours = Math.floor(remainingTime / (60 * 60 * 1000))
          const remainingMinutes = Math.floor((remainingTime % (60 * 60 * 1000)) / (60 * 1000))
          toast({ 
            title: "Cooldown Active", 
            description: `You can exchange again in ${remainingHours}h ${remainingMinutes}m`, 
            variant: "destructive" 
          })
          return
        }
      }
    } catch (error) {
      console.error("Error checking last swap time:", error)
      // Continue with exchange if we can't check the time
    }
    
    setIsAniExchangeLoading(true)
    try {
      // Burn 50 $ANI
      const aniTokenAbi = [
        {
          inputs: [
            { internalType: "address", name: "to", type: "address" },
            { internalType: "uint256", name: "amount", type: "uint256" },
          ],
          name: "transfer",
          outputs: [{ internalType: "bool", name: "", type: "bool" }],
          stateMutability: "nonpayable",
          type: "function",
        },
      ]
      const aniTokenAddress = "0x4d0f53f8810221579627eF6Dd4d64Ca107b2BEF8"
      const burnAddress = "0x000000000000000000000000000000000000dEaD"
      const amountToBurn = BigInt(100 * 1e18)
      const { finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: aniTokenAddress,
            abi: aniTokenAbi,
            functionName: "transfer",
            args: [burnAddress, amountToBurn],
          },
        ],
      })
      console.log("finalPayload", finalPayload)
      if (finalPayload.status !== "success") throw new Error("Blockchain transaction failed")
      // Update legendary_tickets and cooldown in DB
      const now = new Date()

      // Erst: Versuche Benutzer über username zu finden
      let { data: userData, error } = await supabase
        .from("users")
        .select("elite_tickets")
        .eq("username", authUser.username)
        .single()

      if (error || !userData) {
        console.warn("User not found via username, trying world_id fallback...")

        // Fallback: Suche Benutzer über world_id
        const { data: userByWorldId, error: fallbackError } = await supabase
          .from("users")
          .select("elite_tickets")
          .eq("world_id", walletAddress)
          .single()

        if (fallbackError || !userByWorldId) {
          throw new Error("Could not find user by username or world_id")
        }

        // Update über world_id
        const { error: updateError } = await supabase
          .from("users")
          .update({
            elite_tickets:
              (typeof userByWorldId.elite_tickets === "number"
                ? userByWorldId.elite_tickets
                : Number(userByWorldId.elite_tickets) || 0) + 3,
            last_ani_swap: now.toISOString(),
          })
          .eq("world_id", walletAddress)

        if (updateError) {
          throw new Error("Could not update user by world_id")
        }
      } else {
        // Update über username
        const { error: updateError } = await supabase
          .from("users")
          .update({
            elite_tickets:
              (typeof userData.elite_tickets === "number"
                ? userData.elite_tickets
                : Number(userData.elite_tickets) || 0) + 3,
            last_ani_swap: now.toISOString(),
          })
          .eq("username", authUser.username)

        if (updateError) {
          throw new Error("Could not update user by username")
        }
      }

      setAniBalance((prev) => (parseFloat(prev) - 100).toString())
      // Set cooldown to 6 hours
      setAniExchangeCooldown(6 * 60 * 60 * 1000)
      setAniExchangeTimerDisplay(formatTimeRemaining(6 * 60 * 60 * 1000))
      authRefreshUserData?.()
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Something went wrong.", variant: "destructive" })
    } finally {
      setIsAniExchangeLoading(false)
    }
  }

  // Load both balances for swap window
  const loadTokenBalances = async (address: string) => {
    try {
      const balances: Record<string, string> = {}
      for (const token of TOKENS) {
        try {
          const contract = new ethers.Contract(token.address, balanceAbi, provider)
          const rawBalance = await contract.balanceOf(address)
          balances[token.address] = ethers.formatUnits(rawBalance, token.decimals)
        } catch (err) {
          balances[token.address] = "0"
        }
      }
      setTokenBalances(balances)
    } catch (err) {
      console.error("Error loading token balances:", err)
    }
  }

  // Load main $ANI balance for the top card
  const updateUserData = async (address: string) => {
    try {
      const waitTimeContract = new ethers.Contract(aniToken.address, waitTimeAbi, provider)
      const codec = client.codec(balanceAbi)
      const encodedCall = codec.encodeFunctionData("balanceOf", [address])
      const rawResult = await provider.call({
        to: aniToken.address,
        data: encodedCall,
      })
      const [rawBalance] = codec.decodeFunctionResult("balanceOf", rawResult)
      const decimalsContract = new ethers.Contract(aniToken.address, decimalsAbi, provider)
      const decimals = await decimalsContract.decimals()
      setTokenBalance(ethers.formatUnits(rawBalance, decimals))
      const waitTime = await waitTimeContract.timeUntilNextMint(address)
      setSecondsToWait(Number(waitTime))
    } catch (err) {
      console.error("Error using codec + provider.call:", err)
    }
  }

  useEffect(() => {
    const addr = MiniKit.user?.walletAddress
    const username = MiniKit.user?.username
    if (addr) {
      setWalletAddress(addr)
      setUsername(username || addr)
      updateUserData(addr)
      loadTokenBalances(addr)
    }
  }, [])

  useEffect(() => {
    const newBalance = tokenBalances[aniToken.address]
    if (newBalance) {
      setAniDisplayBalance(newBalance)
    }
  }, [tokenBalances])

  const formatNumber = (value: string | number) => {
    const num = typeof value === "string" ? Number.parseFloat(value) : value
    if (isNaN(num)) return "0"
    if (num % 1 === 0) return num.toString()
    return num.toFixed(4).replace(/\.?0+$/, "")
  }

  const getUsdValue = (amount: string) => {
    if (!amount || !wldPrice) return "$0"
    const value = Number.parseFloat(amount) * wldPrice
    return `$${value.toFixed(2)}`
  }

  const truncateAddress = (address: string) => {
    if (!address) return ""
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Get quote for swap
  const getQuote = async () => {
    if (!amountIn || Number.parseFloat(amountIn) <= 0) return
    setIsGettingQuote(true)
    try {
      const params: SwapParams["quoteInput"] = {
        tokenIn: wldToken.address,
        tokenOut: aniToken.address,
        amountIn,
        slippage: "0.3",
        fee: "0.2",
        preferRouters: ["hold-so", "0x"],
      }
      const quoteResponse = await swapHelper.estimate.quote(params)
      setQuote(quoteResponse)
      setAmountOut(quoteResponse.addons?.outAmount || "0")
    } catch (error) {
      console.error("Quote failed:", error)
    } finally {
      setIsGettingQuote(false)
    }
  }

  // Execute swap
  const doSwap = async () => {
    if (!walletAddress || !quote || !amountIn) return
    try {
      const swapParams: SwapParams["input"] = {
        tokenIn: wldToken.address,
        tokenOut: aniToken.address,
        amountIn,
        tx: {
          data: quote.data,
          to: quote.to,
          value: quote.value,
        },
        partnerCode: "14298",
        feeAmountOut: quote.addons?.feeAmountOut,
        fee: "0.2",
        feeReceiver: "0x4bb270ef6dcb052a083bd5cff518e2e019c0f4ee",
      }
      setIsLoading(true)
      const result = await swapHelper.swap(swapParams)
      if (result.success) {
        await new Promise((res) => setTimeout(res, 2500))
        await provider.getBlockNumber()
        await updateUserData(walletAddress)
        await loadTokenBalances(walletAddress)
        await loadAniBalance(walletAddress)
        setShowSwapSuccess(true)
        setAmountIn("")
        setQuote(null)
        setTimeout(() => setShowSwapSuccess(false), 3000)
      }
    } catch (error) {
      console.error("Swap failed:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (amountIn && Number.parseFloat(amountIn) > 0 && walletAddress) {
        getQuote()
      }
    }, 500)
    return () => clearTimeout(timeoutId)
  }, [amountIn, walletAddress])

  // Exchange $ANI for Tickets (dummy handler)
  const handleExchangeTickets = async () => {
    setIsExchanging(true)
    setTimeout(() => {
      setIsExchanging(false)
      setShowExchangeSuccess(true)
      setTimeout(() => setShowExchangeSuccess(false), 2500)
    }, 1500)
  }

  // Always reset walletAddress on mount so connect button is shown
  useEffect(() => {
    setWalletAddress(null)
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-[#f6f8fa] p-4 pb-24">
      <div className="max-w-2xl mx-auto space-y-8 py-8">
        {/* Banner Header */}
        <AniBanner />
       
        {/* Wallet Connection Card */}
        {!walletAddress && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
            <Card className="bg-white border border-[#e5e7eb] shadow-md rounded-2xl">
              <CardContent className="p-6">
                <div className="text-center">
                  <Wallet className="h-12 w-12 text-[#3D9AFF] mx-auto mb-4" />
                  <h3 className="text-xl font-semibold mb-2 text-gray-900">Connect Your Wallet</h3>
                  <p className="text-gray-500 mb-6">
                    Connect your Worldcoin wallet to claim $ANI tokens and start swapping
                  </p>
                  <Button
                    onClick={handleConnectWallet}
                    disabled={isLoading}
                    className="bg-gradient-to-r from-[#3D9AFF] to-[#2D8AEF] hover:from-[#2D8AEF] hover:to-[#1D7ADF] text-white px-8 py-4 text-lg font-semibold rounded-2xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300 border-0"
                  >
                    {isLoading ? (
                      <div className="flex items-center space-x-2">
                        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                        <span>Connecting...</span>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <Wallet className="h-5 w-5" />
                        <span>Connect Worldcoin Wallet</span>
                      </div>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Main Content - Only show when wallet is connected */}
        {walletAddress && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
            {/* Token Balance */}
            <Card className="bg-white border border-[#e5e7eb] shadow-md rounded-2xl max-w-sm mx-auto">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-[#38bdf8] to-[#0e7490] flex items-center justify-center">
                      <img src={aniToken.logo || "/placeholder.svg"} alt="ANI" className="w-7 h-7" />
                    </div>
                    <div>
                      <p className="text-sm text-gray-500">$ANI Balance</p>
                      <p className="font-bold text-[#0891b2] text-lg">
                        {formatAniBalance(aniBalance)}
                      </p>
                      <button
                        onClick={() => walletAddress && navigator.clipboard.writeText(walletAddress)}
                        className="text-xs text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                      >
                        {walletAddress ? truncateAddress(walletAddress) : "-"}
                      </button>
                    </div>
                  </div>
                  <Badge className="bg-[#e0f2fe] text-[#0891b2] border-[#38bdf8]">ANI</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Exchange Button directly below balance */}
            <div className="max-w-sm mx-auto mt-1 mb-1">
              {aniExchangeCooldown && aniExchangeCooldown > 0 ? (
                <Button disabled className="w-full h-12 bg-[#0891b2] text-white text-base font-semibold rounded-2xl">
                  Exchange available in {aniExchangeTimerDisplay}
                </Button>
              ) : (
                <Button
                  onClick={handleAniExchange}
                  disabled={isAniExchangeLoading || parseFloat(aniBalance) < 100}
                  className="w-full h-12 bg-[#0891b2] hover:bg-[#0e7490] text-white text-base font-semibold rounded-2xl"
                >
                  {isAniExchangeLoading ? "Processing..." : "Exchange 100 $ANI for 3 Legendary Tickets"}
                </Button>
              )}
            </div>

            {/* Animated Claim $ANI Button below Exchange */}
            <div className="max-w-sm mx-auto flex justify-center">
              <motion.a
                href="https://worldcoin.org/mini-app?app_id=app_4593f73390a9843503ec096086b43612"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 bg-gradient-to-r from-gray-900 to-black hover:from-gray-800 hover:to-gray-900 text-white font-semibold py-2 px-4 rounded-2xl shadow-md text-base transition-all duration-200 border-0"
                initial={{ scale: 1, y: 0 }}
                animate={{ scale: [1, 1.08, 1], y: [0, -6, 0] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
                whileHover={{ scale: 1.12 }}
              >
                <img src={aniToken.logo || "/ani_labs_black.png"} alt="$ANI" className="w-6 h-6 rounded-full bg-white/10" />
                Claim free daily $ANI
                <ArrowRight className="w-5 h-5 ml-1 animate-pulse" />
              </motion.a>
            </div>

            {/* Swap Window */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="max-w-lg mx-auto"
            >
              <Card className="bg-white border border-[#e5e7eb] shadow-lg rounded-2xl overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-[#0891b2]">
                    <ArrowUpDown className="h-5 w-5" />
                    Swap WLD to $ANI
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-2 flex flex-col h-full">
                  {/* From Token Input (WLD) */}
                  <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl flex flex-col flex-grow">
                    <div className="flex items-center justify-between p-3 pb-0">
                      <Input
                        type="number"
                        placeholder="0"
                        value={amountIn}
                        onChange={(e) => setAmountIn(e.target.value)}
                        className={`bg-transparent border-none font-light text-gray-900 placeholder-gray-400 focus:ring-0 h-12 flex-1 px-3 ${
                          amountIn.length > 10 ? "text-lg" : amountIn.length > 6 ? "text-xl" : "text-2xl"
                        }`}
                      />

                      <div className="flex items-center space-x-2 bg-[#f3f4f6] rounded-full px-3 py-2 ml-3 h-12" style={{ minHeight: '48px' }}>
                        <img src={wldToken.logo || "/placeholder.svg"} alt="WLD" className="w-5 h-5" />
                        <span className="font-medium text-gray-900">WLD</span>
                      </div>
                    </div>
                    {/* Spacer to push bottom row down */}
                    <div className="flex-grow" />

                    {/* Bottom row: USD left, Balance right */}
                    {tokenBalances[wldToken.address] && (
                      <div className="flex items-center justify-between w-full px-3 py-2 mt-0">
                        {/* Dollar value */}
                        <span className="text-sm text-gray-400 pl-3">{getUsdValue(amountIn)}</span>

                        {/* Balance + Max */}
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-400">{formatNumber(tokenBalances[wldToken.address])} WLD</span>
                          <button
                            onClick={() => setAmountIn(tokenBalances[wldToken.address] || "0")}
                            className="bg-[#38bdf8] hover:bg-[#0e7490] text-white text-xs px-2 py-1 rounded-full font-medium transition-colors"
                          >
                            Max
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Swap Arrow */}
                  <div className="flex justify-center">
                    <div className="p-2 bg-white border-2 border-[#e5e7eb] rounded-full">
                      <svg
                        className="h-4 w-4 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                      </svg>
                    </div>
                  </div>

                  {/* To Token Output (ANI) */}
                  <div className="bg-[#f9fafb] border border-[#e5e7eb] rounded-2xl px-4 py-3">
                    <div className="flex items-center justify-between">
                      {/* Zahl */}
                      <div
                        className={`font-light text-gray-900 ${
                          amountOut && amountOut.length > 8
                            ? "text-lg"
                            : amountOut && amountOut.length > 6
                              ? "text-xl"
                              : "text-2xl"
                        }`}
                      >
                        {isGettingQuote ? (
                          <div className="flex items-center space-x-2">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0891b2]"></div>
                          </div>
                        ) : (
                          formatNumber(amountOut || "0")
                        )}
                      </div>

                      {/* Symbol */}
                      <div className="flex items-center space-x-2 bg-[#e0f2fe] rounded-full px-4 py-1.5">
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-gradient-to-br from-[#38bdf8] to-[#0e7490] flex items-center justify-center">
                          <img src={aniToken.logo || "/placeholder.svg"} alt="ANI" className="w-7 h-7" />
                        </div>
                        <span className="font-medium text-gray-900">ANI</span>
                      </div>
                    </div>

                    {/* Balance darunter */}
                    {tokenBalances[aniToken.address] && (
                      <div className="text-right mt-2">
                        <span className="text-sm text-gray-400">
                          {formatNumber(tokenBalances[aniToken.address])} ANI
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Quote Details */}
                  {quote && (
                    <motion.div
                      className="bg-[#f9fafb] border border-[#e5e7eb] rounded-xl p-3 space-y-1"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Expected Output:</span>
                        <span className="text-gray-900 font-medium">
                          {quote.addons?.outAmount ? Number.parseFloat(quote.addons.outAmount).toFixed(4) : "0"} ANI
                        </span>
                      </div>
                      {quote.addons?.minReceived && (
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Minimum Received:</span>
                          <span className="text-gray-900">
                            {Number.parseFloat(quote.addons.minReceived).toFixed(4)} ANI
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}

                  {/* Swap Button */}
                  {showSwapSuccess ? (
                    <motion.button
                      disabled
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ duration: 0.3, ease: "easeOut" }}
                      className="w-full h-14 bg-green-400 text-white text-lg font-semibold rounded-2xl transition-all duration-300 flex items-center justify-center space-x-2 shadow-md"
                    >
                      <motion.div
                        initial={{ rotate: -90, scale: 0 }}
                        animate={{ rotate: 0, scale: 1 }}
                        transition={{ type: "spring", stiffness: 200, damping: 12 }}
                      >
                        <CheckCircle className="h-5 w-5 text-white" />
                      </motion.div>
                      <motion.span
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.1 }}
                      >
                        Swap completed successfully!
                      </motion.span>
                    </motion.button>
                  ) : (
                    <Button
                      onClick={doSwap}
                      disabled={!quote || isLoading || !amountIn || Number.parseFloat(amountIn) <= 0}
                      className="w-full h-14 bg-[#0891b2] hover:bg-[#0e7490] text-white text-lg font-semibold rounded-2xl transition-all duration-300 shadow-sm"
                    >
                      {isLoading ? (
                        <div className="flex items-center space-x-2">
                          <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#0891b2]"></div>
                          <span>Swapping...</span>
                        </div>
                      ) : !quote ? (
                        "Get Quote"
                      ) : (
                        "Swap $WLD for $ANI"
                      )}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </div>
      <MobileNav />
    </div>
  )
}

// Hilfsfunktion für die Balance-Anzeige
function formatAniBalance(balance: string) {
  const num = parseFloat(balance)
  if (isNaN(num)) return "0"
  const fixed = num.toFixed(3)
  return fixed.endsWith(".000") ? num.toFixed(0) : fixed
}