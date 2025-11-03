"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/contexts/auth-context"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import { Button } from "@/components/ui/button"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { motion } from "framer-motion"
import {
  Users,
  ShoppingBag,
  Clock,
  Search,
  Plus,
  Tag,
  ShoppingCart,
  X,
  ArrowUpDown,
  Filter,
  Edit,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  BarChart2,
  History,
  User,
  Globe,
  AlertTriangle,
} from "lucide-react"
import Link from "next/link"
import { toast } from "@/components/ui/use-toast"
import {
  getMarketListings,
  getUserListings,
  getTransactionHistory,
  purchaseCard,
  cancelListing,
  getRecentSales,
  blockListingForPurchase,
} from "@/app/actions/marketplace"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { renderStars } from "@/utils/card-stars"
import UpdatePriceDialog from "@/components/update-price-dialog"
import TiltableCard from "@/components/tiltable-card"
import { MiniKit, tokenToDecimals, Tokens, type PayCommandInput } from "@worldcoin/minikit-js"
import PurchaseSuccessAnimation from "@/components/purchase-success-animation"
import { Progress } from "@/components/ui/progress"
import { debounce } from "@/lib/utils"
import { getSupabaseBrowserClient } from "@/lib/supabase"
// Deal of the Day removed from Trade page
// import DealOfTheDayDialog from "@/components/deal-of-the-day-dialog"
// import { getDailyDeal } from "@/app/actions/deals"
import { useI18n } from "@/contexts/i18n-context"
import { getMarketRevenueSplit } from "@/lib/creator-revenue"

// ABI für die transfer-Funktion des ERC20-Tokens
const ERC20_ABI = ["function transfer(address to, uint256 amount) public returns (bool)"]
// Typen für die Marketplace-Daten
type Card = {
  id: string
  name: string
  character: string
  image_url?: string
  rarity: "common" | "rare" | "epic" | "legendary" // | "wbc" // Commented out
  overall_rating?: number
  creator_address?: string
}

type MarketListing = {
  id: string
  seller_wallet_address: string
  card_id: string
  price: number
  created_at: string
  status: "active" | "sold" | "cancelled" | "blocked"
  buyer_wallet_address?: string
  sold_at?: string
  user_card_id: number | string
  card_level: number
  card: Card
  seller_username: string
  seller_world_id?: string
  blocked_at?: string
}

// Update the Transaction type to make seller_username optional
type Transaction = MarketListing & {
  transaction_type: "sold" | "purchased"
  other_party: string
  other_party_username?: string // Username of the other party
  seller_username?: string // Make this optional
}

// Typ für kürzlich verkaufte Karten
type RecentSale = {
  id: string
  seller_wallet_address: string
  buyer_wallet_address?: string
  card_id: string
  price: number
  sold_at: string
  card_level: number
  card: Card
  seller_username?: string
  seller_world_id?: string
  buyer_username?: string
  buyer_world_id?: string
}

type PaginationInfo = {
  total: number
  page: number
  pageSize: number
  totalPages: number
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
  let cleaned = imagePath.replace(/^\/?(world[-_])?soccer\//i, "")
  
  // Remove any leading slashes to avoid double slashes
  cleaned = cleaned.replace(/^\/+/, "")
  
  return `https://ani-labs.xyz/${encodeURIComponent(cleaned)}`
}

// Neue Bild-URL-Logik global für alle Card-Boxen
const getCardImageUrl = (imageUrl?: string) => {
  if (!imageUrl) {
    console.log("No image URL provided, using placeholder");
    return "/placeholder.svg";
  }
  
  // Wenn schon http, dann direkt zurückgeben
  if (imageUrl.startsWith("http")) {
    return imageUrl
  }
  
  console.log("Original image URL:", imageUrl);
  // Remove leading slash and any world_soccer/world-soccer prefix
  let cleaned = imageUrl.replace(/^\/?(world[-_])?soccer\//i, "");
  
  // Remove any leading slashes to avoid double slashes
  cleaned = cleaned.replace(/^\/+/, "");
  
  const finalUrl = `https://ani-labs.xyz/${encodeURIComponent(cleaned)}`;
  console.log("Processed image URL:", finalUrl);
  return finalUrl;
}

// Helper component for market fee breakdown
function MarketFeeBreakdown({ price, rarity, t }: { price: number; rarity?: string; t: any }) {
  const rarity_lower = rarity?.toLowerCase() || "common"
  const split = getMarketRevenueSplit(rarity_lower as any)
  const totalFees = price * 0.1
  const devFees = price * split.devShare
  const creatorFees = price * split.creatorShare
  
  return (
    <>
      <p className="text-amber-800 mt-1">
        <span className="font-medium">{t("trade.purchase_dialog.seller_receives", "Seller Receives")}:</span> {(price * split.sellerShare).toFixed(4)} WLD
      </p>
      <p className="text-amber-800 mt-1">
        <span className="font-medium">{t("trade.purchase_dialog.market_fee", "Market Fee")}:</span> {totalFees.toFixed(4)} WLD
        <span className="text-xs text-amber-700 ml-2">
          (Dev: {devFees.toFixed(4)} WLD, Creator: {creatorFees.toFixed(4)} WLD)
        </span>
      </p>
    </>
  )
}

export default function TradePage() {
  const { user } = useAuth()
  const { t } = useI18n()
  const [activeTab, setActiveTab] = useState("marketplace")
  const [historyType, setHistoryType] = useState<"my" | "all">("my")

  // Helper function to translate rarity
  const getDisplayRarity = (rarity: string) => {
    const rarityMap: Record<string, string> = {
      common: t("rarity.common", "Common"),
      rare: t("rarity.rare", "Rare"),
      epic: t("rarity.epic", "Epic"),
      legendary: t("rarity.legendary", "Legendary"),
      goat: t("rarity.goat", "GOAT"),
    }
    return rarityMap[rarity.toLowerCase()] || rarity
  }
  const [marketListings, setMarketListings] = useState<MarketListing[]>([])
  const [userListings, setUserListings] = useState<MarketListing[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [recentSales, setRecentSales] = useState<RecentSale[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [salesSearchTerm, setSalesSearchTerm] = useState("")
  const [rarityFilter, setRarityFilter] = useState<string>("all")
  const [sortOption, setSortOption] = useState<string>("newest")
  const [selectedListing, setSelectedListing] = useState<MarketListing | null>(null)
  const [showPurchaseDialog, setShowPurchaseDialog] = useState(false)
  const [showCardDetailsDialog, setShowCardDetailsDialog] = useState(false)
  const [showUpdatePriceDialog, setShowUpdatePriceDialog] = useState(false)
  const [purchaseLoading, setPurchaseLoading] = useState(false)
  const [cancelLoading, setCancelLoading] = useState(false)
  const [showPurchaseSuccess, setShowPurchaseSuccess] = useState(false)
  const [listingCount, setListingCount] = useState(0)
  const [maxListings, setMaxListings] = useState(3)
  const [listingLimitReached, setListingLimitReached] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [soldCount, setSoldCount] = useState<number | null>(null)
  const [showSellLimitInfo, setShowSellLimitInfo] = useState(false)
  
  // Deal of the Day state - DISABLED on Trade page
  // const [dailyDeal, setDailyDeal] = useState<any>(null)
  // const [dailyDealInteraction, setDailyDealInteraction] = useState<any>(null)
  // const [showDailyDealDialog, setShowDailyDealDialog] = useState(false)
  // const [dailyDealLoading, setDailyDealLoading] = useState(false)
  // const [hasShownDailyDeal, setHasShownDailyDeal] = useState(false)
  // Pagination states
  const [marketPage, setMarketPage] = useState(1)
  const [userListingsPage, setUserListingsPage] = useState(1)
  const [transactionsPage, setTransactionsPage] = useState(1)
  const [recentSalesPage, setRecentSalesPage] = useState(1)
  const [marketPagination, setMarketPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  })
  const [userListingsPagination, setUserListingsPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  })
  const [transactionsPagination, setTransactionsPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  })
  const [recentSalesPagination, setRecentSalesPagination] = useState<PaginationInfo>({
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  })

  console.log(user)

  // Fetch sold count
  useEffect(() => {
    const fetchSoldCount = async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        throw new Error('Database connection error')
      }
      const { data, error } = await supabase
        .from("users")
        .select("cards_sold_since_last_purchase")
        .eq("username", user?.username || "")
        .single<{ cards_sold_since_last_purchase: number }>()

      if (!error && data) {
        setSoldCount(data.cards_sold_since_last_purchase)
      }
    }

    fetchSoldCount()
  }, [user?.username])

  const percentage = Math.min(((soldCount ?? 0) / 3) * 100, 100)
  const radius = 20
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (percentage / 100) * circumference

  // Initialize data when user is available
  useEffect(() => {
    if (!user?.username || hasInitialized) return

    if (activeTab === "marketplace") {
      setMarketPage(1)
      loadMarketListings(1)
    } else if (activeTab === "sell") {
      setUserListingsPage(1)
      loadUserListings(1)
    } else if (activeTab === "sales-history") {
      if (historyType === "my") {
        setTransactionsPage(1)
        loadTransactionHistory(1)
      } else {
        setRecentSalesPage(1)
        loadRecentSales(1)
      }
    }

    setHasInitialized(true)
  }, [user?.username])


  // Handle search and filter changes with debounce
  useEffect(() => {
    if (!user?.username || !hasInitialized) return

    const timeoutId = setTimeout(() => {
      if (activeTab === "marketplace") {
        setMarketPage(1)
        loadMarketListings(1)
      } else if (activeTab === "sales-history" && historyType === "all") {
        setRecentSalesPage(1)
        loadRecentSales(1)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchTerm, rarityFilter, sortOption, salesSearchTerm, activeTab, historyType])

  // Refresh user listings when switching to sell tab
  useEffect(() => {
    if (activeTab === "sell" && user?.username) {
      console.log("🔄 Refreshing user listings for sell tab")
      loadUserListings(1)
    }
  }, [activeTab, user?.username])

  // Load market listings with pagination
  const loadMarketListings = useCallback(async (pageToLoad = marketPage) => {
    if (!user?.username) return

    setLoading(true)
    try {
      // Prepare filters
      const filters: any = {
        rarity: rarityFilter !== "all" ? rarityFilter : undefined,
        sort: sortOption,
      }

      // Add search term to filters if present
      if (searchTerm.trim()) {
        filters.search = searchTerm.trim()
      }

      console.log("🔍 Loading market listings:", { pageToLoad, filters })

      const result = await getMarketListings(pageToLoad, 20, filters)
      if (result.success) {
        setMarketListings(result.listings || [])
        if (result.pagination) {
          setMarketPagination(result.pagination)
        }
        console.log("✅ Market listings loaded:", result.listings?.length || 0, "items")
      } else {
        console.error("❌ Error loading market listings:", result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("❌ Error loading market listings:", error)
      toast({
        title: "Error",
        description: 'Failed to load marketplace data',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [user?.username, searchTerm, rarityFilter, sortOption, marketPage])

  // Load user listings with pagination
  const loadUserListings = useCallback(async (pageToLoad = userListingsPage) => {
    if (!user?.username) return

    setLoading(true)
    try {
      console.log("🔍 Loading user listings for:", user.wallet_address)
      const result = await getUserListings(user.wallet_address, pageToLoad, 20)
      if (result.success) {
        setUserListings(result.listings || [])
        setListingCount(result.listingCount || 0)
        setMaxListings(result.maxListings || 3)
        setListingLimitReached((result.listingCount || 0) >= (result.maxListings || 3))
        if (result.pagination) {
          setUserListingsPagination(result.pagination)
        }
        console.log("✅ User listings loaded:", result.listings?.length || 0, "items")
      } else {
        console.error("❌ Error loading user listings:", result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("❌ Error loading user listings:", error)
      toast({
        title: "Error",
        description: 'Failed to load your listings',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [user?.username, user?.wallet_address, userListingsPage])

  // Load transaction history with pagination
  const loadTransactionHistory = async (pageToLoad = transactionsPage) => {
    if (!user?.username) return

    setLoading(true)
    try {
      const result = await getTransactionHistory(user.wallet_address, pageToLoad, 20)
      if (result.success) {
        // Explicitly cast the transactions to the Transaction type
        const transactionData = result.transactions || []
        setTransactions(transactionData as unknown as Transaction[])

        if (result.pagination) {
          setTransactionsPagination(result.pagination)
        }
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error loading transaction history:", error)
      toast({
        title: "Error",
        description: 'Failed to load transaction history',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Load recent sales with pagination
  const loadRecentSales = useCallback(async (pageToLoad = recentSalesPage) => {
    setLoading(true)
    try {
      const searchQuery = salesSearchTerm.trim() || ""
      console.log("🔍 Loading recent sales:", { pageToLoad, searchQuery })

      const result = await getRecentSales(pageToLoad, 20, searchQuery)
      if (result.success) {
        setRecentSales(result.sales || [])
        if (result.pagination) {
          setRecentSalesPagination(result.pagination)
        }
        console.log("✅ Recent sales loaded:", result.sales?.length || 0, "items")
      } else {
        console.error("❌ Error loading recent sales:", result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("❌ Error loading recent sales:", error)
      toast({
        title: "Error",
        description: 'Failed to load recent sales',
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }, [salesSearchTerm, recentSalesPage])

  // Handle page changes
  const handleMarketPageChange = (newPage: number) => {
    setMarketPage(newPage)
    loadMarketListings(newPage) // This will use the current filters and sort options
  }

  const handleUserListingsPageChange = (newPage: number) => {
    setUserListingsPage(newPage)
    loadUserListings(newPage)
  }

  const handleTransactionsPageChange = (newPage: number) => {
    setTransactionsPage(newPage)
    loadTransactionHistory(newPage)
  }

  const handleRecentSalesPageChange = (newPage: number) => {
    console.log("Changing recent sales page to:", newPage)
    setRecentSalesPage(newPage)
    loadRecentSales(newPage)
  }

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
  
  const WLD_TOKEN = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003" // WLD (World Chain)
  
  const toWei = (amount: number | string) => {
    const [intStr, rawFrac = ""] = String(amount).replace(",", ".").split(".")
    const fracStr = (rawFrac + "000000000000000000").slice(0, 18)
  
    const base = BigInt(intStr || "0") * BigInt("1000000000000000000")
    const frac = BigInt(fracStr || "0")
  
    return (base + frac).toString()
  }
  

  const sendTransaction = async () => {
    console.log("sendTransaction called with:", {
      selectedListing: selectedListing,
      seller_world_id: selectedListing?.seller_world_id,
      seller_wallet_address: selectedListing?.seller_wallet_address
    })

    // Use seller_world_id if available, otherwise use seller_wallet_address
    const sellerAddress = selectedListing?.seller_world_id || selectedListing?.seller_wallet_address
    
    if (!sellerAddress) {
      console.log("No seller address found, cannot complete purchase")
      toast({
        title: "Purchase Not Available",
        description: "Seller wallet address not found. Cannot complete purchase.",
        variant: "destructive",
      })
      return
    }
    
    console.log("Using seller address:", sellerAddress)

    // WLD-TRANSAKTION FÜR BLOCKIERTE KARTE
    let unblockTimeout: NodeJS.Timeout | null = null
    
    try {
      console.log("🔥 Starting WLD transaction...")
      console.log("🔥 Listing ID:", selectedListing.id)
      console.log("🔥 Current listing status:", selectedListing.status)
      
      // Prüfe ob Karte noch blockiert ist (optional - kann auch active sein)
      if (selectedListing.status !== "blocked" && selectedListing.status !== "active") {
        console.error("🔒 Card is not available!")
        toast({
          title: "Card Not Available",
          description: "This card is no longer available for purchase!",
          variant: "destructive",
        })
        return
      }
      
      console.log("🔒 Card is available, proceeding with WLD transaction...")
      
      // TIMEOUT: Falls User abbricht, Karte nach 20 Sekunden freigeben
      unblockTimeout = setTimeout(async () => {
        console.log("⏰ Timeout reached - unblocking card automatically")
        try {
          const supabase = getSupabaseBrowserClient()
          if (supabase) {
            await (supabase
              .from("market_listings") as any)
              .update({ 
                status: "active", 
                blocked_at: null 
              })
              .eq("id", selectedListing.id)
              .eq("status", "blocked")
            
            console.log("⏰ Card unblocked due to timeout")
            loadMarketListings() // UI aktualisieren
          }
        } catch (error) {
          console.error("⏰ Error unblocking card:", error)
        }
      }, 20000) // 20 Sekunden
      
      // SCHRITT 2: Jetzt die WLD-Transaktion durchführen
      const price = selectedListing?.price ?? 1
      
      // Check if card has a creator that needs payment
      const hasCreator = selectedListing?.card?.creator_address && selectedListing.card.creator_address.trim() !== ""
      
      let transactions: any[] = []
      
      if (hasCreator && selectedListing?.card?.rarity) {
        // Calculate split payment for seller, dev, and creator
        const { getMarketRevenueSplit } = await import("@/lib/creator-revenue")
        const split = getMarketRevenueSplit(selectedListing.card.rarity as any)
        
        const sellerAmount = price * split.sellerShare
        const devAmount = price * split.devShare
        const creatorAmount = price * split.creatorShare
        
        console.log('Marketplace Split payment:', {
          total: price,
          sellerShare: `${(split.sellerShare * 100).toFixed(1)}%`,
          devShare: `${(split.devShare * 100).toFixed(1)}%`,
          creatorShare: `${(split.creatorShare * 100).toFixed(1)}%`,
          creatorAddress: selectedListing.card.creator_address
        })
        
        // Three transfers: seller, dev, creator
        transactions = [
          {
            address: WLD_TOKEN,
            abi: erc20TransferAbi,
            functionName: "transfer",
            args: [sellerAddress, tokenToDecimals(parseFloat(sellerAmount.toFixed(2)), Tokens.WLD).toString()],
          },
          {
            address: WLD_TOKEN,
            abi: erc20TransferAbi,
            functionName: "transfer",
            args: ["0xDb4D9195EAcE195440fbBf6f80cA954bf782468E", tokenToDecimals(parseFloat(devAmount.toFixed(2)), Tokens.WLD).toString()],
          },
          {
            address: WLD_TOKEN,
            abi: erc20TransferAbi,
            functionName: "transfer",
            args: [selectedListing.card.creator_address, tokenToDecimals(parseFloat(creatorAmount.toFixed(2)), Tokens.WLD).toString()],
          },
        ]
      } else {
        // Two transfers: seller and dev (90/10 split)
        const ten = price * 0.1
        const ninety = price * 0.9
        
        transactions = [
          {
            address: WLD_TOKEN,
            abi: erc20TransferAbi,
            functionName: "transfer",
            args: ["0xDb4D9195EAcE195440fbBf6f80cA954bf782468E", tokenToDecimals(parseFloat(ten.toFixed(2)), Tokens.WLD).toString()],
          },
          {
            address: WLD_TOKEN,
            abi: erc20TransferAbi,
            functionName: "transfer",
            args: [sellerAddress, tokenToDecimals(parseFloat(ninety.toFixed(2)), Tokens.WLD).toString()],
          },
        ]
      }
      
      console.log("Attempting MiniKit transaction...")
      
      // Prüfe ob MiniKit verfügbar ist
      if (!MiniKit || !MiniKit.commandsAsync) {
        throw new Error("MiniKit is not available")
      }

      const {commandPayload, finalPayload} = await MiniKit.commandsAsync.sendTransaction({
        transaction: transactions,
      })
      console.log("MiniKit transaction completed:", { commandPayload, finalPayload })
      
      if (finalPayload.status == "success") {
        console.log("success sending payment")
        
        // Save market fees directly to database (client-side) - will be updated by backend with creator split
        try {
          const supabase = getSupabaseBrowserClient()
          if (supabase && selectedListing?.id && selectedListing?.card) {
            // Get card rarity to calculate fees
            const rarity = selectedListing.card.rarity?.toLowerCase() || "common"
            const { getMarketRevenueSplit } = await import("@/lib/creator-revenue")
            const revenueSplit = getMarketRevenueSplit(rarity as any)
            
            const totalFees = selectedListing.price * 0.1 // 10% total (seller gets 90%)
            const devFees = selectedListing.price * revenueSplit.devShare
            const creatorFees = selectedListing.card.creator_address 
              ? selectedListing.price * revenueSplit.creatorShare 
              : totalFees // If no creator, dev gets all fees
            
            const { error } = await supabase
              .from("market_fees")
              .insert({
                market_listing_id: selectedListing.id,
                fees: totalFees,
                dev_fees: devFees,
                creator_fees: creatorFees
              })
            
            if (error) {
              console.error("Failed to save market fees:", error)
            } else {
              console.log("Market fees saved successfully")
            }
          }
        } catch (error) {
          console.error("Error saving market fees:", error)
        }
        
        // NUR nach erfolgreicher WLD-Transaktion den Backend-Kauf durchführen
        console.log("🔥 WLD transaction successful, completing purchase...")
        console.log("🔥 About to call handlePurchase...")
        
        // Timeout löschen da Kauf erfolgreich
        if (unblockTimeout) {
          clearTimeout(unblockTimeout)
          console.log("⏰ Timeout cleared - purchase successful")
        }
        
        try {
          await handlePurchase()
          console.log("🔥 handlePurchase completed")
        } catch (error) {
          console.error("🔥 handlePurchase failed:", error)
          // WICHTIG: Hier sollte ein Rollback der WLD-Transaktion stattfinden
          // Aber das ist technisch schwierig mit Blockchain-Transaktionen
          toast({
            title: "Purchase Failed",
            description: "The card purchase failed after payment. Please contact support.",
            variant: "destructive",
          })
        }
      } else if (finalPayload.status === 'error') {
        console.error('Error sending transaction', finalPayload)
        if (unblockTimeout) {
          clearTimeout(unblockTimeout) // Timeout löschen bei Fehler
        }
        toast({
          title: "Transaction Failed",
          description: `Transaction was rejected: ${finalPayload.error_code || 'Unknown error'}`,
          variant: "destructive",
        })
      } else {
        console.error('Unknown transaction status', finalPayload)
        if (unblockTimeout) {
          clearTimeout(unblockTimeout) // Timeout löschen bei Fehler
        }
        toast({
          title: "Transaction Failed",
          description: "Transaction failed with unknown status",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error sending transaction', error)
      if (unblockTimeout) {
        clearTimeout(unblockTimeout) // Timeout löschen bei Fehler
      }
      
      let errorMessage = "Failed to initiate transaction. Please try again."
      
      if (error instanceof Error) {
        if (error.message.includes("MiniKit is not available")) {
          errorMessage = "MiniKit wallet is not available. Please connect your wallet and try again."
        } else if (error.message.includes("user_rejected")) {
          errorMessage = "Transaction was rejected by user. Please try again."
        } else if (error.message.includes("No handler")) {
          errorMessage = "Wallet connection issue. Please check your wallet connection."
        }
      }
      
      toast({
        title: "Transaction Error",
        description: errorMessage,
        variant: "destructive",
      })
    }
  }

  const sendPayment = async () => {
    // Use seller_world_id if available, otherwise use seller_wallet_address
    const sellerAddress = selectedListing?.seller_world_id || selectedListing?.seller_wallet_address
    
    if (!sellerAddress) {
      toast({
        title: "Error",
        description: "Seller wallet address not found. Cannot complete purchase.",
        variant: "destructive",
      })
      return
    }

    const wldAmount = selectedListing?.price || 1
    const res = await fetch("/api/initiate-payment", {
      method: "POST",
    })
    const { id } = await res.json()

    const payload: PayCommandInput = {
      reference: id,
      to: sellerAddress,
      tokens: [
        {
          symbol: Tokens.WLD,
          token_amount: tokenToDecimals(wldAmount, Tokens.WLD).toString(),
        },
      ],
      description: "Buy Card",
    }

    try {
      const { finalPayload } = await MiniKit.commandsAsync.pay(payload)
      console.log("🔥 MiniKit payment result:", finalPayload)

      if (finalPayload.status == "success") {
        console.log("🔥 success sending payment")
        console.log("🔥 About to call handlePurchase...")
        await handlePurchase()
        console.log("🔥 handlePurchase completed")
      } else if (finalPayload.status === 'error') {
        console.error('Error sending payment', finalPayload)
        toast({
          title: "Payment Failed",
          description: `Payment was rejected: ${finalPayload.error_code || 'Unknown error'}`,
          variant: "destructive",
        })
      } else {
        console.error('Unknown payment status', finalPayload)
        toast({
          title: "Payment Failed",
          description: "Payment failed with unknown status",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error('Error sending payment', error)
      toast({
        title: "Payment Error",
        description: "Failed to initiate payment. Please try again.",
        variant: "destructive",
      })
    }
  }

  // Blockiere eine Karte für den Kauf - SOFORTIGE BLOCKIERUNG!
  const handleBlockForPurchase = async (listing?: MarketListing) => {
    console.log("🔥 handleBlockForPurchase called!")
    const listingToBlock = listing || selectedListing
    console.log("handleBlockForPurchase called with:", { listing, listingToBlock, selectedListing })
    
    if (!listingToBlock) {
      console.error("No listing to block")
      toast({
        title: "Error",
        description: "No card selected for purchase.",
        variant: "destructive",
      })
      return
    }

    // Modal sofort öffnen ohne Statusänderung
    setSelectedListing(listingToBlock)
    setShowPurchaseDialog(true)
    console.log("🔒 Modal opened immediately for better UX")
    
    // Blockierung im Hintergrund - kein await!
    blockListingForPurchase(listingToBlock.id)
      .then(result => {
        console.log("🔒 Block result:", result)
        
        if (result.success) {
          console.log("🔒 Successfully blocked listing in database")
          
          toast({
            title: "Card Reserved!",
            description: "This card is now reserved for you!",
          })
        } else {
          // Karte bereits blockiert oder nicht verfügbar
          console.error("🔒 Failed to block listing:", result.error)
          
          // Modal schließen und Error zeigen
          setShowPurchaseDialog(false)
          setSelectedListing(null)
          
          toast({
            title: "Card Not Available",
            description: result.error,
            variant: "destructive",
          })
        }
      })
      .catch(error => {
        console.error("🔒 Error blocking listing:", error)
        
        // Modal schließen und Error zeigen
        setShowPurchaseDialog(false)
        setSelectedListing(null)
        
        toast({
          title: "Error",
          description: "Failed to reserve card. Please try again.",
          variant: "destructive",
        })
      })
  }

  // Kaufe eine Karte - KARTE IST BEREITS BLOCKIERT
  const handlePurchase = async () => {
    console.log("🔥 handlePurchase called with:", {
      user: user,
      selectedListing: selectedListing,
      userWallet: user?.wallet_address,
      listingId: selectedListing?.id
    })

    if (!user?.wallet_address || !selectedListing) {
      console.error("Missing required data:", {
        hasUser: !!user,
        hasWallet: !!user?.wallet_address,
        hasListing: !!selectedListing
      })
      toast({
        title: "Error",
        description: "User wallet address not found. Cannot complete purchase.",
        variant: "destructive",
      })
      return false
    }

    console.log("🔥 Starting purchase with:", {
      userWallet: user.wallet_address,
      listingId: selectedListing.id,
      listingPrice: selectedListing.price
    })

    setPurchaseLoading(true)
    
    try {
      // KARTE IST BEREITS BLOCKIERT - direkt Kauf durchführen
      console.log("🔥 Calling purchaseCard function...")
      const result = await purchaseCard(user.wallet_address, selectedListing.id)
      console.log("🔥 Purchase result:", result)
      
      if (result.success) {
        console.log("🔥 Purchase successful!")
        setShowPurchaseDialog(false)
        setShowPurchaseSuccess(true)
        // Aktualisiere die Listings
        loadMarketListings()
        toast({
          title: t("common.success", "Success!"),
          description: t("trade.purchase_success", "Card purchased successfully!"),
        })
        setPurchaseLoading(false)
        return true
      } else {
        console.error("🔥 Purchase failed:", result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
        setPurchaseLoading(false)
        return false
      }
    } catch (error) {
      console.error("🔥 Error purchasing card:", error)
      toast({
        title: "Error",
        description: "Failed to purchase card",
        variant: "destructive",
      })
      return false
    } finally {
      setPurchaseLoading(false)
    }
  }

  // Storniere ein Listing
  const handleCancelListing = async (listingId: string) => {
    // ✅ SOFORTIGER CHECK - Verhindert mehrfache Klicks
    if (!user?.wallet_address || cancelLoading) return

    console.log("🔥 Starting cancel listing process for:", listingId)
    setCancelLoading(true)  // ✅ Sofort setzen
    
    try {
      const result = await cancelListing(user.wallet_address, listingId)
      console.log("🔥 Cancel result:", result)
      
      if (result.success) {
        console.log("🔥 Cancel successful!")
        toast({
          title: "Success",
          description: "Listing cancelled successfully!",
        })
        // Aktualisiere die Listings
        loadUserListings()
        // Auch die Marketplace-Listings aktualisieren
        loadMarketListings()
      } else {
        console.error("🔥 Cancel failed:", result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("🔥 Error cancelling listing:", error)
      toast({
        title: "Error",
        description: "Failed to cancel listing",
        variant: "destructive",
      })
    } finally {
      setCancelLoading(false)
    }
  }

  // Aktualisiere den Preis eines Listings
  const handleUpdatePrice = (listing: MarketListing) => {
    setSelectedListing(listing)
    setShowUpdatePriceDialog(true)
  }

  // Zeige Kartendetails an
  const handleShowCardDetails = (listing: MarketListing) => {
    setSelectedListing(listing)
    setShowCardDetailsDialog(true)
  }

  // Aktualisiere die Daten nach erfolgreicher Preisänderung
  const handlePriceUpdateSuccess = async () => {
    if (!user?.username) return
    loadUserListings()
  }

  // Aktualisiere die Daten
  const handleRefresh = async () => {
    if (!user?.username) return

    if (activeTab === "marketplace") {
      loadMarketListings()
    } else if (activeTab === "sell") {
      loadUserListings()
    } else if (activeTab === "sales-history") {
      if (historyType === "my") {
        loadTransactionHistory()
      } else {
        loadRecentSales()
      }
    }
  }



  const handleSuccessAnimationComplete = () => {
    setShowPurchaseSuccess(false)
  }

  // Pagination component
  const Pagination = ({
    pagination,
    onPageChange,
  }: {
    pagination: PaginationInfo
    onPageChange: (page: number) => void
  }) => {
    const { page, totalPages } = pagination

    if (totalPages <= 1) return null

    return (
      <div className="flex justify-center items-center gap-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page - 1)}
          disabled={page === 1 || loading}
          className="h-8 w-8 p-0 border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-sm text-yellow-400">
          Page {page} of {totalPages}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || loading}
          className="h-8 w-8 p-0 border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    )
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen pb-20" style={{ backgroundImage: 'url(/hintergrung.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
        {/* Header */}
        <header className="sticky top-0 z-10 bg-gradient-to-b from-black/90 to-black/60 border-b border-yellow-400">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex justify-between items-center">
              <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                <span className="inline-block bg-gradient-to-r from-yellow-400 to-yellow-600 text-black px-2 py-1 rounded mr-2">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="10" fill="#FFD700"/></svg>
                </span>
                {t("trade.title", "Trade Market")}
              </h1>
              <div className="flex items-center gap-2">
                <div className="relative w-12 h-12">
                  <svg className="transform -rotate-90" width="48" height="48">
                    <circle cx="24" cy="24" r="18" stroke="#E5E7EB" strokeWidth="4" fill="transparent" />
                    <circle
                      cx="24"
                      cy="24"
                      r="18"
                      stroke={soldCount === 3 ? "#FFD700" : "#FFD700"}
                      strokeWidth="4"
                      strokeDasharray={2 * Math.PI * 18}
                      strokeDashoffset={2 * Math.PI * 18 - Math.min((soldCount || 0) / 3, 1) * 2 * Math.PI * 18}
                      strokeLinecap="round"
                      fill="transparent"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center text-xs font-semibold text-yellow-400">
                    {soldCount}/3
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-6 h-6 p-0 text-yellow-400 hover:text-yellow-500"
                  onClick={() => setShowSellLimitInfo(true)}
                >
                  <AlertCircle className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </header>

        {/* Selling Limit Banner */}
        {soldCount !== null && soldCount >= 2 && (
          <div
            className={`mx-4 mb-4 p-3 rounded-lg border ${
              soldCount === 3 ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"
            }`}
          >
            <div className={`flex items-center gap-2 ${soldCount === 3 ? "text-red-700" : "text-amber-700"}`}>
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium">
                {soldCount === 3 ? t("trade.selling_limit.banner_reached", "Selling limit reached") : t("trade.selling_limit.banner_approaching", "Approaching selling limit")}
              </span>
            </div>
            <p className={`text-sm mt-1 ${soldCount === 3 ? "text-red-600" : "text-amber-600"}`}>
              {soldCount === 3
                ? t("trade.selling_limit.reached_desc", "You must buy a card from the marketplace before you can sell more cards.")
                : t("trade.selling_limit.remaining_desc", "You can sell {count} more card{plural} before reaching the limit.", { count: 3 - soldCount, plural: 3 - soldCount !== 1 ? "s" : "" })}
            </p>
          </div>
        )}

        <main className="p-4 max-w-lg mx-auto">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-black/80 border border-yellow-400 rounded-lg h-12 p-1 mb-4">
              <TabsTrigger value="marketplace" className="h-10 text-yellow-400 font-bold">
                <div className="flex items-center justify-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>{t("trade.tabs.marketplace", "Market")}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="sell" className="h-10 text-yellow-400 font-bold">
                <div className="flex items-center justify-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span>{t("trade.tabs.sell", "List")}</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="sales-history" className="h-10 text-yellow-400 font-bold">
                <div className="flex items-center justify-center gap-2">
                  <History className="h-4 w-4" />
                  <span>{t("trade.tabs.sales_history", "History")}</span>
                </div>
              </TabsTrigger>
            </TabsList>

            {/* Marketplace Tab */}
            <TabsContent value="marketplace">
              <div className="space-y-4">
                {/* Search and Filter */}
                <div className="bg-black/70 rounded-xl p-3 shadow-sm border border-yellow-400 mb-4">
                  <div className="flex gap-2 mb-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-yellow-400" />
                      <Input
                        placeholder={t("trade.search_placeholder", "Search cards or sellers...")}
                        className="pl-8 pr-8 bg-black/80 text-white border border-yellow-400 placeholder-yellow-300 focus:ring-yellow-400"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                      {searchTerm && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSearchTerm("")}
                          className="absolute right-1 top-1 h-6 w-6 p-0 text-yellow-400 hover:text-yellow-300"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                    <Select value={rarityFilter} onValueChange={setRarityFilter}>
                      <SelectTrigger className="w-[130px] bg-black/80 text-yellow-300 border border-yellow-400">
                        <Filter className="h-4 w-4 mr-2 text-yellow-400" />
                        <SelectValue placeholder={t("trade.rarity_filter", "Rarity")} />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 text-yellow-300 border border-yellow-400">
                        <SelectItem value="all">{t("trade.all_rarities", "All Rarities")}</SelectItem>
                        <SelectItem value="common">{t("rarity.common", "Common")}</SelectItem>
                        <SelectItem value="rare">{t("rarity.rare", "Rare")}</SelectItem>
                        <SelectItem value="epic">{t("rarity.epic", "Epic")}</SelectItem>
                        <SelectItem value="legendary">{t("rarity.legendary", "Legendary")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-yellow-200">
                      {t("trade.available_count", "{count} {label} available", { 
                        count: marketPagination.total, 
                        label: marketPagination.total === 1 ? t("common.card", "card") : t("common.cards", "cards")
                      })}
                    </div>
                    <Select value={sortOption} onValueChange={setSortOption}>
                      <SelectTrigger className="w-[130px] h-8 text-xs bg-black/80 text-yellow-300 border border-yellow-400">
                        <ArrowUpDown className="h-3 w-3 mr-1 text-yellow-400" />
                        <SelectValue placeholder={t("trade.sort_by", "Sort by")} />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 text-yellow-300 border border-yellow-400">
                        <SelectItem value="newest">{t("trade.sort.newest", "Newest First")}</SelectItem>
                        <SelectItem value="oldest">{t("trade.sort.oldest", "Oldest First")}</SelectItem>
                        <SelectItem value="price_low">{t("trade.sort.price_low", "Price: Low to High")}</SelectItem>
                        <SelectItem value="price_high">{t("trade.sort.price_high", "Price: High to Low")}</SelectItem>
                        <SelectItem value="level_high">{t("trade.sort.level_high", "Level: High to Low")}</SelectItem>
                        <SelectItem value="level_low">{t("trade.sort.level_low", "Level: Low to High")}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Listings */}
                {loading ? (
                  <div className="space-y-3">
                    {[...Array(3)].map((_, i) => (
                      <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                        <div className="flex gap-3">
                          <Skeleton className="h-24 w-16 rounded-lg" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                            <Skeleton className="h-6 w-1/3 mt-2" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : marketListings.length > 0 ? (
                  <>
                    <div className="space-y-3">
                      {marketListings.map((listing) => (
                        <MarketplaceCard
                          key={listing.id}
                          listing={listing}
                          onPurchase={() => handleBlockForPurchase(listing)}
                          onShowDetails={() => handleShowCardDetails(listing)}
                          purchaseLoading={purchaseLoading}
                        />
                      ))}
                    </div>

                    {/* Pagination */}
                    <Pagination pagination={marketPagination} onPageChange={handleMarketPageChange} />
                  </>
                ) : (
                  <div className="bg-black/70 rounded-xl p-6 shadow-sm text-center border border-yellow-400">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-yellow-900/50 flex items-center justify-center mb-3 border border-yellow-400">
                        <Tag className="h-8 w-8 text-yellow-400" />
                      </div>
                      <h3 className="text-lg font-medium mb-1 text-yellow-200">No Cards Found</h3>
                      <p className="text-yellow-300 text-sm mb-4">
                        {searchTerm || rarityFilter !== "all"
                          ? "Try adjusting your search or filters"
                          : "There are no cards available for purchase right now"}
                      </p>
                      <Link href="/collection">
                        <Button variant="outline" size="sm" className="rounded-full border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black">
                          <Plus className="h-4 w-4 mr-1" />
                          Sell Your Cards
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Sell Tab (formerly My Listings) */}
            <TabsContent value="sell">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h2 className="text-lg font-medium">My Listed Cards</h2>
                  <Link href={listingLimitReached ? "#" : "/collection"}>
                    <Button
                      size="sm"
                      className={`rounded-full ${
                        listingLimitReached
                          ? "bg-gray-400 cursor-not-allowed"
                          : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      }`}
                      disabled={listingLimitReached}
                      onClick={(e) => {
                        if (listingLimitReached) {
                          e.preventDefault()
                          toast({
                            title: t("trade.limit_reached", "Limit reached"),
                            description: t("trade.limit_reached_desc", "You can only list a maximum of {max} cards at a time. Please remove some listings before adding more.", { max: maxListings }),
                            variant: "destructive",
                          })
                        }
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {t("trade.sell_card", "Sell Card")}
                    </Button>
                  </Link>
                </div>

                {/* Listing Limit Indicator */}
                <div className="bg-black/70 rounded-xl p-4 shadow-sm border border-yellow-400 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center">
                      <span className="font-medium text-yellow-200">{t("trade.listing_limit", "Listing Limit")}</span>
                      {listingLimitReached && (
                        <div className="ml-2 flex items-center text-red-400">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          <span className="text-sm">{t("trade.limit_reached", "Limit reached")}</span>
                        </div>
                      )}
                    </div>
                    <span className={`font-medium ${listingLimitReached ? "text-red-400" : "text-yellow-300"}`}>
                      {listingCount}/{maxListings}
                    </span>
                  </div>
                  <Progress
                    value={(listingCount / maxListings) * 100}
                    className={`h-2 bg-yellow-900`}
                    indicatorClassName={listingLimitReached ? "bg-red-500" : "bg-yellow-400"}
                  />
                  <p className="text-xs text-yellow-200 mt-2">
                    {listingLimitReached
                      ? t("trade.limit_reached_text", "You've reached the maximum number of cards you can list. Cancel some listings to add more.")
                      : t("trade.you_can_list_more", "You can list {count} more {label}.", { 
                          count: maxListings - listingCount, 
                          label: maxListings - listingCount !== 1 ? t("common.cards", "cards") : t("common.card", "card")
                        })}
                  </p>
                </div>

                {loading ? (
                  <div className="space-y-3">
                    {[...Array(2)].map((_, i) => (
                      <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                        <div className="flex gap-3">
                          <Skeleton className="h-24 w-16 rounded-lg" />
                          <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-3/4" />
                            <Skeleton className="h-3 w-1/2" />
                            <Skeleton className="h-6 w-1/3 mt-2" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : userListings.length > 0 ? (
                  <>
                    <div className="space-y-3">
                      {userListings.map((listing) => (
                        <MyListingCard
                          key={listing.id}
                          listing={listing}
                          onCancel={() => handleCancelListing(listing.id)}
                          onUpdatePrice={() => handleUpdatePrice(listing)}
                          cancelLoading={cancelLoading}
                        />
                      ))}
                    </div>

                    {/* Pagination */}
                    <Pagination pagination={userListingsPagination} onPageChange={handleUserListingsPageChange} />
                  </>
                ) : (
                  <div className="bg-black/70 rounded-xl p-6 shadow-sm text-center border border-yellow-400">
                    <div className="flex flex-col items-center">
                      <div className="w-16 h-16 rounded-full bg-yellow-900/50 flex items-center justify-center mb-3 border border-yellow-400">
                        <Tag className="h-8 w-8 text-yellow-400" />
                      </div>
                      <h3 className="text-lg font-medium mb-1 text-yellow-200">{t("trade.no_listed_title", "No Listed Cards")}</h3>
                      <p className="text-yellow-300 text-sm mb-4">{t("trade.no_listed_desc", "You haven't listed any cards for sale yet")}</p>
                      <Link href="/collection">
                        <Button className="rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black hover:from-yellow-500 hover:to-yellow-700">
                          <Plus className="h-4 w-4 mr-1" />
                          {t("trade.sell_first_card", "Sell Your First Card")}
                        </Button>
                      </Link>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* Sales History Tab (combines both history types) */}
            <TabsContent value="sales-history">
              <div className="space-y-4">
                {/* History Type Selector */}
                <div className=" rounded-xl p-2 shadow-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      variant={historyType === "all" ? "default" : "outline"}
                      className={`rounded-lg ${historyType === "all" ? "bg-gradient-to-r from-yellow-400 to-yellow-600 text-black border-yellow-400" : "bg-black/80 text-yellow-300 border border-yellow-400"}`}
                      onClick={() => setHistoryType("all")}
                    >
                      <Globe className="h-4 w-4 mr-2 text-yellow-400" />
                      {t("trade.market_history", "Market History")}
                    </Button>
                    <Button
                      variant={historyType === "my" ? "default" : "outline"}
                      className={`rounded-lg ${historyType === "my" ? "bg-gradient-to-r from-yellow-400 to-yellow-600 text-black border-yellow-400" : "bg-black/80 text-yellow-300 border border-yellow-400"}`}
                      onClick={() => setHistoryType("my")}
                    >
                      <User className="h-4 w-4 mr-2 text-black" />
                      {t("trade.my_history", "My History")}
                    </Button>
                  </div>
                </div>

                {/* My Transaction History */}
                {historyType === "my" && (
                  <>
                    <div className="flex justify-between items-center text-white font-bold">
                      <h2 className="text-lg font-medium">{t("trade.my_tx_title", "My Transaction History")}</h2>
                      <Badge variant="outline" className="bg-white">
                        <Clock className="h-3 w-3 mr-1 text-blue-500" />
                        {t("trade.badge_personal", "Personal")}
                      </Badge>
                    </div>

                    {loading ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex gap-3">
                              <Skeleton className="h-24 w-16 rounded-lg" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                                <Skeleton className="h-6 w-1/3 mt-2" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : transactions.length > 0 ? (
                      <>
                        <div className="space-y-3">
                          {transactions.map((transaction) => (
                            <TransactionCard key={transaction.id} transaction={transaction} />
                          ))}
                        </div>

                        {/* Pagination */}
                        <Pagination pagination={transactionsPagination} onPageChange={handleTransactionsPageChange} />
                      </>
                    ) : (
                      <div className="bg-black/70 rounded-xl p-6 shadow-sm text-center border border-yellow-400">
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 rounded-full bg-yellow-900/50 flex items-center justify-center mb-3 border border-yellow-400">
                            <Clock className="h-8 w-8 text-yellow-400" />
                          </div>
                          <h3 className="text-lg font-medium mb-1 text-yellow-200">{t("trade.no_tx_title", "No Transaction History")}</h3>
                          <p className="text-yellow-300 text-sm mb-4">{t("trade.no_tx_desc", "You haven't bought or sold any cards yet")}</p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-full border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black"
                            onClick={() => setActiveTab("marketplace")}
                          >
                            <Tag className="h-4 w-4 mr-1" />
                            {t("trade.browse_market", "Browse Marketplace")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Market History (Recent Sales) */}
                {historyType === "all" && (
                  <>
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-medium">{t("trade.recent_sales_title", "Market Sales History")}</h2>
                      <Badge variant="outline" className="bg-white">
                        <DollarSign className="h-3 w-3 mr-1 text-green-500" />
                        {t("trade.badge_global", "Global")}
                      </Badge>
                    </div>

                    {/* Search for Recent Sales */}
                    <div className="bg-black/70 rounded-xl p-3 shadow-sm border border-yellow-400">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-yellow-400" />
                        <Input
                          placeholder={t("trade.recent_sales_search_placeholder", "Search cards, buyers or sellers...")}
                          className="pl-8 pr-8 bg-black/80 text-white border border-yellow-400 placeholder-yellow-300 focus:ring-yellow-400"
                          value={salesSearchTerm}
                          onChange={(e) => setSalesSearchTerm(e.target.value)}
                        />
                        {salesSearchTerm && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSalesSearchTerm("")}
                            className="absolute right-1 top-1 h-6 w-6 p-0 text-yellow-400 hover:text-yellow-300"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <div className="text-sm text-yellow-200">
                          {t("trade.recent_sales_count", "{count} {label} found", { 
                            count: recentSalesPagination.total, 
                            label: recentSalesPagination.total === 1 ? t("trade.sale", "sale") : t("trade.sales", "sales")
                          })}
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSalesSearchTerm("")
                            loadRecentSales(1)
                          }}
                          className="h-7 text-xs text-yellow-400 hover:text-yellow-300"
                          disabled={!salesSearchTerm}
                        >
                          <X className="h-3 w-3 mr-1" />
                          {t("common.clear", "Clear")}
                        </Button>
                      </div>
                    </div>

                    {/* Market Activity Info */}
                    <div className="bg-black/70 rounded-xl p-4 shadow-sm border border-yellow-400">
                      <p className="text-sm text-yellow-300">
                        {t("trade.recent_sales_info", "View all recent card sales in the marketplace. This helps you understand current market trends and card values.")}
                      </p>
                    </div>

                    {loading ? (
                      <div className="space-y-3">
                        {[...Array(3)].map((_, i) => (
                          <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                            <div className="flex gap-3">
                              <Skeleton className="h-24 w-16 rounded-lg" />
                              <div className="flex-1 space-y-2">
                                <Skeleton className="h-4 w-3/4" />
                                <Skeleton className="h-3 w-1/2" />
                                <Skeleton className="h-6 w-1/3 mt-2" />
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : recentSales.length > 0 ? (
                      <>
                        <div className="space-y-3">
                          {recentSales.map((sale) => (
                            <RecentSaleCard key={sale.id} sale={sale} />
                          ))}
                        </div>

                        {/* Pagination */}
                        <Pagination pagination={recentSalesPagination} onPageChange={handleRecentSalesPageChange} />
                      </>
                    ) : (
                      <div className="bg-black/70 rounded-xl p-6 shadow-sm text-center border border-yellow-400">
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 rounded-full bg-yellow-900/50 flex items-center justify-center mb-3 border border-yellow-400">
                            <BarChart2 className="h-8 w-8 text-yellow-400" />
                          </div>
                          <h3 className="text-lg font-medium mb-1 text-yellow-200">No Recent Sales</h3>
                          <p className="text-yellow-300 text-sm mb-4">
                            {salesSearchTerm
                              ? "No sales match your search criteria. Try a different search term."
                              : "There haven't been any card sales recently"}
                          </p>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            className="rounded-full border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black"
                            onClick={() => setActiveTab("marketplace")}
                          >
                            <Tag className="h-4 w-4 mr-1" />
                            Browse Marketplace
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </main>

        {/* Card Details Dialog */}
        <Dialog open={showCardDetailsDialog} onOpenChange={setShowCardDetailsDialog}>
          <DialogContent className="sm:max-w-md bg-black/80 border-none [&>button]:text-white [&>button]:hover:text-yellow-400">
            <DialogHeader>
              <DialogTitle className="text-white">{t("card_details.title", "Card Details")}</DialogTitle>
            </DialogHeader>
            {selectedListing && (
              <div className="space-y-6">
                <div className="flex flex-col items-center">
                  {/* TiltableCard */}
                  <div className="w-64 mx-auto mb-6">
                    <TiltableCard
                      id={selectedListing.card_id}
                      name={selectedListing.card.name}
                      character={selectedListing.card.character}
                      imageUrl={selectedListing.card.image_url}
                      rarity={selectedListing.card.rarity}
                      level={selectedListing.card_level}
                    />
                  </div>

                  {/* Verkäufer und Preis */}
                  <div className="bg-white/10 backdrop-blur-md p-4 rounded-lg w-full text-white">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-gray-300">{t("trade.card_dialog.seller", "Seller:")}</span>
                      <span className="font-medium">
                        {selectedListing.seller_username.length > 9
                          ? `${selectedListing.seller_username.substring(0, 9)}...`
                          : selectedListing.seller_username}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">{t("trade.card_dialog.price", "Price:")}</span>
                      <div className="flex items-center">
                        <span className="font-bold text-lg">{selectedListing.price} WLD</span>
                      </div>
                    </div>
                  </div>

                  {/* Kaufen-Button */}
                  {selectedListing.seller_wallet_address !== user?.wallet_address && (
                    <Button
                      onClick={() => {
        if (selectedListing.status === "blocked") {
          toast({
            title: t("trade.purchase_dialog.being_purchased_alert", "Card Being Purchased"),
            description: t("trade.purchase_dialog.being_purchased_desc", "This card is currently being purchased by another user. Please try again in a few seconds."),
            variant: "destructive",
          })
          return
        }
                        setShowCardDetailsDialog(false)
                        handleBlockForPurchase()
                      }}
                      disabled={purchaseLoading || selectedListing.status === "blocked"}
                      className={`w-full mt-4 ${
                        selectedListing.status === "blocked" 
                          ? "bg-gray-500 cursor-not-allowed" 
                          : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                      }`}
                    >
                      {selectedListing.status === "blocked" ? (
                        <>
                          <AlertCircle className="h-4 w-4 mr-2" />
                          {t("trade.card_dialog.being_purchased", "Being Purchased")}
                        </>
                      ) : purchaseLoading ? (
                        <>
                          <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                          {t("trade.card_dialog.processing", "Processing...")}
                        </>
                      ) : (
                        <>
                          <ShoppingCart className="h-4 w-4 mr-2" />
                          {t("trade.card_dialog.buy_now", "Buy Now")}
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Purchase Dialog */}
        <Dialog open={showPurchaseDialog} onOpenChange={setShowPurchaseDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{t("trade.purchase_dialog.title", "Confirm Purchase")}</DialogTitle>
              <DialogDescription>{t("trade.purchase_dialog.desc", "You are about to purchase this card. This action cannot be undone.")}</DialogDescription>
            </DialogHeader>
            {selectedListing && (
              <div className="space-y-4">
                <div className="flex gap-4 items-center">
                  <div className="relative w-20 h-28 overflow-hidden rounded-lg">
                    {selectedListing.card.image_url?.endsWith(".mp4") ? (
                      <video
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                            src={getCloudflareImageUrl(selectedListing.card.image_url)}
                          />
                    ) : (<img
                      src={getCloudflareImageUrl(selectedListing.card.image_url) || "/placeholder.svg"}
                      alt="Card"
                      loading="lazy"
                      className="w-full h-full object-cover"
                    />)}
                    
                    <div className="absolute bottom-0 left-0 right-0 flex justify-center">
                      {renderStars(selectedListing.card_level, "xs")}
                    </div>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium">{selectedListing.card.name}</h3>
                    <p className="text-sm text-gray-500">{selectedListing.card.character}</p>
                    <div className="flex items-center mt-1">
                      <Badge
                        className={`
                        ${selectedListing.card.rarity === "common" ? "bg-gray-500" : ""}
                        ${selectedListing.card.rarity === "rare" ? "bg-blue-500" : ""}
                        ${selectedListing.card.rarity === "epic" ? "bg-purple-500" : ""}
                        ${selectedListing.card.rarity === "legendary" ? "bg-amber-500" : ""}
                      `}
                      >
                        {getDisplayRarity(selectedListing.card.rarity)}
                      </Badge>
                      <div className="ml-2 flex items-center">
                        <span className="text-xs mr-1">Level {selectedListing.card_level}</span>
                      </div>
                    </div>
                    <div className="flex items-center mt-2">
                      <span className="font-bold text-lg">{selectedListing.price} WLD</span>
                    </div>
                  </div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg text-sm">
                  <p className="text-amber-800">
                    <span className="font-medium">{t("common.seller", "Seller")}:</span>{" "}
                    {selectedListing.seller_username.length > 9
                      ? `${selectedListing.seller_username.substring(0, 9)}...`
                      : selectedListing.seller_username}
                  </p>
                  
                  {selectedListing.card.creator_address && selectedListing.card.creator_address.trim() !== "" ? (
                    <MarketFeeBreakdown 
                      price={selectedListing.price} 
                      rarity={selectedListing.card.rarity}
                      t={t}
                    />
                  ) : (
                    <>
                      <p className="text-amber-800 mt-1">
                        <span className="font-medium">{t("trade.purchase_dialog.market_fee", "Market Fee")}:</span> {(selectedListing.price * 0.1).toFixed(2)} WLD (10%)
                      </p>
                      <p className="text-amber-800 mt-1">
                        <span className="font-medium">{t("trade.purchase_dialog.seller_receives", "Seller Receives")}:</span> {(selectedListing.price * 0.9).toFixed(2)} WLD
                      </p>
                    </>
                  )}

                  {(user?.coins || 0) < selectedListing.price && (
                    <p className="text-red-500 mt-1 font-medium">{t("trade.purchase_dialog.not_enough_wld", "You don't have enough WLD for this purchase!")}</p>
                  )}
                  {selectedListing.seller_wallet_address === user?.wallet_address && (
                    <p className="text-red-500 mt-1 font-medium">{t("trade.purchase_dialog.cannot_buy_own", "You cannot buy your own card!")}</p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowPurchaseDialog(false)}>
                    {t("trade.purchase_dialog.cancel", "Cancel")}
                  </Button>
                  <Button
                    onClick={() => {
                      if (selectedListing.status === "blocked") {
                        toast({
                          title: t("trade.purchase_dialog.being_purchased_alert", "Card Being Purchased"),
                          description: t("trade.purchase_dialog.being_purchased_desc", "This card is currently being purchased by another user. Please try again in a few seconds."),
                          variant: "destructive",
                        })
                        return
                      }
                      console.log("Buy with WLD button clicked")
                      sendTransaction()
                    }}
                    disabled={
                      purchaseLoading ||
                      (user?.coins || 0) < selectedListing.price ||
                      selectedListing.seller_wallet_address === user?.wallet_address ||
                      selectedListing.status === "blocked"
                    }
                    className={`${
                      selectedListing.status === "blocked" 
                        ? "bg-gray-500 cursor-not-allowed" 
                        : "bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    }`}
                  >
                    {selectedListing.status === "blocked" ? (
                      <>
                        <AlertCircle className="h-4 w-4 mr-2" />
                        {t("trade.card_dialog.being_purchased", "Being Purchased")}
                      </>
                    ) : purchaseLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                        {t("trade.card_dialog.processing", "Processing...")}
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        {t("trade.purchase_dialog.buy_now", "Buy Now")}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Update Price Dialog */}
        {selectedListing && (
          <UpdatePriceDialog
            isOpen={showUpdatePriceDialog}
            onClose={() => setShowUpdatePriceDialog(false)}
            listingId={selectedListing.id}
            currentPrice={selectedListing.price}
            username={user?.wallet_address || ""}
            onSuccess={handlePriceUpdateSuccess}
            cardRarity={selectedListing.card.rarity}
            overallRating={selectedListing.card.overall_rating}
            cardLevel={selectedListing.card_level}
          />
        )}

        {/* Purchase Success Animation */}
        {selectedListing && (
          <PurchaseSuccessAnimation
            show={showPurchaseSuccess}
            onComplete={handleSuccessAnimationComplete}
            cardImageUrl={selectedListing.card.image_url}
            cardName={selectedListing.card.name}
          />
        )}

        {/* Sell Limit Info Dialog */}
        <Dialog open={showSellLimitInfo} onOpenChange={setShowSellLimitInfo}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-blue-500" />
                {t("trade.selling_limit.dialog_title", "Selling Limit")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {t("trade.selling_limit.dialog_desc", "This indicator shows how many cards you've sold since your last purchase from the marketplace.")}
              </p>
              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">{t("trade.selling_limit.dialog_how_it_works", "How it works:")}</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>{t("trade.selling_limit.rule_1", "• You can sell up to 3 cards before needing to buy one")}</li>
                  <li>{t("trade.selling_limit.rule_2", "• After selling 3 cards, you must purchase from the marketplace")}</li>
                  <li>{t("trade.selling_limit.rule_3", "• Purchasing a card resets your counter to 0")}</li>
                  <li>{t("trade.selling_limit.rule_4", "• This encourages marketplace activity and trading")}</li>
                </ul>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">{t("trade.selling_limit.current_status", "Current status:")}</span>
                <span
                  className={`font-medium ${soldCount === 3 ? "text-red-600" : soldCount === 2 ? "text-amber-600" : "text-green-600"}`}
                >
                  {soldCount === 3
                    ? t("trade.selling_limit.status_reached", "Limit reached")
                    : soldCount === 2
                      ? t("trade.selling_limit.status_one_more", "One more sale allowed")
                      : t("trade.selling_limit.status_remaining", "{count} sales remaining", { count: 3 - (soldCount || 0) })}
                </span>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Deal of the Day Dialog - DISABLED on Trade page */}
        {/* {dailyDeal && (
          <>
            {console.log("Rendering DealOfTheDayDialog with:", { dailyDeal, showDailyDealDialog })}
            <DealOfTheDayDialog
            isOpen={showDailyDealDialog}
            onClose={() => {
              setShowDailyDealDialog(false)
              setHasShownDailyDeal(true) // Mark as shown when closed
            }}
            deal={dailyDeal}
            username={user?.wallet_address || ""}
            onPurchaseSuccess={(newTickets, newEliteTickets) => {
              // Handle purchase success - you might want to refresh user data here
              console.log("Deal purchased successfully!", { newTickets, newEliteTickets })
            }}
          />
          </>
        )} */}

        <MobileNav />
      </div>
    </ProtectedRoute>
  )
}

// Marketplace Card Component
function MarketplaceCard({
  listing,
  onPurchase,
  onShowDetails,
  purchaseLoading = false,
}: {
  listing: MarketListing
  onPurchase: () => void
  onShowDetails: () => void
  purchaseLoading?: boolean
}) {
  const { user } = useAuth()
  const { t } = useI18n()
  const isOwnListing = listing.seller_wallet_address === user?.wallet_address

  const getDisplayRarity = (rarity: string) => {
    const rarityMap: Record<string, string> = {
      common: t("rarity.common", "Common"),
      rare: t("rarity.rare", "Rare"),
      epic: t("rarity.epic", "Epic"),
      legendary: t("rarity.legendary", "Legendary"),
      goat: t("rarity.goat", "GOAT"),
    }
    return rarityMap[rarity.toLowerCase()] || rarity
  }

  // Map rarity to color styles
  const rarityStyles = {
    basic: {
      border: "border-gray-400",
      text: "text-gray-600",
      badge: "bg-gray-500",
    },
    rare: {
      border: "border-blue-500",
      text: "text-blue-600",
      badge: "bg-blue-500",
    },
    elite: {
      border: "border-purple-500",
      text: "text-purple-600",
      badge: "bg-purple-500",
    },
    ultimate: {
      border: "border-yellow-500",
      text: "text-yellow-600",
      badge: "bg-amber-500",
    },
    wbc: {
      border: "border-red-800",
      text: "text-red-700",
      badge: "bg-red-800",
    },
  }

  const rarityStyle = rarityStyles[listing.card.rarity as keyof typeof rarityStyles] || rarityStyles.basic

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  console.log('TradeCard', listing.card.image_url, listing.card.image_url);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      onClick={() => {
        if (listing.status === "blocked") {
          // Zeige eine Nachricht dass die Karte gerade gekauft wird
          toast({
            title: t("trade.purchase_dialog.being_purchased_alert", "Card Being Purchased"),
            description: t("trade.purchase_dialog.being_purchased_desc", "This card is currently being purchased by another user. Please try again in a few seconds."),
            variant: "destructive",
          })
          return
        }
        if (!purchaseLoading) {
          onShowDetails()
        }
      }}
      className={`bg-gradient-to-br from-black/80 to-black/60 rounded-2xl shadow-lg p-4 flex items-center gap-4 mb-4 border border-yellow-400 transition-transform ${
        listing.status === "blocked" || purchaseLoading
          ? "cursor-not-allowed opacity-75" 
          : "cursor-pointer hover:scale-[1.02]"
      }`}
    >
      <div className="w-16 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-900 flex items-center justify-center relative">
        <img
          src={getCardImageUrl(listing.card.image_url)}
          alt="Card"
          loading="lazy"
          className="w-full h-full object-cover"
          onError={(e) => {
            console.log("Image failed to load, trying fallback");
            const target = e.target as HTMLImageElement;
            if (target.src.includes('ani-labs.xyz')) {
              target.src = listing.card.image_url || "/placeholder.svg";
            } else {
              target.src = "/placeholder.svg";
            }
          }}
        />
        <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
          {renderStars(listing.card_level, "xs")}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg font-bold text-white truncate">{listing.card.name}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-800 text-yellow-400 uppercase">{getDisplayRarity(listing.card.rarity)}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500 text-black">Level {listing.card_level}</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-yellow-200 truncate">{t("common.seller", "Seller")}: <span className="font-bold text-yellow-400">
            {listing.seller_username.length > 9
              ? `${listing.seller_username.substring(0, 9)}...`
              : listing.seller_username}
          </span></span>
          {isOwnListing && <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">My Listing</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-yellow-400">{listing.price} WLD</span>
          {listing.status === "blocked" && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-orange-500 text-white">
              {t("trade.card_dialog.being_purchased", "Being Purchased")}
            </span>
          )}
          {purchaseLoading && (
            <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-blue-500 text-white flex items-center gap-1">
              <div className="h-2 w-2 border border-t-transparent border-white rounded-full animate-spin"></div>
              Processing...
            </span>
          )}
          <span className="text-xs text-gray-300 ml-auto">{formatDate(listing.created_at)}</span>
        </div>
        
      </div>
    </motion.div>
  )
}

// My Listing Card Component
function MyListingCard({
  listing,
  onCancel,
  onUpdatePrice,
  cancelLoading,
}: {
  listing: MarketListing
  onCancel: () => void
  onUpdatePrice: () => void
  cancelLoading: boolean
}) {
  const { t } = useI18n()

  const getDisplayRarity = (rarity: string) => {
    const rarityMap: Record<string, string> = {
      common: t("rarity.common", "Common"),
      rare: t("rarity.rare", "Rare"),
      epic: t("rarity.epic", "Epic"),
      legendary: t("rarity.legendary", "Legendary"),
      goat: t("rarity.goat", "GOAT"),
    }
    return rarityMap[rarity.toLowerCase()] || rarity
  }

  // Map rarity to color styles
  const rarityStyles = {
    basic: {
      border: "border-gray-400",
      text: "text-gray-600",
      badge: "bg-gray-500",
    },
    rare: {
      border: "border-blue-500",
      text: "text-blue-600",
      badge: "bg-blue-500",
    },
    elite: {
      border: "border-purple-500",
      text: "text-purple-600",
      badge: "bg-purple-500",
    },
    ultimate: {
      border: "border-yellow-500",
      text: "text-yellow-600",
      badge: "bg-amber-500",
    },
  }

  const rarityStyle = rarityStyles[listing.card.rarity as keyof typeof rarityStyles] || rarityStyles.basic

  // Format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  console.log('TradeCard', listing.card.image_url, listing.card.image_url);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-black/80 to-black/60 rounded-xl overflow-hidden shadow-sm"
    >
      <div className="p-3">
        <div className="flex gap-3">
          {/* Card Image */}
          <div className={`relative w-16 h-24 rounded-lg overflow-hidden border-2 ${rarityStyle.border}`}>
            {listing.card.image_url?.endsWith(".mp4")? (
              <video
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                            src={listing.card.image_url}
                          />
            ) : (<img
              src={getCardImageUrl(listing.card.image_url) || "/placeholder.svg"}
              alt="Card"
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log("Image failed to load, trying fallback");
                const target = e.target as HTMLImageElement;
                if (target.src.includes('ani-labs.xyz')) {
                  target.src = listing.card.image_url || "/placeholder.svg";
                } else {
                  target.src = "/placeholder.svg";
                }
              }}
            />)}
            <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 text-[10px] px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1">
              {renderStars(listing.card_level, "xs")}
            </div>
          </div>

          {/* Card Details */}
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-sm text-white">{listing.card.name}</h3>
                <p className="text-xs text-yellow-200">{listing.card.character}</p>
              </div>
              <div className="flex flex-col items-end">
                <Badge className={rarityStyle.badge}>{getDisplayRarity(listing.card.rarity)}</Badge>
                <Badge variant="outline" className="mt-1 text-xs text-yellow-300 border-yellow-400">
                  Level {listing.card_level}
                </Badge>
              </div>
            </div>

            <div className="flex items-center mt-1 text-xs text-yellow-200">
              <span>Listed: <span className="text-yellow-300">{formatDate(listing.created_at)}</span></span>
            </div>

            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center">
                <span className="font-bold text-yellow-400">{listing.price} WLD</span>
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onUpdatePrice}
                  className="h-8 rounded-full border-blue-300 text-blue-500 hover:bg-blue-50"
                >
                  <Edit className="h-3 w-3 mr-1" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onCancel}
                  disabled={cancelLoading}
                  className="h-8 rounded-full border-red-300 text-red-500 hover:bg-red-50"
                >
                  {cancelLoading ? (
                    <div className="h-3 w-3 border-2 border-t-transparent border-red-500 rounded-full animate-spin"></div>
                  ) : (
                    <>
                      <X className="h-3 w-3 mr-1" />
                      Cancel
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// Transaction Card Component
function TransactionCard({ transaction }: { transaction: Transaction }) {
  // Map rarity to color styles
  const rarityStyles = {
    basic: {
      border: "border-gray-400",
      text: "text-gray-600",
      badge: "bg-gray-500",
    },
    rare: {
      border: "border-blue-500",
      text: "text-blue-600",
      badge: "bg-blue-500",
    },
    elite: {
      border: "border-purple-500",
      text: "text-purple-600",
      badge: "bg-purple-500",
    },
    ultimate: {
      border: "border-yellow-500",
      text: "text-yellow-600",
      badge: "bg-amber-500",
    },
  }

  const rarityStyle = rarityStyles[transaction.card.rarity as keyof typeof rarityStyles] || rarityStyles.basic

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown"
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-black/80 to-black/60 rounded-xl overflow-hidden shadow-sm"
    >
      <div className="p-3">
        <div className="flex gap-3">
          {/* Card Image */}
          <div className={`relative w-16 h-24 rounded-lg overflow-hidden border-2 ${rarityStyle.border}`}>
            {transaction.card.image_url?.endsWith(".mp4") ? (
              <video
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                            src={transaction.card.image_url}
                          />
            ) : (<img
              src={getCardImageUrl(transaction.card.image_url) || "/placeholder.svg"}
              alt="Card"
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log("Image failed to load, trying fallback");
                const target = e.target as HTMLImageElement;
                if (target.src.includes('ani-labs.xyz')) {
                  target.src = transaction.card.image_url || "/placeholder.svg";
                } else {
                  target.src = "/placeholder.svg";
                }
              }}
            />)}
            
            <div className="absolute bottom-0 left-0 right-0 flex justify-center">
              {renderStars(transaction.card_level, "xs")}
            </div>
          </div>

          {/* Card Details */}
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-sm text-white">{transaction.card.name}</h3>
                <p className="text-xs text-yellow-200">{transaction.card.character}</p>
              </div>
              <div className="flex flex-col items-end">
                <Badge className={transaction.transaction_type === "purchased" ? "bg-blue-500" : "bg-green-500"}>
                  {transaction.transaction_type === "purchased" ? "Bought" : "Sold"}
                </Badge>
                <Badge variant="outline" className="mt-1 text-xs text-yellow-300 border-yellow-400">
                  Level {transaction.card_level}
                </Badge>
              </div>
            </div>

            <div className="flex items-center mt-1 text-xs text-yellow-200">
              <span>
                {transaction.transaction_type === "purchased" ? "From: " : "To: "}
                <span className="font-medium text-yellow-400">
                  {transaction.other_party_username || transaction.other_party}
                </span>
              </span>
            </div>

            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center">
                <span className="font-bold text-yellow-400">{transaction.price} WLD</span>
              </div>
              <div className="text-xs text-yellow-300">{formatDate(transaction.sold_at || "")}</div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// Recent Sale Card Component
function RecentSaleCard({ sale }: { sale: RecentSale }) {
  const { t } = useI18n()

  const getDisplayRarity = (rarity: string) => {
    const rarityMap: Record<string, string> = {
      common: t("rarity.common", "Common"),
      rare: t("rarity.rare", "Rare"),
      epic: t("rarity.epic", "Epic"),
      legendary: t("rarity.legendary", "Legendary"),
      goat: t("rarity.goat", "GOAT"),
    }
    return rarityMap[rarity.toLowerCase()] || rarity
  }

  // Map rarity to color styles
  const rarityStyles = {
    basic: {
      border: "border-gray-400",
      text: "text-gray-600",
      badge: "bg-gray-500",
    },
    rare: {
      border: "border-blue-500",
      text: "text-blue-600",
      badge: "bg-blue-500",
    },
    elite: {
      border: "border-purple-500",
      text: "text-purple-600",
      badge: "bg-purple-500",
    },
    ultimate: {
      border: "border-yellow-500",
      text: "text-yellow-600",
      badge: "bg-amber-500",
    },
  }

  const rarityStyle = rarityStyles[sale.card.rarity as keyof typeof rarityStyles] || rarityStyles.basic

  // Format date
  const formatDate = (dateString: string) => {
    if (!dateString) return "Unknown"
    const date = new Date(dateString)
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(date)
  }

  // Calculate time ago
  const getTimeAgo = (dateString: string) => {
    if (!dateString) return "Unknown"
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSec = Math.floor(diffMs / 1000)
    const diffMin = Math.floor(diffSec / 60)
    const diffHour = Math.floor(diffMin / 60)
    const diffDay = Math.floor(diffHour / 24)

    if (diffDay > 0) {
      return `${diffDay} day${diffDay > 1 ? "s" : ""} ago`
    } else if (diffHour > 0) {
      return `${diffHour} hour${diffHour > 1 ? "s" : ""} ago`
    } else if (diffMin > 0) {
      return `${diffMin} minute${diffMin > 1 ? "s" : ""} ago`
    } else {
      return "Just now"
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="bg-gradient-to-br from-black/80 to-black/60 rounded-xl overflow-hidden shadow-sm"
    >
      <div className="p-3">
        <div className="flex gap-3">
          {/* Card Image */}
          <div className={`relative w-16 h-24 rounded-lg overflow-hidden border-2 ${rarityStyle.border}`}>
            { sale.card.image_url?.endsWith(".mp4") ? (
              <video
                            autoPlay
                            muted
                            loop
                            playsInline
                            className="absolute inset-0 w-full h-full object-cover"
                            src={sale.card.image_url}
                          />
            ) : (<img
              src={getCardImageUrl(sale.card.image_url) || "/placeholder.svg"}
              alt="Card"
              loading="lazy"
              className="w-full h-full object-cover"
              onError={(e) => {
                console.log("Image failed to load, trying fallback");
                const target = e.target as HTMLImageElement;
                if (target.src.includes('ani-labs.xyz')) {
                  target.src = sale.card.image_url || "/placeholder.svg";
                } else {
                  target.src = "/placeholder.svg";
                }
              }}
            />)}
            
            <div className="absolute bottom-0 left-0 right-0 flex justify-center">
              {renderStars(sale.card_level, "xs")}
            </div>
          </div>

          {/* Card Details */}
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-sm text-white">{sale.card.name}</h3>
                <p className="text-xs text-yellow-200">{sale.card.character}</p>
              </div>
              <div className="flex flex-col items-end">
                <Badge className={rarityStyle.badge}>{getDisplayRarity(sale.card.rarity)}</Badge>
                <Badge variant="outline" className="mt-1 text-xs text-yellow-300 border-yellow-400">
                  Level {sale.card_level}
                </Badge>
              </div>
            </div>

            <div className="flex items-center mt-1 text-xs text-yellow-200">
              <span>
                {t("common.seller", "Seller")}: <span className="font-medium text-yellow-400">{(sale.seller_username && sale.seller_username.length > 9 ? `${sale.seller_username.substring(0, 9)}...` : sale.seller_username) || (sale.seller_wallet_address ? sale.seller_wallet_address.substring(0, 4) : 'Unknown')}</span>
              </span>
              <span className="mx-1 text-yellow-300">•</span>
              <span>{t("common.buyer", "Buyer")}: <span className="font-medium text-yellow-400">{(sale.buyer_username && sale.buyer_username.length > 9 ? `${sale.buyer_username.substring(0, 9)}...` : sale.buyer_username) || (sale.buyer_wallet_address ? sale.buyer_wallet_address.substring(0, 4) : 'Unknown')}</span></span>
            </div>

            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center">
                <span className="font-bold text-yellow-400">{sale.price} WLD</span>
                <Badge variant="outline" className="ml-2 bg-green-50 text-green-600 border-green-200">
                  <DollarSign className="h-3 w-3 mr-1" />
                  Sold
                </Badge>
              </div>
              <div className="text-xs text-yellow-300">
                <span title={formatDate(sale.sold_at)}>{getTimeAgo(sale.sold_at)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
