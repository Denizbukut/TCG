import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function createSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()
    
    if (!username) {
      return NextResponse.json({ 
        success: false, 
        error: "Username required" 
      })
    }
    
    console.log("Simulating XP pass purchase for user:", username)
    const supabase = createSupabaseServer()
    
    // Simulate XP pass purchase (1 week duration)
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 7)
    
    console.log("Creating XP pass with expiry:", expiryDate.toISOString())
    
    // Check for existing pass
    const { data: existingPass, error: checkError } = await supabase
      .from("xp_passes")
      .select("*")
      .eq("user_id", username)
      .single()
    
    let result
    
    if (existingPass) {
      // Update existing pass
      const { data, error } = await supabase
        .from("xp_passes")
        .update({
          active: true,
          purchased_at: new Date().toISOString(),
          expires_at: expiryDate.toISOString(),
        })
        .eq("user_id", username)
        .select()
      
      result = { data, error }
    } else {
      // Create new pass
      const { data, error } = await supabase.from("xp_passes").insert({
        user_id: username,
        active: true,
        purchased_at: new Date().toISOString(),
        expires_at: expiryDate.toISOString(),
      }).select()
      
      result = { data, error }
    }
    
    if (result.error) {
      console.error("Error creating/updating XP pass:", result.error)
      return NextResponse.json({ 
        success: false, 
        error: "Failed to create XP pass", 
        details: result.error 
      })
    }
    
    console.log("XP pass created/updated successfully:", result.data)
    
    // Log the purchase
    const { error: logError } = await supabase.from("ticket_purchases").insert({
      username: username,
      ticket_type: "xp_pass",
      amount: 1,
      price_usd: 5.0,
      price_wld: "5.0",
      discounted: false,
    })
    
    if (logError) {
      console.error("Error logging purchase:", logError)
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "XP pass purchase simulated successfully",
      data: result.data?.[0] || null,
      expiryDate: expiryDate.toISOString(),
      purchaseLogged: !logError
    })
    
  } catch (error) {
    console.error("Error in simulate XP purchase:", error)
    return NextResponse.json({ 
      success: false, 
      error: "Server error", 
      details: error 
    })
  }
} 