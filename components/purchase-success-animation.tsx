"use client"

import { motion, AnimatePresence } from "framer-motion"
// Removed Next.js Image import - using regular img tags
import { CheckCircle } from "lucide-react"
import confetti from "canvas-confetti"
import { useEffect, useRef } from "react"
import { useI18n } from "@/contexts/i18n-context"

interface PurchaseSuccessAnimationProps {
  show: boolean
  onComplete: () => void
  cardImageUrl?: string
  cardName: string
}

export default function PurchaseSuccessAnimation({
  show,
  onComplete,
  cardImageUrl,
  cardName,
}: PurchaseSuccessAnimationProps) {
  const { t } = useI18n()
  const confettiRef = useRef<HTMLDivElement>(null)

  const getCloudflareImageUrl = (imagePath?: string) => {
    if (!imagePath) {
      return "/placeholder.svg"
    }
    
    
    // Remove leading slash and any world_soccer/world-soccer prefix
    let cleaned = imagePath.replace(/^\/?(world[-_])?soccer\//i, "")
    
    // Wenn schon http, dann direkt zurückgeben
    if (cleaned.startsWith("http")) {
      return cleaned
    }
    
    
    // Pub-URL verwenden, KEIN world-soccer/ mehr anhängen!
    const finalUrl = `https://ani-labs.xyz/${encodeURIComponent(cleaned)}`
    
    return finalUrl
  }

  useEffect(() => {
    if (show && confettiRef.current) {
      // Verzögerung für den Konfetti-Effekt
      const timer = setTimeout(() => {
        const canvas = document.createElement("canvas")
        canvas.style.position = "fixed"
        canvas.style.inset = "0"
        canvas.style.width = "100vw"
        canvas.style.height = "100vh"
        canvas.style.zIndex = "9999"
        canvas.style.pointerEvents = "none"
        document.body.appendChild(canvas)

        const myConfetti = confetti.create(canvas, {
          resize: true,
          useWorker: true,
        })

        myConfetti({
          particleCount: 100,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#4F46E5", "#8B5CF6", "#EC4899", "#F59E0B"],
        })

        // Entferne den Canvas nach der Animation
        setTimeout(() => {
          document.body.removeChild(canvas)
        }, 3000)
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [show])

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onComplete}
        >
          <div ref={confettiRef} className="absolute inset-0 pointer-events-none" />

          <motion.div
            initial={{ scale: 0.8, y: 20, opacity: 0 }}
            animate={{ scale: 1, y: 0, opacity: 1 }}
            transition={{ type: "spring", damping: 15, stiffness: 300, delay: 0.2 }}
            className="bg-white rounded-2xl overflow-hidden shadow-2xl max-w-xs w-full mx-4"
          >
            <div className="p-6 text-center">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1, rotate: [0, 10, -10, 0] }}
                transition={{ delay: 0.5, duration: 0.5 }}
                className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4"
              >
                <CheckCircle className="h-10 w-10 text-green-600" />
              </motion.div>

              <motion.h2
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="text-xl font-bold mb-2"
              >
                {t("trade.purchase_successful_title", "Purchase Successful!")}
              </motion.h2>

              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.9 }}
                className="text-gray-600 mb-6"
              >
                {t("trade.purchase_successful_desc", "{cardName} has been added to your collection.", { cardName })}
              </motion.p>

              <motion.div
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 1.1, type: "spring" }}
                className="relative w-40 h-56 mx-auto mb-6 rounded-lg overflow-hidden border-4 border-indigo-500 shadow-lg"
              >
                <img
                  src={getCloudflareImageUrl(cardImageUrl) || `/placeholder.svg?height=400&width=300&query=${encodeURIComponent(cardName)}`}
                  alt={cardName}
                  className="absolute inset-0 w-full h-full object-cover"
                />
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 0.7, 0] }}
                  transition={{ delay: 1.3, duration: 1.5, repeat: 2 }}
                  className="absolute inset-0 bg-gradient-to-r from-transparent via-white/70 to-transparent"
                  style={{
                    transform: "skewX(-20deg) translateX(-100%)",
                    animation: "shine 2s infinite",
                  }}
                />
              </motion.div>

              <motion.button
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.5 }}
                onClick={onComplete}
                className="bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-6 py-2 rounded-full font-medium hover:opacity-90 transition-opacity"
              >
                {t("common.continue", "Continue")}
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
