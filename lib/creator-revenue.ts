/**
 * Creator Revenue Calculation
 * 
 * Helper functions for calculating creator revenue shares based on card rarity
 */

export type Rarity = "basic" | "common" | "rare" | "epic" | "legendary" | "godlike" | "goat" | "wbc"

/**
 * Get revenue split for Daily Deal / Special Deal
 * Returns: { devShare: number, creatorShare: number }
 */
export function getDealRevenueSplit(rarity: Rarity): { devShare: number; creatorShare: number } {
  const splits: Record<string, { devShare: number; creatorShare: number }> = {
    basic: { devShare: 0.99, creatorShare: 0.01 }, // 1% for basic
    common: { devShare: 0.95, creatorShare: 0.05 },
    rare: { devShare: 0.85, creatorShare: 0.15 },
    epic: { devShare: 0.70, creatorShare: 0.30 },
    legendary: { devShare: 0.50, creatorShare: 0.50 },
    godlike: { devShare: 0.50, creatorShare: 0.50 }, // Same as legendary
    goat: { devShare: 0.50, creatorShare: 0.50 }, // Same as legendary
    wbc: { devShare: 0.50, creatorShare: 0.50 }, // Same as legendary
  }

  return splits[rarity.toLowerCase()] || splits.common
}

/**
 * Get revenue split for Market Listing
 * Returns: { sellerShare: number, devShare: number, creatorShare: number }
 */
export function getMarketRevenueSplit(rarity: Rarity): { sellerShare: number; devShare: number; creatorShare: number } {
  const splits: Record<string, { sellerShare: number; devShare: number; creatorShare: number }> = {
    basic: { sellerShare: 0.90, devShare: 0.10, creatorShare: 0.00 }, // 0% for basic
    common: { sellerShare: 0.90, devShare: 0.09, creatorShare: 0.01 },
    rare: { sellerShare: 0.90, devShare: 0.08, creatorShare: 0.02 },
    epic: { sellerShare: 0.90, devShare: 0.07, creatorShare: 0.03 },
    legendary: { sellerShare: 0.90, devShare: 0.05, creatorShare: 0.05 },
    godlike: { sellerShare: 0.90, devShare: 0.05, creatorShare: 0.05 }, // Same as legendary
    goat: { sellerShare: 0.90, devShare: 0.05, creatorShare: 0.05 }, // Same as legendary
    wbc: { sellerShare: 0.90, devShare: 0.05, creatorShare: 0.05 }, // Same as legendary
  }

  return splits[rarity.toLowerCase()] || splits.common
}

/**
 * Calculate creator revenue from deal price
 */
export function calculateCreatorDealRevenue(price: number, rarity: Rarity): number {
  const split = getDealRevenueSplit(rarity)
  return price * split.creatorShare
}

/**
 * Calculate creator revenue from market sale
 */
export function calculateCreatorMarketRevenue(price: number, rarity: Rarity): number {
  const split = getMarketRevenueSplit(rarity)
  return price * split.creatorShare
}

/**
 * Calculate dev revenue from market sale
 */
export function calculateDevMarketRevenue(price: number, rarity: Rarity): number {
  const split = getMarketRevenueSplit(rarity)
  return price * split.devShare
}
