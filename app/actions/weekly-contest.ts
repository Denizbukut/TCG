"use server"

import { createClient } from "@supabase/supabase-js"
import { WEEKLY_CONTEST_CONFIG, getContestEndDate, getContestStartDate } from "@/lib/weekly-contest-config"

function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: { persistSession: false },
  })
}

export async function incrementLegendaryDraw(walletAddress: string, count: number = 1) {
  const supabase = createSupabaseServer()
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
  const contestStart = getContestStartDate()
  const contestEnd = getContestEndDate()
  const now = new Date()

  // Prüfe ob Contest bereits gestartet ist
  if (now < contestStart) {
    return { success: false, error: "The contest has not started yet. No points can be awarded." }
  }

  // Prüfe ob Contest noch aktiv ist (nicht beendet)
  if (now > contestEnd) {
    return { success: false, error: "The contest has ended. No more entries allowed." }
  }

  // Calculate points: 80 points per legendary card (4x Bonus)
  const pointsPerCard = 80
  const totalPoints = pointsPerCard * count

  const { data, error } = await supabase
    .from("weekly_contest_entries")
    .select("legendary_count")
    .eq("wallet_address", walletAddress)
    .eq("week_start_date", weekStart)
    .single()

  if (error && error.code === "PGRST116") {
    await supabase.from("weekly_contest_entries").insert({
      wallet_address: walletAddress,
      week_start_date: weekStart,
      legendary_count: totalPoints,
    })
  } else if (data) {
    const currentCount = data?.legendary_count || 0
    const newCount = currentCount + totalPoints
    await supabase
      .from("weekly_contest_entries")
      .update({ legendary_count: newCount })
      .eq("wallet_address", walletAddress)
      .eq("week_start_date", weekStart)
  }

  return { success: true }
}

/**
 * Increment trade points for a user when they buy a card from another user
 * Only awards points if:
 * - Contest is active
 * - User is buying from a different user (not themselves)
 * - User hasn't been trading too frequently with the same seller (anti-fraud)
 * Points are based on card rarity:
 * - Common: 1 point
 * - Rare: 2 points
 * - Epic: 3 points
 * - Legendary: 5 points
 */
export async function incrementTradePoints(
  buyerWalletAddress: string,
  sellerWalletAddress: string,
  cardRarity: string
) {
  // Calculate points based on rarity
  let points = 0
  switch (cardRarity?.toLowerCase()) {
    case "common":
      points = 1
      break
    case "rare":
      points = 2
      break
    case "epic":
      points = 3
      break
    case "legendary":
      points = 5
      break
    default:
      // Fallback: treat as common if rarity is unknown
      points = 2
      console.warn(`⚠️ [incrementTradePoints] Unknown rarity "${cardRarity}", defaulting to 2 points (common)`)
  }
  
  console.log(`🎯 [incrementTradePoints] Called with buyer: ${buyerWalletAddress}, seller: ${sellerWalletAddress}, rarity: ${cardRarity}, points: ${points}`)
  
  const supabase = createSupabaseServer()
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
  const contestStart = getContestStartDate()
  const contestEnd = getContestEndDate()
  const now = new Date()

  console.log(`📅 [incrementTradePoints] Contest check - now: ${now.toISOString()}, contestStart: ${contestStart.toISOString()}, contestEnd: ${contestEnd.toISOString()}`)

  // Prüfe ob Contest bereits gestartet ist
  if (now < contestStart) {
    console.log(`❌ [incrementTradePoints] Contest has not started yet`)
    return { success: false, error: "The contest has not started yet. No points can be awarded." }
  }

  // Prüfe ob Contest noch aktiv ist (nicht beendet)
  if (now > contestEnd) {
    console.log(`❌ [incrementTradePoints] Contest has ended`)
    return { success: false, error: "The contest has ended. No more entries allowed." }
  }

  // Prüfe ob User von sich selbst kauft (sollte nicht passieren, aber sicherheitshalber)
  if (buyerWalletAddress.toLowerCase() === sellerWalletAddress.toLowerCase()) {
    console.log(`❌ [incrementTradePoints] User trying to buy from themselves`)
    return { success: false, error: "Cannot award points for buying your own card" }
  }

  // Betrugsprävention: Prüfe ob der Käufer bereits von diesem Verkäufer (seller_wallet_address) gekauft hat
  // STRENGE REGEL: Nur 1 Trade pro 24 Stunden mit dem GLEICHEN Verkäufer gibt Punkte
  // Das verhindert, dass Freunde sich gegenseitig immer wieder Karten abkaufen
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()
  
  // Normalisiere Wallet-Adressen für konsistente Vergleiche (wichtig für Betrugsprävention!)
  const normalizedBuyerAddress = buyerWalletAddress.toLowerCase()
  const normalizedSellerAddress = sellerWalletAddress.toLowerCase()
  
  console.log(`🔍 [incrementTradePoints] Checking for recent trades since ${twentyFourHoursAgo}`)
  console.log(`🔍 [incrementTradePoints] Normalized addresses - buyer: ${normalizedBuyerAddress}, seller: ${normalizedSellerAddress}`)
  
  // Prüfe ob der Käufer bereits in den letzten 24h von diesem spezifischen Verkäufer gekauft hat
  // WICHTIG: Verwende normalisierte Adressen für den Vergleich
  const { count: recentTradeCount, error: tradeCountError } = await supabase
    .from("trades")
    .select("*", { count: "exact", head: true })
    .eq("seller_wallet_address", normalizedSellerAddress) // Gleicher Verkäufer (normalisiert)
    .eq("buyer_wallet_address", normalizedBuyerAddress)   // Gleicher Käufer (normalisiert)
    .gte("created_at", twentyFourHoursAgo)

  if (tradeCountError) {
    console.error(`❌ [incrementTradePoints] Error checking recent trades:`, tradeCountError)
    // Bei Fehler trotzdem weitermachen, aber loggen
  } else {
    console.log(`📊 [incrementTradePoints] Recent trades found: ${recentTradeCount || 0}`)
  }

  if (recentTradeCount && recentTradeCount >= 1) {
    // Der Käufer hat bereits in den letzten 24h von diesem Verkäufer gekauft - keine Punkte vergeben
    console.log(`🚫 [incrementTradePoints] Anti-fraud: Blocking trade points. Buyer ${buyerWalletAddress} has already bought from seller ${sellerWalletAddress} ${recentTradeCount} time(s) in the last 24 hours.`)
    return { success: false, error: "You have already bought from this seller in the last 24 hours. Points not awarded to prevent fraud." }
  }

  console.log(`✅ [incrementTradePoints] Anti-fraud check passed, proceeding to update contest entry`)
  console.log(`📋 [incrementTradePoints] Looking for entry - wallet: ${buyerWalletAddress}, weekStart: ${weekStart}`)

  // Normalisiere wallet_address (lowercase) für konsistente Vergleiche
  const normalizedWalletAddress = buyerWalletAddress.toLowerCase()

  // Hole oder erstelle Contest-Eintrag
  // WICHTIG: trade_points fließen direkt in legendary_count
  // Zusätzlich: tracke Anzahl gekaufter Karten in trade_cards_purchased
  const { data, error } = await supabase
    .from("weekly_contest_entries")
    .select("legendary_count, trade_cards_purchased")
    .eq("wallet_address", normalizedWalletAddress)
    .eq("week_start_date", weekStart)
    .single()

  if (error && error.code === "PGRST116") {
    // Eintrag existiert nicht - erstelle neuen
    console.log(`➕ [incrementTradePoints] No entry found, creating new entry with ${points} points added to legendary_count`)
    const { error: insertError } = await supabase.from("weekly_contest_entries").insert({
      wallet_address: normalizedWalletAddress,
      week_start_date: weekStart,
      legendary_count: points, // Direkt zu legendary_count hinzufügen
      trade_cards_purchased: 1, // Erste Karte gekauft
    })
    if (insertError) {
      console.error(`❌ [incrementTradePoints] Error inserting new entry:`, insertError)
      return { success: false, error: `Failed to create contest entry: ${insertError.message}` }
    }
    console.log(`✅ [incrementTradePoints] Successfully created new entry with ${points} points in legendary_count and 1 card purchased`)
  } else if (data) {
    // Eintrag existiert - erhöhe legendary_count und trade_cards_purchased
    const currentCount = data?.legendary_count ?? 0
    const currentCardsPurchased = data?.trade_cards_purchased ?? 0
    const newCount = currentCount + points
    const newCardsPurchased = currentCardsPurchased + 1
    
    console.log(`📈 [incrementTradePoints] Entry found - current legendary_count: ${currentCount}, adding ${points} from trade, new total: ${newCount}`)
    console.log(`📊 [incrementTradePoints] Cards purchased: ${currentCardsPurchased} → ${newCardsPurchased}`)
    
    const { error: updateError } = await supabase
      .from("weekly_contest_entries")
      .update({ 
        legendary_count: newCount,
        trade_cards_purchased: newCardsPurchased 
      })
      .eq("wallet_address", normalizedWalletAddress)
      .eq("week_start_date", weekStart)
    
    if (updateError) {
      console.error(`❌ [incrementTradePoints] Error updating entry:`, updateError)
      return { success: false, error: `Failed to update contest entry: ${updateError.message}` }
    }
    console.log(`✅ [incrementTradePoints] Successfully updated legendary_count to ${newCount} points and trade_cards_purchased to ${newCardsPurchased}`)
  } else if (error) {
    console.error(`❌ [incrementTradePoints] Error fetching contest entry:`, error)
    return { success: false, error: `Failed to fetch contest entry: ${error.message}` }
  }

  console.log(`🎉 [incrementTradePoints] Successfully completed!`)
  return { success: true }
}

/**
 * Increment contest points for a user when they buy tickets in the ticket shop
 * Only awards points if contest is active
 */
export async function incrementTicketShopPoints(
  walletAddress: string,
  points: number = 2
) {
  console.log(`🎯 [incrementTicketShopPoints] Called with wallet: ${walletAddress}, points: ${points}`)
  
  const supabase = createSupabaseServer()
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
  const contestStart = getContestStartDate()
  const contestEnd = getContestEndDate()
  const now = new Date()

  console.log(`📅 [incrementTicketShopPoints] Contest check - now: ${now.toISOString()}, contestStart: ${contestStart.toISOString()}, contestEnd: ${contestEnd.toISOString()}`)

  // Prüfe ob Contest bereits gestartet ist
  if (now < contestStart) {
    console.log(`❌ [incrementTicketShopPoints] Contest has not started yet`)
    return { success: false, error: "The contest has not started yet. No points can be awarded." }
  }

  // Prüfe ob Contest noch aktiv ist (nicht beendet)
  if (now > contestEnd) {
    console.log(`❌ [incrementTicketShopPoints] Contest has ended`)
    return { success: false, error: "The contest has ended. No more entries allowed." }
  }

  // Normalisiere wallet_address (lowercase) für konsistente Vergleiche
  const normalizedWalletAddress = walletAddress.toLowerCase()

  console.log(`✅ [incrementTicketShopPoints] Contest is active, proceeding to update contest entry`)
  console.log(`📋 [incrementTicketShopPoints] Looking for entry - wallet: ${normalizedWalletAddress}, weekStart: ${weekStart}`)

  // Hole oder erstelle Contest-Eintrag
  // WICHTIG: trade_points fließen direkt in legendary_count
  const { data, error } = await supabase
    .from("weekly_contest_entries")
    .select("legendary_count")
    .eq("wallet_address", normalizedWalletAddress)
    .eq("week_start_date", weekStart)
    .single()

  if (error && error.code === "PGRST116") {
    // Eintrag existiert nicht - erstelle neuen
    console.log(`➕ [incrementTicketShopPoints] No entry found, creating new entry with ${points} points added to legendary_count`)
    const { error: insertError } = await supabase.from("weekly_contest_entries").insert({
      wallet_address: normalizedWalletAddress,
      week_start_date: weekStart,
      legendary_count: points, // Direkt zu legendary_count hinzufügen
    })
    if (insertError) {
      console.error(`❌ [incrementTicketShopPoints] Error inserting new entry:`, insertError)
      return { success: false, error: `Failed to create contest entry: ${insertError.message}` }
    }
    console.log(`✅ [incrementTicketShopPoints] Successfully created new entry with ${points} points in legendary_count`)
  } else if (data) {
    // Eintrag existiert - erhöhe legendary_count direkt
    const currentCount = data?.legendary_count ?? 0
    const newCount = currentCount + points
    console.log(`📈 [incrementTicketShopPoints] Entry found - current legendary_count: ${currentCount}, adding ${points} from ticket shop, new total: ${newCount}`)
    
    const { error: updateError } = await supabase
      .from("weekly_contest_entries")
      .update({ legendary_count: newCount })
      .eq("wallet_address", normalizedWalletAddress)
      .eq("week_start_date", weekStart)
    
    if (updateError) {
      console.error(`❌ [incrementTicketShopPoints] Error updating entry:`, updateError)
      return { success: false, error: `Failed to update contest entry: ${updateError.message}` }
    }
    console.log(`✅ [incrementTicketShopPoints] Successfully updated legendary_count to ${newCount} points`)
  } else if (error) {
    console.error(`❌ [incrementTicketShopPoints] Error fetching contest entry:`, error)
    return { success: false, error: `Failed to fetch contest entry: ${error.message}` }
  }

  console.log(`🎉 [incrementTicketShopPoints] Successfully completed!`)
  return { success: true }
}

/**
 * Increment contest points for a user when they buy a Special Deal
 * Only awards points if contest is active
 */
export async function incrementSpecialDealPoints(
  walletAddress: string,
  points: number = 100
) {
  console.log(`🎯 [incrementSpecialDealPoints] Called with wallet: ${walletAddress}, points: ${points}`)
  
  const supabase = createSupabaseServer()
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
  const contestStart = getContestStartDate()
  const contestEnd = getContestEndDate()
  const now = new Date()

  console.log(`📅 [incrementSpecialDealPoints] Contest check - now: ${now.toISOString()}, contestStart: ${contestStart.toISOString()}, contestEnd: ${contestEnd.toISOString()}`)

  // Prüfe ob Contest bereits gestartet ist
  if (now < contestStart) {
    console.log(`❌ [incrementSpecialDealPoints] Contest has not started yet`)
    return { success: false, error: "The contest has not started yet. No points can be awarded." }
  }

  // Prüfe ob Contest noch aktiv ist (nicht beendet)
  if (now > contestEnd) {
    console.log(`❌ [incrementSpecialDealPoints] Contest has ended`)
    return { success: false, error: "The contest has ended. No more entries allowed." }
  }

  // Normalisiere wallet_address (lowercase) für konsistente Vergleiche
  const normalizedWalletAddress = walletAddress.toLowerCase()

  console.log(`✅ [incrementSpecialDealPoints] Contest is active, proceeding to update contest entry`)
  console.log(`📋 [incrementSpecialDealPoints] Looking for entry - wallet: ${normalizedWalletAddress}, weekStart: ${weekStart}`)

  // Hole oder erstelle Contest-Eintrag
  // WICHTIG: special_deal_points fließen direkt in legendary_count
  const { data, error } = await supabase
    .from("weekly_contest_entries")
    .select("legendary_count")
    .eq("wallet_address", normalizedWalletAddress)
    .eq("week_start_date", weekStart)
    .single()

  if (error && error.code === "PGRST116") {
    // Eintrag existiert nicht - erstelle neuen
    console.log(`➕ [incrementSpecialDealPoints] No entry found, creating new entry with ${points} points added to legendary_count`)
    const { error: insertError } = await supabase.from("weekly_contest_entries").insert({
      wallet_address: normalizedWalletAddress,
      week_start_date: weekStart,
      legendary_count: points, // Direkt zu legendary_count hinzufügen
    })
    if (insertError) {
      console.error(`❌ [incrementSpecialDealPoints] Error inserting new entry:`, insertError)
      return { success: false, error: `Failed to create contest entry: ${insertError.message}` }
    }
    console.log(`✅ [incrementSpecialDealPoints] Successfully created new entry with ${points} points in legendary_count`)
  } else if (data) {
    // Eintrag existiert - erhöhe legendary_count
    const currentCount = data?.legendary_count ?? 0
    const newCount = currentCount + points
    
    console.log(`📈 [incrementSpecialDealPoints] Entry found - current legendary_count: ${currentCount}, adding ${points} from special deal, new total: ${newCount}`)
    
    const { error: updateError } = await supabase
      .from("weekly_contest_entries")
      .update({ legendary_count: newCount })
      .eq("wallet_address", normalizedWalletAddress)
      .eq("week_start_date", weekStart)
    
    if (updateError) {
      console.error(`❌ [incrementSpecialDealPoints] Error updating entry:`, updateError)
      return { success: false, error: `Failed to update contest entry: ${updateError.message}` }
    }
    console.log(`✅ [incrementSpecialDealPoints] Successfully updated legendary_count to ${newCount} points`)
  } else if (error) {
    console.error(`❌ [incrementSpecialDealPoints] Error fetching contest entry:`, error)
    return { success: false, error: `Failed to fetch contest entry: ${error.message}` }
  }

  console.log(`🎉 [incrementSpecialDealPoints] Successfully completed!`)
  return { success: true }
}

/**
 * Increment contest points for a user when they spin the Premium Lucky Wheel
 * Only awards points if contest is active
 */
export async function incrementPremiumWheelPoints(
  walletAddress: string,
  points: number = 25
) {
  console.log(`🎯 [incrementPremiumWheelPoints] Called with wallet: ${walletAddress}, points: ${points}`)
  
  const supabase = createSupabaseServer()
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
  const contestStart = getContestStartDate()
  const contestEnd = getContestEndDate()
  const now = new Date()

  console.log(`📅 [incrementPremiumWheelPoints] Contest check - now: ${now.toISOString()}, contestStart: ${contestStart.toISOString()}, contestEnd: ${contestEnd.toISOString()}`)

  // Prüfe ob Contest bereits gestartet ist
  if (now < contestStart) {
    console.log(`❌ [incrementPremiumWheelPoints] Contest has not started yet`)
    return { success: false, error: "The contest has not started yet. No points can be awarded." }
  }

  // Prüfe ob Contest noch aktiv ist (nicht beendet)
  if (now > contestEnd) {
    console.log(`❌ [incrementPremiumWheelPoints] Contest has ended`)
    return { success: false, error: "The contest has ended. No more entries allowed." }
  }

  // Normalisiere wallet_address (lowercase) für konsistente Vergleiche
  const normalizedWalletAddress = walletAddress.toLowerCase()

  console.log(`✅ [incrementPremiumWheelPoints] Contest is active, proceeding to update contest entry`)
  console.log(`📋 [incrementPremiumWheelPoints] Looking for entry - wallet: ${normalizedWalletAddress}, weekStart: ${weekStart}`)

  // Hole oder erstelle Contest-Eintrag
  // WICHTIG: Premium Wheel Punkte fließen direkt in legendary_count
  const { data, error } = await supabase
    .from("weekly_contest_entries")
    .select("legendary_count")
    .eq("wallet_address", normalizedWalletAddress)
    .eq("week_start_date", weekStart)
    .single()

  if (error && error.code === "PGRST116") {
    // Eintrag existiert nicht - erstelle neuen
    console.log(`➕ [incrementPremiumWheelPoints] No entry found, creating new entry with ${points} points added to legendary_count`)
    const { error: insertError } = await supabase.from("weekly_contest_entries").insert({
      wallet_address: normalizedWalletAddress,
      week_start_date: weekStart,
      legendary_count: points, // Direkt zu legendary_count hinzufügen
    })
    if (insertError) {
      console.error(`❌ [incrementPremiumWheelPoints] Error inserting new entry:`, insertError)
      return { success: false, error: `Failed to create contest entry: ${insertError.message}` }
    }
    console.log(`✅ [incrementPremiumWheelPoints] Successfully created new entry with ${points} points in legendary_count`)
  } else if (data) {
    // Eintrag existiert - erhöhe legendary_count direkt
    const currentCount = data?.legendary_count ?? 0
    const newCount = currentCount + points
    console.log(`📈 [incrementPremiumWheelPoints] Entry found - current legendary_count: ${currentCount}, adding ${points} from premium wheel spin, new total: ${newCount}`)
    
    const { error: updateError } = await supabase
      .from("weekly_contest_entries")
      .update({ legendary_count: newCount })
      .eq("wallet_address", normalizedWalletAddress)
      .eq("week_start_date", weekStart)
    
    if (updateError) {
      console.error(`❌ [incrementPremiumWheelPoints] Error updating entry:`, updateError)
      return { success: false, error: `Failed to update contest entry: ${updateError.message}` }
    }
    console.log(`✅ [incrementPremiumWheelPoints] Successfully updated legendary_count to ${newCount} points`)
  } else if (error) {
    console.error(`❌ [incrementPremiumWheelPoints] Error fetching contest entry:`, error)
    return { success: false, error: `Failed to fetch contest entry: ${error.message}` }
  }

  console.log(`🎉 [incrementPremiumWheelPoints] Successfully completed!`)
  return { success: true }
}

/**
 * Increment contest points for a user when they spin the Standard Lucky Wheel
 * Only awards points if contest is active
 */
export async function incrementStandardWheelPoints(
  walletAddress: string,
  points: number = 2
) {
  console.log(`🎯 [incrementStandardWheelPoints] Called with wallet: ${walletAddress}, points: ${points}`)
  
  const supabase = createSupabaseServer()
  const weekStart = WEEKLY_CONTEST_CONFIG.weekStart
  const contestStart = getContestStartDate()
  const contestEnd = getContestEndDate()
  const now = new Date()

  console.log(`📅 [incrementStandardWheelPoints] Contest check - now: ${now.toISOString()}, contestStart: ${contestStart.toISOString()}, contestEnd: ${contestEnd.toISOString()}`)

  // Prüfe ob Contest bereits gestartet ist
  if (now < contestStart) {
    console.log(`❌ [incrementStandardWheelPoints] Contest has not started yet`)
    return { success: false, error: "The contest has not started yet. No points can be awarded." }
  }

  // Prüfe ob Contest noch aktiv ist (nicht beendet)
  if (now > contestEnd) {
    console.log(`❌ [incrementStandardWheelPoints] Contest has ended`)
    return { success: false, error: "The contest has ended. No more entries allowed." }
  }

  // Normalisiere wallet_address (lowercase) für konsistente Vergleiche
  const normalizedWalletAddress = walletAddress.toLowerCase()

  console.log(`✅ [incrementStandardWheelPoints] Contest is active, proceeding to update contest entry`)
  console.log(`📋 [incrementStandardWheelPoints] Looking for entry - wallet: ${normalizedWalletAddress}, weekStart: ${weekStart}`)

  // Hole oder erstelle Contest-Eintrag
  // WICHTIG: Standard Wheel Punkte fließen direkt in legendary_count
  const { data, error } = await supabase
    .from("weekly_contest_entries")
    .select("legendary_count")
    .eq("wallet_address", normalizedWalletAddress)
    .eq("week_start_date", weekStart)
    .single()

  if (error && error.code === "PGRST116") {
    // Eintrag existiert nicht - erstelle neuen
    console.log(`➕ [incrementStandardWheelPoints] No entry found, creating new entry with ${points} points added to legendary_count`)
    const { error: insertError } = await supabase.from("weekly_contest_entries").insert({
      wallet_address: normalizedWalletAddress,
      week_start_date: weekStart,
      legendary_count: points, // Direkt zu legendary_count hinzufügen
    })
    if (insertError) {
      console.error(`❌ [incrementStandardWheelPoints] Error inserting new entry:`, insertError)
      return { success: false, error: `Failed to create contest entry: ${insertError.message}` }
    }
    console.log(`✅ [incrementStandardWheelPoints] Successfully created new entry with ${points} points in legendary_count`)
  } else if (data) {
    // Eintrag existiert - erhöhe legendary_count direkt
    const currentCount = data?.legendary_count ?? 0
    const newCount = currentCount + points
    console.log(`📈 [incrementStandardWheelPoints] Entry found - current legendary_count: ${currentCount}, adding ${points} from standard wheel spin, new total: ${newCount}`)
    
    const { error: updateError } = await supabase
      .from("weekly_contest_entries")
      .update({ legendary_count: newCount })
      .eq("wallet_address", normalizedWalletAddress)
      .eq("week_start_date", weekStart)
    
    if (updateError) {
      console.error(`❌ [incrementStandardWheelPoints] Error updating entry:`, updateError)
      return { success: false, error: `Failed to update contest entry: ${updateError.message}` }
    }
    console.log(`✅ [incrementStandardWheelPoints] Successfully updated legendary_count to ${newCount} points`)
  } else if (error) {
    console.error(`❌ [incrementStandardWheelPoints] Error fetching contest entry:`, error)
    return { success: false, error: `Failed to fetch contest entry: ${error.message}` }
  }

  console.log(`🎉 [incrementStandardWheelPoints] Successfully completed!`)
  return { success: true }
}