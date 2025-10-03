"use client"

import { useState, useEffect } from "react"
import { useAuth } from "@/contexts/auth-context"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import CardItem from "@/components/card-item"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { motion, AnimatePresence } from "framer-motion"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { AlertCircle, BookOpen, Search, Filter } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import MobileNav from "@/components/mobile-nav"
import { Input } from "@/components/ui/input"
import { renderStars } from "@/utils/card-stars"
import { LevelSystemInfoDialog } from "@/components/level-system-info-dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
// Removed Next.js Image import - using regular img tags
import SquadCardMenu from "@/components/squad-card-menu"

export default function CollectionPage() {
  const { user } = useAuth()
  const router = useRouter()
  const [userCards, setUserCards] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedEpoch, setSelectedEpoch] = useState<number | "all">("all")
  const [availableEpochs, setAvailableEpochs] = useState<number[]>([])
  const [showSquad, setShowSquad] = useState(false);

  // Debug: Log user info
  console.log("=== COLLECTION PAGE DEBUG ===")
  console.log("User from auth context:", user)
  console.log("Username:", user?.username)


  // Check URL parameters for direct squad access
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam === 'mysquad') {
      setShowSquad(true);
    }
  }, []);
  // Squad-Positions-State
  const initialSquad: Record<string, any> = {
    GK: null,
    DF1: null, DF2: null, DF3: null, DF4: null,
    MF1: null, MF2: null, MF3: null, MF4: null,
    FW1: null, FW2: null,
  };
  const [squad, setSquad] = useState<Record<string, any>>(initialSquad);
  const [selectingPosition, setSelectingPosition] = useState<string | null>(null); // z.B. 'DF2'
  const [savingSquad, setSavingSquad] = useState(false);
  // Squad Management Menu State
  const [squadMenuOpen, setSquadMenuOpen] = useState(false);
  const [selectedCard, setSelectedCard] = useState<any>(null);
  const [selectedPosition, setSelectedPosition] = useState<string>("");

  // Squad aus API laden, wenn My Squad geöffnet wird
  useEffect(() => {
    if (!showSquad || !user?.username) return;
    async function fetchSquad() {
      try {
        const res = await fetch("/api/save-squad", { method: "GET", credentials: "include" });
        const data = await res.json();
        if (data.squad) {
          // Die Squad-Objekte enthalten nur Card-IDs, wir müssen die Card-Objekte aus userCards zuordnen
          const newSquad: Record<string, any> = { ...initialSquad };
          Object.entries(data.squad).forEach(([slot, cardId]) => {
            if (cardId) {
              const cardObj = userCards.find((c) => c.cardId === cardId);
              if (cardObj) {
                console.log(`Found squad card for ${slot}:`, cardObj);
                newSquad[slot] = cardObj;
              } else {
                console.log(`Card not found for ${slot} with cardId:`, cardId);
              }
            }
          });
          setSquad(newSquad);
        } else {
          setSquad(initialSquad);
        }
      } catch (e) {
        setSquad(initialSquad);
      }
    }
    fetchSquad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showSquad, user?.username, userCards]);

  // Fetch user's cards
  useEffect(() => {
    async function fetchUserCards() {
      if (!user?.username) {
        console.log("No user found, redirecting to login")
        // Sanftere Weiterleitung statt sofortiger Redirect
        setTimeout(() => {
          router.push('/login')
        }, 100)
        return
      }

      setLoading(true)
      const supabase = getSupabaseBrowserClient()

      try {
        // 1. First get user's cards - only one entry per card_id
        if (!supabase) {
          console.log("No Supabase client available")
          setLoading(false)
          return
        }
        // Use individual card instances instead of user_cards
        const { data: userCardsData, error: userCardsError } = await supabase
          .from("user_card_instances")
          .select(`id, card_id, level, favorite, obtained_at`)
          .eq("user_id", user.username)
          .order('obtained_at', { ascending: false })

        if (userCardsError) {
          console.error("Error fetching user cards:", userCardsError)
          toast({
            title: "Error",
            description: "Failed to load your card collection",
            variant: "destructive",
          })
          setUserCards([])
          setLoading(false)
          return
        }

        if (!userCardsData || userCardsData.length === 0) {
          console.log("No user cards found for:", user.username)
          setUserCards([])
          setLoading(false)
          return
        }

        console.log("Found user cards:", userCardsData.length, "for user:", user.username)

        // 2. Group individual instances by card_id and level
        const groupedCards = new Map()
        
        userCardsData?.forEach(instance => {
          const key = `${instance.card_id}-${instance.level}`
          
          if (!groupedCards.has(key)) {
            groupedCards.set(key, {
              card_id: instance.card_id,
              level: instance.level,
              quantity: 0,
              instances: [],
              favorite: false
            })
          }
          
          const group = groupedCards.get(key)
          group.quantity += 1
          group.instances.push({
            id: instance.id,
            favorite: instance.favorite,
            obtained_at: instance.obtained_at
          })
          if (instance.favorite) {
            group.favorite = true
          }
        })

        const uniqueUserCards = Array.from(groupedCards.values())

        // 3. Get the card IDs to fetch
        const cardIds = uniqueUserCards.map((uc) => uc.card_id)

        // 4. Fetch the card details including epoch
        const { data: cardsData, error: cardsError } = await supabase
          .from("cards")
          .select("id, name, character, image_url, rarity, epoch")
          .in("id", cardIds)

        if (cardsError) {
          console.error("Error fetching card details:", cardsError)
          toast({
            title: "Error",
            description: "Failed to load card details",
            variant: "destructive",
          })
          setUserCards([])
          setLoading(false)
          return
        }

        const cardMap = new Map()
        cardsData?.forEach((c) => {
          cardMap.set(c.id, c)
        })

        // 5. Get available epochs from user's cards
        const epochs = [...new Set(cardsData?.map((card) => card.epoch).filter(Boolean))] as number[]
        setAvailableEpochs(epochs.sort((a, b) => b - a)) // Sort newest first

        // 6. Combine the data
        const processedCards = uniqueUserCards
          .map((userCard) => {
            const details = cardMap.get(userCard.card_id)
            if (!details) return null
            return {
              id: userCard.id,
              cardId: userCard.card_id,
              quantity: userCard.quantity,
              level: userCard.level || 1,
              ...details,
              imageUrl: details.image_url, // <-- wichtig für CardItem
            }
          })
          .filter(Boolean)

        setUserCards(processedCards)
      } catch (err) {
        console.error("Unexpected error:", err)
        toast({
          title: "Error",
          description: "An unexpected error occurred",
          variant: "destructive",
        })
      } finally {
        setLoading(false)
      }
    }

    fetchUserCards()
  }, [user?.username])

  // Filter cards based on active tab, search term, and epoch
  const filteredCards = userCards.filter((card) => {
    const matchesSearch =
      searchTerm === "" ||
      card.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      card.character?.toLowerCase().includes(searchTerm.toLowerCase())


      const matchesRarity = activeTab === "all" || 
      (activeTab === "legendary" && (card.rarity?.toLowerCase() === "legendary" || card.rarity?.toLowerCase() === "ultima" || card.rarity?.toLowerCase() === "ultimate")) || 
      (activeTab === "epic" && (card.rarity?.toLowerCase() === "epic" || card.rarity?.toLowerCase() === "elite")) ||
      (activeTab === "rare" && card.rarity?.toLowerCase() === "rare") ||
      (activeTab === "common" && (card.rarity?.toLowerCase() === "common" || card.rarity?.toLowerCase() === "basic"))
      // (activeTab === "wbc" && card.rarity?.toLowerCase() === "wbc") // Commented out

    const matchesEpoch = selectedEpoch === "all" || card.epoch === selectedEpoch

    return matchesSearch && matchesRarity && matchesEpoch
  })

  // Group cards by level for better organization
  const cardsByLevel = filteredCards.reduce((acc: Record<number, any[]>, card) => {
    const level = card.level || 1
    if (!acc[level]) {
      acc[level] = []
    }
    acc[level].push(card)
    return acc
  }, {})

  // Sort levels in descending order
  const sortedLevels = Object.keys(cardsByLevel)
    .map(Number)
    .sort((a, b) => b - a)

  // Debug: Log all rarity values to see what's in the database
  console.log("All card rarities:", userCards.map(card => ({ name: card.name, rarity: card.rarity, quantity: card.quantity })))
  
  // Calculate collection stats
  const collectionStats = userCards.reduce(
    (acc, card) => {
      acc.total += card.quantity || 0
      if (card.rarity) {
        // Map all possible rarity names to our display names
        let rarityKey = card.rarity.toLowerCase()
        
        // Handle different possible rarity values
        if (rarityKey === 'legendary' || rarityKey === 'ultima' || rarityKey === 'ultimate') {
          rarityKey = 'legendary'
        } else if (rarityKey === 'epic' || rarityKey === 'elite') {
          rarityKey = 'epic'
        } else if (rarityKey === 'rare') {
          rarityKey = 'rare'
        } else if (rarityKey === 'common' || rarityKey === 'basic') {
          rarityKey = 'common'
        } else if (rarityKey === 'goat') {
          rarityKey = 'goat'
        }
        
        // Initialize the key if it doesn't exist
        if (!acc.hasOwnProperty(rarityKey)) {
          acc[rarityKey] = 0
        }
        
        acc[rarityKey] = (acc[rarityKey] || 0) + (card.quantity || 0)
      }
      return acc
    },
    { total: 0, common: 0, rare: 0, epic: 0, legendary: 0, goat: 0 },
  )
  
  // Debug: Log the final stats
  console.log("Collection stats:", collectionStats)

  // Squad Management Functions
  const handleSquadCardClick = (card: any, position: string) => {
    if (!card) {
      console.error("No card provided to handleSquadCardClick");
      return;
    }
    console.log(`Squad card clicked for ${position}:`, card);
    setSelectedCard(card);
    setSelectedPosition(position);
    setSquadMenuOpen(true);
  };

  const handleRemoveCard = async (position: string) => {
    try {
      const newSquad = { ...squad };
      newSquad[position] = null;
      setSquad(newSquad);
      
      // Save to API
      const response = await fetch("/api/save-squad", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ squad: newSquad }),
      });
      
      if (!response.ok) {
        throw new Error("Failed to save squad");
      }
      
      toast({
        title: "Success",
        description: "Card removed from squad",
      });
    } catch (error) {
      console.error("Error removing card:", error);
      toast({
        title: "Error",
        description: "Failed to remove card from squad",
        variant: "destructive",
      });
    }
  };

  const handleReplaceCard = async (position: string) => {
    setSelectingPosition(position);
    setSquadMenuOpen(false);
  };



  if (loading) {
    return (
      <div className="min-h-screen pb-20" style={{ backgroundImage: 'url(/hintergrung.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
        <header className="sticky top-0 z-10 backdrop-blur-md bg-black/80 border-b border-yellow-500">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex justify-between items-center">
              <h1 className="text-lg font-medium text-yellow-300">My Collection</h1>
            </div>
          </div>
        </header>
        <div className="p-4 max-w-lg mx-auto">
          <div className="bg-black/80 rounded-2xl shadow-sm mb-4 p-4 border border-yellow-500">
            <Skeleton className="h-6 w-32 mb-3 bg-yellow-500/20" />
            <div className="grid grid-cols-5 gap-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-16 rounded-lg bg-yellow-500/20" />
              ))}
            </div>
          </div>
          <Skeleton className="h-10 w-full mb-4 bg-yellow-500/20" />
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
            {Array.from({ length: 9 }).map((_, index) => (
              <div key={index} className="aspect-[3/4]">
                <Skeleton className="h-full w-full rounded-xl bg-yellow-500/20" />
              </div>
            ))}
          </div>
        </div>
        <MobileNav />
      </div>
    )
  }

  if (userCards.length === 0) {
    return (
      <div className="min-h-screen pb-20" style={{ backgroundImage: 'url(/hintergrung.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
        <header className="sticky top-0 z-10 backdrop-blur-md bg-black/80 border-b border-yellow-500">
          <div className="max-w-lg mx-auto px-4 py-3">
            <div className="flex justify-between items-center">
              <h1 className="text-lg font-medium text-yellow-300">My Collection</h1>
            </div>
          </div>
        </header>
        <div className="p-4 max-w-lg mx-auto">
          <div className="bg-black/80 rounded-2xl shadow-sm p-8 text-center border border-yellow-500">
            <div className="w-16 h-16 rounded-full bg-yellow-500/20 flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>
            <h2 className="text-xl font-medium mb-2 text-yellow-300">No Cards Yet</h2>
            <p className="text-yellow-400 mb-6 max-w-xs mx-auto">
              You don't have any cards in your collection yet. Open some packs to get started!
            </p>
            <Button
              onClick={() => router.push("/draw")}
              className="bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-600 hover:to-fuchsia-600 rounded-full"
            >
              Open Card Packs
            </Button>
          </div>
        </div>
        <MobileNav />
      </div>
    )
  }

  if (showSquad) {
    // Karten nach Level sortieren (höchster zuerst)
    const sortedUserCards = [...userCards].sort((a, b) => (b.level || 1) - (a.level || 1));
    // My Squad Ansicht
    return (
      <div
        className="relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden bg-black"
        style={{ backgroundImage: 'url(/fußballpaltz.jpg)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 backdrop-blur-md bg-white/90 border-b border-gray-100 shadow-sm w-full">
          <div className="w-full max-w-lg mx-auto px-4 py-3 flex items-center justify-between">
            <h1 className="text-lg font-bold tracking-tight bg-gradient-to-r from-green-400 to-green-700 bg-clip-text text-transparent drop-shadow-md">
              4-4-2
            </h1>
            <button onClick={() => setShowSquad(false)} className="text-sm text-gray-600 underline">Back</button>
          </div>
        </header>
        {/* Spielfeld und Formation */}
        <div className="relative w-full max-w-md mx-auto flex-1 flex flex-col items-center justify-center py-8">
          {/* 1 Torwart */}
          <div
            className="aspect-[3/4] w-20 sm:w-24 border-2 border-yellow-400 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer bg-white/10 p-0"
            onClick={() => squad.GK && squad.GK.id ? handleSquadCardClick(squad.GK, 'GK') : setSelectingPosition('GK')}
          >
            {squad.GK ? (
              <CardItem {...squad.GK} compact owned={true} hideOverlay={true} hideName={true} hideQuantity={true} disableCardLink={true} onClick={() => squad.GK && squad.GK.id ? handleSquadCardClick(squad.GK, 'GK') : null} style={{ width: '100%', height: '100%' }} />
            ) : null}
          </div>
          {/* 4 Verteidiger */}
          <div className="flex justify-between mb-6 w-4/5 mx-auto">
            {[1,2,3,4].map(i => (
              <div
                key={i}
                className="aspect-[3/4] w-20 sm:w-24 border-2 border-blue-400 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer bg-white/10 p-0"
                onClick={() => squad[`DF${i}`] && squad[`DF${i}`].id ? handleSquadCardClick(squad[`DF${i}`], `DF${i}`) : setSelectingPosition(`DF${i}`)}
              >
                {squad[`DF${i}`] ? (
                  <CardItem {...squad[`DF${i}`]} compact owned={true} hideOverlay={true} hideName={true} hideQuantity={true} disableCardLink={true} onClick={() => squad[`DF${i}`] && squad[`DF${i}`].id ? handleSquadCardClick(squad[`DF${i}`], `DF${i}`) : null} style={{ width: '100%', height: '100%' }} />
                ) : null}
              </div>
            ))}
          </div>
          {/* 4 Mittelfeld */}
          <div className="flex justify-between mb-6 w-4/5 mx-auto">
            {[1,2,3,4].map(i => (
              <div
                key={i}
                className="aspect-[3/4] w-20 sm:w-24 border-2 border-green-400 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer bg-white/10 p-0"
                onClick={() => squad[`MF${i}`] && squad[`MF${i}`].id ? handleSquadCardClick(squad[`MF${i}`], `MF${i}`) : setSelectingPosition(`MF${i}`)}
              >
                {squad[`MF${i}`] ? (
                  <CardItem {...squad[`MF${i}`]} compact owned={true} hideOverlay={true} hideName={true} hideQuantity={true} disableCardLink={true} onClick={() => squad[`MF${i}`] && squad[`MF${i}`].id ? handleSquadCardClick(squad[`MF${i}`], `MF${i}`) : null} style={{ width: '100%', height: '100%' }} />
                ) : null}
              </div>
            ))}
          </div>
          {/* 2 Stürmer */}
          <div className="flex justify-center mb-6">
            {[1,2].map(i => (
              <div
                key={i}
                className="aspect-[3/4] w-20 sm:w-24 border-2 border-red-400 rounded-xl overflow-hidden flex items-center justify-center cursor-pointer bg-white/10 p-0"
                onClick={() => squad[`FW${i}`] && squad[`FW${i}`].id ? handleSquadCardClick(squad[`FW${i}`], `FW${i}`) : setSelectingPosition(`FW${i}`)}
              >
                {squad[`FW${i}`] ? (
                  <CardItem {...squad[`FW${i}`]} compact owned={true} hideOverlay={true} hideName={true} hideQuantity={true} disableCardLink={true} onClick={() => squad[`FW${i}`] && squad[`FW${i}`].id ? handleSquadCardClick(squad[`FW${i}`], `FW${i}`) : null} style={{ width: '100%', height: '100%' }} />
                ) : null}
              </div>
            ))}
          </div>
          {/* Save Squad Button */}
          <button
            className="mt-8 px-6 py-3 bg-green-600 text-white rounded-full font-bold shadow-lg hover:bg-green-700 transition disabled:opacity-60"
            onClick={async () => {
              setSavingSquad(true);
              // Nur die Card-IDs speichern
              const squadToSave: Record<string, string | null> = {};
              Object.entries(squad).forEach(([slot, cardObj]) => {
                squadToSave[slot] = cardObj ? cardObj.cardId : null;
              });
              // Validierung: Keine Karte doppelt im Team
              const cardIds = Object.values(squadToSave).filter(Boolean);
              const hasDuplicates = new Set(cardIds).size !== cardIds.length;
              if (hasDuplicates) {
                toast({ title: "Fehler", description: "Du hast dieselbe Karte mehrfach im Team!", variant: "destructive" });
                setSavingSquad(false);
                return;
              }
              console.log('Squad to save:', squadToSave);
              const res = await fetch("/api/save-squad", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ squad: squadToSave }),
                credentials: "include"
              });
              const data = await res.json();
              setSavingSquad(false);
              console.log("Save Squad Response:", data);
              if (res.ok && data.success) {
                toast({ title: "Squad gespeichert!", description: JSON.stringify(data) });
              } else {
                toast({ title: "Fehler", description: JSON.stringify(data), variant: "destructive" });
              }
            }}
            disabled={savingSquad}
          >
            {savingSquad ? "Speichern..." : "Save Squad"}
          </button>

          {/* Auswahlmenü für Karten */}
          {selectingPosition && (
            <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
              <div className="bg-black/90 border border-yellow-500 rounded-xl p-6 max-w-sm w-full shadow-lg text-white">
                <h2 className="text-lg font-bold mb-4 text-yellow-300">Select Card for {selectingPosition}</h2>
                <div className="max-h-64 overflow-y-auto space-y-2">
                  {sortedUserCards.map((card, index) => {
                    // Prüfen, ob die Karte schon in einer anderen Position ist
                    const alreadyInSquad = Object.entries(squad).some(
                      ([slot, c]) => c && c.cardId === card.cardId && slot !== selectingPosition
                    );
                    // Key eindeutig machen mit Index um Duplikate zu vermeiden:
                    const uniqueKey = card.cardId + '-' + selectingPosition + '-' + index;
                    return (
                      <button
                        key={uniqueKey}
                        className={`w-full flex items-center gap-3 text-left px-3 py-3 rounded-lg border mb-2 transition-colors ${
                          alreadyInSquad 
                            ? 'bg-gray-800/50 text-gray-400 cursor-not-allowed opacity-60 border-gray-600' 
                            : 'hover:bg-yellow-500/20 border-yellow-500/50 text-white hover:border-yellow-400'
                        }`}
                        onClick={() => {
                          if (alreadyInSquad) return;
                          setSquad(prev => ({ ...prev, [selectingPosition]: card }));
                          setSelectingPosition(null);
                        }}
                        disabled={alreadyInSquad}
                      >
                        <div className="w-10 h-14 flex-shrink-0 overflow-hidden rounded">
                          {card ? (
                            <CardItem 
                              {...card} 
                              compact 
                              owned={true}
                              hideOverlay={true}
                              hideName={true}
                              hideQuantity={true}
                              hideLevel={true}
                              style={{ width: '100%', height: '100%' }}
                            />
                          ) : null}
                        </div>
                        <span className="flex-1">{card.name} ({card.character})</span>
                        <span className="flex items-center text-xs text-yellow-500 ml-2">
                          ★ {card.level}
                        </span>
                        {alreadyInSquad && <span className="ml-2 text-xs text-red-400 font-semibold">Bereits im Team</span>}
                      </button>
                    );
                  })}
                </div>
                <button
                  className="mt-4 w-full py-2 bg-red-500/20 text-red-400 border border-red-500/50 rounded-lg font-bold hover:bg-red-500/30 transition-colors"
                  onClick={() => {
                    setSquad(prev => ({ ...prev, [selectingPosition]: null }));
                    setSelectingPosition(null);
                  }}
                >
                  Remove Card
                </button>
                <button 
                  className="mt-2 w-full py-2 bg-gray-500/20 text-gray-300 border border-gray-500/50 rounded-lg hover:bg-gray-500/30 transition-colors" 
                  onClick={() => setSelectingPosition(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* Squad Management Menu */}
        <SquadCardMenu
          isOpen={squadMenuOpen}
          onClose={() => setSquadMenuOpen(false)}
          card={selectedCard}
          position={selectedPosition}
          onRemove={handleRemoveCard}
          onReplace={handleReplaceCard}
        />
      </div>
    );
  }

  // Normale Collection-Ansicht
  return (
    <div className="min-h-screen pb-20" style={{ backgroundImage: 'url(/hintergrung.png)', backgroundSize: 'cover', backgroundPosition: 'center', backgroundRepeat: 'no-repeat' }}>
      {/* Header mit My Collection und My Squad */}
      

      <main className="p-4 max-w-lg mx-auto">
        {/* Collection Stats */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="bg-black/80 rounded-2xl shadow-sm mb-4 overflow-hidden border border-yellow-500"
        >
          <div className="p-4">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-sm font-medium text-yellow-300">Collection Stats</h2>
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
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: "Total", value: collectionStats.total, color: "text-yellow-300" },
                { label: "Common", value: collectionStats.common, color: "text-yellow-300" },
                { label: "Rare", value: collectionStats.rare, color: "text-blue-400" },
                { label: "Epic", value: collectionStats.epic, color: "text-purple-400" },
                { label: "Legendary", value: collectionStats.legendary, color: "text-amber-400" },
              ].map((stat) => (
                <div key={stat.label} className="bg-black/60 rounded-lg p-2 border border-yellow-500/50">
                  <div className={`text-lg font-semibold ${stat.color}`}>{stat.value}</div>
                  <div className="text-xs text-yellow-300">{stat.label}</div>
                </div>
              ))}
            </div>

            {/* Level System Info Button */}
            <div className="mt-3 flex justify-center">
              <LevelSystemInfoDialog />
            </div>
          </div>
        </motion.div>

        {/* Search and Filters */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.4 }}
          className="mb-4 space-y-3"
        >
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-yellow-500" />
            <Input
              placeholder="Search cards..."
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
                <SelectTrigger className="w-32 bg-black/80 border-yellow-500 text-yellow-300">
                  <SelectValue placeholder="Epoch" />
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

          <Tabs defaultValue="all" className="w-full" onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-5 bg-black/80 border-yellow-500 h-9">
              <TabsTrigger value="all" className="text-xs h-7 text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
                All
              </TabsTrigger>
              <TabsTrigger value="legendary" className="text-xs h-7 text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
                Legendary
              </TabsTrigger>
              <TabsTrigger value="epic" className="text-xs h-7 text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
                Epic
              </TabsTrigger>
              <TabsTrigger value="rare" className="text-xs h-7 text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
                Rare
              </TabsTrigger>
              <TabsTrigger value="common" className="text-xs h-7 text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
                Common
              </TabsTrigger>
              {/* <TabsTrigger value="wbc" className="text-xs h-7 text-yellow-300 data-[state=active]:bg-yellow-500 data-[state=active]:text-black">
                WBC
              </TabsTrigger> */}
            </TabsList>
          </Tabs>
        </motion.div>

        {/* Cards by Level */}
        {sortedLevels.length > 0 ? (
          sortedLevels.map((level) => (
            <motion.div
              key={level}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.4 }}
              className="mb-8"
            >
              <div className="flex items-center mb-3">
                <Badge variant="outline" className="mr-2 font-bold border-yellow-400 text-yellow-200">
                  Level {level}
                </Badge>
                <div className="flex">{renderStars(level, "xs")}</div>
                <span className="ml-2 text-sm text-yellow-200">
                  ({cardsByLevel[level].length} {cardsByLevel[level].length === 1 ? "card" : "cards"})
                </span>
              </div>

              <motion.div
                className="grid grid-cols-3 sm:grid-cols-4 gap-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ staggerChildren: 0.05 }}
              >
                <AnimatePresence>
                  {cardsByLevel[level].map((card) => {
                    console.log('CollectionCard', card.imageUrl, card.image_url);
                    return (
                      <motion.div
                        key={card.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        transition={{ type: "spring", stiffness: 400, damping: 17 }}
                      >
                        <CardItem
                          id={`${card.cardId}`}
                          name={card.name}
                          character={card.character}
                          imageUrl={card.imageUrl}
                          rarity={card.rarity}
                          level={card.level || 1}
                          quantity={card.quantity}
                          owned={true}
                          isCollection={true}
                          epoch={card.epoch}
                        />
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
              </motion.div>
            </motion.div>
          ))
        ) : (
          <div className="bg-black/70 rounded-2xl shadow-sm p-8 text-center border border-yellow-400">
            <div className="w-12 h-12 rounded-full bg-yellow-400/20 flex items-center justify-center mx-auto mb-4">
              <Search className="h-6 w-6 text-yellow-400" />
            </div>
            <h2 className="text-lg font-medium mb-2 text-yellow-200">No Results</h2>
            <p className="text-yellow-300 mb-4">
              No cards match your search criteria. Try different keywords or filters.
            </p>
            <Button
              variant="outline"
              className="border-yellow-400 text-yellow-200 hover:bg-yellow-400 hover:text-black"
              onClick={() => {
                setSearchTerm("")
                setActiveTab("all")
                setSelectedEpoch("all")
              }}
            >
              Clear Filters
            </Button>
          </div>
        )}
      </main>

      <MobileNav />
      {/* <button
        onClick={() => setShowSquad(true)}
        className="mt-8 px-6 py-3 bg-green-600 text-white rounded-full font-bold shadow-lg hover:bg-green-700 transition"
      >
        My Squad
      </button> */}
    </div>
  )
}
