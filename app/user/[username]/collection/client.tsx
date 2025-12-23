"use client"

import { useState } from "react"
import MobileNav from "@/components/mobile-nav"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { BookOpen, ChevronLeft } from "lucide-react"
import Link from "next/link"
import { renderStars } from "@/utils/card-stars"
import CardItem from "@/components/card-item"

type CollectionStats = {
  total: number
  common: number
  rare: number
  epic: number
  legendary: number
}

export default function UserCollectionClient({
  username,
  userData,
  cardsByLevel,
  sortedLevels,
  collectionStats,
}: {
  username: string
  userData: any
  cardsByLevel: Record<number, any[]>
  sortedLevels: number[]
  collectionStats: CollectionStats
}) {
  const [activeTab, setActiveTab] = useState("all")

  // Filter cards based on active tab
  const getFilteredCardsByLevel = () => {
    return Object.entries(cardsByLevel).reduce((acc: Record<number, any[]>, [level, cards]) => {
      const filteredCards = cards.filter((card) => {
        if (activeTab === "all") return true
        return card.cardDetails?.rarity?.toLowerCase() === activeTab.toLowerCase()
      })

      if (filteredCards.length > 0) {
        acc[Number(level)] = filteredCards
      }

      return acc
    }, {})
  }

  const filteredCardsByLevel = getFilteredCardsByLevel()
  const filteredLevels = Object.keys(filteredCardsByLevel)
    .map(Number)
    .sort((a, b) => b - a)

  return (
    <div className="min-h-screen bg-[#f8f9ff] pb-20">
      {/* Header */}
      <header className="sticky top-0 z-10 backdrop-blur-md bg-white/80 border-b border-gray-100">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <Link href="/leaderboard" passHref>
                <Button variant="ghost" size="sm" className="mr-2 -ml-2" asChild>
                  <div>
                    <ChevronLeft className="h-4 w-4 mr-1" />
                    <span className="text-sm">Back</span>
                  </div>
                </Button>
              </Link>
              <h1 className="text-lg font-medium">{username}'s Collection</h1>
            </div>
          </div>
        </div>
      </header>

      <main className="p-4 max-w-lg mx-auto">
        {/* Collection Stats */}
        <div className="bg-white rounded-2xl shadow-sm mb-4 overflow-hidden">
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-medium">Collection Stats</h2>
              <Link href="/catalog">
                <Button
                  size="sm"
                  className="bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-600 hover:to-indigo-700 text-white h-7 px-3 shadow-sm"
                >
                  <BookOpen className="h-3.5 w-3.5 mr-1" />
                  <span className="text-xs font-medium">Cards Gallery</span>
                </Button>
              </Link>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center">
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-semibold">{collectionStats.total}</div>
                <div className="text-xs text-gray-500">Total</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-semibold text-gray-600">{collectionStats.common}</div>
                <div className="text-xs text-gray-500">Common</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-semibold text-blue-600">{collectionStats.rare}</div>
                <div className="text-xs text-gray-500">Rare</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-semibold text-purple-600">{collectionStats.epic}</div>
                <div className="text-xs text-gray-500">Epic</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <div className="text-lg font-semibold text-amber-600">{collectionStats.legendary}</div>
                <div className="text-xs text-gray-500">Legend</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs for filtering by rarity */}
        <div className="mb-4">
          <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6 bg-white h-9">
              <TabsTrigger value="all" className="text-xs h-7">
                All
              </TabsTrigger>
              <TabsTrigger value="legendary" className="text-xs h-7">
                Legendary
              </TabsTrigger>
              <TabsTrigger value="epic" className="text-xs h-7">
                Epic
              </TabsTrigger>
              <TabsTrigger value="rare" className="text-xs h-7">
                Rare
              </TabsTrigger>
              <TabsTrigger value="common" className="text-xs h-7">
                Common
              </TabsTrigger>
              <TabsTrigger value="basic" className="text-xs h-7">
                Basic
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {/* Cards by Level */}
        {filteredLevels.length > 0 ? (
          filteredLevels.map((level) => (
            <div key={level} className="mb-8">
              <div className="flex items-center mb-3">
                <Badge variant="outline" className="mr-2 font-bold">
                  Level {level}
                </Badge>
                <div className="flex">{renderStars(level, "xs")}</div>
                <span className="ml-2 text-sm text-gray-700">
                  ({filteredCardsByLevel[level].length} {filteredCardsByLevel[level].length === 1 ? "card" : "cards"})
                </span>
              </div>

              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                {filteredCardsByLevel[level].map((card) => (
                  <div key={card.id}>
                    <CardItem
                      id={card.card_id}
                      name={card.cardDetails?.name || "Unknown Card"}
                      character={card.cardDetails?.character || "Unknown Character"}
                      imageUrl={card.cardDetails?.imageUrl}
                      rarity={card.cardDetails?.rarity?.toLowerCase() || "common"}
                      epoch={card.cardDetails?.epoch || 1}
                      level={card.level || 1}
                      quantity={card.quantity || 1}
                      owned={true}
                      isCollection={true}
                      // Disable navigation by providing an empty onClick handler
                      onClick={() => {}}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <p className="text-gray-500">No cards match the selected filter.</p>
            <Button variant="outline" className="mt-4" onClick={() => setActiveTab("all")}>
              Show All Cards
            </Button>
          </div>
        )}
      </main>

      <MobileNav />
    </div>
  )
}
