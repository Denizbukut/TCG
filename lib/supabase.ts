import { createClient } from "@supabase/supabase-js"

// Singleton pattern for browser client
let browserClient: ReturnType<typeof createClient> | null = null

export function getSupabaseBrowserClient() {
  if (browserClient) return browserClient

  // Only create a new client if one doesn't exist
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Supabase URL or Anon Key is missing")
    return null
  }

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  })

  return browserClient
}

// Server-side client function
export function getSupabaseServerClient() {
  // Try server-side env vars first, fallback to public vars if needed
  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl) {
    console.error("Supabase URL is missing. Missing environment variables: SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL")
    throw new Error(`Supabase URL is missing. Please set SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL in your environment variables.`)
  }

  if (!supabaseServiceKey) {
    console.error("Supabase Service Role Key is missing. Please set SUPABASE_SERVICE_ROLE_KEY in your environment variables.")
    throw new Error(`Supabase Service Role Key is missing. Please set SUPABASE_SERVICE_ROLE_KEY in your environment variables.`)
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      persistSession: false,
    },
  })
}
