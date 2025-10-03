"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

// Funktion, um Punkte für eine Kartenrarität zu erhalten
function getScoreForRarity(rarity: string): number {
  switch (rarity) {
    case "legendary":
      return 100
    case "epic":
      return 40
    case "rare":
      return 25
    case "common":
      return 5
    // case "wbc":
    //   return 250 // WBC-Karten sind sehr wertvoll // Commented out
    default:
      return 0
  }
}

// Create a server-side Supabase client
function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: {
      persistSession: false,
    },
  })
}

export async function updateScoreForCards(walletAddress: string, cards: any[]) {
  try {
    const supabase = createSupabaseServer()

    // Berechne die Gesamtpunktzahl für alle Karten
    const totalScoreToAdd = cards.reduce((total, card) => {
      const points = getScoreForRarity(card.rarity)
      console.log(`[updateScoreForCards] Card ${card.name} (${card.rarity}) worth ${points} points`)
      return total + points
    }, 0)

    // Hole den aktuellen Score des Benutzers
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("score")
      .eq("wallet_address", walletAddress)
      .maybeSingle()

    if (userError) {
      console.error("[updateScoreForCards] Error fetching user score:", userError)
      return { success: false, error: "Failed to fetch user score" }
    }

    // Berechne den neuen Score
    const currentScore = userData?.score || 0
    const newScore = currentScore + totalScoreToAdd

    console.log(
      `[updateScoreForCards] UPDATING SCORE: ${walletAddress} - Current: ${currentScore}, Adding: ${totalScoreToAdd}, New: ${newScore}`,
    )

    // Aktualisiere den Score in der Datenbank
    const { error: updateError } = await supabase.from("users").update({ score: newScore }).eq("wallet_address", walletAddress)

    if (updateError) {
      console.error("[updateScoreForCards] Error updating score:", updateError)
      return { success: false, error: "Failed to update score" }
    }

    // Überprüfe, ob der Score tatsächlich aktualisiert wurde
    const { data: verifyData, error: verifyError } = await supabase
      .from("users")
      .select("score")
      .eq("wallet_address", walletAddress)
      .maybeSingle()

    if (verifyError) {
      console.error("[updateScoreForCards] Error verifying score update:", verifyError)
    } else if (verifyData) {
      console.log(`[updateScoreForCards] SCORE VERIFICATION: Expected ${newScore}, Actual ${verifyData.score}`)
      if (verifyData.score !== newScore) {
        console.error(
          `[updateScoreForCards] Score verification failed! Expected: ${newScore}, Actual: ${verifyData.score}`,
        )
      } else {
        console.log("[updateScoreForCards] Score successfully updated and verified!")
      }
    }

    // Revalidiere den Leaderboard-Pfad
    revalidatePath("/leaderboard")

    return {
      success: true,
      previousScore: currentScore,
      addedScore: totalScoreToAdd,
      newScore: newScore,
    }
  } catch (error) {
    console.error("[updateScoreForCards] Error updating score:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Funktion für Level-Up-Punkte
export async function updateScoreForLevelUp(walletAddress: string) {
  try {
    const supabase = createSupabaseServer()
    const levelUpPoints = 100

    // Hole den aktuellen Score des Benutzers
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("score")
      .eq("wallet_address", walletAddress)
      .maybeSingle()

    if (userError) {
      console.error("[updateScoreForLevelUp] Error fetching user score:", userError)
      return { success: false, error: "Failed to fetch user score" }
    }

    // Berechne den neuen Score
    const currentScore = userData?.score || 0
    const newScore = currentScore + levelUpPoints

    console.log(
      `[updateScoreForLevelUp] UPDATING SCORE FOR LEVEL UP: ${walletAddress} - Current: ${currentScore}, Adding: ${levelUpPoints}, New: ${newScore}`,
    )

    // Aktualisiere den Score in der Datenbank
    const { error: updateError } = await supabase.from("users").update({ score: newScore }).eq("wallet_address", walletAddress)

    if (updateError) {
      console.error("[updateScoreForLevelUp] Error updating score:", updateError)
      return { success: false, error: "Failed to update score" }
    }

    // Revalidiere den Leaderboard-Pfad
    revalidatePath("/leaderboard")

    return {
      success: true,
      previousScore: currentScore,
      addedScore: levelUpPoints,
      newScore: newScore,
    }
  } catch (error) {
    console.error("[updateScoreForLevelUp] Error updating score for level up:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}
