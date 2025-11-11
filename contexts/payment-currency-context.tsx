"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"
import type { ReactNode } from "react"
import type { PaymentCurrency } from "@/lib/payment-utils"

interface PaymentCurrencyContextValue {
  currency: PaymentCurrency
  setCurrency: (currency: PaymentCurrency) => void
}

const DEFAULT_CURRENCY: PaymentCurrency = "WLD"
const STORAGE_KEY = "paymentCurrency"

const PaymentCurrencyContext = createContext<PaymentCurrencyContextValue | undefined>(undefined)

export const PaymentCurrencyProvider = ({ children }: { children: ReactNode }) => {
  const [currency, setCurrencyState] = useState<PaymentCurrency>(DEFAULT_CURRENCY)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as PaymentCurrency | null
      if (stored === "WLD" || stored === "USDC") {
        setCurrencyState(stored)
      }
    } catch (error) {
      console.error("Failed to read payment currency from storage", error)
    }
  }, [])

  const setCurrency = (next: PaymentCurrency) => {
    setCurrencyState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch (error) {
      console.error("Failed to persist payment currency", error)
    }
  }

  const value = useMemo(() => ({ currency, setCurrency }), [currency])

  return <PaymentCurrencyContext.Provider value={value}>{children}</PaymentCurrencyContext.Provider>
}

export const usePaymentCurrency = () => {
  const context = useContext(PaymentCurrencyContext)
  if (!context) {
    throw new Error("usePaymentCurrency must be used within a PaymentCurrencyProvider")
  }
  return context
}
