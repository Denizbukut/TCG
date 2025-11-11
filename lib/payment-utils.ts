import { Tokens, tokenToDecimals } from "@worldcoin/minikit-js"

export type PaymentCurrency = "WLD" | "USDC"

export const PAYMENT_RECIPIENT = "0xDb4D9195EAcE195440fbBf6f80cA954bf782468E"
export const WLD_TOKEN_ADDRESS = "0x2cFc85d8E48F8EAB294be644d9E25C3030863003"
export const USDC_TOKEN_ADDRESS = "0x79A02482A880bCE3F13e09Da970dC34db4CD24d1"
export const USDC_DECIMALS = 6

export const PAYMENT_CURRENCIES: PaymentCurrency[] = ["WLD", "USDC"]

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
}

const TOKEN_DECIMALS: Record<PaymentCurrency, number> = {
  WLD: 18,
  USDC: USDC_DECIMALS,
}

const TOKEN_FRACTION_DIGITS: Record<PaymentCurrency, { minimum: number; maximum: number }> = {
  WLD: { minimum: 3, maximum: 3 },
  USDC: { minimum: 2, maximum: 2 },
}

const TOKEN_SYMBOL: Record<PaymentCurrency, Tokens> = {
  WLD: Tokens.WLD,
  USDC: Tokens.USDCE,
}

export interface TransferDetails {
  tokenAddress: string
  rawAmount: string
  numericAmount: number
  displayAmount: string
  currency: PaymentCurrency
  miniKitSymbol: Tokens
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

export const getTransferDetails = ({
  usdAmount,
  currency,
  wldPrice,
}: {
  usdAmount: number
  currency: PaymentCurrency
  wldPrice?: number | null
}): TransferDetails => {
  const sanitizedUsd = Number.isFinite(usdAmount) ? Math.max(0, usdAmount) : 0
  const miniKitSymbol = TOKEN_SYMBOL[currency]

  if (currency === "USDC") {
    const numericAmount = parseFloat(sanitizedUsd.toFixed(TOKEN_FRACTION_DIGITS.USDC.maximum))
    const rawAmount = toUsdcUnits(numericAmount)
    return {
      tokenAddress: TOKEN_ADDRESSES.USDC,
      rawAmount,
      numericAmount,
      displayAmount: `${formatAmount(numericAmount, "USDC")} USDC`,
      currency,
      miniKitSymbol,
      miniKitTokenAmount: tokenToDecimals(numericAmount, Tokens.USDCE).toString(),
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
}

export const formatPaymentAmount = (numericAmount: number, currency: PaymentCurrency) => {
  return `${formatAmount(numericAmount, currency)} ${currency}`
}
