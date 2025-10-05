"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { toast } from "@/components/ui/use-toast"
import { motion } from "framer-motion"
import { Coins, Tag, ShoppingCart, AlertCircle, Search, Filter, ArrowUpDown, X } from "lucide-react"
// Removed Next.js Image import - using regular img tags
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { listCardForSale, getMarketListings, getUserListings, cancelListing, buyCard } from "@/app/market-actions"

export default function TradeMenu() {
  const { user, updateUserCoins } = useAuth()
  const [activeTab, setActiveTab] = useState("market")
  const [marketListings, setMarketListings] = useState<any[]>([])
  const [userListings, setUserListings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showSellDialog, setShowSellDialog] = useState(false)
  const [showBuyDialog, setShowBuyDialog] = useState(false)
  const [selectedCard, setSelectedCard] = useState<any>(null)
  const [selectedListing, setSelectedListing] = useState<any>(null)
  const [price, setPrice] = useState("")
  const [userCards, setUserCards] = useState<any[]>([])
  const [loadingAction, setLoadingAction] = useState(false)
  const [loadingUserCards, setLoadingUserCards] = useState(false)
  const [searchQuery, setSearchQuery] = useState("")
  const [sortBy, setSortBy] = useState<"price_asc" | "price_desc" | "rarity" | "newest">("newest")
  const [filterRarity, setFilterRarity] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<string | null>(null)
  const [priceUsdPerWLD, setPriceUsdPerWLD] = useState<number | null>(null)

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user, activeTab, sortBy, filterRarity, filterType])

  useEffect(() => {
    const fetchPrice = async () => {
      try {
        const res = await fetch("/api/wld-price")
        const json = await res.json()
        if (json.price) {
          setPriceUsdPerWLD(json.price)
        }
      } catch (err) {
        console.error("Failed to fetch WLD price", err)
      }
    }

    fetchPrice()
  }, [])

  const fetchData = async () => {
    setLoading(true)

    if (activeTab === "market") {
      const result = await getMarketListings()
      if (result.success) {
        let listings = result.listings || []

        // Apply filters
        if (filterRarity) {
          listings = listings.filter((listing: any) => listing.cards.rarity === filterRarity)
        }

        if (filterType) {
          listings = listings.filter((listing: any) => listing.cards.type === filterType)
        }

        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          listings = listings.filter(
            (listing: any) =>
              listing.cards.name.toLowerCase().includes(query) || listing.cards.character.toLowerCase().includes(query),
          )
        }

        // Apply sorting
        listings = sortListings(listings, sortBy)

        setMarketListings(listings)
      }
    } else if (activeTab === "my-listings") {
      const result = await getUserListings(user!.username)
      if (result.success) {
        let listings = result.listings || []

        // Apply search filter to user listings too
        if (searchQuery) {
          const query = searchQuery.toLowerCase()
          listings = listings.filter(
            (listing: any) =>
              listing.cards.name.toLowerCase().includes(query) || listing.cards.character.toLowerCase().includes(query),
          )
        }

        // Apply sorting
        listings = sortListings(listings, sortBy)

        setUserListings(listings)
      }
    }

    setLoading(false)
  }

  const sortListings = (listings: any[], sortType: string) => {
    switch (sortType) {
      case "price_asc":
        return [...listings].sort((a, b) => a.price - b.price)
      case "price_desc":
        return [...listings].sort((a, b) => b.price - a.price)
      case "rarity":
        return [...listings].sort((a, b) => {
          const rarityOrder = { legendary: 4, "ultra-rare": 3, rare: 2, uncommon: 1, common: 0 }
          return (
            rarityOrder[b.cards.rarity as keyof typeof rarityOrder] -
            rarityOrder[a.cards.rarity as keyof typeof rarityOrder]
          )
        })
      case "newest":
      default:
        return [...listings].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    }
  }

  const fetchUserCards = async () => {
    if (!user) return


    setLoadingUserCards(true)
    try {
      const supabase = getSupabaseBrowserClient()
      if(!supabase) return
      // First, get the user_cards with card_id and quantity
      const { data: userCardsData, error: userCardsError } = await supabase
        .from("user_cards")
        .select("id, card_id, quantity")
        .eq("user_id", user.username)
        .gt("quantity", 0)

      if (userCardsError) {
        console.error("Error fetching user cards:", userCardsError)
        toast({
          title: "Error",
          description: "Failed to fetch your cards",
          variant: "destructive",
        })
        setUserCards([])
        setLoadingUserCards(false)
        return
      }

      if (!userCardsData || userCardsData.length === 0) {
        setUserCards([])
        setLoadingUserCards(false)
        return
      }

      // Deduplicate user cards by card_id - keep only one entry per card
      const uniqueUserCards = userCardsData.reduce((acc, current) => {
        const existingCard = acc.find(card => card.card_id === current.card_id)
        if (!existingCard) {
          acc.push(current)
        }
        return acc
      }, [] as typeof userCardsData)

      // Extract card IDs
      const cardIds = uniqueUserCards.map((uc) => uc.card_id)

             // Fetch the actual card details
       const { data: cardsData, error: cardsError } = await supabase
         .from("cards")
         .select("id, name, character, image_url, rarity, type, overall_rating")
         .in("id", cardIds)

      if (cardsError) {
        console.error("Error fetching card details:", cardsError)
        toast({
          title: "Error",
          description: "Failed to fetch card details",
          variant: "destructive",
        })
        setUserCards([])
        setLoadingUserCards(false)
        return
      }

      // Create a map of card details by ID for easy lookup
      const cardMap = new Map()
      cardsData?.forEach((c) => {
        cardMap.set(c.id, c)
      })

      // Combine the data
      const combinedData = uniqueUserCards
        .map((userCard) => {
          const details = cardMap.get(userCard.card_id)
          if (!details) return null

          return {
            id: userCard.id,
            quantity: userCard.quantity,
            cards: details,
          }
        })
        .filter(Boolean) // Remove any null entries

      setUserCards(combinedData)
    } catch (error) {
      console.error("Error fetching user cards:", error)
      setUserCards([])
    } finally {
      setLoadingUserCards(false)
    }
  }

  const handleOpenSellDialog = () => {
    fetchUserCards()
    setSelectedCard(null)
    setPrice("")
    setShowSellDialog(true)
  }

  const handleBuyCard = (listing: any) => {
    setSelectedListing(listing)
    setShowBuyDialog(true)
  }

  const handleListCard = async () => {
    if (!selectedCard || !price || isNaN(Number(price)) || Number(price) <= 0) {
      toast({
        title: "Invalid price",
        description: "Please enter a valid price",
        variant: "destructive",
      })
      return
    }

    // Preisvalidierung basierend auf Rating und Rarity
    const parsedPrice = Number(price)
    let minUsdPrice = 0.15 // Standard-Mindestpreis
    
    // Debug: Log card details
    console.log("Card details:", {
      name: selectedCard.cards.name,
      rarity: selectedCard.cards.rarity,
      overall_rating: selectedCard.cards.overall_rating,
      price: parsedPrice
    })
    
    // Rarity-basierte Preise
    if (selectedCard.cards.rarity === "wbc") {
      minUsdPrice = 5.0
      console.log("WBC rarity detected, setting min price to $5.00")
    } else if (selectedCard.cards.rarity === "ultimate") {
      minUsdPrice = 1.5
      console.log("Ultimate rarity detected, setting min price to $1.50")
    } else if (selectedCard.cards.rarity === "legendary") {
      minUsdPrice = 1.5
      console.log("Legendary rarity detected, setting min price to $1.50")
    } else if (selectedCard.cards.rarity === "epic") {
      minUsdPrice = 1.0
      console.log("Epic rarity detected, setting min price to $1.00")
    } else if (selectedCard.cards.rarity === "rare") {
      minUsdPrice = 0.5
      console.log("Rare rarity detected, setting min price to $0.50")
    } else if (selectedCard.cards.rarity === "elite") {
      minUsdPrice = 0.5
      console.log("Elite rarity detected, setting min price to $0.50")
    }

    const minWldPrice = priceUsdPerWLD ? minUsdPrice / priceUsdPerWLD : minUsdPrice

    if (parsedPrice < minWldPrice) {
      let cardType = "cards"
      if (selectedCard.cards.overall_rating >= 91) {
        cardType = `Rating ${selectedCard.cards.overall_rating} cards`
      } else if (selectedCard.cards.overall_rating >= 90) {
        cardType = `Rating ${selectedCard.cards.overall_rating} cards`
      } else if (selectedCard.cards.overall_rating >= 89) {
        cardType = `Rating ${selectedCard.cards.overall_rating} cards`
      } else if (selectedCard.cards.overall_rating >= 88) {
        cardType = `Rating ${selectedCard.cards.overall_rating} cards`
      } else if (selectedCard.cards.overall_rating >= 87) {
        cardType = `Rating ${selectedCard.cards.overall_rating} cards`
      } else if (selectedCard.cards.overall_rating >= 86) {
        cardType = `Rating ${selectedCard.cards.overall_rating} cards`
      } else if (selectedCard.cards.overall_rating >= 85) {
        cardType = `Rating ${selectedCard.cards.overall_rating} cards`
      } else {
        cardType = // selectedCard.cards.rarity === "wbc" ? "WBC" : 
                  selectedCard.cards.rarity === "legendary" ? "Legendary" : 
                  selectedCard.cards.rarity === "epic" ? "Epic" : 
                  selectedCard.cards.rarity === "rare" ? "Rare" : "cards"
      }
      toast({
        title: "Price too low",
        description: `${cardType} must be listed for at least ${minWldPrice.toFixed(3)} WLD ($${minUsdPrice.toFixed(2)})`,
        variant: "destructive",
      })
      return
    }

    setLoadingAction(true)
    try {
      const result = await listCardForSale(user!.username, selectedCard.cards.id, Number(price))

      if (result.success) {
        toast({
          title: "Success",
          description: "Card listed for sale",
        })
        setShowSellDialog(false)
        fetchData()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error listing card:", error)
      toast({
        title: "Error",
        description: "Failed to list card",
        variant: "destructive",
      })
    } finally {
      setLoadingAction(false)
    }
  }

  const handleCancelListing = async (listingId: string) => {
    setLoadingAction(true)
    try {
      const result = await cancelListing(user!.username, listingId)

      if (result.success) {
        toast({
          title: "Success",
          description: "Listing cancelled",
        })
        fetchData()
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
      setLoadingAction(false)
    }
  }

  const handleConfirmBuy = async () => {
    if (!selectedListing) return

    setLoadingAction(true)
    try {
      const result = await buyCard(user!.username, selectedListing.id)

      if (result.success) {
        toast({
          title: "Success",
          description: `You purchased ${result.card.name} for ${result.price} coins`,
        })
        setShowBuyDialog(false)
        // Update user's coins in context
        updateUserCoins(user!.coins - selectedListing.price)
        fetchData()
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error buying card:", error)
      toast({
        title: "Error",
        description: "Failed to buy card",
        variant: "destructive",
      })
    } finally {
      setLoadingAction(false)
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    fetchData()
  }

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case "legendary":
        return "bg-gradient-to-r from-yellow-400 to-amber-600 border-0"
      case "ultra-rare":
        return "bg-gradient-to-r from-purple-400 to-purple-600 border-0"
      case "rare":
        return "bg-gradient-to-r from-blue-400 to-blue-600 border-0"
      case "uncommon":
        return "bg-gradient-to-r from-green-400 to-green-600 border-0"
      // case "wbc":
      //   return "bg-gradient-to-r from-red-500 to-red-700 border-0" // Commented out
      default:
        return "bg-gradient-to-r from-slate-400 to-slate-600 border-0"
    }
  }

  const getTypeColor = (type: string) => {
    switch (type) {
      case "fire":
        return "text-red-500"
      case "water":
        return "text-blue-500"
      case "earth":
        return "text-amber-600"
      case "wind":
        return "text-teal-500"
      case "lightning":
        return "text-yellow-500"
      default:
        return "text-gray-500"
    }
  }

  return (
    <div>
      <header className="bg-gradient-to-r from-orange-500 to-amber-600 text-white p-4">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Marketplace</h1>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-black/20 px-3 py-1.5 rounded-full">
              <Coins className="h-4 w-4" />
              <span className="font-bold">{user?.coins || 0}</span>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4">
        <Tabs defaultValue="market" className="w-full" onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="market">Marketplace</TabsTrigger>
            <TabsTrigger value="my-listings">My Listings</TabsTrigger>
          </TabsList>

          <div className="mt-4 space-y-4">
            {/* Search and filters */}
            <div className="flex flex-col gap-4 sm:flex-row">
              <form onSubmit={handleSearch} className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search cards..."
                    className="pl-10"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
              </form>

              <div className="flex gap-2">
                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => document.getElementById("sort-dropdown")?.classList.toggle("hidden")}
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                  <div
                    id="sort-dropdown"
                    className="hidden absolute right-0 top-full mt-1 bg-white shadow-lg rounded-md z-10 w-48"
                  >
                    <div className="p-2 space-y-1">
                      <button
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${sortBy === "newest" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                        onClick={() => {
                          setSortBy("newest")
                          document.getElementById("sort-dropdown")?.classList.add("hidden")
                        }}
                      >
                        Newest First
                      </button>
                      <button
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${sortBy === "price_asc" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                        onClick={() => {
                          setSortBy("price_asc")
                          document.getElementById("sort-dropdown")?.classList.add("hidden")
                        }}
                      >
                        Price: Low to High
                      </button>
                      <button
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${sortBy === "price_desc" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                        onClick={() => {
                          setSortBy("price_desc")
                          document.getElementById("sort-dropdown")?.classList.add("hidden")
                        }}
                      >
                        Price: High to Low
                      </button>
                      <button
                        className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${sortBy === "rarity" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                        onClick={() => {
                          setSortBy("rarity")
                          document.getElementById("sort-dropdown")?.classList.add("hidden")
                        }}
                      >
                        Rarity
                      </button>
                    </div>
                  </div>
                </div>

                <div className="relative">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => document.getElementById("filter-dropdown")?.classList.toggle("hidden")}
                  >
                    <Filter className="h-4 w-4" />
                  </Button>
                  <div
                    id="filter-dropdown"
                    className="hidden absolute right-0 top-full mt-1 bg-white shadow-lg rounded-md z-10 w-48"
                  >
                    <div className="p-2">
                      <div className="mb-2">
                        <p className="text-xs font-medium text-gray-500 mb-1">Rarity</p>
                        <div className="space-y-1">
                          <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterRarity === null ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterRarity(null)
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            All Rarities
                          </button>
                          <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterRarity === "legendary" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterRarity("legendary")
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            Legendary
                          </button>
                          <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterRarity === "ultra-rare" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterRarity("ultra-rare")
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            Ultra Rare
                          </button>
                          <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterRarity === "rare" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterRarity("rare")
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            Rare
                          </button>
                          {/* <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterRarity === "wbc" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterRarity("wbc")
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            WBC
                          </button> */}
                        </div>
                      </div>

                      <div>
                        <p className="text-xs font-medium text-gray-500 mb-1">Type</p>
                        <div className="space-y-1">
                          <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterType === null ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterType(null)
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            All Types
                          </button>
                          <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterType === "fire" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterType("fire")
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            Fire
                          </button>
                          <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterType === "water" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterType("water")
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            Water
                          </button>
                          <button
                            className={`w-full text-left px-3 py-1.5 text-sm rounded-md ${filterType === "earth" ? "bg-orange-100 text-orange-700" : "hover:bg-gray-100"}`}
                            onClick={() => {
                              setFilterType("earth")
                              document.getElementById("filter-dropdown")?.classList.add("hidden")
                            }}
                          >
                            Earth
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Active filters display */}
            {(filterRarity || filterType) && (
              <div className="flex flex-wrap gap-2">
                {filterRarity && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    Rarity: {filterRarity}
                    <button className="ml-1 hover:bg-gray-200 rounded-full p-0.5" onClick={() => setFilterRarity(null)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {filterType && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    Type: {filterType}
                    <button className="ml-1 hover:bg-gray-200 rounded-full p-0.5" onClick={() => setFilterType(null)}>
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                )}
                {(filterRarity || filterType) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setFilterRarity(null)
                      setFilterType(null)
                    }}
                  >
                    Clear All
                  </Button>
                )}
              </div>
            )}
          </div>

          <TabsContent value="market" className="mt-4 space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-orange-600 border-t-transparent mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Loading market listings...</p>
              </div>
            ) : marketListings.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground">No cards are currently for sale</p>
                <Button onClick={handleOpenSellDialog} className="mt-4 bg-orange-600 hover:bg-orange-700">
                  Sell Your Cards
                </Button>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Available Cards</h2>
                  <Button onClick={handleOpenSellDialog} className="bg-orange-600 hover:bg-orange-700">
                    <Tag className="h-4 w-4 mr-2" />
                    Sell Cards
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {marketListings.map((listing) => (
                    <motion.div
                      key={listing.id}
                      whileHover={{ scale: 1.02 }}
                      transition={{ type: "spring", stiffness: 400 }}
                    >
                      <Card className="overflow-hidden border-0 shadow-md">
                        <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-200">
                          <img
                            src={
                              listing.cards.image_url ||
                              `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(listing.cards.character) || "anime"}%20character`
                            }
                            alt={listing.cards.name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2">
                            <Badge className={getRarityColor(listing.cards.rarity)}>{listing.cards.rarity}</Badge>
                          </div>
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                            <h3 className="text-white font-bold truncate">{listing.cards.name}</h3>
                            <p className="text-white/80 text-sm truncate">{listing.cards.character}</p>
                          </div>
                        </div>
                        <CardContent className="p-4">
                          <div className="flex justify-between items-center mb-3">
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className={getTypeColor(listing.cards.type)}>
                                {listing.cards.type}
                              </Badge>
                            </div>
                            <div className="text-sm text-gray-500">
                              Seller: {listing.seller?.username || "Unknown User"}
                            </div>
                          </div>

                          <div className="flex justify-between items-center">
                            <div className="flex items-center gap-1 text-lg font-bold text-orange-600">
                              <Coins className="h-5 w-5" />
                              {listing.price} coins
                            </div>
                            <Button
                              className="bg-orange-600 hover:bg-orange-700"
                              onClick={() => handleBuyCard(listing)}
                              disabled={listing.seller_id === user?.username}
                              size="sm"
                            >
                              {listing.seller_id === user?.username ? "Your Listing" : "Buy Card"}
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))}
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="my-listings" className="mt-4 space-y-4">
            {loading ? (
              <div className="text-center py-8">
                <div className="h-16 w-16 animate-spin rounded-full border-4 border-orange-600 border-t-transparent mx-auto"></div>
                <p className="mt-4 text-muted-foreground">Loading your listings...</p>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">Your Cards for Sale</h2>
                  <Button onClick={handleOpenSellDialog} className="bg-orange-600 hover:bg-orange-700">
                    <Tag className="h-4 w-4 mr-2" />
                    Sell a Card
                  </Button>
                </div>

                {userListings.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">You don't have any cards listed for sale</p>
                    <Button onClick={handleOpenSellDialog} className="mt-4 bg-orange-600 hover:bg-orange-700">
                      Sell a Card
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {userListings.map((listing) => (
                      <motion.div
                        key={listing.id}
                        whileHover={{ scale: 1.02 }}
                        transition={{ type: "spring", stiffness: 400 }}
                      >
                        <Card className="overflow-hidden border-0 shadow-md">
                          <div className="relative h-40 bg-gradient-to-br from-gray-100 to-gray-200">
                            <img
                              src={
                                listing.cards.image_url ||
                                `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(listing.cards.character) || "anime"}%20character`
                              }
                              alt={listing.cards.name}
                              className="absolute inset-0 w-full h-full object-cover"
                            />
                            <div className="absolute top-2 right-2">
                              <Badge className={getRarityColor(listing.cards.rarity)}>{listing.cards.rarity}</Badge>
                            </div>
                            <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-3">
                              <h3 className="text-white font-bold truncate">{listing.cards.name}</h3>
                              <p className="text-white/80 text-sm truncate">{listing.cards.character}</p>
                            </div>
                          </div>
                          <CardContent className="p-4">
                            <div className="flex justify-between items-center mb-3">
                              <div className="flex items-center gap-1">
                                <Badge variant="outline" className={getTypeColor(listing.cards.type)}>
                                  {listing.cards.type}
                                </Badge>
                              </div>
                              <div className="flex items-center gap-1 text-lg font-bold text-orange-600">
                                <Coins className="h-5 w-5" />
                                {listing.price}
                              </div>
                            </div>

                            <Button
                              variant="outline"
                              className="w-full"
                              onClick={() => handleCancelListing(listing.id)}
                              disabled={loadingAction}
                            >
                              Cancel Listing
                            </Button>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                )}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      {/* Sell Card Dialog */}
      <Dialog open={showSellDialog} onOpenChange={setShowSellDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Sell a Card</DialogTitle>
            <DialogDescription>Choose a card from your collection to sell on the market</DialogDescription>
          </DialogHeader>

          {loadingUserCards ? (
            <div className="text-center py-4">
              <div className="h-10 w-10 animate-spin rounded-full border-4 border-orange-600 border-t-transparent mx-auto"></div>
              <p className="mt-2 text-sm text-muted-foreground">Loading your cards...</p>
            </div>
          ) : userCards.length === 0 ? (
            <div className="text-center py-4">
              <AlertCircle className="h-10 w-10 text-orange-600 mx-auto mb-2" />
              <p>You don't have any cards to sell</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 max-h-60 overflow-y-auto">
                {userCards.map((card) => (
                  <div
                    key={card.id}
                    className={`p-2 border rounded-md cursor-pointer ${
                      selectedCard?.id === card.id ? "border-orange-600 bg-orange-50" : ""
                    }`}
                                         onClick={() => {
                       setSelectedCard(card)
                       // Setze Standardpreis basierend auf Rarity (USD umgerechnet zu WLD)
                       let minUsdPrice = 0.15
                       
                       // Rarity-basierte Preise
                       if (card.cards.rarity === "legendary") {
                         minUsdPrice = 1.5
                       } else if (card.cards.rarity === "epic") {
                         minUsdPrice = 1.0
                       } else if (card.cards.rarity === "rare") {
                         minUsdPrice = 0.5
                       }
                       
                       const defaultPrice = priceUsdPerWLD
                         ? (minUsdPrice / priceUsdPerWLD).toFixed(3)
                         : minUsdPrice.toString()
                       setPrice(defaultPrice)
                     }}
                  >
                    <div className="flex gap-2">
                      <div className="relative w-12 h-16 overflow-hidden rounded-md">
                        <img
                          src={
                            card.cards.image_url ||
                            `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(card.cards.character) || "anime"}%20character`
                          }
                          alt={card.cards.name}
                          className="absolute inset-0 w-full h-full object-cover"
                        />
                      </div>
                      <div className="flex-1">
                        <p className="text-sm font-medium truncate">{card.cards.name}</p>
                        <p className="text-xs text-muted-foreground">{card.cards.character}</p>
                        <div className="flex items-center gap-1 mt-1">
                          <Badge className={`${getRarityColor(card.cards.rarity)} text-xs`}>{card.cards.rarity}</Badge>
                          <span className="text-xs">x{card.quantity}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2 mt-4">
                <label htmlFor="price" className="text-sm font-medium">
                  Price (WLD)
                </label>
                <Input
                  id="price"
                  type="number"
                  step="0.001"
                  min="0.001"
                  placeholder="Enter price in WLD"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                />
                                 {selectedCard && (
                   <p className="text-xs text-gray-500">
                     {selectedCard.cards.overall_rating >= 91
                       ? `Rating ${selectedCard.cards.overall_rating} cards must be listed for at least $3.50 (~${priceUsdPerWLD ? (3.5 / priceUsdPerWLD).toFixed(3) : "3.5"} WLD)`
                       : selectedCard.cards.overall_rating >= 90
                       ? `Rating ${selectedCard.cards.overall_rating} cards must be listed for at least $2.50 (~${priceUsdPerWLD ? (2.5 / priceUsdPerWLD).toFixed(3) : "2.5"} WLD)`
                       : selectedCard.cards.overall_rating >= 89
                       ? `Rating ${selectedCard.cards.overall_rating} cards must be listed for at least $2.00 (~${priceUsdPerWLD ? (2.0 / priceUsdPerWLD).toFixed(3) : "2.0"} WLD)`
                       : selectedCard.cards.overall_rating >= 88
                       ? `Rating ${selectedCard.cards.overall_rating} cards must be listed for at least $1.50 (~${priceUsdPerWLD ? (1.5 / priceUsdPerWLD).toFixed(3) : "1.5"} WLD)`
                       : selectedCard.cards.overall_rating >= 87
                       ? `Rating ${selectedCard.cards.overall_rating} cards must be listed for at least $1.00 (~${priceUsdPerWLD ? (1.0 / priceUsdPerWLD).toFixed(3) : "1.0"} WLD)`
                       : selectedCard.cards.rarity === "legendary" 
                       ? `Legendary cards must be listed for at least $1.50 (~${priceUsdPerWLD ? (1.5 / priceUsdPerWLD).toFixed(3) : "1.5"} WLD)`
                       : selectedCard.cards.rarity === "epic"
                       ? `Epic cards must be listed for at least $1.00 (~${priceUsdPerWLD ? (1 / priceUsdPerWLD).toFixed(3) : "1"} WLD)`
                       : selectedCard.cards.rarity === "rare"
                       ? `Rare cards must be listed for at least $0.50 (~${priceUsdPerWLD ? (0.5 / priceUsdPerWLD).toFixed(3) : "0.5"} WLD)`
                       : `Minimum price: $0.15 (~${priceUsdPerWLD ? (0.15 / priceUsdPerWLD).toFixed(3) : "0.15"} WLD)`
                     }
                   </p>
                 )}
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setShowSellDialog(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={handleListCard}
                  disabled={!selectedCard || !price || loadingAction}
                >
                  {loadingAction ? "Listing..." : "List for Sale"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Buy Card Dialog */}
      <Dialog open={showBuyDialog} onOpenChange={setShowBuyDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Buy Card</DialogTitle>
            <DialogDescription>Confirm your purchase of this card</DialogDescription>
          </DialogHeader>

          {selectedListing && (
            <>
              <div className="flex gap-4">
                <div className="relative w-24 h-32 overflow-hidden rounded-md">
                  <img
                    src={
                      selectedListing.cards.image_url ||
                      `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(selectedListing.cards.character) || "anime"}%20character`
                    }
                    alt={selectedListing.cards.name}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h3 className="font-bold">{selectedListing.cards.name}</h3>
                  <p className="text-sm text-muted-foreground">{selectedListing.cards.character}</p>
                  <div className="flex items-center gap-1 mt-2">
                    <Badge className={getRarityColor(selectedListing.cards.rarity)}>
                      {selectedListing.cards.rarity}
                    </Badge>
                    <Badge variant="outline" className={getTypeColor(selectedListing.cards.type)}>
                      {selectedListing.cards.type}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1 mt-4 text-lg font-bold text-orange-600">
                    <Coins className="h-5 w-5" />
                    {selectedListing.price} coins
                  </div>
                </div>
              </div>

              {user && selectedListing.price > user.coins && (
                <div className="bg-red-50 p-3 rounded-md flex items-center gap-2 text-red-600">
                  <AlertCircle className="h-5 w-5" />
                  <p className="text-sm">You don't have enough coins for this purchase</p>
                </div>
              )}

              <DialogFooter>
                <Button variant="outline" onClick={() => setShowBuyDialog(false)}>
                  Cancel
                </Button>
                <Button
                  className="bg-orange-600 hover:bg-orange-700"
                  onClick={handleConfirmBuy}
                  disabled={!user || selectedListing.price > user.coins || loadingAction}
                >
                  {loadingAction ? (
                    "Processing..."
                  ) : (
                    <>
                      <ShoppingCart className="h-4 w-4 mr-2" />
                      Buy Now
                    </>
                  )}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
