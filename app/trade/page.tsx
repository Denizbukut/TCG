"use client"

import { useState, useEffect } from "react"
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

// ABI für die transfer-Funktion des ERC20-Tokens
const ERC20_ABI = ["function transfer(address to, uint256 amount) public returns (bool)"]
// Typen für die Marketplace-Daten
type Card = {
  id: string
  name: string
  character: string
  image_url?: string
  rarity: "common" | "rare" | "epic" | "legendary" | "goat" // | "wbc" // Commented out
  overall_rating?: number
}

type MarketListing = {
  id: string
  seller_id: string
  card_id: string
  price: number
  created_at: string
  status: "active" | "sold" | "cancelled"
  buyer_id?: string
  sold_at?: string
  user_card_id: number | string
  card_level: number
  card: Card
  seller_username: string
  seller_world_id?: string
}

// Update the Transaction type to make seller_username optional
type Transaction = MarketListing & {
  transaction_type: "sold" | "purchased"
  other_party: string
  seller_username?: string // Make this optional
}

// Typ für kürzlich verkaufte Karten
type RecentSale = {
  id: string
  seller_id: string
  buyer_id: string
  card_id: string
  price: number
  sold_at: string
  card_level: number
  card: Card
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
  
  // Remove leading slash and any world_soccer/world-soccer prefix
  let cleaned = imagePath.replace(/^\/?(world[-_])?soccer\//i, "")
  return `https://ani-labs.xyz/${cleaned}`
}

// Neue Bild-URL-Logik global für alle Card-Boxen
const getCardImageUrl = (imageUrl?: string) => {
  if (!imageUrl) return "/placeholder.svg";
  // Remove leading slash and any world_soccer/world-soccer prefix
  let cleaned = imageUrl.replace(/^\/?(world[-_])?soccer\//i, "");
  return `https://ani-labs.xyz/${cleaned}`;
}

export default function TradePage() {
  const { user } = useAuth()
  const [activeTab, setActiveTab] = useState("marketplace")
  const [historyType, setHistoryType] = useState<"my" | "all">("my")
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
  const [maxListings, setMaxListings] = useState(7)
  const [listingLimitReached, setListingLimitReached] = useState(false)
  const [hasInitialized, setHasInitialized] = useState(false)
  const [soldCount, setSoldCount] = useState<number | null>(null)
  const [showSellLimitInfo, setShowSellLimitInfo] = useState(false)
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

  // Debounced search function for marketplace
  const debouncedSearch = debounce(() => {
    setMarketPage(1) // Reset to page 1 when search changes
    loadMarketListings(1) // Load page 1 with the new search term
  }, 500)

  // Debounced search function for recent sales
  const debouncedSalesSearch = debounce(() => {
    setRecentSalesPage(1) // Reset to page 1 when search changes
    loadRecentSales(1) // Load page 1 with the new search term
  }, 500)

  console.log(user)

  useEffect(() => {
    const fetchSoldCount = async () => {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        throw new Error("Could not connect to database")
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

  useEffect(() => {
    if (!user?.username || !hasInitialized) return

    if (activeTab === "marketplace") {
      setMarketPage(1)
      debouncedSearch()
      loadMarketListings(1)
    }

    if (activeTab === "sales-history") {
      if (historyType === "my") {
        setTransactionsPage(1)
        loadTransactionHistory(1)
      } else {
        setRecentSalesPage(1)
        debouncedSalesSearch()
        loadRecentSales(1)
      }
    }

    if (activeTab === "sell") {
      setUserListingsPage(1)
      loadUserListings(1)
    }
  }, [activeTab, searchTerm, rarityFilter, sortOption, historyType, salesSearchTerm])
  console.log(user)

  // Load market listings with pagination
  const loadMarketListings = async (pageToLoad = marketPage) => {
    if (!user?.username) return

    setLoading(true)
    try {
      // Prepare filters
      const filters: any = {
        rarity: rarityFilter !== "all" ? rarityFilter : undefined,
        sort: sortOption, // Pass the sort option to the server
      }

      // Add search term to filters if present
      if (searchTerm) {
        filters.search = searchTerm
      }

      const result = await getMarketListings(pageToLoad, 20, filters)
      if (result.success) {
        setMarketListings(result.listings || [])
        if (result.pagination) {
          setMarketPagination(result.pagination)
        }
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error loading market listings:", error)
      toast({
        title: "Error",
        description: "Failed to load marketplace data",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Load user listings with pagination
  const loadUserListings = async (pageToLoad = userListingsPage) => {
    if (!user?.username) return

    setLoading(true)
    try {
      const result = await getUserListings(user.username, pageToLoad, 20)
      if (result.success) {
        setUserListings(result.listings || [])
        setListingCount(result.listingCount || 0)
        setMaxListings(result.maxListings || 7)
        setListingLimitReached((result.listingCount || 0) >= (result.maxListings || 7))
        if (result.pagination) {
          setUserListingsPagination(result.pagination)
        }
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error loading user listings:", error)
      toast({
        title: "Error",
        description: "Failed to load your listings",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Load transaction history with pagination
  const loadTransactionHistory = async (pageToLoad = transactionsPage) => {
    if (!user?.username) return

    setLoading(true)
    try {
      const result = await getTransactionHistory(user.username, pageToLoad, 20)
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
        description: "Failed to load transaction history",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  // Load recent sales with pagination
  const loadRecentSales = async (pageToLoad = recentSalesPage) => {
    setLoading(true)
    try {
      console.log("Loading recent sales page:", pageToLoad, "with search term:", salesSearchTerm)
      const result = await getRecentSales(pageToLoad, 20, salesSearchTerm)
      if (result.success) {
        console.log("Recent sales loaded successfully:", result.sales?.length || 0, "items")
        setRecentSales(result.sales || [])
        if (result.pagination) {
          console.log("Pagination info:", result.pagination)
          setRecentSalesPagination(result.pagination)
        }
      } else {
        console.error("Error in result:", result.error)
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error loading recent sales:", error)
      toast({
        title: "Error",
        description: "Failed to load recent sales",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

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
    const total  = BigInt(toWei(selectedListing?.price ?? 1))
    const ten    = (total * BigInt("10")) / BigInt("100") // 10%
    const ninety = total - ten   

    const addrTen = "0x9311788aa11127F325b76986f0031714082F016B"
    const addrNinety = selectedListing?.seller_world_id // MUSS 0x-Adresse sein

    const {commandPayload, finalPayload} = await MiniKit.commandsAsync.sendTransaction({
      transaction: [
        {
          address: WLD_TOKEN,
          abi: erc20TransferAbi,
          functionName: "transfer",
          args: [addrTen, ten.toString()],
        },
        {
          address: WLD_TOKEN,
          abi: erc20TransferAbi,
          functionName: "transfer",
          args: [addrNinety, ninety.toString()],
        },
      ],
    })
    if (finalPayload.status == "success") {
      console.log("success sending payment")
      
      // Save market fees directly to database (client-side)
      try {
        const supabase = getSupabaseBrowserClient()
        if (supabase && selectedListing?.id) {
          const fees = selectedListing.price * 0.1
          const { error } = await supabase
            .from("market_fees")
            .insert({
              market_listing_id: selectedListing.id,
              fees: fees
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
      
      handlePurchase()
    }
    else if (finalPayload.status === 'error') {
      console.error('Error sending transaction', finalPayload)
    }
  }

  const sendPayment = async () => {
    const wldAmount = selectedListing?.price || 1
    const res = await fetch("/api/initiate-payment", {
      method: "POST",
    })
    const { id } = await res.json()

    const payload: PayCommandInput = {
      reference: id,
      to: selectedListing?.seller_world_id || "", // my wallet
      tokens: [
        {
          symbol: Tokens.WLD,
          token_amount: tokenToDecimals(wldAmount, Tokens.WLD).toString(),
        },
      ],
      description: "Buy Card",
    }

    const { finalPayload } = await MiniKit.commandsAsync.pay(payload)

    if (finalPayload.status == "success") {
      console.log("success sending payment")
      handlePurchase()
    }
  }

  // Kaufe eine Karte
  const handlePurchase = async () => {
    if (!user?.username || !selectedListing) return

    setPurchaseLoading(true)
    try {
      const result = await purchaseCard(user.username, selectedListing.id)
      if (result.success) {
        setShowPurchaseDialog(false)
        setShowPurchaseSuccess(true)
        // Aktualisiere die Listings
        loadMarketListings()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error purchasing card:", error)
      toast({
        title: "Error",
        description: "Failed to purchase card",
        variant: "destructive",
      })
    } finally {
      setPurchaseLoading(false)
    }
  }

  // Storniere ein Listing
  const handleCancelListing = async (listingId: string) => {
    if (!user?.username) return

    setCancelLoading(true)
    try {
      const result = await cancelListing(user.username, listingId)
      if (result.success) {
        toast({
          title: "Success",
          description: "Listing cancelled successfully!",
        })
        // Aktualisiere die Listings
        loadUserListings()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error cancelling listing:", error)
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
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="text-sm">
          Page {page} of {totalPages}
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={() => onPageChange(page + 1)}
          disabled={page === totalPages || loading}
          className="h-8 w-8 p-0"
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
                Transfer Market
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
                {soldCount === 3 ? "Selling limit reached" : "Approaching selling limit"}
              </span>
            </div>
            <p className={`text-sm mt-1 ${soldCount === 3 ? "text-red-600" : "text-amber-600"}`}>
              {soldCount === 3
                ? "You must buy a card from the marketplace before you can sell more cards."
                : `You can sell ${3 - soldCount} more card${3 - soldCount !== 1 ? "s" : ""} before reaching the limit.`}
            </p>
          </div>
        )}

        <main className="p-4 max-w-lg mx-auto">
          <Tabs defaultValue="marketplace" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 bg-black/80 border border-yellow-400 rounded-lg h-12 p-1 mb-4">
              <TabsTrigger value="marketplace" className="h-10 text-yellow-400 font-bold">
                <div className="flex items-center justify-center gap-2">
                  <Users className="h-4 w-4" />
                  <span>Market</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="sell" className="h-10 text-yellow-400 font-bold">
                <div className="flex items-center justify-center gap-2">
                  <ShoppingBag className="h-4 w-4" />
                  <span>List</span>
                </div>
              </TabsTrigger>
              <TabsTrigger value="sales-history" className="h-10 text-yellow-400 font-bold">
                <div className="flex items-center justify-center gap-2">
                  <History className="h-4 w-4" />
                  <span>History</span>
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
                        placeholder="Search cards or sellers..."
                        className="pl-8 bg-black/80 text-white border border-yellow-400 placeholder-yellow-300 focus:ring-yellow-400"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                      />
                    </div>
                    <Select value={rarityFilter} onValueChange={setRarityFilter}>
                      <SelectTrigger className="w-[130px] bg-black/80 text-yellow-300 border border-yellow-400">
                        <Filter className="h-4 w-4 mr-2 text-yellow-400" />
                        <SelectValue placeholder="Rarity" />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 text-yellow-300 border border-yellow-400">
                                                    <SelectItem value="all">All Rarities</SelectItem>
                            <SelectItem value="common">Common</SelectItem>
                            <SelectItem value="rare">Rare</SelectItem>
                            <SelectItem value="epic">Epic</SelectItem>
                            <SelectItem value="legendary">Legendary</SelectItem>
                            <SelectItem value="goat">GOAT</SelectItem>
                            {/* <SelectItem value="wbc">WBC</SelectItem> */}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex justify-between items-center">
                    <div className="text-sm text-yellow-200">
                      {marketPagination.total} {marketPagination.total === 1 ? "card" : "cards"} available
                    </div>
                    <Select value={sortOption} onValueChange={setSortOption}>
                      <SelectTrigger className="w-[130px] h-8 text-xs bg-black/80 text-yellow-300 border border-yellow-400">
                        <ArrowUpDown className="h-3 w-3 mr-1 text-yellow-400" />
                        <SelectValue placeholder="Sort by" />
                      </SelectTrigger>
                      <SelectContent className="bg-black/90 text-yellow-300 border border-yellow-400">
                        <SelectItem value="newest">Newest First</SelectItem>
                        <SelectItem value="oldest">Oldest First</SelectItem>
                        <SelectItem value="price_low">Price: Low to High</SelectItem>
                        <SelectItem value="price_high">Price: High to Low</SelectItem>
                        <SelectItem value="level_high">Level: High to Low</SelectItem>
                        <SelectItem value="level_low">Level: Low to High</SelectItem>
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
                          onPurchase={() => {
                            setSelectedListing(listing)
                            setShowPurchaseDialog(true)
                          }}
                          onShowDetails={() => handleShowCardDetails(listing)}
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
                            title: "Listing Limit Reached",
                            description: `You can only list a maximum of ${maxListings} cards at a time. Please remove some listings before adding more.`,
                            variant: "destructive",
                          })
                        }
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Sell Card
                    </Button>
                  </Link>
                </div>

                {/* Listing Limit Indicator */}
                <div className="bg-black/70 rounded-xl p-4 shadow-sm border border-yellow-400 mb-4">
                  <div className="flex justify-between items-center mb-2">
                    <div className="flex items-center">
                      <span className="font-medium text-yellow-200">Listing Limit</span>
                      {listingLimitReached && (
                        <div className="ml-2 flex items-center text-red-400">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          <span className="text-sm">Limit reached</span>
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
                      ? "You've reached the maximum number of cards you can list. Cancel some listings to add more."
                      : `You can list ${maxListings - listingCount} more card${maxListings - listingCount !== 1 ? "s" : ""}.`}
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
                      <h3 className="text-lg font-medium mb-1 text-yellow-200">No Listed Cards</h3>
                      <p className="text-yellow-300 text-sm mb-4">You haven't listed any cards for sale yet</p>
                      <Link href="/collection">
                        <Button className="rounded-full bg-gradient-to-r from-yellow-400 to-yellow-600 text-black hover:from-yellow-500 hover:to-yellow-700">
                          <Plus className="h-4 w-4 mr-1" />
                          Sell Your First Card
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
                      Market History
                    </Button>
                    <Button
                      variant={historyType === "my" ? "default" : "outline"}
                      className={`rounded-lg ${historyType === "my" ? "bg-gradient-to-r from-yellow-400 to-yellow-600 text-black border-yellow-400" : "bg-black/80 text-yellow-300 border border-yellow-400"}`}
                      onClick={() => setHistoryType("my")}
                    >
                      <User className="h-4 w-4 mr-2 text-black" />
                      My History
                    </Button>
                  </div>
                </div>

                {/* My Transaction History */}
                {historyType === "my" && (
                  <>
                    <div className="flex justify-between items-center text-white font-bold">
                      <h2 className="text-lg font-medium">My Transaction History</h2>
                      <Badge variant="outline" className="bg-white">
                        <Clock className="h-3 w-3 mr-1 text-blue-500" />
                        Personal
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
                      <div className="bg-white rounded-xl p-6 shadow-sm text-center">
                        <div className="flex flex-col items-center">
                          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-3">
                            <Clock className="h-8 w-8 text-gray-400" />
                          </div>
                          <h3 className="text-lg font-medium mb-1">No Transaction History</h3>
                          <p className="text-gray-500 text-sm mb-4">You haven't bought or sold any cards yet</p>
                          <Link href="/collection">
                            <Button variant="outline" size="sm" className="rounded-full">
                              <Tag className="h-4 w-4 mr-1" />
                              Browse Marketplace
                            </Button>
                          </Link>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* Market History (Recent Sales) */}
                {historyType === "all" && (
                  <>
                    <div className="flex justify-between items-center">
                      <h2 className="text-lg font-medium">Market Sales History</h2>
                      <Badge variant="outline" className="bg-white">
                        <DollarSign className="h-3 w-3 mr-1 text-green-500" />
                        Global
                      </Badge>
                    </div>

                    {/* Search for Recent Sales */}
                    <div className="bg-black/70 rounded-xl p-3 shadow-sm border border-yellow-400">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-yellow-400" />
                        <Input
                          placeholder="Search cards, buyers or sellers..."
                          className="pl-8 bg-black/80 text-white border border-yellow-400 placeholder-yellow-300 focus:ring-yellow-400"
                          value={salesSearchTerm}
                          onChange={(e) => setSalesSearchTerm(e.target.value)}
                        />
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <div className="text-sm text-yellow-200">
                          {recentSalesPagination.total} {recentSalesPagination.total === 1 ? "sale" : "sales"} found
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
                          Clear
                        </Button>
                      </div>
                    </div>

                    {/* Market Activity Info */}
                    <div className="bg-black/70 rounded-xl p-4 shadow-sm border border-yellow-400">
                      <p className="text-sm text-yellow-300">
                        View all recent card sales in the marketplace. This helps you understand current market trends
                        and card values.
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
                          <Link href="/marketplace">
                            <Button variant="outline" size="sm" className="rounded-full border-yellow-400 text-yellow-400 hover:bg-yellow-400 hover:text-black">
                              <Tag className="h-4 w-4 mr-1" />
                              Browse Marketplace
                            </Button>
                          </Link>
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
          <DialogContent className="sm:max-w-md bg-black/80 border-none">
            <DialogHeader>
              <DialogTitle className="text-white">Card Details</DialogTitle>
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
                      <span className="text-gray-300">Seller:</span>
                      <span className="font-medium">
                        {selectedListing.seller_username.length > 9
                          ? `${selectedListing.seller_username.substring(0, 9)}...`
                          : selectedListing.seller_username}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-gray-300">Price:</span>
                      <div className="flex items-center">
                        <span className="font-bold text-lg">{selectedListing.price} WLD</span>
                      </div>
                    </div>
                  </div>

                  {/* Kaufen-Button */}
                  {selectedListing.seller_id !== user?.username && (
                    <Button
                      onClick={() => {
                        setShowCardDetailsDialog(false)
                        setShowPurchaseDialog(true)
                      }}
                      className="w-full mt-4 bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    >
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Buy Now
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
              <DialogTitle>Confirm Purchase</DialogTitle>
              <DialogDescription>You are about to purchase this card. This action cannot be undone.</DialogDescription>
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
                        ${selectedListing.card.rarity === "goat" ? "bg-red-500" : ""}
                      `}
                      >
                        {selectedListing.card.rarity}
                      </Badge>
                      <div className="ml-2 flex items-center">
                        <span className="text-xs mr-1">Level {selectedListing.card_level}</span>
                        {renderStars(selectedListing.card_level, "xs")}
                      </div>
                    </div>
                    <div className="flex items-center mt-2">
                      <span className="font-bold text-lg">{selectedListing.price} WLD</span>
                    </div>
                  </div>
                </div>
                <div className="bg-amber-50 p-3 rounded-lg text-sm">
                  <p className="text-amber-800">
                    <span className="font-medium">Seller:</span>{" "}
                    {selectedListing.seller_username.length > 9
                      ? `${selectedListing.seller_username.substring(0, 9)}...`
                      : selectedListing.seller_username}
                  </p>
                  <p className="text-amber-800 mt-1">
                    <span className="font-medium">Market Fee:</span> {(selectedListing.price * 0.1).toFixed(3)} WLD (10%)
                  </p>
                  <p className="text-amber-800 mt-1">
                    <span className="font-medium">Seller Receives:</span> {(selectedListing.price * 0.9).toFixed(3)} WLD
                  </p>

                  {(user?.coins || 0) < selectedListing.price && (
                    <p className="text-red-500 mt-1 font-medium">You don't have enough WLD for this purchase!</p>
                  )}
                  {selectedListing.seller_id === user?.username && (
                    <p className="text-red-500 mt-1 font-medium">You cannot buy your own card!</p>
                  )}
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowPurchaseDialog(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={sendTransaction}
                    disabled={
                      purchaseLoading ||
                      (user?.coins || 0) < selectedListing.price ||
                      selectedListing.seller_id === user?.username
                    }
                    className="bg-gradient-to-r from-violet-500 to-fuchsia-500"
                  >
                    {purchaseLoading ? (
                      <>
                        <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin mr-2"></div>
                        Processing...
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="h-4 w-4 mr-2" />
                        Buy Now
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
            username={user?.username || ""}
            onSuccess={handlePriceUpdateSuccess}
            cardRarity={selectedListing.card.rarity}
            overallRating={selectedListing.card.overall_rating}
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
                Selling Limit
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                This indicator shows how many cards you've sold since your last purchase from the marketplace.
              </p>
              <div className="bg-blue-50 p-3 rounded-lg">
                <h4 className="font-medium text-blue-900 mb-2">How it works:</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• You can sell up to 3 cards before needing to buy one</li>
                  <li>• After selling 3 cards, you must purchase from the marketplace</li>
                  <li>• Purchasing a card resets your counter to 0</li>
                  <li>• This encourages marketplace activity and trading</li>
                </ul>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600">Current status:</span>
                <span
                  className={`font-medium ${soldCount === 3 ? "text-red-600" : soldCount === 2 ? "text-amber-600" : "text-green-600"}`}
                >
                  {soldCount === 3
                    ? "Limit reached"
                    : soldCount === 2
                      ? "One more sale allowed"
                      : `${3 - (soldCount || 0)} sales remaining`}
                </span>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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
}: {
  listing: MarketListing
  onPurchase: () => void
  onShowDetails: () => void
}) {
  const { user } = useAuth()
  const isOwnListing = listing.seller_id === user?.username

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
    goat: {
      border: "border-red-500",
      text: "text-red-600",
      badge: "bg-red-500",
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
      onClick={() => onShowDetails()}
      className="bg-gradient-to-br from-black/80 to-black/60 rounded-2xl shadow-lg p-4 flex items-center gap-4 mb-4 border border-yellow-400 cursor-pointer hover:scale-[1.02] transition-transform"
    >
      <div className="w-16 h-24 flex-shrink-0 rounded-xl overflow-hidden bg-gray-900 flex items-center justify-center">
        <img
          src={getCardImageUrl(listing.card.image_url)}
          alt="Card"
          loading="lazy"
          className="w-full h-full object-cover"
        />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg font-bold text-white truncate">{listing.card.name}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-800 text-yellow-400 uppercase">{listing.card.rarity}</span>
          <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-500 text-black">Level {listing.card_level}</span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <div className="flex items-center">
            {renderStars(listing.card_level, "xs")}
          </div>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm text-yellow-200 truncate">Seller: <span className="font-bold text-yellow-400">
            {listing.seller_username.length > 9
              ? `${listing.seller_username.substring(0, 9)}...`
              : listing.seller_username}
          </span></span>
          {isOwnListing && <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-bold bg-red-500 text-white">My Listing</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xl font-bold text-yellow-400">{listing.price} WLD</span>
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
    goat: {
      border: "border-red-500",
      text: "text-red-600",
      badge: "bg-red-500",
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
            />)}
            

          </div>

          {/* Card Details */}
          <div className="flex-1">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-medium text-sm text-white">{listing.card.name}</h3>
                <p className="text-xs text-yellow-200">{listing.card.character}</p>
                <div className="flex items-center mt-1">
                  {renderStars(listing.card_level, "xs")}
                </div>
              </div>
              <div className="flex flex-col items-end">
                <Badge className={rarityStyle.badge}>{listing.card.rarity}</Badge>
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
    goat: {
      border: "border-red-500",
      text: "text-red-600",
      badge: "bg-red-500",
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
                <span className="font-medium text-yellow-400">{transaction.other_party}</span>
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
    goat: {
      border: "border-red-500",
      text: "text-red-600",
      badge: "bg-red-500",
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
                <Badge className={rarityStyle.badge}>{sale.card.rarity}</Badge>
                <Badge variant="outline" className="mt-1 text-xs text-yellow-300 border-yellow-400">
                  Level {sale.card_level}
                </Badge>
              </div>
            </div>

            <div className="flex items-center mt-1 text-xs text-yellow-200">
              <span>
                Seller: <span className="font-medium text-yellow-400">{sale.seller_id.length > 15 ? `${sale.seller_id.substring(0, 12)}..` : sale.seller_id}</span>
              </span>
              <span className="mx-1 text-yellow-300">•</span>
              <span>Buyer: <span className="font-medium text-yellow-400">{sale.buyer_id.length > 15 ? `${sale.buyer_id.substring(0, 12)}..` : sale.buyer_id}</span></span>
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
