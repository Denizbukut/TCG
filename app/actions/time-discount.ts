"use server"

function createSupabaseServer() {
  const { createClient } = require("@supabase/supabase-js")
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function getActiveTimeDiscount() {
  try {
    const supabase = createSupabaseServer()
    
    // Use maybeSingle() instead of single() to handle 0 rows gracefully
    const { data, error } = await supabase
      .from("discount_configs")
      .select("*")
      .eq("name", "time_based_15_percent_4h")
      .eq("is_active", true)
      .maybeSingle()

    // Only log errors that are not "no rows found" (PGRST116)
    if (error && error.code !== 'PGRST116') {
      console.log("Database error:", error)
      return { success: false, data: null }
    }

    if (!data) {
      // No discount found - this is normal, don't log as error
      return { success: false, data: null }
    }

    console.log("Found discount:", data)

    // Check if discount is still valid (within time window)
    if (data.end_time) {
      const now = new Date()
      const endTime = new Date(data.end_time)
      
      console.log("Current time:", now.toISOString())
      console.log("End time:", endTime.toISOString())
      console.log("Is expired:", now > endTime)
      
      if (now > endTime) {
        console.log("Discount expired, deactivating...")
        // Discount has expired, deactivate it
        await supabase
          .from("discount_configs")
          .update({ is_active: false })
          .eq("name", "time_based_15_percent_4h")
        
        return { success: false, data: null }
      }
    }

    console.log("Discount is valid and active")
    return { success: true, data }
  } catch (error) {
    console.error("Error getting time discount:", error)
    return { success: false, data: null }
  }
}

export async function activateTimeDiscount() {
  try {
    const supabase = createSupabaseServer()
    
    const { error } = await supabase
      .from("discount_configs")
      .upsert({
        name: "time_based_15_percent_4h",
        value: 0.15,
        is_active: true,
        start_time: new Date().toISOString(),
        end_time: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString() // 4 hours from now
      })

    if (error) {
      console.error("Error activating time discount:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in activateTimeDiscount:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

export async function deactivateTimeDiscount() {
  try {
    const supabase = createSupabaseServer()
    
    const { error } = await supabase
      .from("discount_configs")
      .update({ is_active: false })
      .eq("name", "time_based_15_percent_4h")

    if (error) {
      console.error("Error deactivating time discount:", error)
      return { success: false, error: error.message }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in deactivateTimeDiscount:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Debug function to check current discount status
export async function debugTimeDiscount() {
  try {
    const supabase = createSupabaseServer()
    
    const { data, error } = await supabase
      .from("discount_configs")
      .select("*")
      .eq("name", "time_based_15_percent_4h")
      .single()

    if (error) {
      return { success: false, error: error.message, data: null }
    }

    const now = new Date()
    const endTime = data?.end_time ? new Date(data.end_time) : null
    
    return {
      success: true,
      data: {
        ...data,
        currentTime: now.toISOString(),
        endTime: endTime?.toISOString(),
        isExpired: endTime ? now > endTime : false,
        timeLeft: endTime ? endTime.getTime() - now.getTime() : null
      }
    }
  } catch (error) {
    console.error("Error in debugTimeDiscount:", error)
    return { success: false, error: "An unexpected error occurred", data: null }
  }
} 