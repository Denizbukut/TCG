import { Tokens, tokenToDecimals } from "@worldcoin/minikit-js"

export type PaymentCurrency = "WLD" | "USDC" | "ANIX"

export const PAYMENT_RECIPIENT = "0xDb4D9195EAcE195440fbBf6f80cA954bf782468E"
export const WLD_TOKEN_ADDRESS = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003"
export const USDC_TOKEN_ADDRESS = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1"
export const ANIX_TOKEN_ADDRESS = "0xcd7Abb83918984A0Bb10a02f8656923041777369"
export const USDC_DECIMALS = 6
export const ANIX_DECIMALS = 18

export const PAYMENT_CURRENCIES: PaymentCurrency[] = ["WLD", "USDC", "ANIX"]

export const ERC20_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
] as const

const TOKEN_ADDRESSES: Record<PaymentCurrency, string> = {
  WLD: WLD_TOKEN_ADDRESS,
  USDC: USDC_TOKEN_ADDRESS,
  ANIX: ANIX_TOKEN_ADDRESS,
}

const TOKEN_DECIMALS: Record<PaymentCurrency, number> = {
  WLD: 18,
  USDC: USDC_DECIMALS,
  ANIX: ANIX_DECIMALS,
}

const TOKEN_FRACTION_DIGITS: Record<PaymentCurrency, { minimum: number; maximum: number }> = {
  WLD: { minimum: 2, maximum: 2 },
  USDC: { minimum: 2, maximum: 2 },
  ANIX: { minimum: 3, maximum: 3 },
}

const TOKEN_SYMBOL: Record<PaymentCurrency, Tokens | null> = {
  WLD: Tokens.WLD,
  USDC: Tokens.USDCE,
  ANIX: null,
}

export interface TransferDetails {
  tokenAddress: string
  rawAmount: string
  numericAmount: number
  displayAmount: string
  currency: PaymentCurrency
  miniKitSymbol?: Tokens | null
  miniKitTokenAmount?: string
}

const formatAmount = (value: number, currency: PaymentCurrency) => {
  const digits = TOKEN_FRACTION_DIGITS[currency]
  return value.toLocaleString(undefined, {
    minimumFractionDigits: digits.minimum,
    maximumFractionDigits: digits.maximum,
  })
}

const toUsdcUnits = (amount: number) => {
  const scaled = Math.round(amount * 10 ** USDC_DECIMALS)
  return BigInt(scaled).toString()
}

const toTokenUnits = (amount: number, decimals: number) => {
  if (!Number.isFinite(amount)) return "0"
  const fixed = amount.toFixed(decimals)
  const normalized = fixed.replace(".", "")
  const trimmed = normalized.replace(/^0+/, "")
  return trimmed.length > 0 ? trimmed : "0"
}

export const getTransferDetails = ({
  usdAmount,
  currency,
  wldPrice,
  anixPrice,
}: {
  usdAmount: number
  currency: PaymentCurrency
  wldPrice?: number | null
  anixPrice?: number | null
}): TransferDetails => {
  const sanitizedUsd = Number.isFinite(usdAmount) ? Math.max(0, usdAmount) : 0
  const miniKitSymbol = TOKEN_SYMBOL[currency]

  try {
    if (currency === "USDC") {
      const numericAmount = parseFloat(sanitizedUsd.toFixed(TOKEN_FRACTION_DIGITS.USDC.maximum))
      const rawAmount = toUsdcUnits(numericAmount)
      const miniKitTokenAmount = Math.round(numericAmount * 10 ** USDC_DECIMALS).toString()
      return {
        tokenAddress: TOKEN_ADDRESSES.USDC,
        rawAmount,
        numericAmount,
        displayAmount: `${formatAmount(numericAmount, "USDC")} USDC`,
        currency,
        miniKitSymbol,
        miniKitTokenAmount,
      }
    }
    if (currency === "ANIX") {
      const effectiveAnixPrice = anixPrice && anixPrice > 0 ? anixPrice : 1
      const tokenAmount = effectiveAnixPrice > 0 ? sanitizedUsd / effectiveAnixPrice : sanitizedUsd
      const numericAmount = parseFloat(tokenAmount.toFixed(TOKEN_FRACTION_DIGITS.ANIX.maximum))
      const rawAmount = toTokenUnits(numericAmount, TOKEN_DECIMALS.ANIX)

      return {
        tokenAddress: TOKEN_ADDRESSES.ANIX,
        rawAmount,
        numericAmount,
        displayAmount: `${formatAmount(numericAmount, "ANIX")} ANIX`,
        currency,
        miniKitSymbol,
        miniKitTokenAmount: rawAmount,
      }
    }

    const effectivePrice = wldPrice && wldPrice > 0 ? wldPrice : 1
    const tokenAmount = sanitizedUsd / effectivePrice
    const numericAmount = parseFloat(tokenAmount.toFixed(TOKEN_FRACTION_DIGITS.WLD.maximum))
    const rawAmount = tokenToDecimals(numericAmount, Tokens.WLD).toString()

    return {
      tokenAddress: TOKEN_ADDRESSES.WLD,
      rawAmount,
      numericAmount,
      displayAmount: `${formatAmount(numericAmount, "WLD")} WLD`,
      currency,
      miniKitSymbol,
      miniKitTokenAmount: rawAmount,
    }
  } catch (error) {
    console.error("Failed to build transfer details", { usdAmount, currency, error })
  }

  const fallbackDisplay = `$${sanitizedUsd.toFixed(2)} USD`
  return {
    tokenAddress: TOKEN_ADDRESSES[currency],
    rawAmount: "0",
    numericAmount: sanitizedUsd,
    displayAmount: fallbackDisplay,
    currency,
    miniKitSymbol,
  }
}

export const formatPaymentAmount = (numericAmount: number, currency: PaymentCurrency) => {
  return `${formatAmount(numericAmount, currency)} ${currency}`
}
