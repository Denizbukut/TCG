"use client"

import { useState, useEffect } from "react"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { drawCards } from "@/app/actions"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import CardItem from "@/components/card-item"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Ticket, Package, PackageOpen, Sparkles, Crown, ArrowRight } from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { PackOpeningAnimation } from "@/components/pack-opening-animation"
// Removed Next.js Image import - using regular img tags
import { motion } from "framer-motion"

export default function PacksPage() {
  const { user, updateUserTickets } = useAuth()
  const [isDrawing, setIsDrawing] = useState(false)
  const [showResults, setShowResults] = useState(false)
  const [showAnimation, setShowAnimation] = useState(false)
  const [drawnCards, setDrawnCards] = useState<any[]>([])
  const [currentPackType, setCurrentPackType] = useState<"basic" | "premium" | "ultimate">("basic")
  // const [hasIconPass, setHasIconPass] = useState(false)
  const [hasEpicAvatar, setHasEpicAvatar] = useState(false)

  // Debug: Log user state
  // console.log('PacksPage rendered, user:', user?.username, 'hasIconPass:', hasIconPass)

  // Check if user has active Icon Pass and Epic Avatar
  // useEffect(() => {
  //   console.log('useEffect triggered, user:', user?.username)
    
  //   // TEMPORARY: Force hasIconPass to true for testing
  //   console.log('🔧 TEMPORARY: Setting hasIconPass to true for testing')
  //   setHasIconPass(true)
    
  //   const checkUserBonuses = async () => {
  //     if (!user?.username) {
  //       console.log('No username found, returning')
  //       return
  //     }
      
  //     try {
  //       console.log('Starting Icon Pass and Epic Avatar check for user:', user.username)
  //       const supabase = getSupabaseBrowserClient()
  //       if (!supabase) {
  //         console.log('No Supabase client found')
  //         return
  //       }

  //       // Check Icon Pass
  //       console.log('Querying icon_passes table...')
  //       const { data: iconPassData, error: iconPassError } = await supabase
  //         .from('icon_passes')
  //         .select('*')
  //         .eq('user_id', user.username)
  //         .eq('active', true)
  //         .single()

  //       console.log('Icon Pass check result:', { data: iconPassData, error: iconPassError, username: user.username })
        
  //       if (!iconPassError && iconPassData) {
  //         setHasIconPass(true)
  //         console.log('✅ Icon Pass is active!')
  //       } else {
  //         setHasIconPass(false)
  //         console.log('❌ No active Icon Pass found, error:', iconPassError)
  //       }

  //       // Check Epic Avatar
  //       if (user.avatar_id) {
  //         console.log('Checking Epic Avatar for avatar_id:', user.avatar_id)
  //         const { data: avatarData, error: avatarError } = await supabase
  //           .from('avatars')
  //           .select('rarity')
  //           .eq('id', user.avatar_id)
  //           .eq('is_active', true)
  //           .single()
          
  //         if (!avatarError && avatarData?.rarity === "epic") {
  //           setHasEpicAvatar(true)
  //           console.log('🎭 Epic Avatar detected!')
  //         } else {
  //           setHasEpicAvatar(false)
  //           console.log('❌ No Epic Avatar found, rarity:', avatarData?.rarity)
  //         }
  //       } else {
  //         setHasEpicAvatar(false)
  //         console.log('❌ No avatar_id found for user')
  //       }
  //     } catch (error) {
  //       console.error('❌ Error checking user bonuses:', error)
  //       setHasIconPass(false)
  //       setHasEpicAvatar(false)
  //     }
  //   }

  //   checkUserBonuses()
  // }, [user?.username, user?.avatar_id])

  const handleDrawPack = async (packType: string) => {
    if (!user) return

    setIsDrawing(true)
    try {
      const result = await drawCards(user.username, packType)

      if (result.success) {
        // Update user tickets in context
        await updateUserTickets(result.newTicketCount)

        // Show drawn cards
        setDrawnCards(result.drawnCards || [])
        setCurrentPackType(packType as "basic" | "premium" | "ultimate")
        setShowAnimation(true)
      } else {
        toast({
          title: "Error",
          description: result.error,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error drawing pack:", error)
      toast({
        title: "Error",
        description: "Failed to draw card pack",
        variant: "destructive",
      })
    } finally {
      setIsDrawing(false)
    }
  }

  const closeAnimation = () => {
    setShowAnimation(false)
    setShowResults(true)
  }

  const closeResults = () => {
    setShowResults(false)
    setDrawnCards([])
  }

  // Floating animation variants
  const floatingAnimation = {
    animate: {
      y: [0, -10, 0],
      transition: {
        duration: 4,
        repeat: Number.POSITIVE_INFINITY,
        ease: "easeInOut",
      },
    },
  }

  return (
    <ProtectedRoute>
      <div className="pb-20">
        <header className="bg-orange-600 text-white p-4">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h1 className="text-2xl font-bold">Card Packs</h1>
              {/* Tickets neben dem Card Packs Titel */}
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full">
                  <Ticket className="h-4 w-4 text-amber-300" />
                  <span className="font-bold text-sm">{user?.tickets ?? 0}</span>
                </div>
                <div className="flex items-center gap-1 bg-white/20 px-2 py-1 rounded-full">
                  <Ticket className="h-4 w-4 text-purple-300" />
                  <span className="font-bold text-sm">{user?.elite_tickets ?? 0}</span>
                </div>
              </div>
            </div>
          </div>
        </header>

        <main className="p-4 space-y-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-bold mb-2">Draw New Cards</h2>
            <p className="text-muted-foreground">Use your tickets to draw card packs and expand your collection!</p>
          </div>

          <div className="grid gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5 text-green-500" />
                  Basic Pack
                  {hasEpicAvatar && (
                    <div className="bg-gradient-to-r from-purple-400 to-purple-600 text-white text-xs px-2 py-1 rounded-full font-bold">
                      🎭 EPIC BONUS
                    </div>
                  )}
                </CardTitle>
                <CardDescription>
                  3 cards with Common to Rare cards
                  {hasEpicAvatar && (
                    <span className="block text-purple-600 font-medium mt-1">
                      +1% Ultimate drop rate (Rating 88-91) with Epic Avatar!
                    </span>
                  )}
                </CardDescription>
              </CardHeader>
              <div className="px-6 py-2 flex justify-center">
                <motion.div
                  className="relative aspect-[3/4] w-24 mx-auto rounded-lg overflow-hidden"
                  variants={floatingAnimation}
                  animate="animate"
                  style={{ filter: "drop-shadow(0 0 8px rgba(34, 197, 94, 0.5))" }}
                >
                  <img src="/regular-summon-pack.png" alt="Basic Pack" className="absolute inset-0 w-full h-full object-cover" />
                </motion.div>
              </div>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <Ticket className="h-5 w-5 text-orange-500" />
                    <span className="font-bold">3 tickets</span>
                  </div>
                  <Button
                    onClick={() => handleDrawPack("basic")}
                    disabled={isDrawing || (user?.tickets || 0) < 3}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    {isDrawing ? "Drawing..." : "Draw Pack"}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <PackageOpen className="h-5 w-5 text-blue-500" />
                  Premium Pack
                  {/* {hasIconPass && (
                    <div className="bg-gradient-to-r from-yellow-400 to-yellow-600 text-white text-xs px-2 py-1 rounded-full font-bold">
                      PASS ACTIVE
                    </div>
                  )} */}
                </CardTitle>
                <CardDescription>3 cards with better odds for Rare and Epic</CardDescription>
              </CardHeader>
              <div className="px-6 py-2 flex justify-center">
                <motion.div
                  className="relative aspect-[3/4] w-24 mx-auto rounded-lg overflow-hidden"
                  variants={floatingAnimation}
                  animate="animate"
                  style={{ filter: "drop-shadow(0 0 8px rgba(59, 130, 246, 0.5))" }}
                >
                  <img src="/regular-summon-pack.png" alt="Premium Pack" className="absolute inset-0 w-full h-full object-cover" />
                </motion.div>
              </div>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <Ticket className="h-5 w-5 text-orange-500" />
                    <span className="font-bold">5 tickets</span>
                  </div>
                  <Button
                    onClick={() => handleDrawPack("premium")}
                    disabled={isDrawing || (user?.tickets || 0) < 5}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {isDrawing ? "Drawing..." : "Draw Pack"}
                  </Button>
                </div>
                

                

              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Ultimate Pack
                </CardTitle>
                <CardDescription>5 cards with chance for Legendary cards</CardDescription>
              </CardHeader>
              <div className="px-6 py-2 flex justify-center">
                <motion.div
                  className="relative aspect-[3/4] w-24 mx-auto rounded-lg overflow-hidden"
                  variants={floatingAnimation}
                  animate="animate"
                  style={{ filter: "drop-shadow(0 0 12px rgba(245, 158, 11, 0.6))" }}
                  whileHover={{
                    scale: 1.05,
                    rotate: [-1, 1, -1],
                    transition: { rotate: { duration: 0.5, repeat: Number.POSITIVE_INFINITY } },
                  }}
                >
                  <img src="/legendarypack.png?v=2" alt="Ultimate Pack" className="absolute inset-0 w-full h-full object-cover" />
                </motion.div>
              </div>
              <CardContent>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-1">
                    <Ticket className="h-5 w-5 text-orange-500" />
                    <span className="font-bold">10 tickets</span>
                  </div>
                  <Button
                    onClick={() => handleDrawPack("ultimate")}
                    disabled={isDrawing || (user?.tickets || 0) < 10}
                    className="bg-purple-600 hover:bg-purple-700"
                  >
                    {isDrawing ? "Drawing..." : "Draw Pack"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="bg-muted rounded-lg p-4 mt-6">
            <h3 className="font-bold mb-2">How to get more tickets:</h3>
            <ul className="space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="text-orange-500">•</span>
                <span>Claim your daily login bonus (3 tickets)</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500">•</span>
                <span>Complete achievements</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-orange-500">•</span>
                <span>Participate in events</span>
              </li>
            </ul>
          </div>
        </main>

        {/* Pack Opening Animation */}
        {showAnimation && (
          <PackOpeningAnimation
            isOpen={showAnimation}
            onClose={closeAnimation}
            packType={currentPackType}
            cards={drawnCards}
          />
        )}

        {/* Results Dialog (shown after animation) */}
        <Dialog open={showResults} onOpenChange={closeResults}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="text-center text-xl">New Cards!</DialogTitle>
              <DialogDescription className="text-center">You've drawn {drawnCards.length} new cards!</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-2 gap-4 mt-4">
              {drawnCards.map((card) => (
                <CardItem
                  key={card.id}
                  id={card.id}
                  name={card.name}
                  character={card.character}
                  imageUrl={card.image_url}
                  rarity={card.rarity}
                  epoch={card.epoch || 1}
                />
              ))}
            </div>
            <Button onClick={closeResults} className="w-full mt-4">
              Add to Collection
            </Button>
          </DialogContent>
        </Dialog>

        <MobileNav />
      </div>
    </ProtectedRoute>
  )
}
