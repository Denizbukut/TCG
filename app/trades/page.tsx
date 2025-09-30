"use client"

import { useState, useEffect } from "react"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { useAuth } from "@/contexts/auth-context"
import {
  getMarketListings,
  getUserListings,
  getUserPurchaseHistory,
  getUserSaleHistory,
  buyCard,
  cancelListing,
} from "@/app/market-actions"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { toast } from "@/components/ui/use-toast"
import { Coins, ShoppingCart, Tag, AlertCircle } from "lucide-react"
import { motion } from "framer-motion"
// Removed Next.js Image import - using regular img tags
import Link from "next/link"
import { listCardForSale } from "../market-actions"
import { getSupabaseBrowserClient } from "@/lib/supabase"

export default function TradesPage() {
  const { user, updateUserCoins } = useAuth()
  const [activeTab, setActiveTab] = useState("market")
  const [marketListings, setMarketListings] = useState<any[]>([])
  const [userListings, setUserListings] = useState<any[]>([])
  const [purchaseHistory, setPurchaseHistory] = useState<any[]>([])
  const [saleHistory, setSaleHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showSellDialog, setShowSellDialog] = useState(false)
  const [showBuyDialog, setShowBuyDialog] = useState(false)
  const [selectedCard, setSelectedCard] = useState<any>(null)
  const [selectedListing, setSelectedListing] = useState<any>(null)
  const [price, setPrice] = useState("")
  const [userCards, setUserCards] = useState<any[]>([])
  const [loadingAction, setLoadingAction] = useState(false)
  const [loadingUserCards, setLoadingUserCards] = useState(false)

  useEffect(() => {
    if (user) {
      fetchData()
    }
  }, [user, activeTab])

  const fetchData = async () => {
    setLoading(true)

    if (activeTab === "market") {
      const result = await getMarketListings()
      if (result.success) {
        setMarketListings(result.listings || [])
      }
    } else if (activeTab === "my-listings") {
      const result = await getUserListings(user!.id)
      if (result.success) {
        setUserListings(result.listings || [])
      }
    } else if (activeTab === "history") {
      const purchasesResult = await getUserPurchaseHistory(user!.id)
      const salesResult = await getUserSaleHistory(user!.id)

      if (purchasesResult.success) {
        setPurchaseHistory(purchasesResult.purchases || [])
      }

      if (salesResult.success) {
        setSaleHistory(salesResult.sales || [])
      }
    }

    setLoading(false)
  }

  const fetchUserCards = async () => {
    if (!user) return

    setLoadingUserCards(true)
    try {
      const supabase = getSupabaseBrowserClient()
      const { data, error } = await supabase
        .from("user_cards")
        .select(`
          id,
          quantity,
          cards (
            id,
            name,
            character,
            image_url,
            rarity,
            type,
            hp
          )
        `)
        .eq("user_id", user.id)
        .gt("quantity", 0)

      if (error) {
        console.error("Error fetching user cards:", error)
        toast({
          title: "Error",
          description: "Failed to fetch your cards",
          variant: "destructive",
        })
        setUserCards([])
      } else {
        setUserCards(data || [])
      }
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

  const handleSellCard = (card: any) => {
    setSelectedCard(card)
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

    // Preisvalidierung für Ultimate-Karten
    const parsedPrice = Number(price)
    const minWldPrice = 
      selectedCard.cards.rarity === "legendary"
        ? 1.5
        : selectedCard.cards.rarity === "epic"
        ? 1
        : selectedCard.cards.rarity === "rare"
        ? 0.5
        : 0.15

    if (parsedPrice < minWldPrice) {
      const cardType = selectedCard.cards.rarity === "legendary" ? "Legendary" : 
                      selectedCard.cards.rarity === "epic" ? "Epic" : 
                      selectedCard.cards.rarity === "rare" ? "Rare" : "cards"
      const usdAmount = selectedCard.cards.rarity === "legendary" ? 1.5 : selectedCard.cards.rarity === "epic" ? 1 : selectedCard.cards.rarity === "rare" ? 0.5 : 0.15
      toast({
        title: "Price too low",
        description: `${cardType} cards must be listed for at least $${usdAmount.toFixed(2)} (~${minWldPrice.toFixed(3)} WLD)`,
        variant: "destructive",
      })
      return
    }

    setLoadingAction(true)
    try {
      const result = await listCardForSale(user!.id, selectedCard.cards.id, Number(price))

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
      const result = await cancelListing(user!.id, listingId)

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
      const result = await buyCard(user!.id, selectedListing.id)

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

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case "legendary":
        return "bg-orange-500 text-white font-semibold"
      case "epic":
        return "bg-purple-500 text-white font-semibold"
      case "rare":
        return "bg-blue-500 text-white font-semibold"
      case "common":
        return "bg-slate-500 text-white font-semibold"
      default:
        return "bg-slate-500 text-white font-semibold"
    }
  }

  return (
    <ProtectedRoute>
      <div className="pb-20">
        <header className="bg-orange-600 text-white p-4">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Market</h1>
            <div className="flex items-center gap-1">
              <Coins className="h-5 w-5" />
              <span className="font-bold">{user?.coins || 0}</span>
            </div>
          </div>
        </header>

        <main className="p-4">
          <Tabs defaultValue="market" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="market">Market</TabsTrigger>
              <TabsTrigger value="my-listings">My Listings</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
            </TabsList>

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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {marketListings.map((listing) => (
                      <motion.div
                        key={listing.id}
                        whileHover={{ scale: 1.02 }}
                        transition={{ type: "spring", stiffness: 400 }}
                      >
                        <Card>
                          <CardHeader className="pb-2">
                            <div className="flex justify-between">
                              <div>
                                <CardTitle>{listing.cards.name}</CardTitle>
                                <CardDescription>{listing.cards.character}</CardDescription>
                              </div>
                              <Badge className={getRarityColor(listing.cards.rarity)}>{listing.cards.rarity}</Badge>
                            </div>
                          </CardHeader>
                          <CardContent className="pb-2">
                            <div className="flex gap-4">
                              <div className="relative w-20 h-28 overflow-hidden rounded-md">
                                <img
                                  src={
                                    listing.cards.image_url ||
                                    `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(listing.cards.character) || "/placeholder.svg"}%20anime%20character`
                                  }
                                  alt={listing.cards.name}
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                              </div>
                              <div className="flex-1">
                                <p className="text-sm text-muted-foreground mb-1">Seller: {listing.seller.username}</p>
                                <div className="flex items-center gap-1 mb-2">
                                  <Badge variant="outline" className={`text-${listing.cards.type}-500`}>
                                    {listing.cards.type}
                                  </Badge>
                                  <span className="text-sm">HP: {listing.cards.hp}</span>
                                </div>
                                <div className="flex items-center gap-1 text-lg font-bold text-orange-600">
                                  <Coins className="h-5 w-5" />
                                  {listing.price} coins
                                </div>
                              </div>
                            </div>
                          </CardContent>
                          <CardFooter>
                            <Button
                              className="w-full bg-orange-600 hover:bg-orange-700"
                              onClick={() => handleBuyCard(listing)}
                              disabled={listing.seller_id === user?.id}
                            >
                              {listing.seller_id === user?.id ? "Your Listing" : "Buy Card"}
                            </Button>
                          </CardFooter>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {userListings.map((listing) => (
                        <motion.div
                          key={listing.id}
                          whileHover={{ scale: 1.02 }}
                          transition={{ type: "spring", stiffness: 400 }}
                        >
                          <Card>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between">
                                <div>
                                  <CardTitle>{listing.cards.name}</CardTitle>
                                  <CardDescription>{listing.cards.character}</CardDescription>
                                </div>
                                <Badge className={getRarityColor(listing.cards.rarity)}>{listing.cards.rarity}</Badge>
                              </div>
                            </CardHeader>
                            <CardContent className="pb-2">
                              <div className="flex gap-4">
                                <div className="relative w-20 h-28 overflow-hidden rounded-md">
                                  <img
                                    src={
                                      listing.cards.image_url ||
                                      `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(listing.cards.character) || "/placeholder.svg"}%20anime%20character`
                                    }
                                    alt={listing.cards.name}
                                    className="absolute inset-0 w-full h-full object-cover"
                                  />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-1 mb-2">
                                    <Badge variant="outline" className={`text-${listing.cards.type}-500`}>
                                      {listing.cards.type}
                                    </Badge>
                                    <span className="text-sm">HP: {listing.cards.hp}</span>
                                  </div>
                                  <div className="flex items-center gap-1 text-lg font-bold text-orange-600">
                                    <Coins className="h-5 w-5" />
                                    {listing.price} coins
                                  </div>
                                </div>
                              </div>
                            </CardContent>
                            <CardFooter>
                              <Button
                                variant="outline"
                                className="w-full"
                                onClick={() => handleCancelListing(listing.id)}
                                disabled={loadingAction}
                              >
                                Cancel Listing
                              </Button>
                            </CardFooter>
                          </Card>
                        </motion.div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </TabsContent>

            <TabsContent value="history" className="mt-4 space-y-6">
              {loading ? (
                <div className="text-center py-8">
                  <div className="h-16 w-16 animate-spin rounded-full border-4 border-orange-600 border-t-transparent mx-auto"></div>
                  <p className="mt-4 text-muted-foreground">Loading history...</p>
                </div>
              ) : (
                <>
                  <div>
                    <h2 className="text-lg font-semibold mb-4">Your Purchases</h2>
                    {purchaseHistory.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">You haven't purchased any cards yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {purchaseHistory.map((purchase) => (
                          <Card key={purchase.id}>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between">
                                <div>
                                  <CardTitle>{purchase.cards.name}</CardTitle>
                                  <CardDescription>
                                    Purchased from {purchase.seller.username} on{" "}
                                    {new Date(purchase.sold_at).toLocaleDateString()}
                                  </CardDescription>
                                </div>
                                <div className="flex items-center gap-1 text-orange-600 font-bold">
                                  <Coins className="h-4 w-4" />
                                  {purchase.price}
                                </div>
                              </div>
                            </CardHeader>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h2 className="text-lg font-semibold mb-4">Your Sales</h2>
                    {saleHistory.length === 0 ? (
                      <div className="text-center py-4">
                        <p className="text-muted-foreground">You haven't sold any cards yet</p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {saleHistory.map((sale) => (
                          <Card key={sale.id}>
                            <CardHeader className="pb-2">
                              <div className="flex justify-between">
                                <div>
                                  <CardTitle>{sale.cards.name}</CardTitle>
                                  <CardDescription>
                                    Sold to {sale.buyer.username} on {new Date(sale.sold_at).toLocaleDateString()}
                                  </CardDescription>
                                </div>
                                <div className="flex items-center gap-1 text-green-600 font-bold">
                                  <Coins className="h-4 w-4" />
                                  {sale.price}
                                </div>
                              </div>
                            </CardHeader>
                          </Card>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </main>

        {/* Sell Card Dialog */}
        <Dialog open={showSellDialog} onOpenChange={setShowSellDialog}>
          <DialogContent>
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
                <Link href="/draw" className="text-orange-600 hover:underline block mt-2">
                  Draw some cards first
                </Link>
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
                        // Setze Standardpreis basierend auf Rarity
                        const defaultPrice = 
                          card.cards.rarity === "legendary"
                            ? "1.5"
                            : card.cards.rarity === "epic"
                            ? "1"
                            : "0.15"
                        setPrice(defaultPrice)
                      }}
                    >
                      <div className="flex gap-2">
                        <div className="relative w-12 h-16 overflow-hidden rounded-md">
                          <img
                            src={
                              card.cards.image_url ||
                              `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(card.cards.character) || "/placeholder.svg"}%20anime%20character`
                            }
                            alt={card.cards.name}
                            className="absolute inset-0 w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium truncate">{card.cards.name}</p>
                          <p className="text-xs text-muted-foreground">{card.cards.character}</p>
                          <div className="flex items-center gap-1 mt-1">
                            <Badge className={`${getRarityColor(card.cards.rarity)} text-xs`}>
                              {card.cards.rarity}
                            </Badge>
                            <span className="text-xs">x{card.quantity}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="space-y-2">
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
                      {selectedCard.cards.rarity === "legendary" 
                        ? "Legendary cards must be listed for at least 1.5 WLD"
                        : selectedCard.cards.rarity === "epic"
                        ? "Epic cards must be listed for at least 1 WLD"
                        : "Minimum price: 0.15 WLD"
                      }
                    </p>
                  )}
                </div>

                <DialogFooter>
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
          <DialogContent>
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
                        `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(selectedListing.cards.character) || "/placeholder.svg"}%20anime%20character`
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
                      <Badge variant="outline" className={`text-${selectedListing.cards.type}-500`}>
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

        <MobileNav />
      </div>
    </ProtectedRoute>
  )
}
