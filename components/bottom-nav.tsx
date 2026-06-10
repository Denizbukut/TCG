"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const items = [
  { href: "/", label: "Home" },
  { href: "/draw", label: "Packs" },
  { href: "/tokens", label: "Create" },
  { href: "/collection", label: "Collection" },
  { href: "/trade", label: "Trade" },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 backdrop-blur-xl bg-[#0a0a0a]/90 border-t border-white/10">
      <div className="max-w-2xl mx-auto px-4 py-3">
        <div className="grid grid-cols-5 gap-2">
          {items.map((item) => {
            const active = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center justify-center rounded-xl py-2.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[#d4af37]/10 border border-[#d4af37]/20 text-[#d4af37]"
                    : "bg-white/5 border border-white/10 text-white/60"
                }`}
              >
                {item.label}
              </Link>
            )
          })}
        </div>
      </div>
    </nav>
  )
}
