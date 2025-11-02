"use client"

import React, { useState, useRef, useEffect } from "react"
import { useI18n, type SupportedLang } from "@/contexts/i18n-context"
import { ChevronDown } from "lucide-react"

const flags: Record<SupportedLang, string> = {
  en: "🇬🇧",
  de: "🇩🇪",
  es: "🇪🇸",
  ja: "🇯🇵",
  th: "🇹🇭",
  hi: "🇮🇳",
  fil: "🇵🇭",
}

const langs: { value: SupportedLang; label: string }[] = [
  { value: "en", label: "English" },
  { value: "de", label: "Deutsch" },
  { value: "es", label: "Español" },
  { value: "ja", label: "日本語" },
  { value: "th", label: "ไทย" },
  { value: "hi", label: "हिन्दी" },
  { value: "fil", label: "Filipino" }
]

export default function LanguageSwitcher() {
  const { lang, setLang } = useI18n()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current) return
      if (!ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", onDocClick)
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [])

  const current = langs.find(l => l.value === lang) || langs[0]

  return (
    <div ref={ref} className="relative flex justify-center">
      <button
        onClick={() => setOpen(v => !v)}
        className="flex items-center justify-center gap-2 bg-black/70 backdrop-blur-md border border-yellow-400 text-yellow-300 rounded-lg px-3 py-1.5 text-xs font-bold shadow hover:bg-black/80 w-full max-w-[120px]"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="text-base leading-none">{flags[current.value]}</span>
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      {/* Vertical dropdown list opening downward */}
      <div
        className={`absolute left-1/2 -translate-x-1/2 top-full mt-2 w-36 bg-black/90 backdrop-blur-md border border-yellow-400 rounded-xl shadow-lg overflow-hidden transition-all duration-200 origin-top z-50 ${
          open ? "opacity-100 scale-100 max-h-96" : "opacity-0 scale-95 pointer-events-none max-h-0"
        }`}
      >
        <ul className="py-1">
          {langs.map((l) => (
            <li key={l.value}>
              <button
                onClick={() => {
                  setLang(l.value)
                  setOpen(false)
                }}
                className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                  lang === l.value ? "bg-yellow-400 text-black" : "text-yellow-200 hover:bg-yellow-400/10"
                }`}
                aria-pressed={lang === l.value}
              >
                <span className="text-lg leading-none">{flags[l.value]}</span>
                <span className="truncate">{l.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
