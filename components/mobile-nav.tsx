"use client"

import type React from "react"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Home, CreditCard, Package, Repeat, ShoppingCart, Trophy } from "lucide-react"
import { motion } from "framer-motion"
// import LanguageSwitcher from "./language-switcher"
import { useTranslation } from "@/hooks/use-translation"

export default function MobileNav() {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-black border-t border-gray-800 z-50 backdrop-blur-md bg-black/90 shadow-[0_-1px_10px_rgba(0,0,0,0.3)]">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-4">
        <NavItem href="/" icon={<Home />} label={t('navigation.home')} isActive={pathname === "/"} />
        <NavItem href="/draw" icon={<Package />} label={t('navigation.packs')} isActive={pathname === "/draw"} />
        {/* <NavItem href="/ani" icon={<Trophy className="h-5 w-5" />} label="Kick Off" isActive={pathname === "/ani"} /> */}
        <NavItem href="/collection" icon={<CreditCard />} label={t('navigation.collection')} isActive={pathname === "/collection"} />
        <NavItem href="/trade" icon={<Repeat />} label={t('navigation.trade')} isActive={pathname === "/trade"} />
        {/* <div className="flex items-center justify-center">
          <LanguageSwitcher />
        </div> */}
      </div>
    </div>
  )
}

interface NavItemProps {
  href: string
  icon: React.ReactNode
  label: string
  isActive: boolean
}

function NavItem({ href, icon, label, isActive }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex flex-col items-center justify-center w-full h-full text-xs font-medium transition-colors relative",
        isActive ? "text-white" : "text-gray-400",
      )}
    >
      <div className="h-5 w-5 mb-1 relative">
        {icon}
        {/* NEW Badge for Kick Off - COMMENTED OUT */}
        {/* {href === "/ani" && (
          <div className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] px-1 py-0.5 rounded-full font-bold animate-pulse">
            NEW
          </div>
        )} */}
      </div>
      <span>{label}</span>

      {isActive && (
        <motion.div
          layoutId="nav-indicator"
          className="absolute -bottom-0 w-12 h-0.5 bg-white rounded-full"
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      )}
    </Link>
  )
}
