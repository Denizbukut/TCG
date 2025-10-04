"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

function createSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function logXpPassPurchase(walletAddress: string, priceUsd: number, priceWld: string) {
  try {
    const supabase = createSupabaseServer()
    
    // Log to ticket_purchases table with special type for XP pass
    const { error: purchaseLogError } = await supabase.from("ticket_purchases").insert({
      username: walletAddress,
      ticket_type: "xp_pass",
      amount: 1,
      price_usd: priceUsd,
      price_wld: priceWld,
      discounted: false,
    })
    
    if (purchaseLogError) {
      console.error("Error logging XP pass purchase:", purchaseLogError)
      return { success: false, error: "Failed to log purchase" }
    }
    
    return { success: true }
  } catch (error) {
    console.error("Error in logXpPassPurchase:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function createXpPassPurchasesTable() {
  try {
    const supabase = createSupabaseServer()
    
    // Create the xp_pass_purchases table if it doesn't exist
    const { error } = await supabase.rpc('create_xp_pass_purchases_table')
    
    if (error) {
      console.error("Error creating xp_pass_purchases table:", error)
      return { success: false, error: error.message }
    }
    
    return { success: true }
  } catch (error) {
    console.error("Error in createXpPassPurchasesTable:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function purchaseXpPass(walletAddress: string) {
  try {
    console.log("Server: Purchasing XP pass for user:", walletAddress)
    const supabase = createSupabaseServer()
    
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 7) // 1 week
    
    console.log("Server: Expiry date:", expiryDate.toISOString())
    
    // Check for existing pass
    const { data: existingPass, error: checkError } = await supabase
      .from("xp_passes")
      .select("*")
      .eq("wallet_address", walletAddress)
      .single()
    
    console.log("Server: Check result:", { existingPass, checkError })
    
    let error
    
    if (existingPass) {
      console.log("Server: Updating existing XP pass")
      const { error: updateError } = await supabase
        .from("xp_passes")
        .update({
          active: true,
          purchased_at: new Date().toISOString(),
          expires_at: expiryDate.toISOString(),
        })
        .eq("wallet_address", walletAddress)
      
      error = updateError
      console.log("Server: Update result:", { error })
    } else {
      console.log("Server: Creating new XP pass")
      const { error: insertError } = await supabase.from("xp_passes").insert({
        wallet_address: walletAddress,
        active: true,
        purchased_at: new Date().toISOString(),
        expires_at: expiryDate.toISOString(),
      })
      
      error = insertError
      console.log("Server: Insert result:", { error })
    }
    
    if (error) {
      console.error("Server: Error purchasing XP pass:", error)
      return { success: false, error: "Failed to purchase XP pass" }
    }
    
    console.log("Server: XP pass purchased successfully")
    return { success: true, expiryDate: expiryDate.toISOString() }
  } catch (error) {
    console.error("Server: Error in purchaseXpPass:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
} 