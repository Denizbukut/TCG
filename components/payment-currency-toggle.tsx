"use client"

import { PAYMENT_CURRENCIES, type PaymentCurrency } from "@/lib/payment-utils"
import { cn } from "@/lib/utils"
import { usePaymentCurrency } from "@/contexts/payment-currency-context"

interface PaymentCurrencyToggleProps {
  value?: PaymentCurrency
  onChange?: (currency: PaymentCurrency) => void
  size?: "sm" | "md"
  className?: string
}

const sizeClasses: Record<NonNullable<PaymentCurrencyToggleProps["size"]>, string> = {
  sm: "gap-1 p-1 text-[10px]",
  md: "gap-2.5 p-1.5 text-xs",
}

const buttonSizeClasses: Record<NonNullable<PaymentCurrencyToggleProps["size"]>, string> = {
  sm: "px-2 py-1",
  md: "px-3 py-1.5",
}

const currencyStyles: Record<PaymentCurrency, { active: string; inactive: string }> = {
  WLD: {
    active:
      "bg-gradient-to-r from-sky-400 via-indigo-400 to-purple-500 text-white shadow-[0_0_18px_rgba(80,140,255,0.35)]",
    inactive: "text-sky-200/80 hover:text-sky-50",
  },
  USDC: {
    active:
      "bg-gradient-to-r from-emerald-300 via-teal-400 to-sky-500 text-slate-900 shadow-[0_0_18px_rgba(66,211,173,0.35)]",
    inactive: "text-emerald-200/80 hover:text-emerald-50",
  },
}

export const PaymentCurrencyToggle = ({
  value,
  onChange,
  size = "md",
  className,
}: PaymentCurrencyToggleProps) => {
  const context = usePaymentCurrency()
  const currency = value ?? context.currency
  const handleChange = onChange ?? context.setCurrency

  return (
    <div
      className={cn(
        "flex items-center rounded-2xl border border-blue-500/30 bg-white/10 text-blue-100/80 backdrop-blur-md shadow-[inset_0_0_12px_rgba(15,23,42,0.35)]",
        sizeClasses[size],
        className,
      )}
    >
      {PAYMENT_CURRENCIES.map((option) => {
        const isActive = option === currency
        const styles = currencyStyles[option]

        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleChange(option)}
            className={cn(
              "flex-1 rounded-xl border border-transparent font-semibold uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-sky-400 focus-visible:ring-offset-transparent",
              buttonSizeClasses[size],
              isActive ? styles.active : styles.inactive,
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
