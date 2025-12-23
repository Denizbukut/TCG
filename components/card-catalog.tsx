"use client"

import { useState, useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import CardItem from "@/components/card-item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { motion } from "framer-motion"
import { Badge } from "@/components/ui/badge"

type CardCatalogProps = {
  username: string | undefined
  searchTerm?: string
}

// Map database rarity to display categories
const rarityMapping: Record<string, string> = {
  legendary: "L",
  epic: "E",
  rare: "R",
  common: "C",
  basic: "B",
  // wbc: "WBC" // Commented out
};

// Map display categories back to database rarities
const categoryToRarities: Record<string, string[]> = {
  L: ["legendary"],
  U: ["legendary"], // Ultimate = Legendary
  E: ["epic"],
  R: ["rare"],
  C: ["common"],
  B: ["basic"],
  // WBC: ["wbc"] // Commented out
};

export default function CardCatalog({ username, searchTerm = "" }: CardCatalogProps) {
  const [allCards, setAllCards] = useState<any[]>([])
  const [userCards, setUserCards] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")

  useEffect(() => {
    async function fetchCards() {
      setLoading(true)
      const supabase = getSupabaseBrowserClient()

      // Fetch all cards without any filters
      if(!supabase) {
        return
      }
      
      const { data: cards, error: cardsError } = await supabase
        .from("cards")
        .select("id, name, character, image_url, rarity, epoch, obtainable")

      if (cardsError) {
        console.error("Error fetching cards:", cardsError)
        setAllCards([])
      } else {
        
        setAllCards(cards || [])
      }

      // Fetch user's cards if username is provided
      if (username) {
        console.log("=== LOADING USER CARDS ===")
        console.log("Username:", username)
        console.log("Supabase client:", supabase)
        
        // Lade alle user_card_instances und zähle sie pro card_id
        const { data: userCardData, error: userCardsError } = await supabase
          .from("user_card_instances")
          .select("card_id")
          .eq("user_id", username)
          
        console.log("UserCards query result:")
        console.log("  - userCardData:", userCardData)
        console.log("  - userCardsError:", userCardsError)
        
        // Debug: Zeige die ersten UserCard-Daten
        if (userCardData && userCardData.length > 0) {
          console.log("First user card data:", userCardData[0])
          console.log("Card ID in first card:", userCardData[0]?.card_id)
        } else {
          console.log("=== NO USER CARDS FOUND IN CARD GALLERY ===")
          console.log("Username being searched:", username)
          
          // Debug: Prüfe alle UserCards für diesen User
          const { data: allUserCards, error: allUserCardsError } = await supabase
            .from("user_card_instances")
            .select("*")
            .eq("user_id", username)
          
          console.log("All user cards for this user:", allUserCards)
          console.log("All user cards error:", allUserCardsError)
        }

        if (userCardsError) {
          console.error("Error loading user cards:", userCardsError)
          setUserCards({})
        } else if (userCardData && userCardData.length > 0) {
          console.log("User card instances found:", userCardData.length)
          console.log("User card data:", userCardData)
          
          // Zähle die Anzahl der Instanzen pro Card ID
          const userCardMap: Record<string, boolean> = {}
          const cardCounts: Record<string, number> = {}
          
          userCardData.forEach((item) => {
            const cardId = item.card_id as string
            cardCounts[cardId] = (cardCounts[cardId] || 0) + 1
            userCardMap[cardId] = true // Markiere als besessen
            console.log(`Card ${cardId}: ${cardCounts[cardId]} instances`)
          })
          
          console.log("User card map:", userCardMap)
          console.log("Card counts:", cardCounts)
          console.log("User card map keys:", Object.keys(userCardMap))
          setUserCards(userCardMap)
        } else {
          console.log("No user cards found - userCardData:", userCardData)
          setUserCards({})
        }
      } else {
        console.log("No username provided, skipping user cards")
        setUserCards({})
      }

      setLoading(false)
    }

    fetchCards()
  }, [username])

  // Filter cards based on search term
  const filteredCards = allCards.filter(
    (card) =>
      searchTerm === "" ||
      card.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.character.toLowerCase().includes(searchTerm.toLowerCase()),
  )



  const filterCardsByCategory = (category: string) => {
    if (category === "all") return filteredCards

    const rarities = categoryToRarities[category] || []
    return filteredCards.filter((card) => rarities.includes(card.rarity))
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
    const category = rarityMapping[card.rarity] || "Other"
    if (!acc[category]) {
      acc[category] = []
    }
    acc[category].push(card)
    return acc
  }, {})

  // Sort categories in order: L, E, R, C, B (WBC commented out)
  const sortedCategories = ["L", "E", "R", "C", "B"].filter(
    (category) => cardsByRarity[category] && cardsByRarity[category].length > 0,
  )

  // Debug: Show user card ownership
  console.log("=== USER CARD OWNERSHIP ===")
  console.log("Total user cards:", Object.keys(userCards).length)
  console.log("User cards:", userCards)
  
  // Debug: Show sample card ownership
  if (filteredCards.length > 0) {
    console.log("=== SAMPLE CARD OWNERSHIP ===")
    filteredCards.slice(0, 5).forEach(card => {
      const isOwned = userCards[card.id]
      console.log(`Card "${card.name}" (${card.id}): owned=${isOwned}`)
      console.log(`  - Card ID in userCards: ${card.id in userCards}`)
      console.log(`  - UserCards keys: ${Object.keys(userCards)}`)
      console.log(`  - UserCards values: ${Object.values(userCards)}`)
      console.log(`  - Will be passed to CardItem as owned=${isOwned}`)
    })
  }

  if (loading) {
    return (
      <div className="grid grid-cols-5 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
        {Array.from({ length: 10 }).map((_, index) => (
          <div key={index} className="aspect-[3/4]">
            <Skeleton className="h-full w-full rounded-lg" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="w-full">
      
      <Tabs defaultValue="all" className="w-full text-black" onValueChange={setActiveTab}>
      <TabsList className="grid w-full grid-cols-6 bg-white text-black">
        <TabsTrigger value="all" className="text-black data-[state=active]:bg-gray-200 data-[state=active]:text-black">
          All
        </TabsTrigger>
        <TabsTrigger value="L" className="text-black data-[state=active]:bg-gray-200 data-[state=active]:text-black">
          Legendary
        </TabsTrigger>
        <TabsTrigger value="E" className="text-black data-[state=active]:bg-gray-200 data-[state=active]:text-black">
          Epic
        </TabsTrigger>
        <TabsTrigger value="R" className="text-black data-[state=active]:bg-gray-200 data-[state=active]:text-black">
          Rare
        </TabsTrigger>
        <TabsTrigger value="C" className="text-black data-[state=active]:bg-gray-200 data-[state=active]:text-black">
          Common
        </TabsTrigger>
        <TabsTrigger value="B" className="text-black data-[state=active]:bg-gray-200 data-[state=active]:text-black">
          Basic
        </TabsTrigger>
        {/* <TabsTrigger value="WBC" className="text-black data-[state=active]:bg-gray-200 data-[state=active]:text-black">
          WBC
        </TabsTrigger> */}
      </TabsList>

      <TabsContent value="all" className="mt-4 text-black">
        {sortedCategories.map((category) => (
          <div key={category} className="mb-8">
            <div className="flex items-center mb-2">
              <Badge variant="outline" className="mr-2 font-bold text-black border-black">
                {category}
              </Badge>
              <h3 className="text-lg font-semibold text-black">
                {category === "L"
                  ? "Legendary"
                  : category === "E"
                  ? "Epic"
                  : category === "R"
                  ? "Rare"
                  : category === "C"
                  ? "Common"
                  : category === "B"
                  ? "Basic"
                  // : category === "WBC"
                  // ? "WBC"
                  : category}
              </h3>
              <span className="ml-2 text-sm text-gray-700">({cardsByRarity[category].length} cards)</span>
            </div>
            <motion.div
              className="grid grid-cols-5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2 mb-4"
              variants={container}
              initial="hidden"
              animate="show"
            >
              {cardsByRarity[category].map((card) => (
                <motion.div
                  key={card.id}
                  variants={item}
                  whileHover={{ scale: userCards[card.id] ? 1.05 : 1.02 }}
                  transition={{ type: "spring", stiffness: 400, damping: 17 }}
                >
                  <CardItem
                    id={card.id}
                    name={card.name}
                    character={card.character}
                    imageUrl={card.image_url}
                    rarity={card.rarity}
                    epoch={card.epoch}
                    owned={userCards[card.id]}
                    compact={true}
                    hideQuantity={true}
                    isCollection={false}
                  />
                </motion.div>
              ))}
            </motion.div>
          </div>
        ))}
      </TabsContent>

      {["L", "E", "R", "C", "B"].map((category) => (
        <TabsContent key={category} value={category} className="mt-4 text-black">
          <motion.div
            className="grid grid-cols-5 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8 gap-2"
            variants={container}
            initial="hidden"
            animate="show"
          >
            {filterCardsByCategory(category).map((card) => (
              <motion.div
                key={card.id}
                variants={item}
                whileHover={{ scale: userCards[card.id] ? 1.05 : 1.02 }}
                transition={{ type: "spring", stiffness: 400, damping: 17 }}
              >
                <CardItem
                  id={card.id}
                  name={card.name}
                  character={card.character}
                  imageUrl={card.image_url}
                  rarity={card.rarity}
                  epoch={card.epoch}
                  owned={userCards[card.id]}
                  compact={true}
                  hideQuantity={true}
                  isCollection={false}
                />
              </motion.div>
            ))}
          </motion.div>
        </TabsContent>
      ))}
    </Tabs>
    </div>
  )
}
