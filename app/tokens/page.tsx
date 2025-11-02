"use client"

import { useState, useEffect } from "react"
import { ethers } from "ethers"
import { MiniKit } from "@worldcoin/minikit-js"
import { useAuth } from "@/contexts/auth-context"
import MobileNav from "@/components/mobile-nav"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Loader2, Coins, Calendar, Wallet, CheckCircle, XCircle } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { useI18n } from "@/contexts/i18n-context"
import ProtectedRoute from "@/components/protected-route"
import Image from "next/image"
import { getSupabaseBrowserClient } from "@/lib/supabase"

const PUF_CONTRACT_ADDRESS_1 = "0xc301BaCE6E9409B1876347a3dC94EC24D18C1FE4"
const PUF_CONTRACT_ADDRESS_2 = "0x3140167E09d3cfB67b151C25d54fa356f644712D"

const RPC_URL = "https://worldchain-mainnet.g.alchemy.com/public"

const provider = new ethers.JsonRpcProvider(
  RPC_URL,
  { chainId: 480, name: "worldchain" },
  { staticNetwork: true },
)

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
  const [tokens, setTokens] = useState<TokenInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [walletAddress, setWalletAddress] = useState<string | null>(null)

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
        isListed: tokensWithListedStatus[token.tokenAddress] || false,
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

  const checkTokensListed = async (tokenAddresses: string[]): Promise<Record<string, boolean>> => {
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return {}
    
    try {
      const result: Record<string, boolean> = {}
      
      // Get all cards with contract_address
      const { data: cards, error } = await supabase
        .from("cards")
        .select("contract_address")
      
      if (error) {
        console.error("Error fetching cards:", error)
        return {}
      }
      
      // Create a set of listed contract addresses (lowercase for comparison)
      const listedAddresses = new Set(
        (cards || [])
          .filter((card: any) => card.contract_address)
          .map((card: any) => card.contract_address.toLowerCase())
      )
      
      // Check each token address
      for (const address of tokenAddresses) {
        result[address] = listedAddresses.has(address.toLowerCase())
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

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-white pb-20">
        <div className="container mx-auto px-4 py-6 max-w-4xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-gray-900 mb-1 flex items-center gap-2">
              <Coins className="h-6 w-6 text-gray-900" />
              {t("tokens.title", "Meine Tokens")}
            </h1>
            <p className="text-sm text-gray-600">{t("tokens.subtitle", "Token, die du bei PUF erstellt hast")}</p>
          </div>

          {!walletAddress ? (
            <Card className="bg-white border border-gray-200 shadow-sm">
              <CardContent className="pt-6">
                <Alert>
                  <Wallet className="h-4 w-4 text-gray-900" />
                  <AlertDescription className="flex items-center justify-between">
                    <span className="text-gray-700">{t("tokens.connect_wallet", "Bitte verbinde deine Wallet, um deine Tokens zu sehen.")}</span>
                    <Button onClick={handleConnectWallet} className="ml-4">
                      {t("tokens.connect", "Wallet verbinden")}
                    </Button>
                  </AlertDescription>
                </Alert>
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="mb-4 text-sm text-gray-600">
                {t("tokens.wallet_address", "Wallet Adresse")}: <span className="text-gray-900 font-mono text-xs">{walletAddress}</span>
              </div>

              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-600" />
                  <span className="ml-3 text-gray-600">{t("tokens.loading", "Lade Tokens...")}</span>
                </div>
              ) : tokens.length === 0 ? (
                <Card className="bg-white border border-gray-200 shadow-sm">
                  <CardContent className="pt-6 text-center py-12">
                    <Coins className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                    <h3 className="text-xl font-semibold text-gray-900 mb-2">{t("tokens.no_tokens", "Keine Tokens gefunden")}</h3>
                    <p className="text-gray-600">{t("tokens.no_tokens_desc", "Du hast noch keine Tokens bei PUF erstellt.")}</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-3">
                  {tokens.map((token) => (
                    <Card key={token.tokenAddress} className="bg-white border border-gray-200 hover:border-gray-300 shadow-sm transition-colors">
                      <CardContent className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3 flex-1 min-w-0">
                            {token.IMGURL ? (
                              <div className="relative w-12 h-12 rounded-full overflow-hidden border border-gray-200 flex-shrink-0">
                                <Image 
                                  src={token.IMGURL} 
                                  alt={token.name} 
                                  fill 
                                  className="object-cover"
                                  unoptimized={token.IMGURL.includes('supabase.co')}
                                  onError={(e) => {
                                    const target = e.target as HTMLImageElement
                                    target.style.display = 'none'
                                    const parent = target.parentElement
                                    if (parent) {
                                      const fallback = document.createElement('div')
                                      fallback.className = 'w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center'
                                      fallback.innerHTML = '<svg class="h-6 w-6 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>'
                                      parent.appendChild(fallback)
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center flex-shrink-0">
                                <Coins className="h-6 w-6 text-gray-400" />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <CardTitle className="text-gray-900 text-base font-semibold truncate">{token.name}</CardTitle>
                              <CardDescription className="text-gray-600 font-mono text-sm truncate">{token.symbol}</CardDescription>
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-3">
                            {token.isListed ? (
                              <Badge 
                                variant="default"
                                className="bg-green-100 text-green-700 border-green-200 text-xs"
                              >
                                <CheckCircle className="h-3 w-3 mr-1" />
                                {t("tokens.listed", "Listed")}
                              </Badge>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-xs h-7"
                                onClick={() => {
                                  // TODO: Implement list token functionality
                                  toast({
                                    title: t("tokens.list_token", "List Token"),
                                    description: t("tokens.list_token_desc", "Token listing functionality coming soon"),
                                  })
                                }}
                              >
                                {t("tokens.list_now", "List Now")}
                              </Button>
                            )}
                          </div>
                        </div>
                        
                        <div className="space-y-2 pt-3 border-t border-gray-200">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-gray-500">{t("tokens.contract", "Contract")}:</span>
                            <Badge variant="outline" className="text-xs font-mono">
                              {token.contractType === "contract1" ? "PUF 1" : "PUF 2"}
                            </Badge>
                          </div>
                          
                          {/* All URLs */}
                          <div className="space-y-1.5">
                            {token.IMGURL && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500 text-xs flex-shrink-0">IMG:</span>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-gray-700 font-mono text-xs truncate">{token.IMGURL}</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 flex-shrink-0"
                                    onClick={() => {
                                      navigator.clipboard.writeText(token.IMGURL)
                                      toast({
                                        title: t("tokens.copied", "Kopiert"),
                                        description: t("tokens.image_url_copied", "Image URL wurde kopiert"),
                                      })
                                    }}
                                  >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </Button>
                                </div>
                              </div>
                            )}
                            
                            {token.xURL && (
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-gray-500 text-xs flex-shrink-0">X URL:</span>
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <span className="text-gray-700 font-mono text-xs truncate">{token.xURL}</span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 w-6 p-0 flex-shrink-0"
                                    onClick={() => {
                                      const fullUrl = token.xURL.startsWith("http") ? token.xURL : `https://${token.xURL}`
                                      navigator.clipboard.writeText(fullUrl)
                                      toast({
                                        title: t("tokens.copied", "Kopiert"),
                                        description: t("tokens.x_url_copied", "X URL wurde kopiert"),
                                      })
                                    }}
                                  >
                                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                  </Button>
                                </div>
                              </div>
                            )}
                            
                            {/* Token Address URL */}
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-gray-500 text-xs flex-shrink-0">Address:</span>
                              <div className="flex items-center gap-2 flex-1 min-w-0">
                                <span className="text-gray-700 font-mono text-xs truncate">{token.tokenAddress}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 w-6 p-0 flex-shrink-0"
                                  onClick={() => {
                                    navigator.clipboard.writeText(token.tokenAddress)
                                    toast({
                                      title: t("tokens.copied", "Kopiert"),
                                      description: t("tokens.address_copied", "Token-Adresse wurde in die Zwischenablage kopiert"),
                                    })
                                  }}
                                >
                                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                  </svg>
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
        <MobileNav />
      </div>
    </ProtectedRoute>
  )
}

