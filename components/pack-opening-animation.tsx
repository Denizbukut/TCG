"use client"

import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Dialog, DialogContent } from "@/components/ui/dialog"
// Removed Next.js Image import - using regular img tags
import { Button } from "@/components/ui/button"
import { Sparkles } from "lucide-react"
import confetti from "canvas-confetti"

interface PackOpeningAnimationProps {
  isOpen: boolean
  onClose: () => void
  packType: "basic" | "premium" | "ultimate"
  cards: any[]
}

export function PackOpeningAnimation({ isOpen, onClose, packType, cards }: PackOpeningAnimationProps) {
  const [currentStep, setCurrentStep] = useState(0)
  const [revealedCards, setRevealedCards] = useState<number[]>([])
  const [isRevealing, setIsRevealing] = useState(false)
  const confettiCanvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (isOpen) {
      setCurrentStep(0)
      setRevealedCards([])
      setIsRevealing(false)
    }
  }, [isOpen])

  const handleSwipeToOpen = () => {
    setCurrentStep(1)
  }

  const handleRevealCard = (index: number) => {
    if (isRevealing || revealedCards.includes(index)) return

    setIsRevealing(true)
    setRevealedCards((prev) => [...prev, index])

    const card = cards[index]
    if (card.rarity === "epic") {
      triggerEpicEffect()
    } else if (card.rarity === "legendary") {
      triggerLegendaryEffect()
    }

    setTimeout(() => {
      setIsRevealing(false)
    }, 1500)

    if (revealedCards.length === cards.length - 1) {
      setTimeout(() => {
        setCurrentStep(2)
      }, 2000)
    }
  }

  const triggerEpicEffect = () => {
    if (confettiCanvasRef.current) {
      const myConfetti = confetti.create(confettiCanvasRef.current, {
        resize: true,
        useWorker: true,
      })

      myConfetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ["#8b5cf6", "#a78bfa", "#c4b5fd"],
      })
    }
  }

  const triggerLegendaryEffect = () => {
    if (confettiCanvasRef.current) {
      const myConfetti = confetti.create(confettiCanvasRef.current, {
        resize: true,
        useWorker: true,
      })

      myConfetti({
        particleCount: 150,
        spread: 100,
        origin: { y: 0.6 },
        colors: ["#fbbf24", "#f59e0b", "#d97706"],
      })

      setTimeout(() => {
        myConfetti({
          particleCount: 150,
          spread: 100,
          origin: { y: 0.6 },
          colors: ["#fbbf24", "#f59e0b", "#d97706"],
        })
      }, 300)
    }
  }

  const getPackImage = () => {
    switch (packType) {
      case "premium":
        return "/regular pack.png?v=2"
      case "ultimate":
        return "/legendarypack.png?v=2"
      default:
        return "/regular pack.png?v=2"
    }
  }

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case "common":
        return "bg-gray-200 text-gray-800"
      case "rare":
        return "bg-blue-500 text-white"
      case "epic":
        return "bg-purple-500 text-white"
      case "legendary":
        return "bg-amber-500 text-white"
      default:
        return "bg-gray-200 text-gray-800"
    }
  }

  const getRarityLabel = (rarity: string) => {
    return rarity.charAt(0).toUpperCase() + rarity.slice(1)
  }

  return (
    <Dialog open={isOpen} onOpenChange={() => currentStep === 2 && onClose()}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-transparent border-0 shadow-none">
        <canvas
          ref={confettiCanvasRef}
          className="fixed inset-0 z-50 pointer-events-none"
          style={{ width: "100vw", height: "100vh" }}
        />

        <div className="relative flex items-center justify-center w-full h-full min-h-[70vh]">
          <AnimatePresence mode="wait">
            {currentStep === 0 && (
              <motion.div
                key="pack"
                initial={{ scale: 0.5, opacity: 0, y: 50 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 1.2, opacity: 0, y: -50 }}
                transition={{ duration: 0.5 }}
                className="flex flex-col items-center cursor-pointer"
                onClick={handleSwipeToOpen}
              >
                <div className="w-48 h-64 relative rounded-xl overflow-hidden shadow-lg">
                  <img
                    src={getPackImage()}
                    alt={`${packType} Pack`}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                </div>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                  className="mt-4 text-xl font-bold text-white"
                >
                  {packType.charAt(0).toUpperCase() + packType.slice(1)} Pack
                </motion.div>
              </motion.div>
            )}

            {currentStep === 1 && (
              <motion.div
                key="cards"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="w-full p-4 bg-gray-900 rounded-lg"
              >
                <h2 className="mb-4 text-xl font-bold text-center text-white">Reveal Your Cards!</h2>
                <div className={`grid gap-4 ${cards.length > 3 ? "grid-cols-3" : "grid-cols-3"}`}>
                  {cards.map((card, index) => (
                    <div key={card.id} className="relative">
                      <motion.div
                        className="relative w-full aspect-[3/4] cursor-pointer"
                        onClick={() => handleRevealCard(index)}
                        whileHover={!revealedCards.includes(index) && !isRevealing ? { scale: 1.05 } : {}}
                      >
                        <AnimatePresence>
                          {!revealedCards.includes(index) ? (
                            <motion.div
                              key="back"
                              className="absolute inset-0 bg-gradient-to-b from-blue-500 to-blue-700 rounded-lg shadow-lg flex items-center justify-center"
                              exit={{ rotateY: 90, transition: { duration: 0.3 } }}
                            >
                              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-full flex items-center justify-center">
                                <span className="text-2xl font-bold text-white">?</span>
                              </div>
                            </motion.div>
                          ) : (
                            <motion.div
                              key="front"
                              className="absolute inset-0 rounded-lg shadow-lg overflow-hidden"
                              initial={{ rotateY: -90 }}
                              animate={{ rotateY: 0 }}
                              transition={{ duration: 0.3, delay: 0.3 }}
                            >
                              <div className="relative w-full h-full">
                                <img
                                  src={card.image_url || "/placeholder.svg"}
                                  alt={card.name}
                                  className="absolute inset-0 w-full h-full object-cover"
                                />
                                <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-60 p-1">
                                  <div className="text-xs text-white font-medium truncate">{card.name}</div>
                                </div>
                                <div
                                  className={`absolute top-1 right-1 px-2 py-0.5 rounded-full text-xs font-bold ${getRarityColor(card.rarity)}`}
                                >
                                  {getRarityLabel(card.rarity)}
                                </div>
                                {(card.rarity === "epic" || card.rarity === "legendary") && (
                                  <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none">
                                    <Sparkles
                                      className={`w-6 h-6 absolute top-1 left-1 ${card.rarity === "legendary" ? "text-amber-400" : "text-purple-400"}`}
                                    />
                                  </div>
                                )}
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {currentStep === 2 && (
              <motion.div
                key="finish"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="w-full p-4 bg-gray-900 rounded-lg text-center"
              >
                <h2 className="mb-4 text-xl font-bold text-white">All Cards Revealed!</h2>
                <Button
                  onClick={onClose}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600"
                >
                  Add to Collection
                </Button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  )
}
