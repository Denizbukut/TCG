"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import CardItem from "@/components/card-item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Search, ArrowLeft, Filter } from "lucide-react"
import Link from "next/link"
import MobileNav from "@/components/mobile-nav"
import { useRouter } from "next/navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export default function CatalogPage() {
  const router = useRouter()
  const { user } = useAuth()
  const [allCards, setAllCards] = useState<any[]>([])
  const [userCards, setUserCards] = useState<Record<string, { owned: boolean; level: number }>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedEpoch, setSelectedEpoch] = useState<number | "all">("all")
  const [availableEpochs, setAvailableEpochs] = useState<number[]>([])
  const [debugInfo, setDebugInfo] = useState<string>("")

  // Update the fetchCards function to include epoch filtering
  async function fetchCards() {
    setLoading(true)
    const supabase = getSupabaseBrowserClient()

    try {
      // Fetch all cards including epoch
      if (!supabase) return
      const { data: cards, error: cardsError } = await supabase
        .from("cards")
        .select("*")
        .order("epoch", { ascending: false }) // Order by newest epoch first
        .order("rarity", { ascending: false })

      if (cardsError) {
        console.error("Error fetching cards:", cardsError)
        setAllCards([])

      } else {
        
        // Process cards to ensure imageUrl is set correctly
        const processedCards = cards?.map(card => ({
          ...card,
          imageUrl: card.image_url || card.imageUrl // Ensure imageUrl is available
        })) || []
        
        // Debug: Log some card data to check image URLs
        console.log("Sample cards with image URLs:", processedCards.slice(0, 3))
        
        setAllCards(processedCards)

        // Debug: Check for WBC cards
        const wbcCards = processedCards?.filter((card: any) => card.rarity === 'wbc' || card.rarity === 'WBC')
        console.log('WBC cards found:', wbcCards?.length || 0, wbcCards)

        // Get available epochs
        const epochs = [...new Set(processedCards?.map((card: any) => card.epoch).filter(Boolean))] as number[]
        setAvailableEpochs(epochs.sort((a, b) => b - a)) // Sort newest first
      }

      // Fetch user's cards if username is provided
      if (user?.username) {
        const { data: userCardData, error: userCardsError } = await supabase
          .from("user_cards")
          .select("card_id, level, quantity")
          .eq("user_id", user.username)
          .gt("quantity", 0)

        if (userCardsError) {
          console.error("Error fetching user cards:", userCardsError)
        } else {
          const userCardMap: Record<string, { owned: boolean; level: number }> = {}
          userCardData?.forEach((item) => {
            userCardMap[item.card_id as string] = {
              owned: true,
              level: (item.level as number) || 1,

            }
          })
          setUserCards(userCardMap)
        }
      }
    } catch (error) {
      console.error("Unexpected error fetching cards:", error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchCards()
  }, [user?.username])

  // Filter cards based on search term and epoch
  const filteredCards = allCards.filter((card) => {
    const matchesSearch =
      card.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.character.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesEpoch = selectedEpoch === "all" || card.epoch === selectedEpoch

    return matchesSearch && matchesEpoch
  })

  const filterCardsByCategory = (category: string) => {
    if (category === "all") return filteredCards

    return filteredCards.filter((card) => {
      const cardRarity = card.rarity?.toLowerCase()
      const categoryLower = category.toLowerCase()
      return cardRarity === categoryLower
    })
  }

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  }

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 },
  }

  // Group cards by rarity for the "all" tab
  const cardsByRarity = filteredCards.reduce((acc: Record<string, any[]>, card) => {
    const category = card.rarity
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(card)
    return acc
  }, {})

  // Sort categories in order: legendary, epic, rare, common
  const sortedCategories = ["legendary", "epic", "rare", "common"].filter(
    (category) => cardsByRarity[category] && cardsByRarity[category].length > 0,
  )

  // Handle card click to navigate to card detail page
  const handleCardClick = (cardId: string) => {
    router.push(`/cards/${cardId}`)
  }

  if (loading) {
    return (
      <div className="min-h-screen pb-20" style={{ backgroundImage: 'url(/hintergrung.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center mb-6">
            <Link href="/collection">
              <Button variant="ghost" size="sm" className="mr-2 text-yellow-300 hover:text-yellow-200">
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </Link>
            <h1 className="text-2xl font-bold text-yellow-300">Card Catalog</h1>
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
            {Array.from({ length: 12 }).map((_, index) => (
              <div key={index} className="aspect-[3/4]">
                <Skeleton className="h-full w-full rounded-lg bg-yellow-500/20" />
              </div>
            ))}
          </div>
        </div>
        <MobileNav />
      </div>
    )
  }

  return (
    <div className="min-h-screen pb-20" style={{ backgroundImage: 'url(/hintergrung.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      <div className="max-w-lg mx-auto px-4 py-3">
        <div className="flex items-center mb-6">
          <Link href="/collection">
            <Button variant="ghost" size="sm" className="mr-2 text-yellow-300 hover:text-yellow-200">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold text-yellow-300">Card Catalog</h1>
        </div>

        <div className="space-y-4 mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-yellow-500" />
            <Input
              placeholder="Search cards by name or anime..."
              className="pl-10 bg-black/80 border-yellow-500 text-yellow-300 placeholder-yellow-400 focus:ring-yellow-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {/* Epoch Filter */}
          {availableEpochs.length > 1 && (
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-yellow-500" />
              <Select
                value={selectedEpoch.toString()}
                onValueChange={(value) => setSelectedEpoch(value === "all" ? "all" : Number.parseInt(value))}
              >
                <SelectTrigger className="w-40 bg-black/80 border-yellow-500 text-yellow-300">
                  <SelectValue placeholder="Select Epoch" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Epochs</SelectItem>
                  {availableEpochs.map((epoch) => (
                    <SelectItem key={epoch} value={epoch.toString()}>
                      Epoch {epoch}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>



      <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
        <TabsList className="flex overflow-x-auto whitespace-nowrap no-scrollbar bg-black/80 border-yellow-500">
          <TabsTrigger value="all" className="text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">All</TabsTrigger>
          <TabsTrigger value="legendary" className="text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">Legendary</TabsTrigger>
          <TabsTrigger value="epic" className="text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">Epic</TabsTrigger>
          <TabsTrigger value="rare" className="text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">Rare</TabsTrigger>
          <TabsTrigger value="common" className="text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">Common</TabsTrigger>
        </TabsList>

        <TabsContent value="all" className="mt-4">
          {sortedCategories.map((category) => (
            <div key={category} className="mb-8">
              <div className="flex items-center mb-3">
                <Badge variant="outline" className="mr-2 font-bold border-yellow-400 text-yellow-200">
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </Badge>
                <span className="text-sm text-yellow-200">({cardsByRarity[category].length} cards)</span>
              </div>

              <motion.div
                className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"
                variants={container}
                initial="hidden"
                animate="show"
              >
                {cardsByRarity[category].map((card) => (
                  <motion.div
                    key={card.id}
                    variants={item}
                    whileHover={{ scale: userCards[card.id]?.owned ? 1.05 : 1.02 }}
                    transition={{ type: "spring", stiffness: 400, damping: 17 }}
                  >
                    <CardItem
                      id={card.id}
                      name={card.name}
                      character={card.character}
                      imageUrl={card.imageUrl}
                      rarity={card.rarity}
                      level={userCards[card.id]?.level || 1}
                      owned={userCards[card.id]?.owned || false}
                      hideOverlay={true}
                      hideLevel={true}
                      onClick={() => handleCardClick(card.id)}
                      epoch={card.epoch}
                    />
                  </motion.div>
                ))}
              </motion.div>
            </div>
          ))}
        </TabsContent>

        {["legendary", "epic", "rare", "common"].map((category) => (
          <TabsContent key={category} value={category} className="mt-4">
            <motion.div
              className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3"
              variants={container}
              initial="hidden"
              animate="show"
            >
              {filterCardsByCategory(category).map((card) => (
                <motion.div
                  key={card.id}
                  variants={item}
                  whileHover={{ scale: userCards[card.id]?.owned ? 1.05 : 1.02 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <CardItem
                    id={card.id}
                    name={card.name}
                    character={card.character}
                    imageUrl={card.imageUrl}
                    rarity={card.rarity}
                    level={userCards[card.id]?.level || 1}
                    owned={userCards[card.id]?.owned || false}
                    hideOverlay={true}
                    hideLevel={true}
                    onClick={() => handleCardClick(card.id)}
                    epoch={card.epoch}
                  />
                </motion.div>
              ))}
            </motion.div>
          </TabsContent>
        ))}
      </Tabs>

      <MobileNav />
      </div>
    </div>
  )
}
