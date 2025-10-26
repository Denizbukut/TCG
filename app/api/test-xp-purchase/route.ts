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
    
    console.log("Testing XP pass purchase for user:", username)
    const supabase = createSupabaseServer()
    
    // Test creating an XP pass directly
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 7) // 1 week
    
    console.log("Creating XP pass with expiry:", expiryDate.toISOString())
    
    const { data, error } = await supabase.from("xp_passes").insert({
      user_id: username,
      active: true,
      purchased_at: new Date().toISOString(),
      expires_at: expiryDate.toISOString(),
    }).select()
    
    if (error) {
      console.error("Error creating XP pass:", error)
      return NextResponse.json({ 
        success: false, 
        error: "Failed to create XP pass", 
        details: error 
      })
    }
    
    console.log("XP pass created successfully:", data[0])
    
    // Also log the purchase
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
      message: "XP pass created and logged successfully",
      data: data[0],
      expiryDate: expiryDate.toISOString()
    })
    
  } catch (error) {
    console.error("Error in test XP purchase:", error)
    return NextResponse.json({ 
      success: false, 
      error: "Server error", 
      details: error 
    })
  }
} 