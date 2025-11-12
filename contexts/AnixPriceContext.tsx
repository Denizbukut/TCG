"use client"

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react"

interface AnixPriceContextValue {
  price: number | null
}

const AnixPriceContext = createContext<AnixPriceContextValue>({ price: null })

export const useAnixPrice = () => useContext(AnixPriceContext)

export const AnixPriceProvider = ({ children }: { children: ReactNode }) => {
  const [price, setPrice] = useState<number | null>(null)
  const lastFetched = useRef<number>(0)

  useEffect(() => {
    const fetchPrice = async () => {
      const now = Date.now()
      const CACHE_WINDOW = 5 * 60 * 1000

      if (price !== null && now - lastFetched.current < CACHE_WINDOW) return

      try {
        const res = await fetch("/api/anix-price")
        if (!res.ok) throw new Error(`Failed status ${res.status}`)
        const json = await res.json()
        if (typeof json.price === "number") {
          setPrice(json.price)
          lastFetched.current = now
        }
      } catch (error) {
        console.error("Error fetching ANIX price:", error)
      }
    }

    fetchPrice()
    const interval = setInterval(fetchPrice, 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [price])

  return <AnixPriceContext.Provider value={{ price }}>{children}</AnixPriceContext.Provider>
}

