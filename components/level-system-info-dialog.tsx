"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Info, Star, ArrowRight } from "lucide-react"
import { useI18n } from "@/contexts/i18n-context"

export function LevelSystemInfoDialog() {
  const [isOpen, setIsOpen] = useState(false)
  const { t } = useI18n()

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="flex items-center text-xs text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50 rounded-full px-2.5 py-1"
        >
          <Info className="h-3.5 w-3.5 mr-1" />
          <span>{t("level_system.button", "Card Level System")}</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-center">{t("level_system.title", "Card Level System")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-center text-gray-700">
            {t("level_system.description", "Combine two identical cards of the same level to level up your card!")}
            <br />
            <span className="font-medium">{t("level_system.max_level", "Maximum level is 15.")}</span>
          </p>

          {/* Static Card Combination Visual - Horizontal Layout */}
          <div className="flex items-center justify-between px-4 py-6">
            {/* Left Side - Two Level 1 Cards */}
            <div className="flex items-center space-x-1">
              {/* First Card */}
              <div className="w-16 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg shadow-md border border-indigo-200 flex flex-col items-center justify-center">
                <div className="w-12 h-12 bg-white rounded-md mb-1 flex items-center justify-center overflow-hidden">
                  <img src="/ANI.webp" alt="ANI Character" className="w-full h-full object-cover" />
                </div>
                <div className="flex">
                  <Star className="h-2.5 w-2.5 fill-red-500 text-red-500" />
                </div>
                <span className="text-[10px] font-semibold mt-0.5">Lv. 1</span>
              </div>

              {/* Second Card */}
              <div className="w-16 h-24 bg-gradient-to-br from-indigo-100 to-purple-100 rounded-lg shadow-md border border-indigo-200 flex flex-col items-center justify-center">
                <div className="w-12 h-12 bg-white rounded-md mb-1 flex items-center justify-center overflow-hidden">
                  <img src="/ANI.webp" alt="ANI Character" className="w-full h-full object-cover" />
                </div>
                <div className="flex">
                  <Star className="h-2.5 w-2.5 fill-red-500 text-red-500" />
                </div>
                <span className="text-[10px] font-semibold mt-0.5">Lv. 1</span>
              </div>
            </div>

            {/* Middle - Arrow */}
            <div className="mx-4">
              <ArrowRight className="h-6 w-6 text-indigo-500" />
            </div>

            {/* Right Side - Result Card */}
            <div className="relative w-20 h-28 bg-gradient-to-br from-indigo-200 to-purple-200 rounded-lg shadow-lg border border-indigo-300 flex flex-col items-center justify-center">
              <div className="absolute -top-1 -right-1 bg-yellow-400 text-xs font-bold text-white rounded-full w-5 h-5 flex items-center justify-center">
                +
              </div>
              <div className="w-16 h-16 bg-white rounded-md mb-1 flex items-center justify-center overflow-hidden">
                <img src="/ANI.webp" alt="ANI Character" className="w-full h-full object-cover" />
              </div>
              <div className="flex">
                <Star className="h-3 w-3 fill-red-500 text-red-500" />
                <Star className="h-3 w-3 fill-red-500 text-red-500 -ml-0.5" />
              </div>
              <span className="text-xs font-semibold mt-0.5">Lv. 2</span>
            </div>
          </div>

          <div className="pt-2 grid grid-cols-3 gap-3 mt-3">
            <div className="bg-white/80 rounded-lg p-2 text-center border border-gray-100">
              <div className="flex justify-center mb-1">
                {[...Array(3)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-red-500 text-red-500 -ml-0.5" />
                ))}
              </div>
              <div className="text-xs font-medium text-gray-700">{t("level_system.levels_1_5", "Levels 1-5")}</div>
              <div className="text-xs text-gray-500">{t("level_system.red_stars", "Red Stars")}</div>
            </div>
            <div className="bg-white/80 rounded-lg p-2 text-center border border-gray-100">
              <div className="flex justify-center mb-1">
                {[...Array(3)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-blue-500 text-blue-500 -ml-0.5" />
                ))}
              </div>
              <div className="text-xs font-medium text-gray-700">{t("level_system.levels_6_10", "Levels 6-10")}</div>
              <div className="text-xs text-gray-500">{t("level_system.blue_stars", "Blue Stars")}</div>
            </div>
            <div className="bg-white/80 rounded-lg p-2 text-center border border-gray-100">
              <div className="flex justify-center mb-1">
                {[...Array(3)].map((_, i) => (
                  <Star key={i} className="h-3.5 w-3.5 fill-amber-400 text-amber-400 -ml-0.5" />
                ))}
              </div>
              <div className="text-xs font-medium text-gray-700">{t("level_system.levels_11_15", "Levels 11-15")}</div>
              <div className="text-xs text-gray-500">{t("level_system.gold_stars", "Gold Stars")}</div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
