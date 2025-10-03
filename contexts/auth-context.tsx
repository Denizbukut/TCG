"use client"

import type React from "react"
import { createContext, useContext, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase"

type User = {
  wallet_address: string
  username: string
  tickets: number
  elite_tickets: number
  icon_tickets: number // NEW: icon tickets
  coins: number
  level: number
  experience: number
  nextLevelExp: number
  has_premium?: boolean
  score?: number // Hinzufügen des score-Felds
  clan_id?: number
  avatar_id?: number // NEW: avatar_id hinzufügen
}

type AuthContextType = {
  user: User | null
  loading: boolean
  login: (walletAddress: string, username?: string) => Promise<{ success: boolean; error?: string }>
  logout: () => void
  updateUserTickets: (newTicketCount: number, newEliteTicketCount?: number, newIconTicketCount?: number) => void
  updateUserCoins: (newCoinCount: number) => void
  updateUserExp: (expToAdd: number) => Promise<{ leveledUp: boolean; newLevel?: number }>
  setUserPremium: (hasPremium: boolean) => void
  refreshUserData: () => Promise<void>
  updateUserScore: (scoreToAdd: number) => void // Neue Methode zum Aktualisieren des Scores
  updateUserAvatar: (avatarId: number) => Promise<void> // NEW: Avatar aktualisieren
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  login: async () => ({ success: false }),
  logout: () => {},
  updateUserTickets: () => {},
  updateUserCoins: () => {},
  updateUserExp: async () => ({ leveledUp: false }),
  setUserPremium: () => {},
  refreshUserData: async () => {},
  updateUserScore: () => {}, // Standardimplementierung
  updateUserAvatar: async () => {}, // NEW: Standardimplementierung
})

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(false)

  // Initialize Supabase client once when the provider mounts
  useEffect(() => {
    // Just initialize the client once to prevent multiple instances
    getSupabaseBrowserClient()
  }, [])

  // Load user data from database
  const loadUserDataFromDatabase = async (walletAddress: string) => {
    try {
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        console.error("Failed to initialize Supabase client")
        return null
      }

      // Add timeout to prevent infinite loading
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database request timeout')), 10000); // 10 seconds timeout
      });


      // Use new schema (wallet_address as primary key)
      let dataPromise = supabase
        .from("users")
        .select("wallet_address, username, tickets, elite_tickets, icon_tickets, coins, level, world_id, experience, next_level_exp, has_premium, score, clan_id, avatar_id")
        .eq("wallet_address", walletAddress)
        .single();

      let { data, error } = await Promise.race([dataPromise, timeoutPromise]) as any;


      // Add a type assertion for data to include icon_tickets
      const typedData = data as (typeof data & { icon_tickets?: number })

      if (error) {
        console.error("Error loading user data from database:", error)
        console.error("Error details:", {
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code
        })
        return null
      }

      if (typedData) {
        // Transform database fields to match our User type with proper type assertions
        const userData: User = {
          wallet_address: String(typedData.wallet_address || ""),
          username: String(typedData.username || ""),
          tickets: Number(typedData.tickets || 0),
          elite_tickets: Number(typedData.elite_tickets || 0),
          icon_tickets: Number(typedData.icon_tickets || 0), // NEW
          coins: Number(typedData.coins || 0),
          level: Number(typedData.level || 1),
          clan_id: Number(typedData.clan_id || null),
          experience: Number(typedData.experience || 0),
          nextLevelExp: Number(typedData.next_level_exp || 500),
          has_premium: Boolean(typedData.has_premium || false),
          score: Number(typedData.score || 0), // Score aus der Datenbank laden
          avatar_id: Number(typedData.avatar_id || 1), // NEW: avatar_id hinzufügen (Standard: 1)
        }

        return userData
      }

      return null
    } catch (error) {
      console.error("Error in loadUserDataFromDatabase:", error)
      return null
    }
  }

  // Refresh user data from database
  const refreshUserData = async () => {
    if (!user?.wallet_address) return

    try {
      const userData = await loadUserDataFromDatabase(user.wallet_address)
      if (userData) {
        setUser(userData)
        localStorage.setItem("animeworld_user", JSON.stringify(userData))
      }
    } catch (error) {
      console.error("Error refreshing user data:", error)
    }
  }

  useEffect(() => {
    const checkExistingAuth = async () => {
      // Check for World ID in localStorage
      /*
      const worldIdUserId = localStorage.getItem("worldId_userId")

      if (worldIdUserId) {
        // If World ID exists, use it to log in
        await login(worldIdUserId)
      }*/

      setLoading(false)
    }

    // Check for user in localStorage
    const checkUser = async () => {
      try {
        const isVerifiedAsHuman = localStorage.getItem("isVerifiedAsHuman")

  if (isVerifiedAsHuman !== "true") {
    console.log("User is NOT verified as human → skipping auto-login")
    setLoading(false)
    return
  }
  const isHumanVerified = localStorage.getItem("isVerifiedAsHuman") === "true"


if (!isHumanVerified) {
  console.log("Human verification missing – skipping auto login")
  setLoading(false)
  return
}

        const storedUser = localStorage.getItem("animeworld_user")

        if (storedUser) {
          const parsedUser = JSON.parse(storedUser)

          // 🚫 Block user "sasuke"
          if (parsedUser.username === "llegaraa2kwdd" || parsedUser.username === "nadapersonal" || parsedUser.username === "regresosss") {
            router.push("/login")
            return
          }

          // Set user from localStorage first for immediate UI rendering
          setUser(parsedUser)
          setIsAuthenticated(true)

          // Then fetch fresh data from database
          if (parsedUser.wallet_address) {
            const freshUserData = await loadUserDataFromDatabase(parsedUser.wallet_address)
            if (freshUserData) {
              setUser(freshUserData)
              localStorage.setItem("animeworld_user", JSON.stringify(freshUserData))
            }
          }
        }
      } catch (error) {
        console.error("Error parsing user data:", error)
      } finally {
        setLoading(false)
      }
    }

    checkUser()
  }, [])

  const login = async (walletAddress: string, username?: string) => {
    try {

      // Try to load user data from database first
      const userData = await loadUserDataFromDatabase(walletAddress)

      if (userData) {
        // User exists in database, use that data
        localStorage.setItem("animeworld_user", JSON.stringify(userData))
        setUser(userData)
        setIsAuthenticated(true)
        // Cookie setzen (1 Jahr gültig)
        document.cookie = `animeworld_user=${encodeURIComponent(JSON.stringify(userData))}; path=/; max-age=31536000`;
        return { success: true }
      }

      // User doesn't exist in database, create new user
      const supabase = getSupabaseBrowserClient()
      if (!supabase) {
        return { success: false, error: "Failed to initialize Supabase client" }
      }

      // Create default user data
      const newUserData: User = {
        wallet_address: walletAddress,
        username: username || walletAddress, // Use provided username or fallback to wallet address
        tickets: 5,
        elite_tickets: 2,
        icon_tickets: 0, // NEW
        coins: 1000,
        level: 1,
        experience: 0,
        nextLevelExp: 500,
        has_premium: false,
        score: 100, // Initialer Score basierend auf Level * 100
      }

      // Insert new user into database
      const { error } = await supabase.from("users").insert({
        wallet_address: walletAddress,
        username: newUserData.username,
        tickets: newUserData.tickets,
        elite_tickets: newUserData.elite_tickets,
        coins: newUserData.coins,
        level: newUserData.level,
        experience: newUserData.experience,
        next_level_exp: newUserData.nextLevelExp,
        has_premium: newUserData.has_premium,
        score: newUserData.score, // Score in die Datenbank einfügen
        icon_tickets: newUserData.icon_tickets,
      })
      

      if (error) {
        console.error("Error creating new user in database:", error)
        return { success: false, error: "Failed to create user in database" }
      }

      localStorage.setItem("animeworld_user", JSON.stringify(newUserData))
      setUser(newUserData)
      setIsAuthenticated(true)
      // Cookie setzen (1 Jahr gültig)
      document.cookie = `animeworld_user=${encodeURIComponent(JSON.stringify(newUserData))}; path=/; max-age=31536000`;
      return { success: true }
    } catch (error) {
      console.error("Login error:", error)
      return { success: false, error: "An unexpected error occurred" }
    }
  }

  const logout = async () => {
    try {
      // Clear World ID from localStorage
      localStorage.removeItem("worldId_userId")

      // Rest of your existing logout code
      setUser(null)
      setIsAuthenticated(false)
      localStorage.removeItem("animeworld_user")
      document.cookie = "animeworld_auth=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT"
      router.push("/login")
      return { success: true }
    } catch (error) {
      console.error("Logout error:", error)
      return { success: false, error: "Failed to logout" }
    }
  }

  const updateUserTickets = async (newTicketCount: number, newEliteTicketCount?: number, newIconTicketCount?: number) => {
    if (user) {
      // Create updated user with new ticket count
      const updatedUser = { ...user }

      if (typeof newTicketCount === "number") {
        updatedUser.tickets = newTicketCount
      }

      // Update elite tickets if provided
      if (typeof newEliteTicketCount === "number") {
        updatedUser.elite_tickets = newEliteTicketCount
      }

      if (typeof newIconTicketCount === "number") {
        updatedUser.icon_tickets = newIconTicketCount
      }

      console.log("Updating user tickets:", updatedUser.tickets, "elite:", updatedUser.elite_tickets)

      // Update state and localStorage
      setUser(updatedUser)
      localStorage.setItem("animeworld_user", JSON.stringify(updatedUser))

      // Update database
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        const updateData: Record<string, any> = {}
        if (typeof newTicketCount === "number") {
          updateData.tickets = newTicketCount
        }
        if (typeof newEliteTicketCount === "number") {
          updateData.elite_tickets = newEliteTicketCount
        }
        if (typeof newIconTicketCount === "number") {
          updateData.icon_tickets = newIconTicketCount
        }

        const { error } = await supabase.from("users").update(updateData).eq("wallet_address", user.wallet_address)

        if (error) {
          console.error("Error updating tickets in database:", error)
        }
      } catch (error) {
        console.error("Error in updateUserTickets:", error)
      }
    }
  }

  const updateUserCoins = async (newCoinCount: number) => {
    if (user) {
      const updatedUser = { ...user, coins: newCoinCount }
      setUser(updatedUser)
      localStorage.setItem("animeworld_user", JSON.stringify(updatedUser))

      // Update database
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        const { error } = await supabase.from("users").update({ coins: newCoinCount }).eq("wallet_address", user.wallet_address)

        if (error) {
          console.error("Error updating coins in database:", error)
        }
      } catch (error) {
        console.error("Error in updateUserCoins:", error)
      }
    }
  }

  // Calculate XP needed for a specific level using the new formula
  const calculateXpForLevel = (level: number) => {
    if (level <= 1) return 500
    // Lineare Formel: 500 + (level - 1) * 1500
    // Level 1: 500 XP
    // Level 2: 2,000 XP  
    // Level 3: 3,500 XP
    // Level 4: 5,000 XP
    // Level 5: 6,500 XP
    // Level 6: 8,000 XP
    // Level 7: 9,500 XP
    // Level 8: 11,000 XP
    // Level 9: 12,500 XP
    // Level 10: 14,000 XP
    return 500 + (level - 1) * 1500
  }

  const updateUserExp = async (expToAdd: number) => {
    if (!user) return { leveledUp: false }

    try {
      let newExp = user.experience + expToAdd
      let newLevel = user.level
      let leveledUp = false

      // Check if user leveled up
      if (newExp >= user.nextLevelExp) {
        newExp -= user.nextLevelExp
        newLevel++
        leveledUp = true
      }

      // Calculate next level exp requirement using the new formula
      const nextLevelExp = calculateXpForLevel(newLevel)

      // Berechne Score-Erhöhung für Level-Up (100 Punkte pro Level)
      const scoreToAdd = leveledUp ? 100 : 0
      const newScore = (user.score || 0) + scoreToAdd

      const updatedUser = {
        ...user,
        experience: newExp,
        level: newLevel,
        nextLevelExp: nextLevelExp,
        score: newScore, // Score im User-Objekt aktualisieren
      }

      // Update user in database
      const supabase = getSupabaseBrowserClient()
      if (supabase) {
        await supabase
          .from("users")
          .update({
            experience: newExp,
            level: newLevel,
            next_level_exp: nextLevelExp,
            score: newScore, // Score in der Datenbank aktualisieren
          })
          .eq("wallet_address", user.wallet_address)
      }

      // Update local state
      setUser(updatedUser)
      localStorage.setItem("animeworld_user", JSON.stringify(updatedUser))

      return { leveledUp, newLevel: leveledUp ? newLevel : undefined }
    } catch (error) {
      console.error("Error updating user experience:", error)
      return { leveledUp: false }
    }
  }

  const setUserPremium = async (hasPremium: boolean) => {
    if (user) {
      const updatedUser = { ...user, has_premium: hasPremium }
      setUser(updatedUser)
      localStorage.setItem("animeworld_user", JSON.stringify(updatedUser))

      // Update database
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        const { error } = await supabase.from("users").update({ has_premium: hasPremium }).eq("wallet_address", user.wallet_address)

        if (error) {
          console.error("Error updating premium status in database:", error)
        }
      } catch (error) {
        console.error("Error in setUserPremium:", error)
      }
    }
  }

  // Neue Methode zum Aktualisieren des Scores
  const updateUserScore = async (scoreToAdd: number) => {
    if (user) {
      const currentScore = user.score || 0
      const newScore = currentScore + scoreToAdd

      const updatedUser = { ...user, score: newScore }
      setUser(updatedUser)
      localStorage.setItem("animeworld_user", JSON.stringify(updatedUser))

      // Update database
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        const { error } = await supabase.from("users").update({ score: newScore }).eq("wallet_address", user.wallet_address)

        if (error) {
          console.error("Error updating score in database:", error)
        }
      } catch (error) {
        console.error("Error in updateUserScore:", error)
      }
    }
  }

  const updateUserAvatar = async (avatarId: number) => {
    if (user) {
      const updatedUser = { ...user, avatar_id: avatarId }
      setUser(updatedUser)
      localStorage.setItem("animeworld_user", JSON.stringify(updatedUser))

      // Update database
      try {
        const supabase = getSupabaseBrowserClient()
        if (!supabase) return

        const { error } = await supabase.from("users").update({ avatar_id: avatarId }).eq("username", user.username)

        if (error) {
          console.error("Error updating avatar in database:", error)
        }
      } catch (error) {
        console.error("Error in updateUserAvatar:", error)
      }
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        logout,
        updateUserTickets,
        updateUserCoins,
        updateUserExp,
        setUserPremium,
        refreshUserData,
        updateUserScore, // Neue Methode zum Context hinzufügen
        updateUserAvatar,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
