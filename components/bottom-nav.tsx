"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Home as HomeIcon, Sparkles, ShoppingBag, CreditCard, Repeat } from "lucide-react"
import { useI18n } from "@/contexts/i18n-context"

export default function BottomNav() {
  const pathname = usePathname()
  const { t } = useI18n()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/90 border-t border-white/10">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="grid grid-cols-5 gap-2">
          <Link href="/" className="flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              pathname === "/" 
                ? "bg-[#d4af37]/10 border border-[#d4af37]/20" 
                : "bg-white/5 border border-white/10"
            }`}>
              <HomeIcon className={`h-5 w-5 ${pathname === "/" ? "text-[#d4af37]" : "text-white/60"}`} />
            </div>
            <span className={`text-[10px] font-medium ${pathname === "/" ? "text-white" : "text-white/60"}`}>
              {t("nav.home", "Home")}
            </span>
          </Link>
          
          <Link href="/draw" className="flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              pathname === "/draw" 
                ? "bg-[#d4af37]/10 border border-[#d4af37]/20" 
                : "bg-white/5 border border-white/10"
            }`}>
              <Sparkles className={`h-5 w-5 ${pathname === "/draw" ? "text-[#d4af37]" : "text-white/60"}`} />
            </div>
            <span className={`text-[10px] font-medium ${pathname === "/draw" ? "text-white" : "text-white/60"}`}>
              {t("nav.packs", "Packs")}
            </span>
          </Link>
          
          <Link href="/tokens" className="flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              pathname === "/tokens" 
                ? "bg-[#d4af37]/10 border border-[#d4af37]/20" 
                : "bg-white/5 border border-white/10"
            }`}>
              <ShoppingBag className={`h-5 w-5 ${pathname === "/tokens" ? "text-[#d4af37]" : "text-white/60"}`} />
            </div>
            <span className={`text-[10px] font-medium ${pathname === "/tokens" ? "text-white" : "text-white/60"}`}>
              {t("nav.create", "Create")}
            </span>
          </Link>
          
          <Link href="/collection" className="flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              pathname === "/collection" 
                ? "bg-[#d4af37]/10 border border-[#d4af37]/20" 
                : "bg-white/5 border border-white/10"
            }`}>
              <CreditCard className={`h-5 w-5 ${pathname === "/collection" ? "text-[#d4af37]" : "text-white/60"}`} />
            </div>
            <span className={`text-[10px] font-medium ${pathname === "/collection" ? "text-white" : "text-white/60"}`}>
              {t("nav.collection", "Collection")}
            </span>
          </Link>
          
          <Link href="/trade" className="flex flex-col items-center gap-1">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
              pathname === "/trade" 
                ? "bg-[#d4af37]/10 border border-[#d4af37]/20" 
                : "bg-white/5 border border-white/10"
            }`}>
              <Repeat className={`h-5 w-5 ${pathname === "/trade" ? "text-[#d4af37]" : "text-white/60"}`} />
            </div>
            <span className={`text-[10px] font-medium ${pathname === "/trade" ? "text-white" : "text-white/60"}`}>
              {t("nav.trade", "Trade")}
            </span>
          </Link>
        </div>
      </div>
    </nav>
  )
}
