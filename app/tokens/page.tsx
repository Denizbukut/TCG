"use client"

import React, { useState, useEffect } from "react"
import { ethers } from "ethers"
import { MiniKit } from "@worldcoin/minikit-js"
import { useAuth } from "@/contexts/auth-context"
import MobileNav from "@/components/mobile-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Coins, Calendar, Wallet, CheckCircle, XCircle, Copy, Sparkles, Zap, Upload, Image as ImageIcon, X, ChevronDown, ChevronUp, ExternalLink } from "lucide-react"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import ImageEditor from "@/components/image-editor"
import { toast } from "@/components/ui/use-toast"
import { useI18n } from "@/contexts/i18n-context"
import ProtectedRoute from "@/components/protected-route"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { motion } from "framer-motion"
import { useWldPrice } from "@/contexts/WldPriceContext"

const PUF_CONTRACT_ADDRESS_1 = "0xc301BaCE6E9409B1876347a3dC94EC24D18C1FE4"
const PUF_CONTRACT_ADDRESS_2 = "0x3140167E09d3cfB67b151C25d54fa356f644712D"
const WLD_TOKEN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003" // WLD (World Chain)
const DEV_WALLET = "0xDb4D9195EAcE195440fbBf6f80cA954bf782468E" // Dev wallet for receiving card creation payments

const RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public"

const provider = new ethers.JsonRpcProvider(
  RPC_URL,
  { chainId: 480, name: "worldchain" },
  { staticNetwork: true },
)

const erc20TransferAbi = [{
  type: "function",
  name: "transfer",
  stateMutability: "nonpayable",
  inputs: [
    { name: "to", type: "address" },
    { name: "amount", type: "uint256" }
  ],
  outputs: [{ type: "bool" }]
}]

const toWei = (amount: number | string) => {
  const [intStr, rawFrac = ""] = String(amount).replace(",", ".").split(".")
  const fracStr = (rawFrac + "000000000000000000").slice(0, 18)

  const base = BigInt(intStr || "0") * BigInt("1000000000000000000")
  const frac = BigInt(fracStr || "0")

  return (base + frac).toString()
}

const CARD_CREATION_PRICES: Record<string, { usd: number; wld: number }> = {
  common: { usd: 3, wld: 0 }, // WLD amount will be calculated based on price
  rare: { usd: 10, wld: 0 },
  epic: { usd: 25, wld: 0 },
  legendary: { usd: 50, wld: 0 },
}

// Contract 1 ABI (with virtual reserves)
const PUF_CONTRACT_ABI_1 = [
  "function getCreatorTokens(address creator) external view returns (address[] memory)",
  "function tokens(address tokenAddress) external view returns (address creator, string memory name, string memory symbol, string memory IMGURL, string memory description, string memory xURL, uint256 creationDate, uint8 phase, address poolAddress, uint256 totalLiquidity, uint256 xVirtualReserve, uint256 yVirtualReserve)",
]

// Contract 2 ABI (with totalRaised)
const PUF_CONTRACT_ABI_2 = [
  "function getCreatorTokens(address creator) external view returns (address[] memory)",
  "function tokens(address tokenAddress) external view returns (address creator, string memory name, string memory symbol, string memory IMGURL, string memory description, string memory xURL, uint256 creationDate, uint256 totalRaised, uint8 phase, address poolAddress, uint256 totalLiquidity)",
]

interface CardData {
  image_url: string
  rarity: string
}

interface TokenInfo {
  tokenAddress: string
  contractType: "contract1" | "contract2"
  creator: string
  name: string
  symbol: string
  IMGURL: string
  description: string
  xURL: string
  creationDate: bigint
  phase: number
  poolAddress: string
  totalLiquidity: bigint
  isListed?: boolean
  cardData?: CardData
  earnedAmount?: number
  // Contract 1 specific
  xVirtualReserve?: bigint
  yVirtualReserve?: bigint
  // Contract 2 specific
  totalRaised?: bigint
}

enum Phase {
  PRIVATE = 0,
  PUBLIC = 1,
}

export default function TokensPage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const { price: wldPrice } = useWldPrice()
  const [tokens, setTokens] = useState<TokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("listed")
  const [selectedToken, setSelectedToken] = useState<TokenInfo | null>(null)
  const [showCreateCard, setShowCreateCard] = useState(false)
  const [selectedRarity, setSelectedRarity] = useState<string>("common")
  const [selectedImage, setSelectedImage] = useState<File | string | null>(null)
  const [showImageEditor, setShowImageEditor] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [creatingCard, setCreatingCard] = useState(false)
  const [isCreatorBenefitsOpen, setIsCreatorBenefitsOpen] = useState(false)

  useEffect(() => {
    const loadWalletAddress = async () => {
      try {
        // Try to get wallet address from MiniKit first
        const miniKitAddress = MiniKit.user?.walletAddress
        if (miniKitAddress) {
          setWalletAddress(miniKitAddress)
          await loadTokens(miniKitAddress)
          return
        }

        // Fallback to user wallet_address from auth context
        if (user?.wallet_address) {
          setWalletAddress(user.wallet_address)
          await loadTokens(user.wallet_address)
        }
      } catch (error) {
        console.error("Error loading wallet address:", error)
        toast({
          title: "Error",
          description: "Failed to load wallet address",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    loadWalletAddress()
  }, [user])

  const loadTokens = async (address: string) => {
    try {
      setLoading(true)

      // Load tokens from both contracts in parallel
      const contract1 = new ethers.Contract(PUF_CONTRACT_ADDRESS_1, PUF_CONTRACT_ABI_1, provider)
      const contract2 = new ethers.Contract(PUF_CONTRACT_ADDRESS_2, PUF_CONTRACT_ABI_2, provider)

      const [tokenAddresses1, tokenAddresses2] = await Promise.all([
        contract1.getCreatorTokens(address).catch(() => [] as string[]),
        contract2.getCreatorTokens(address).catch(() => [] as string[]),
      ])

      // Get TokenInfo for each token from contract 1
      const tokenPromises1 = tokenAddresses1.map(async (tokenAddress: string) => {
        try {
          const tokenData = await contract1.tokens(tokenAddress)
          return {
            tokenAddress,
            contractType: "contract1" as const,
            creator: tokenData[0],
            name: tokenData[1],
            symbol: tokenData[2],
            IMGURL: tokenData[3],
            description: tokenData[4],
            xURL: tokenData[5],
            creationDate: tokenData[6],
            phase: tokenData[7],
            poolAddress: tokenData[8],
            totalLiquidity: tokenData[9],
            xVirtualReserve: tokenData[10],
            yVirtualReserve: tokenData[11],
          } as TokenInfo
        } catch (error) {
          console.error(`Error loading token ${tokenAddress} from contract 1:`, error)
          return null
        }
      })

      // Get TokenInfo for each token from contract 2
      const tokenPromises2 = tokenAddresses2.map(async (tokenAddress: string) => {
        try {
          const tokenData = await contract2.tokens(tokenAddress)
          return {
            tokenAddress,
            contractType: "contract2" as const,
            creator: tokenData[0],
            name: tokenData[1],
            symbol: tokenData[2],
            IMGURL: tokenData[3],
            description: tokenData[4],
            xURL: tokenData[5],
            creationDate: tokenData[6],
            totalRaised: tokenData[7],
            phase: tokenData[8],
            poolAddress: tokenData[9],
            totalLiquidity: tokenData[10],
          } as TokenInfo
        } catch (error) {
          console.error(`Error loading token ${tokenAddress} from contract 2:`, error)
          return null
        }
      })

      // Wait for all tokens to load and combine them
      const [tokens1, tokens2] = await Promise.all([
        Promise.all(tokenPromises1),
        Promise.all(tokenPromises2),
      ])

      const allTokens = [
        ...tokens1.filter((token) => token !== null),
        ...tokens2.filter((token) => token !== null),
      ] as TokenInfo[]

      // Check which tokens are listed in the cards table
      const tokensWithListedStatus = await checkTokensListed(allTokens.map(t => t.tokenAddress))
      const tokensWithStatus = allTokens.map(token => ({
        ...token,
        isListed: tokensWithListedStatus[token.tokenAddress]?.isListed || false,
        cardData: tokensWithListedStatus[token.tokenAddress]?.cardData,
        earnedAmount: tokensWithListedStatus[token.tokenAddress]?.earnedAmount,
      }))

      setTokens(tokensWithStatus)
    } catch (error) {
      console.error("Error loading tokens:", error)
      toast({
        title: "Error",
        description: "Failed to load tokens. Please try again.",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const handleConnectWallet = async () => {
    try {
      const { finalPayload } = await MiniKit.commandsAsync.walletAuth({
        nonce: crypto.randomUUID(),
        expirationTime: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        notBefore: new Date(Date.now() - 60 * 1000),
      })
      const address = MiniKit.user?.walletAddress
      if (address) {
        setWalletAddress(address)
        await loadTokens(address)
      }
    } catch (error) {
      toast({
        title: "Wallet Connect Error",
        description: "Could not connect wallet.",
        variant: "destructive",
      })
    }
  }

  const checkTokensListed = async (tokenAddresses: string[]): Promise<Record<string, { isListed: boolean; cardData?: CardData; earnedAmount?: number }>> => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return {}
    
    try {
      const result: Record<string, { isListed: boolean; cardData?: CardData; earnedAmount?: number }> = {}
      
      // Get all cards with contract_address, image_url, and rarity
      const { data: cards, error } = await (supabase
        .from("cards")
        .select("contract_address, image_url, rarity") as any)
      
      if (error) {
        console.error("Error fetching cards:", error)
        return {}
      }
      
      // Get earned amounts from card_creations
      const { data: cardCreations, error: creationsError } = await (supabase
        .from("card_creations")
        .select("token_address, earned_amount") as any)
      
      if (creationsError) {
        console.error("Error fetching card_creations:", creationsError)
      }
      
      // Create a map of contract addresses to card data (lowercase for comparison)
      const cardDataMap = new Map<string, CardData>()
      ;(cards || []).forEach((card: any) => {
        if (card.contract_address && card.image_url) {
          cardDataMap.set(card.contract_address.toLowerCase(), {
            image_url: card.image_url,
            rarity: card.rarity || "common",
          })
        }
      })
      
      // Create a map of token addresses to earned amounts (lowercase for comparison)
      const earnedAmountMap = new Map<string, number>()
      ;(cardCreations || []).forEach((creation: any) => {
        if (creation.token_address && creation.earned_amount !== undefined) {
          earnedAmountMap.set(creation.token_address.toLowerCase(), creation.earned_amount || 0)
        }
      })
      
      // Check each token address
      for (const address of tokenAddresses) {
        const lowerAddress = address.toLowerCase()
        const cardData = cardDataMap.get(lowerAddress)
        const earnedAmount = earnedAmountMap.get(lowerAddress)
        result[address] = {
          isListed: !!cardData,
          cardData: cardData,
          earnedAmount: earnedAmount,
        }
      }
      
      return result
    } catch (error) {
      console.error("Error checking listed status:", error)
      return {}
    }
  }

  const formatDate = (timestamp: bigint) => {
    const date = new Date(Number(timestamp) * 1000)
    return date.toLocaleDateString("de-DE", {
      year: "numeric",
      month: "short",
      day: "numeric",
    })
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    toast({
      title: t("tokens.copied", "Copied"),
      description: `${label} copied to clipboard`,
    })
  }

  const getCloudflareImageUrl = (imagePath?: string) => {
    if (!imagePath) {
      return "/placeholder.svg"
    }
    
    // Wenn schon http, dann direkt zurückgeben
    if (imagePath.startsWith("http")) {
      return imagePath
    }
    
    // Remove leading slash and any world_soccer/world-soccer prefix
    let cleaned = imagePath.replace(/^\/?(world[-_]?soccer\/)/i, "")
    
    // Remove any leading slashes to avoid double slashes
    cleaned = cleaned.replace(/^\/+/, "")
    
    // Pub-URL verwenden, KEIN world-soccer/ mehr anhängen!
    const finalUrl = `https://ani-labs.xyz/${encodeURIComponent(cleaned)}`
    
    return finalUrl
  }

  const getRarityStyles = (rarity: string) => {
    const rarityStyles: Record<string, { border: string }> = {
      common: {
        border: "border-4 border-gray-400",
      },
      rare: {
        border: "border-4 border-blue-500",
      },
      epic: {
        border: "border-4 border-purple-500",
      },
      legendary: {
        border: "border-4 border-yellow-500",
      },
      godlike: {
        border: "border-4 border-red-500",
      },
      goat: {
        border: "border-4 border-red-600",
      },
      wbc: {
        border: "border-4 border-red-800",
      },
    }
    
    return rarityStyles[rarity?.toLowerCase()] || rarityStyles.common
  }

  const handleImageSave = async (imageData: string) => {
    // Convert base64 to blob
    const response = await fetch(imageData)
    const blob = await response.blob()
    const file = new File([blob], "card-image.png", { type: "image/png" })
    setSelectedImage(imageData)
    setShowImageEditor(false)
  }

  const handleCreateCard = async () => {
    if (!selectedToken || !selectedImage || !walletAddress) return

    try {
      setCreatingCard(true)

      // Calculate WLD amount based on current price
      if (!wldPrice) {
        throw new Error('WLD price not available. Please try again.')
      }

      const priceInfo = CARD_CREATION_PRICES[selectedRarity]
      if (!priceInfo) {
        throw new Error('Invalid rarity selected')
      }

      const wldAmount = priceInfo.usd / wldPrice
      const wldAmountWei = toWei(wldAmount)

      console.log('=== Card Creation Payment ===')
      console.log('Rarity:', selectedRarity)
      console.log('USD Price:', priceInfo.usd)
      console.log('WLD Price:', wldPrice)
      console.log('WLD Amount:', wldAmount)
      console.log('WLD Amount (Wei):', wldAmountWei)
      console.log('Dev Wallet:', DEV_WALLET)
      console.log('============================')

      // Send WLD payment to dev wallet
      if (!MiniKit || !MiniKit.commandsAsync) {
        throw new Error("MiniKit is not available")
      }

      const { commandPayload, finalPayload } = await MiniKit.commandsAsync.sendTransaction({
        transaction: [
          {
            address: WLD_TOKEN,
            abi: erc20TransferAbi,
            functionName: "transfer",
            args: [DEV_WALLET, wldAmountWei.toString()],
          },
        ],
      })

      console.log("MiniKit transaction completed:", { commandPayload, finalPayload })

      if (finalPayload.status !== "success") {
        const status = finalPayload.status || "unknown"
        const errorMessage = (finalPayload as any).errorMessage || (finalPayload as any).error?.message || "Payment failed"
        throw new Error(`${errorMessage} (Transaction Status: ${status})`)
      }

      // Convert base64 to blob if needed
      let imageBlob: Blob
      if (typeof selectedImage === 'string') {
        const response = await fetch(selectedImage)
        imageBlob = await response.blob()
      } else {
        imageBlob = selectedImage
      }

      // Upload image to Cloudflare
      const formData = new FormData()
      formData.append('file', imageBlob, 'card-image.png')
      formData.append('tokenAddress', selectedToken.tokenAddress)

      const uploadResponse = await fetch('/api/upload-card-image', {
        method: 'POST',
        body: formData,
      })

      if (!uploadResponse.ok) {
        const errorData = await uploadResponse.json().catch(() => ({ error: 'Unknown error' }))
        console.error('Upload error response:', errorData)
        const errorMsg = errorData.error || 'Failed to upload image'
        const errorCode = uploadResponse.status
        throw new Error(`${errorMsg} (Error Code: ${errorCode})`)
      }

      const uploadData = await uploadResponse.json()

      
      // Save card to database with creator_address
      const supabase = getSupabaseBrowserClient()
      if (!supabase) throw new Error('Supabase client not available')
      
      const { error: cardError } = await (supabase.from('cards') as any).insert({
        contract_address: selectedToken.tokenAddress.toLowerCase(),
        name: selectedToken.name,
        character: selectedToken.name,
        rarity: selectedRarity.toLowerCase(),
        image_url: uploadData.path,
        creator_address: walletAddress.toLowerCase(),
        obtainable: true,
        epoch: 1,
      })
      
      if (cardError) {
        const errorMsg = cardError.message || 'Failed to save card to database'
        const errorCode = (cardError as any).code || (cardError as any).hint || 'UNKNOWN'
        throw new Error(`${errorMsg} (Error Code: ${errorCode})`)
      }

      // Save card creation record to database
      const { error: creationError } = await (supabase.from('card_creations') as any).insert({
        wallet_address: walletAddress.toLowerCase(),
        token_address: selectedToken.tokenAddress.toLowerCase(),
        rarity: selectedRarity,
        price_wld: wldAmount,
        price_usd: priceInfo.usd,
        image_url: uploadData.path,
      })

      if (creationError) {
        console.error('Failed to save card creation record:', creationError)
        // Don't fail the whole process if this fails
      }

      toast({
        title: "Success",
        description: `Card created successfully! You paid ${wldAmount.toFixed(4)} WLD ($${priceInfo.usd})`,
      })

      // Reset form
      setShowCreateCard(false)
      setSelectedToken(null)
      setSelectedImage(null)
      setSelectedRarity("common")
      
      // Reload tokens to show the new card
      await loadTokens(walletAddress)
    } catch (error: any) {
      console.error('Error creating card:', error)
      let errorMessage = error.message || "Failed to create card"
      
      // Extract error code if available
      if (error.code) {
        errorMessage += ` (Code: ${error.code})`
      } else if (error.status || error.statusCode) {
        errorMessage += ` (Status: ${error.status || error.statusCode})`
      }
      
      // If it's a MiniKit transaction error, include the status
      if (error.finalPayload?.status) {
        errorMessage += ` (Transaction Status: ${error.finalPayload.status})`
      }
      
      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setCreatingCard(false)
    }
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-gray-50 via-white to-gray-50 pb-20">
        {/* Professional Header */}
        <div className="bg-gradient-to-br from-slate-900 via-indigo-900 to-slate-900 border-b border-indigo-800/30">
          <div className="container mx-auto px-4 py-6 max-w-4xl">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <h1 className="text-2xl font-bold text-white tracking-tight mb-2">
                {t("tokens.title", "My Tokens")}
              </h1>
              <p className="text-slate-300 text-sm flex items-center justify-center gap-2">
                {t("tokens.subtitle", "Tokens you created on")}
                <a 
                  href="https://world.org/mini-app?app_id=app_15daccf5b7d4ec9b7dbba044a8fdeab5" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="inline-flex items-center px-3 py-1 bg-indigo-600/80 hover:bg-indigo-600 text-white font-medium text-xs rounded-md transition-colors border border-indigo-500/50"
                >
                  PUF
                  <ExternalLink className="h-3 w-3 ml-1" />
                </a>
              </p>
            </motion.div>

            {walletAddress && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="mt-4 flex items-center justify-center gap-2 text-xs bg-slate-800/50 border border-slate-700/50 rounded-lg px-4 py-2 mx-auto w-fit"
              >
                <Wallet className="h-3.5 w-3.5 text-indigo-400" />
                <span className="font-mono text-slate-200">{walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}</span>
              </motion.div>
            )}
          </div>
        </div>

        <div className="container mx-auto px-4 py-6 max-w-4xl">
          {/* Motivational Text - only show if user has tokens */}
          {tokens.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3, duration: 0.4 }}
              className="mb-6"
            >
              
              {/* Creator Benefits Info - collapsible */}
              <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200">
                <Collapsible open={isCreatorBenefitsOpen} onOpenChange={setIsCreatorBenefitsOpen}>
                  <CollapsibleTrigger asChild>
                    <CardContent className="p-6 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-lg font-bold text-gray-900">{t("tokens.creator_benefits_title", "Card Creator Benefits")}</h4>
                          <p className="text-sm text-gray-600 mt-1">{t("tokens.creator_benefits_subtitle", "Creator earns for all Sales")}</p>
                        </div>
                        {isCreatorBenefitsOpen ? (
                          <ChevronUp className="h-5 w-5 text-gray-700" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-gray-700" />
                        )}
                      </div>
                    </CardContent>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="pt-0 pb-6 px-6">
                      <div className="grid md:grid-cols-2 gap-6 text-sm">
                        <div>
                          <p className="font-semibold text-gray-800 mb-2">{t("tokens.deal_benefits", "Daily Deal & Special Deal:")}</p>
                          <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                            <li>{t("tokens.deal_common", "Common: 5%")}</li>
                            <li>{t("tokens.deal_rare", "Rare: 15%")}</li>
                            <li>{t("tokens.deal_epic", "Epic: 30%")}</li>
                            <li>{t("tokens.deal_legendary", "Legendary: 50%")}</li>
                          </ul>
                        </div>
                        <div>
                          <p className="font-semibold text-gray-800 mb-2">{t("tokens.market_benefits", "Market Sales:")}</p>
                          <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                            <li>{t("tokens.market_common", "Common: 1%")}</li>
                            <li>{t("tokens.market_rare", "Rare: 2%")}</li>
                            <li>{t("tokens.market_epic", "Epic: 3%")}</li>
                            <li>{t("tokens.market_legendary", "Legendary: 5%")}</li>
                          </ul>
                        </div>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Collapsible>
              </Card>
            </motion.div>
          )}

          {!walletAddress ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
            >
              <Card className="bg-white border-2 border-indigo-100 shadow-xl">
                <CardContent className="pt-6">
                  <Alert className="bg-gradient-to-r from-indigo-50 to-purple-50 border-indigo-200">
                    <Wallet className="h-5 w-5 text-indigo-600" />
                    <AlertDescription className="flex items-center justify-between">
                      <span className="text-gray-700 font-medium">{t("tokens.connect_wallet", "Please connect your wallet to see your tokens.")}</span>
                      <Button 
                        onClick={handleConnectWallet} 
                        className="ml-4 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg"
                      >
                        <Wallet className="h-4 w-4 mr-2" />
                        {t("tokens.connect", "Connect Wallet")}
                      </Button>
                    </AlertDescription>
                  </Alert>
                </CardContent>
              </Card>
            </motion.div>
          ) : (
            <>
              {loading ? (
                <div className="flex flex-col items-center justify-center py-16">
                  <Loader2 className="h-12 w-12 animate-spin text-indigo-600 mb-4" />
                  <span className="text-gray-600 font-medium">{t("tokens.loading", "Loading tokens...")}</span>
                </div>
              ) : tokens.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4 }}
                >
                  <Card className="bg-white border-2 border-gray-200 shadow-xl">
                    <CardContent className="pt-12 pb-12 text-center">
                      <h3 className="text-2xl font-bold text-gray-900 mb-6">{t("tokens.create_first_token", "Create your first token")}</h3>
                      <div className="space-y-4 mb-8 text-left max-w-md mx-auto">
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                            1
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-700 font-medium">
                              {t("tokens.step1", "Create your first Token for Free on PUF")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-start gap-4">
                          <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                            2
                          </div>
                          <div className="flex-1">
                            <p className="text-gray-700 font-medium">
                              {t("tokens.step2", "Create your Crypto Card")}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Button
                        onClick={() => window.open("https://world.org/mini-app?app_id=app_15daccf5b7d4ec9b7dbba044a8fdeab5", "_blank")}
                        className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white shadow-lg mb-8"
                      >
                        {t("tokens.go_to_puf", "Create your first token for Free on PUF")}
                      </Button>
                      
                      {/* Creator Benefits Info - collapsible */}
                      <Collapsible open={isCreatorBenefitsOpen} onOpenChange={setIsCreatorBenefitsOpen} className="mt-8">
                        <CollapsibleTrigger asChild>
                          <div className="w-full p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border-2 border-indigo-200 cursor-pointer hover:bg-indigo-100/50 transition-colors">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="text-lg font-bold text-gray-900">{t("tokens.creator_benefits_title", "Card Creator Benefits")}</h4>
                                <p className="text-sm text-gray-600 mt-1">{t("tokens.creator_benefits_subtitle", "Creator earns for all Sales")}</p>
                              </div>
                              {isCreatorBenefitsOpen ? (
                                <ChevronUp className="h-5 w-5 text-gray-700" />
                              ) : (
                                <ChevronDown className="h-5 w-5 text-gray-700" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="p-6 bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg border-2 border-indigo-200 border-t-0 rounded-t-none">
                            <div className="grid md:grid-cols-2 gap-6 text-sm">
                              <div>
                                <p className="font-semibold text-gray-800 mb-2">{t("tokens.deal_benefits", "Daily Deal & Special Deal:")}</p>
                                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                                  <li>{t("tokens.deal_common", "Common: 5%")}</li>
                                  <li>{t("tokens.deal_rare", "Rare: 15%")}</li>
                                  <li>{t("tokens.deal_epic", "Epic: 30%")}</li>
                                  <li>{t("tokens.deal_legendary", "Legendary: 50%")}</li>
                                </ul>
                              </div>
                              <div>
                                <p className="font-semibold text-gray-800 mb-2">{t("tokens.market_benefits", "Market Sales:")}</p>
                                <ul className="list-disc list-inside space-y-1 text-gray-700 ml-2">
                                  <li>{t("tokens.market_common", "Common: 1%")}</li>
                                  <li>{t("tokens.market_rare", "Rare: 2%")}</li>
                                  <li>{t("tokens.market_epic", "Epic: 3%")}</li>
                                  <li>{t("tokens.market_legendary", "Legendary: 5%")}</li>
                                </ul>
                              </div>
                            </div>
                          </div>
                        </CollapsibleContent>
                      </Collapsible>
                    </CardContent>
                  </Card>
                </motion.div>
              ) : (
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-6">
                    <TabsTrigger value="listed">{t("tokens.listed_cards", "Listed Cards")}</TabsTrigger>
                    <TabsTrigger value="create">{t("tokens.create_card_tab", "Create Card")}</TabsTrigger>
                  </TabsList>

                  <TabsContent value="listed">
                    <div className="space-y-4">
                      {tokens.filter(t => t.isListed).map((token, index) => (
                    <motion.div
                      key={token.tokenAddress}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.3 }}
                    >
                      <Card className="bg-white border-2 border-gray-200 hover:border-indigo-300 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
                        <CardContent className="p-0">
                          {/* Token Header */}
                          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-5 border-b border-gray-200">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-center gap-4 flex-1 min-w-0">
                                {token.isListed && token.cardData ? (
                                  <div className={`relative aspect-[3/4] w-20 rounded-xl overflow-hidden flex-shrink-0 ${getRarityStyles(token.cardData.rarity).border}`}>
                                    {token.cardData.image_url?.endsWith(".mp4") ? (
                                      <video
                                        autoPlay
                                        muted
                                        loop
                                        playsInline
                                        className="w-full h-full object-cover rounded-l"
                                        src={getCloudflareImageUrl(token.cardData.image_url)}
                                      />
                                    ) : (
                                      <img
                                        src={getCloudflareImageUrl(token.cardData.image_url) || "/placeholder.svg"}
                                        alt={token.name}
                                        className="w-full h-full object-cover rounded-l"
                                        onError={(e: React.SyntheticEvent<HTMLImageElement>) => {
                                          ;(e.target as HTMLImageElement).src = "/placeholder.svg"
                                        }}
                                      />
                                    )}
                                  </div>
                                ) : (
                                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-200 to-purple-200 flex items-center justify-center flex-shrink-0 ring-2 ring-indigo-100">
                                    <Coins className="h-8 w-8 text-indigo-400" />
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <h3 className="text-base font-bold text-gray-900 truncate mb-1">{token.name}</h3>
                                  <p className="text-sm font-mono text-indigo-600 truncate mb-0.5">${token.symbol}</p>
                                  <p className="text-xs font-mono text-gray-500">
                                    {token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}
                                  </p>
                                </div>
                              </div>
                              
                              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                                {token.isListed ? (
                                  <>
                                    <Badge 
                                      variant="default"
                                      className="bg-gradient-to-r from-green-500 to-emerald-500 text-white border-0 text-xs px-3 py-1 shadow-md"
                                    >
                                      <CheckCircle className="h-3 w-3 mr-1" />
                                      {t("tokens.listed", "Listed")}
                                    </Badge>
                                    {token.earnedAmount !== undefined && token.earnedAmount > 0 && (
                                      <div className="text-right">
                                        <p className="text-xs text-gray-500 mb-0.5">{t("tokens.earned", "Earned")}</p>
                                        <p className="text-sm font-bold text-green-600">
                                          {token.earnedAmount.toFixed(5)} WLD
                                        </p>
                                      </div>
                                    )}
                                  </>
                                ) : (
                                  <Button
                                    size="sm"
                                    className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs px-4 py-2 shadow-md"
                                    onClick={() => {
                                      toast({
                                        title: t("tokens.create_card", "Create Card"),
                                        description: t("tokens.create_card_desc", "Card creation functionality coming soon"),
                                      })
                                    }}
                                  >
                                    <Zap className="h-3 w-3 mr-1" />
                                    {t("tokens.create_card", "Create Card")}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          
                        </CardContent>
                      </Card>
                    </motion.div>
                      ))}
                      {tokens.filter(t => t.isListed).length === 0 && (
                        <Card className="bg-white border-2 border-gray-200 shadow-xl">
                          <CardContent className="pt-12 pb-12 text-center">
                            <p className="text-gray-600">{t("tokens.no_listed_cards", "No listed cards yet.")}</p>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="create">
                    {!showCreateCard ? (
                      <div className="space-y-4">
                        {tokens.filter(t => !t.isListed).map((token, index) => (
                          <motion.div
                            key={token.tokenAddress}
                            initial={{ opacity: 0, y: 20 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.1, duration: 0.3 }}
                          >
                            <Card className="bg-white border-2 border-gray-200 hover:border-indigo-300 shadow-lg hover:shadow-xl transition-all duration-300 overflow-hidden group">
                              <CardContent className="p-0">
                                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 p-5">
                                  <div className="flex items-start justify-between gap-4">
                                    <div className="flex-1 min-w-0">
                                      <h3 className="text-xl font-bold text-gray-900 truncate mb-1">{token.name}</h3>
                                      <p className="text-sm font-mono text-indigo-600 truncate mb-0.5">${token.symbol}</p>
                                      <p className="text-xs font-mono text-gray-500">
                                        {token.tokenAddress.slice(0, 6)}...{token.tokenAddress.slice(-4)}
                                      </p>
                                    </div>
                                    <Button
                                      size="sm"
                                      className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-xs px-4 py-2 shadow-md"
                                      onClick={() => {
                                        setSelectedToken(token)
                                        setShowCreateCard(true)
                                      }}
                                    >
                                      {t("tokens.create_card_button", "Create Card")}
                                    </Button>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        ))}
                        {tokens.filter(t => !t.isListed).length === 0 && (
                          <Card className="bg-white border-2 border-gray-200 shadow-xl">
                            <CardContent className="pt-12 pb-12 text-center">
                              <p className="text-gray-600">No unlisted tokens available.</p>
                            </CardContent>
                          </Card>
                        )}
                      </div>
                    ) : (
                      <Card className="bg-white border-2 border-indigo-100 shadow-xl">
                        <CardContent className="p-6">
                          <div className="space-y-6">
                            <div className="flex items-center justify-between">
                              <h3 className="text-xl font-bold">{t("tokens.create_card", "Create Card")} {t("tokens.for", "for")} {selectedToken?.name}</h3>
                              <Button variant="outline" onClick={() => {
                                setShowCreateCard(false)
                                setSelectedToken(null)
                                setSelectedImage(null)
                              }}>
                                <X className="h-4 w-4 mr-2" />
                                {t("tokens.cancel", "Cancel")}
                              </Button>
                            </div>

                            {/* Rarity Selection */}
                            <div>
                              <label className="block text-sm font-medium mb-2">{t("tokens.rarity", "Rarity")}</label>
                              <Select value={selectedRarity} onValueChange={setSelectedRarity}>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="common">Common - $3</SelectItem>
                                  <SelectItem value="rare">Rare - $10</SelectItem>
                                  <SelectItem value="epic">Epic - $25</SelectItem>
                                  <SelectItem value="legendary">Legendary - $50</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>

                            {/* Image Upload */}
                            <div>
                              <label className="block text-sm font-medium mb-2">{t("tokens.card_image", "Card Image")}</label>
                              {!selectedImage ? (
                                <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                                  <input
                                    type="file"
                                    accept="image/png,image/jpeg,image/jpg,image/gif,image/webp"
                                    className="hidden"
                                    id="image-upload"
                                    onClick={(e) => {
                                      // On mobile, try to prevent camera option by removing capture attribute dynamically
                                      const input = e.currentTarget as HTMLInputElement
                                      if (input.hasAttribute('capture')) {
                                        input.removeAttribute('capture')
                                      }
                                    }}
                                    onChange={(e) => {
                                      const file = e.target.files?.[0]
                                      if (file) {
                                        setSelectedImage(file)
                                        setShowImageEditor(true)
                                      }
                                    }}
                                  />
                                  <label
                                    htmlFor="image-upload"
                                    className="cursor-pointer flex flex-col items-center gap-2"
                                  >
                                    <Upload className="h-12 w-12 text-gray-400" />
                                    <span className="text-sm text-gray-600">{t("tokens.click_to_upload", "Click to upload image")}</span>
                                  </label>
                                </div>
                              ) : (
                                <div className="space-y-2">
                                  <div className="relative aspect-[3/4] w-32 rounded-xl overflow-hidden border-2 border-gray-300">
                                    {selectedImage instanceof File ? (
                                      <img
                                        src={URL.createObjectURL(selectedImage)}
                                        alt="Preview"
                                        className="w-full h-full object-cover"
                                      />
                                    ) : (
                                      <img
                                        src={selectedImage}
                                        alt="Preview"
                                        className="w-full h-full object-cover"
                                      />
                                    )}
                                  </div>
                                  <div className="flex gap-2">
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => setShowImageEditor(true)}
                                    >
                                      <ImageIcon className="h-4 w-4 mr-2" />
                                      {t("tokens.edit_image", "Edit Image")}
                                    </Button>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => {
                                        setSelectedImage(null)
                                      }}
                                    >
                                      {t("tokens.remove", "Remove")}
                                    </Button>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Submit Button */}
                            <Button
                              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700"
                              onClick={handleCreateCard}
                              disabled={!selectedImage || creatingCard}
                            >
                              {creatingCard ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  {t("tokens.creating_card", "Creating Card...")}
                                </>
                              ) : (
                                <>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  {t("tokens.create_card", "Create Card")}
                                </>
                              )}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </TabsContent>
                </Tabs>
              )}
            </>
          )}
        </div>

        {/* Image Editor Dialog */}
        <ImageEditor
          isOpen={showImageEditor}
          onClose={() => setShowImageEditor(false)}
          onSave={handleImageSave}
          initialImage={selectedImage}
        />

        <MobileNav />
      </div>
    </ProtectedRoute>
  )
}
