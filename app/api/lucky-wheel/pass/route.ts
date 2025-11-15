import { NextResponse } from "next/server"
import { getSupabaseServerClient } from "@/lib/supabase"

export async function POST(req: Request) {
  try {
    const { walletAddress, passType } = await req.json()

    if (!walletAddress || !passType) {
      return NextResponse.json(
        { success: false, error: "Missing parameters" },
        { status: 400 },
      )
    }

    if (passType !== "premium" && passType !== "xp") {
      return NextResponse.json(
        { success: false, error: "Invalid pass type. Must be 'premium' or 'xp'" },
        { status: 400 },
      )
    }

    const supabase = getSupabaseServerClient()
    if (!supabase) {
      return NextResponse.json(
        { success: false, error: "Database connection failed" },
        { status: 500 },
      )
    }

    const tableName = passType === "premium" ? "premium_passes" : "xp_passes"

    // Use UPSERT with atomic operation to ensure both users get a pass if they both win
    // The UNIQUE constraint on wallet_address ensures each user can only have one pass
    // This means: User A and User B can both get passes simultaneously (different wallet_addresses)
    // But if the same user tries twice, only one pass is created/updated
    
    // Calculate base expiry date (7 days from now)
    const baseExpiryDate = new Date()
    baseExpiryDate.setDate(baseExpiryDate.getDate() + 7)
    
    // Try to get existing pass to extend expiry if it exists and is still valid
    // This is done BEFORE the upsert to avoid race conditions in expiry calculation
    const { data: existingPass } = await supabase
      .from(tableName)
      .select("expires_at")
      .eq("wallet_address", walletAddress)
      .maybeSingle()

    // Calculate final expiry date
    let expiryDate = baseExpiryDate
    
    if (existingPass && existingPass.expires_at) {
      const currentExpiry = new Date(existingPass.expires_at)
      const now = new Date()
      
      // If current expiry is in the future, extend from that date
      if (currentExpiry > now) {
        expiryDate = new Date(currentExpiry)
        expiryDate.setDate(expiryDate.getDate() + 7)
      }
      // Otherwise use baseExpiryDate (already set above)
    }

    // Use UPSERT which is atomic - ensures both users can get passes simultaneously
    // Each user has a unique wallet_address, so there's no conflict between different users
    const passData = {
      wallet_address: walletAddress,
      active: true,
      purchased_at: new Date().toISOString(),
      expires_at: expiryDate.toISOString(),
      from_lucky_wheel: true,
    }

    // Atomic upsert: if user has no pass, creates one; if user has pass, updates it
    // This works for multiple users simultaneously because each has unique wallet_address
    const { data: upsertData, error: upsertError } = await supabase
      .from(tableName)
      .upsert(passData, {
        onConflict: "wallet_address",
        ignoreDuplicates: false,
      })
      .select()
      .single()

    if (upsertError) {
      console.error("Error activating pass (upsert):", upsertError)
      
      // If there's a conflict (shouldn't happen with unique wallet_address per user),
      // retry with update to ensure the pass is activated
      const { error: updateError } = await supabase
        .from(tableName)
        .update({
          active: true,
          purchased_at: new Date().toISOString(),
          expires_at: expiryDate.toISOString(),
          from_lucky_wheel: true,
        })
        .eq("wallet_address", walletAddress)

      if (updateError) {
        console.error("Error updating pass after upsert failure:", updateError)
        return NextResponse.json(
          { success: false, error: `Failed to activate ${passType} pass` },
          { status: 500 },
        )
      }
    }

    // For premium pass, also update user's has_premium status
    if (passType === "premium") {
      const { error: updateUserError } = await supabase
        .from("users")
        .update({ has_premium: true })
        .eq("wallet_address", walletAddress)

      if (updateUserError) {
        console.error("Error updating user premium status:", updateUserError)
        // Don't fail the entire operation, just log it
      }
    }

    return NextResponse.json({
      success: true,
      passType,
      expiryDate: expiryDate.toISOString(),
      message: `${passType === "premium" ? "Premium" : "XP"} Pass activated successfully`,
    })
  } catch (error) {
    console.error("Lucky wheel pass reward error:", error)
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "An unexpected error occurred while activating the pass.",
      },
      { status: 500 },
    )
  }
}

