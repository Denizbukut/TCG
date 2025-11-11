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
  sm: "gap-1 p-1 text-[11px]",
  md: "gap-2 p-1.5 text-xs",
}

const buttonSizeClasses: Record<NonNullable<PaymentCurrencyToggleProps["size"]>, string> = {
  sm: "px-2 py-1",
  md: "px-3 py-1.5",
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
        "flex items-center rounded-xl border border-yellow-400/50 bg-black/40 text-yellow-200 backdrop-blur-sm",
        sizeClasses[size],
        className,
      )}
    >
      {PAYMENT_CURRENCIES.map((option) => {
        const isActive = option === currency
        return (
          <button
            key={option}
            type="button"
            aria-pressed={isActive}
            onClick={() => handleChange(option)}
            className={cn(
              "flex-1 rounded-lg font-semibold uppercase transition focus:outline-none focus-visible:ring focus-visible:ring-yellow-400",
              buttonSizeClasses[size],
              isActive
                ? "bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 text-black shadow-[inset_0_0_12px_rgba(0,0,0,0.35)]"
                : "text-yellow-300 hover:text-yellow-50",
            )}
          >
            {option}
          </button>
        )
      })}
    </div>
  )
}
