"use client"

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react"
import en from "@/locales/en.json"
import de from "@/locales/de.json"
import es from "@/locales/es.json"
import ja from "@/locales/ja.json"
import th from "@/locales/th.json"
import hi from "@/locales/hi.json"
import fil from "@/locales/fil.json"

export type SupportedLang = "en" | "de" | "es" | "ja" | "th" | "hi" | "fil"

type Translations = Record<string, any>

type I18nContextType = {
  lang: SupportedLang
  setLang: (l: SupportedLang) => void
  t: (key: string, fallback?: string, params?: Record<string, string | number>) => string
  ready: boolean
}

const I18nContext = createContext<I18nContextType | undefined>(undefined)

const LOCALES: Record<SupportedLang, Translations> = { en, de, es, ja, th, hi, fil }

function getInitialLang(): SupportedLang {
  if (typeof window === "undefined") return "en"
  const saved = window.localStorage.getItem("lang") as SupportedLang | null
  if (saved && LOCALES[saved]) return saved
  const browser = navigator.language?.split("-")[0]
  if (["en","de","es","ja","th","hi","fil"].includes(browser)) return browser as SupportedLang
  return "en"
}

function interpolate(template: string, params?: Record<string, string | number>) {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`))
}

function getByPath(obj: any, path: string): any {
  return path.split(".").reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj)
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<SupportedLang>(getInitialLang)
  const [translations, setTranslations] = useState<Translations>(LOCALES["en"]) 
  const [ready, setReady] = useState(false)

  const load = useCallback(async (l: SupportedLang) => {
    setReady(false)
    try {
      const data = LOCALES[l] || LOCALES["en"]
      setTranslations(data)
    } catch (e) {
      console.error("Failed to load locale", l, e)
      setTranslations(LOCALES["en"]) 
    } finally {
      setReady(true)
    }
  }, [])

  useEffect(() => {
    load(lang)
  }, [lang, load])

  const setLang = useCallback((l: SupportedLang) => {
    setLangState(l)
    if (typeof window !== "undefined") {
      window.localStorage.setItem("lang", l)
    }
  }, [])

  const t = useCallback(
    (key: string, fallback?: string, params?: Record<string, string | number>) => {
      const value = getByPath(translations, key)
      if (typeof value === "string") return interpolate(value, params)
      if (value !== undefined) return String(value)
      return fallback !== undefined ? interpolate(fallback, params) : key
    },
    [translations]
  )

  const value = useMemo(() => ({ lang, setLang, t, ready }), [lang, setLang, t, ready])

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n(): I18nContextType {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error("useI18n must be used within I18nProvider")
  return ctx
}
