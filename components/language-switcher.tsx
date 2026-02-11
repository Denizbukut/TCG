"use client"

import React, { useState, useRef, useEffect } from "react"
import { createPortal } from "react-dom"
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
  const dropdownRef = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ top: 0, right: 0 })
  const [isPositioned, setIsPositioned] = useState(false)

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!ref.current || !dropdownRef.current) return
      if (!ref.current.contains(e.target as Node) && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setIsPositioned(false)
      }
    }
    if (open) {
      document.addEventListener("mousedown", onDocClick)
    }
    return () => document.removeEventListener("mousedown", onDocClick)
  }, [open])

  // Calculate position immediately when opening
  const handleToggle = () => {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right
      })
      setIsPositioned(true)
    }
    setOpen(v => !v)
  }

  useEffect(() => {
    if (open && ref.current && !isPositioned) {
      const rect = ref.current.getBoundingClientRect()
      setPosition({
        top: rect.bottom + window.scrollY + 8,
        right: window.innerWidth - rect.right
      })
      setIsPositioned(true)
    }
  }, [open, isPositioned])

  const current = langs.find(l => l.value === lang) || langs[0]

  const dropdownContent = open ? (
    <div
      ref={dropdownRef}
      className={`fixed w-36 bg-[#0a0a0a]/95 backdrop-blur-md border border-white/20 rounded-xl shadow-lg overflow-y-auto z-[9999] transition-all duration-200 ${
        isPositioned ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 -translate-y-2'
      }`}
      style={{
        top: `${position.top}px`,
        right: `${position.right}px`
      }}
    >
      <ul className="py-1">
        {langs.map((l) => (
          <li key={l.value}>
            <button
              onClick={() => {
                setLang(l.value)
                setOpen(false)
                setIsPositioned(false)
              }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                lang === l.value ? "bg-[#d4af37]/20 text-[#d4af37]" : "text-white/70 hover:bg-white/10"
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
  ) : null

  return (
    <>
      <div ref={ref} className="relative z-[100]">
        <button
          onClick={handleToggle}
          className="flex items-center justify-center gap-1.5 bg-white/5 backdrop-blur-sm border border-white/10 text-white rounded-lg px-2 py-1.5 text-xs font-medium hover:bg-white/10 transition-colors"
          aria-haspopup="true"
          aria-expanded={open}
        >
          <span className="text-base leading-none">{flags[current.value]}</span>
          <ChevronDown className="h-3 w-3" />
        </button>
      </div>
      {typeof window !== "undefined" && createPortal(dropdownContent, document.body)}
    </>
  )
}
