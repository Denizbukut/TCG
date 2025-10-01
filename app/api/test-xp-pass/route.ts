import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

function createSupabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(request: NextRequest) {
  try {
    const supabase = createSupabaseServer()
    
    // Test database connection
    const { data: testData, error: testError } = await supabase
      .from("xp_passes")
      .select("count")
      .limit(1)
    
    console.log("XP Passes table test:", { testData, testError })
    
    // Test user table
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("username")
      .limit(1)
    
    console.log("Users table test:", { userData, userError })
    
    // Test if we can insert into xp_passes
    const testExpiry = new Date()
    testExpiry.setDate(testExpiry.getDate() + 7)
    
    const { data: insertTestData, error: insertTestError } = await supabase
      .from("xp_passes")
      .insert({
        user_id: "test_user",
        active: true,
        purchased_at: new Date().toISOString(),
        expires_at: testExpiry.toISOString(),
      })
      .select()
    
    console.log("Insert test:", { insertTestData, insertTestError })
    
    // Clean up test data
    if (insertTestData) {
      await supabase
        .from("xp_passes")
        .delete()
        .eq("user_id", "test_user")
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "Database connection working",
      xpPassesTable: testError ? "error" : "accessible",
      usersTable: userError ? "error" : "accessible",
      insertTest: insertTestError ? "failed" : "success",
      userCount: userData?.length || 0,
      details: {
        xpPassesError: testError,
        usersError: userError,
        insertError: insertTestError
      }
    })
    
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: "Server error", 
      details: error 
    })
  }
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
    
    const supabase = createSupabaseServer()
    
    // Test creating an XP pass
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + 7)
    
    const { data, error } = await supabase.from("xp_passes").insert({
      user_id: username,
      active: true,
      purchased_at: new Date().toISOString(),
      expires_at: expiryDate.toISOString(),
    }).select()
    
    if (error) {
      return NextResponse.json({ 
        success: false, 
        error: "Failed to create XP pass", 
        details: error 
      })
    }
    
    return NextResponse.json({ 
      success: true, 
      message: "XP pass created successfully",
      data: data[0]
    })
    
  } catch (error) {
    return NextResponse.json({ 
      success: false, 
      error: "Server error", 
      details: error 
    })
  }
} 