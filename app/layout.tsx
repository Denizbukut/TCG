import type React from "react"
import type { Metadata } from "next"
import "./globals.css"
import MiniKitProvider from "@/components/minikit-provider"
import ErudaLoader from "./eruda-loader"
import { ThemeProvider } from "@/components/theme-provider"
import { Inter } from "next/font/google"
import { AppProvider } from "@/contexts/auth-context"
import { WldPriceProvider } from "@/contexts/WldPriceContext"
import { AnixPriceProvider } from "@/contexts/AnixPriceContext"
import { Poppins } from "next/font/google"
import { I18nProvider } from "@/contexts/i18n-context"
import { PaymentCurrencyProvider } from "@/contexts/payment-currency-context"
import BottomNav from "@/components/bottom-nav"

const poppins = Poppins({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
})

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Anime World TCG",
  description: "Collect and trade anime cards",
  generator: "v0.dev",
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <MiniKitProvider>
        <body className={poppins.className}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
            <I18nProvider>
              <AppProvider>
                <WldPriceProvider>
                  <AnixPriceProvider>
                    <PaymentCurrencyProvider>
                      {children}
                      <BottomNav />
                    </PaymentCurrencyProvider>
                  </AnixPriceProvider>
                </WldPriceProvider>
              </AppProvider>
            </I18nProvider>
          </ThemeProvider>
        </body>
      </MiniKitProvider>
    </html>
  )
}
