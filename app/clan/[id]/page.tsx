"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { getSupabaseBrowserClient } from "@/lib/supabase"
import { useAuth } from "@/contexts/auth-context"
import { claimLevel5Reward, updateClanMemberRole } from "@/app/actions/clans"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Badge } from "@/components/ui/badge"
import { toast } from "@/components/ui/use-toast"
import { updateClanDescription } from "@/app/actions/clans"
import { Progress } from "@/components/ui/progress"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  Shield,
  Users,
  Trophy,
  XCircle,
  Info,
  AlertCircle,
  ArrowLeft,
  Crown,
  Star,
  Sword,
  MessageCircle,
  Calendar,
  TrendingUp,
  Edit3,
  Check,
  X,
  Search,
  DollarSign,
  Lock,
  Target,
  Gift,
} from "lucide-react"
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"
import ClanChat from "@/components/ClanChat"
import { claimClanMissionReward } from "@/app/actions/clan-missions"

interface ClanMember {
  id: string
  username: string
  level: number
  role: string
  is_founder: boolean
}

interface ClanActivity {
  id: number
  activity_type: string
  description: string
  user_id: string | null
  username: string | null
  created_at: string
}

interface ClanDetails {
  id: number
  name: string
  description: string | null
  level: number
  xp: number
  xp_needed: number
  created_at: string
  founder_id: string
  founder_name: string
  member_count: number
  max_members: number
  total_donated: number
  next_expansion_cost: number
}

interface ClanLevel {
  level: number
  required_xp: number
  reward: string
}

interface RoleCounts {
  xp_hunter: number
  lucky_star: number
  cheap_hustler: number
}

interface ClanMission {
  mission_type: string
  goal: number
  progress: number
  completed: boolean
  user_claimed: boolean
  reward: {
    type: string
    amount: number
  }
}

export default function ModernClanPage() {
  const params = useParams()
  const id = params?.id ? String(params.id) : ""
  const router = useRouter()
  const { user, updateUserTickets } = useAuth()
  const [clan, setClan] = useState<ClanDetails | null>(null)
  const [members, setMembers] = useState<ClanMember[]>([])
  const [activities, setActivities] = useState<ClanActivity[]>([])
  const [clanMissions, setClanMissions] = useState<ClanMission[]>([])
  const [isUserMember, setIsUserMember] = useState(false)
  const [isUserFounder, setIsUserFounder] = useState(false)
  const [userHasClan, setUserHasClan] = useState(false)
  const [loading, setLoading] = useState(true)
  const [memberLoading, setMemberLoading] = useState(false)
  const [activityLoading, setActivityLoading] = useState(false)
  const [missionsLoading, setMissionsLoading] = useState(false)
  const [kickMemberDialog, setKickMemberDialog] = useState(false)
  const [selectedMember, setSelectedMember] = useState<ClanMember | null>(null)
  const [showLevelInfo, setShowLevelInfo] = useState(false)
  const [level5Claimed, setLevel5Claimed] = useState(false)
  const [claimLoading, setClaimLoading] = useState(false)
  const [showRoleInfo, setShowRoleInfo] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editDescription, setEditDescription] = useState(clan?.description || "")
  const [savingDescription, setSavingDescription] = useState(false)
  const [roleCounts, setRoleCounts] = useState<RoleCounts>({
    xp_hunter: 0,
    lucky_star: 0,
    cheap_hustler: 0,
  })
  const [showXpGuide, setShowXpGuide] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)

  // Updated clan level rewards table (only levels 1-4)
  const clanLevels: ClanLevel[] = [
    { level: 1, required_xp: 0, reward: "Clan created" },
    { level: 2, required_xp: 5000, reward: "+1 regular ticket per day for everyone" },
    { level: 3, required_xp: 20000, reward: "Role limits increased to 5" },
    { level: 4, required_xp: 50000, reward: "Cheap Hustler role unlocked" },
  ]
  useEffect(() => {
    if (isUserMember && clan) {
      fetchClanMissions()
    }
  }, [isUserMember, clan])

  useEffect(() => {
    if (id) {
      fetchClanDetails()
    }
  }, [id, user])

  useEffect(() => {
    const checkClaim = async () => {
      if (!user || !id) return
      const supabase = getSupabaseBrowserClient()
      if (!supabase) return
      const { data } = await supabase
        .from("clan_level_rewards")
        .select("claimed_by")
        .eq("clan_id", id)
        .eq("level", 5)
        .single()
      if (data && Array.isArray(data.claimed_by) && data.claimed_by.includes(user.username)) {
        setLevel5Claimed(true)
      }
    }
    checkClaim()
  }, [user, id])

  const deleteClan = async () => {
    if (!user || !clan || !isUserFounder) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    try {
      const clanId = clan.id

      // 1. Remove all members (clan_members)
      await supabase.from("clan_members").delete().eq("clan_id", clanId)
      await supabase.from("clan_mission_claims").delete().eq("clan_id", clanId)

      // 2. Set clan_id to null for all users still in the clan
      await supabase.from("users").update({ clan_id: null }).eq("clan_id", clanId)

      await supabase.from("clans").delete().eq("id", clanId)

      // 3. Delete all activities (optional)
      await supabase.from("clan_activities").delete().eq("clan_id", clanId)

      // 4. Delete the clan itself
      const { error: deleteError } = await supabase.from("clans").delete().eq("id", clanId)

      if (deleteError) {
        toast({
          title: "Error",
          description: "Failed to delete clan",
          variant: "destructive",
        })
        return
      }

      toast({
        title: "Clan Deleted 🧨",
        description: "Your clan has been successfully disbanded.",
      })

      // Back to overview
      router.push("/clan/browse")
    } catch (error) {
      console.error("Error deleting clan:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred",
        variant: "destructive",
      })
    }
  }

  const fetchClanDetails = async () => {
    setLoading(true)
    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    try {
      // Fetch clan details
      const { data: clanData, error: clanError } = await supabase
        .from("clans")
        .select("*, max_members, total_donated, next_expansion_cost")
        .eq("id", String(id))
        .single()

      if (clanError || !clanData) {
        console.error("Error fetching clan:", clanError)
        toast({
          title: "Error",
          description: "Clan not found",
          variant: "destructive",
        })
        router.push("/clan/browse")
        return
      }

      // Get founder's username
      const { data: founderData, error: founderError } = await supabase
        .from("users")
        .select("username")
        .eq("username", String(clanData.founder_id))
        .single()

      const founderName = founderError ? "Unknown" : String(founderData?.username || "Unknown")

      // Get real member count from clan_members table
      const { data: memberCountData, error: memberCountError } = await supabase
        .from("clan_members")
        .select("user_id", { count: "exact" })
        .eq("clan_id", String(id))

      const realMemberCount = memberCountData?.length || 0

      setClan({
        ...clanData,
        id: Number(clanData.id),
        name: String(clanData.name),
        description: clanData.description ? String(clanData.description) : null,
        level: typeof clanData.level === "number" ? clanData.level : 1,
        xp: typeof clanData.xp === "number" ? clanData.xp : 0,
        xp_needed: typeof clanData.xp_needed === "number" ? clanData.xp_needed : 500,
        created_at: String(clanData.created_at),
        founder_id: String(clanData.founder_id),
        founder_name: founderName,
        member_count: realMemberCount, // Use real count from clan_members
        max_members: typeof clanData.max_members === "number" ? clanData.max_members : 30,
        total_donated: typeof clanData.total_donated === "number" ? clanData.total_donated : 0,
        next_expansion_cost: typeof clanData.next_expansion_cost === "number" ? clanData.next_expansion_cost : 50,
      })

      // Check if current user is a member or founder and if they have a clan
      if (user) {
        const isFounder = user.username === clanData.founder_id
        setIsUserFounder(isFounder)

        // Fetch user's clan_id to check membership and clan status
        const { data: userData, error: userError } = await supabase
          .from("users")
          .select("clan_id")
          .eq("username", user.username)
          .single()

        if (!userError && userData) {
          const userClanId = userData.clan_id
          setUserHasClan(!!userClanId) // User has a clan if clan_id is not null

          if (userClanId === Number(id)) {
            setIsUserMember(true)
          } else {
            setIsUserMember(false)
          }
        } else {
          setIsUserMember(false)
          setUserHasClan(false)
        }
      }

      // Now fetch members and activities
      fetchClanMembers()
      if (isUserMember || user?.username === clanData.founder_id) {
        // Only fetch activities if user is member of this clan
        fetchClanActivities()
        fetchClanMissions()
      }
    } catch (error) {
      console.error("Error in fetchClanDetails:", error)
      toast({
        title: "Error",
        description: "Failed to load clan details",
        variant: "destructive",
      })
    } finally {
      setLoading(false)
    }
  }

  const fetchClanMembers = async () => {
    setMemberLoading(true)
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !id) return

    try {
      // 1. Get clan_members entries (only user_id + role)
      const { data: membersData, error: membersError } = (await supabase
        .from("clan_members")
        .select("user_id, role")
        .eq("clan_id", String(id))) as unknown as {
        data: { user_id: string; role: string }[] | null
        error: any
      }

      if (membersError) {
        console.error("Error fetching members:", membersError)
        toast({
          title: "Error",
          description: "Failed to load members",
          variant: "destructive",
        })
        return
      }

      if (!membersData || membersData.length === 0) {
        setMembers([])
        setRoleCounts({ xp_hunter: 0, lucky_star: 0, cheap_hustler: 0 })
        return
      }

      // Count roles
      const counts = {
        xp_hunter: membersData.filter((m) => m.role === "xp_hunter").length,
        lucky_star: membersData.filter((m) => m.role === "lucky_star").length,
        cheap_hustler: membersData.filter((m) => m.role === "cheap_hustler").length,
      }
      setRoleCounts(counts)

      // 2. Get user data separately
      const userIds = membersData.map((m) => m.user_id)
      const { data: usersData, error: usersError } = await supabase
        .from("users")
        .select("username, level")
        .in("username", userIds)

      if (usersError) {
        console.error("Error fetching user levels:", usersError)
        return
      }

      // 3. Map usernames → level
      const userMap = Object.fromEntries(usersData.map((u) => [u.username, u.level ?? 1]))

      // 4. Combine
      const formattedMembers = membersData.map((member) => ({
        id: String(member.user_id),
        username: member.user_id,
        level: userMap[member.user_id] || 1,
        role: member.role,
        is_founder: member.user_id === clan?.founder_id,
      }))

      // Sort members: Leader first, then special roles, then regular members
      const sortedMembers = formattedMembers.sort((a, b) => {
        // Leader (founder) always first - check against clan founder_id
        const aIsFounder = a.username === clan?.founder_id
        const bIsFounder = b.username === clan?.founder_id

        if (aIsFounder && !bIsFounder) return -1
        if (!aIsFounder && bIsFounder) return 1

        // If both are founders or both are not founders, continue with other sorting
        if (aIsFounder && bIsFounder) return 0

        // Then special roles (non-member roles)
        const aHasSpecialRole = a.role !== "member"
        const bHasSpecialRole = b.role !== "member"

        if (aHasSpecialRole && !bHasSpecialRole) return -1
        if (!aHasSpecialRole && bHasSpecialRole) return 1

        // Within same category, sort by username
        return a.username.localeCompare(b.username)
      })

      setMembers(sortedMembers)
      setClan((prev) => (prev ? { ...prev, member_count: sortedMembers.length } : prev))
    } catch (error) {
      console.error("Error in fetchClanMembers:", error)
    } finally {
      setMemberLoading(false)
    }
  }

  const fetchClanActivities = async () => {
    setActivityLoading(true)
    const supabase = getSupabaseBrowserClient()
    if (!supabase || !id) return

    try {
      console.log("Fetching activities for clan:", id)

      // Fetch clan activities
      const { data: activitiesData, error: activitiesError } = await supabase
        .from("clan_activities")
        .select(`
          id,
          activity_type,
          description,
          user_id,
          created_at
        `)
        .eq("clan_id", String(id))
        .order("created_at", { ascending: false })
        .limit(20)

      console.log("Activities data:", activitiesData)
      console.log("Activities error:", activitiesError)

      if (activitiesError) {
        console.error("Error fetching activities:", activitiesError)
        return
      }

      if (activitiesData) {
        // Get all unique user IDs from activities
        const userIds = [...new Set(activitiesData.filter((a) => a.user_id).map((a) => a.user_id))]

        // Fetch usernames for these IDs
        const usernamesMap: Record<string, string> = {}

        if (userIds.length > 0) {
          const { data: usersData, error: usersError } = await supabase
            .from("users")
            .select("username")
            .in("username", userIds as string[])

          if (!usersError && usersData) {
            usersData.forEach((u) => {
              if (u.username && typeof u.username === "string") {
                usernamesMap[u.username] = String(u.username)
              }
            })
          }
        }

        // Format activities with usernames
        const formattedActivities = activitiesData.map((activity) => ({
          id: Number(activity.id),
          activity_type: String(activity.activity_type),
          description: String(activity.description),
          user_id: activity.user_id ? String(activity.user_id) : null,
          username:
            activity.user_id && typeof activity.user_id === "string" && activity.user_id in usernamesMap
              ? usernamesMap[activity.user_id]
              : null,
          created_at: String(activity.created_at),
        }))

        console.log("Formatted activities:", formattedActivities)
        setActivities(formattedActivities)
      }
    } catch (error) {
      console.error("Error in fetchClanActivities:", error)
    } finally {
      setActivityLoading(false)
    }
  }

  const fetchClanMissions = async () => {
    if (!user || !clan) return
    setMissionsLoading(true)

    try {
      console.log("Fetching missions for clan:", clan.id, "user:", user.username)

      const response = await fetch("/api/clan-missions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clanId: clan.id, username: user.username }),
      })

      const data = await response.json()
      console.log("Missions response:", data)

      if (data.success) {
        setClanMissions(data.missions)
      } else {
        console.error("Failed to fetch missions:", data.error)
      }
    } catch (error) {
      console.error("Error fetching clan missions:", error)
    } finally {
      setMissionsLoading(false)
    }
  }

  const joinClan = async () => {
    if (!user || !clan || userHasClan) return

    // Check if clan is full (30 members max)
    if (clan.member_count >= clan.max_members) {
      toast({
        title: "Clan Full",
        description: `This clan has reached the maximum of ${clan.max_members} members.`,
        variant: "destructive",
      })
      return
    }

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    try {
      // Update user's clan_id
      const { error: updateError } = await supabase
        .from("users")
        .update({ clan_id: clan.id })
        .eq("username", user.username)

      if (updateError) {
        console.error("Error joining clan:", updateError)
        toast({
          title: "Error",
          description: "Failed to join clan",
          variant: "destructive",
        })
        return
      }

      // Add to clan_members if not already added
      const { data: existingMember } = await supabase
        .from("clan_members")
        .select("id")
        .eq("clan_id", clan.id)
        .eq("user_id", user.username)
        .maybeSingle()

      if (!existingMember) {
        const { error: insertMemberError } = await supabase.from("clan_members").insert({
          clan_id: clan.id,
          user_id: user.username,
          role: "member",
        })

        if (insertMemberError) {
          console.error("Error adding to clan_members:", insertMemberError)
          toast({
            title: "Error",
            description: "Failed to join clan (member insert)",
            variant: "destructive",
          })
          return
        }
      }

      // Remove this part:
      // const { error: clanUpdateError } = await supabase
      //   .from("clans")
      //   .update({ member_count: clan.member_count + 1 })
      //   .eq("id", String(clan.id))

      // if (clanUpdateError) {
      //   console.error("Error updating clan member count:", clanUpdateError)
      // }

      // Add activity
      await supabase.from("clan_activities").insert({
        clan_id: clan.id,
        activity_type: "join",
        description: `${user.username} joined the clan`,
        user_id: user.username,
        created_at: new Date().toISOString(),
      })

      // Refresh data
      toast({
        title: "Success! 🎉",
        description: "You joined the clan",
      })

      setIsUserMember(true)
      setUserHasClan(true)
      fetchClanMembers()
      fetchClanActivities()
      fetchClanMissions()
      setClan((prev) => (prev ? { ...prev, member_count: prev.member_count + 1 } : prev))
    } catch (error) {
      console.error("Error in joinClan:", error)
      toast({
        title: "Error",
        description: "Failed to join clan",
        variant: "destructive",
      })
    }
  }

  const leaveClan = async () => {
    if (!user || !clan || isUserFounder) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    try {
      // Update user's clan_id
      const { error: updateError } = await supabase
        .from("users")
        .update({ clan_id: null })
        .eq("username", user.username)

      if (updateError) {
        console.error("Error leaving clan:", updateError)
        toast({
          title: "Error",
          description: "Failed to leave clan",
          variant: "destructive",
        })
        return
      }
      // Delete mission claims of the user for this clan
      const { error: deleteClaimsError } = await supabase
        .from("clan_members")
        .delete()
        .eq("clan_id", clan.id)
        .eq("user_id", user.username)

      if (deleteClaimsError) {
        console.warn("Error deleting clan_mission_claims:", deleteClaimsError)
      }

      // Remove this part:
      // const { error: clanUpdateError } = await supabase
      //   .from("clans")
      //   .update({ member_count: Math.max(1, clan.member_count - 1) })
      //   .eq("id", String(clan.id))

      // if (clanUpdateError) {
      //   console.error("Error updating clan member count:", clanUpdateError)
      // }

      // Add activity
      await supabase.from("clan_activities").insert({
        clan_id: clan.id,
        activity_type: "leave",
        description: `${user.username} left the clan`,
        user_id: user.username,
        created_at: new Date().toISOString(),
      })

      toast({
        title: "Success",
        description: "You left the clan",
      })

      // Redirect to clan browse page
      router.push("/clan/browse")
    } catch (error) {
      console.error("Error in leaveClan:", error)
      toast({
        title: "Error",
        description: "Failed to leave clan",
        variant: "destructive",
      })
    }
  }

  const handleKickMember = (member: ClanMember) => {
    if (isUserFounder && !member.is_founder) {
      setSelectedMember(member)
      setKickMemberDialog(true)
    }
  }

  const confirmKickMember = async () => {
    if (!selectedMember || !clan) return

    const supabase = getSupabaseBrowserClient()
    if (!supabase) return

    // Prevent kicking the founder
    if (selectedMember.username === clan.founder_id) {
      toast({
        title: "Not Allowed",
        description: "You cannot remove the founder from the clan.",
        variant: "destructive",
      })
      return
    }

    try {
      // Update user's clan_id
      const { error: updateError } = await supabase
        .from("users")
        .update({ clan_id: null })
        .eq("username", selectedMember.username)

      await supabase.from("clan_members").delete().eq("clan_id", String(clan.id)).eq("user_id", selectedMember.username)

      if (updateError) {
        console.error("Error kicking member:", updateError)
        toast({
          title: "Error",
          description: "Failed to remove member",
          variant: "destructive",
        })
        return
      }

      // Remove this part:
      // const { error: clanUpdateError } = await supabase
      //   .from("clans")
      //   .update({ member_count: Math.max(1, clan.member_count - 1) })
      //   .eq("id", String(clan.id))

      // if (clanUpdateError) {
      //   console.error("Error updating clan member count:", clanUpdateError)
      // }

      // Add activity
      await supabase.from("clan_activities").insert({
        clan_id: clan.id,
        activity_type: "kick",
        description: `${selectedMember.username} was removed from the clan`,
        user_id: user?.username,
        created_at: new Date().toISOString(),
      })

      toast({
        title: "Success! ⚡",
        description: `${selectedMember.username} was removed from the clan`,
      })

      // Refresh data
      setKickMemberDialog(false)
      setSelectedMember(null)
      fetchClanMembers()
      fetchClanActivities()

      // Update clan details to reflect new member count
      if (clan) {
        setClan((prev) => (prev ? { ...prev, member_count: Math.max(1, prev.member_count - 1) } : prev))
      }
    } catch (error) {
      console.error("Error in kickMember:", error)
      toast({
        title: "Error",
        description: "Failed to remove member",
        variant: "destructive",
      })
    }
  }

  const handleRoleChange = async (targetUsername: string, newRole: string) => {
    if (!user || !clan) return

    const result = await updateClanMemberRole({
      clanId: clan.id,
      targetUsername,
      newRole: newRole as "member" | "xp_hunter" | "lucky_star" | "cheap_hustler",
      currentUser: user.username,
    })

    if (!result.success) {
      toast({
        title: "Error",
        description: result.error || "Failed to update role.",
        variant: "destructive",
      })
    } else {
      toast({ title: "Success! ✨", description: "Role updated" })
      fetchClanMembers()
    }
  }

  const claimLevel5 = async () => {
    if (!user || !clan) return
    setClaimLoading(true)
    try {
      const result = await claimLevel5Reward(user.username)
      if (result.success) {
        toast({ title: "Success! 🎉", description: "Reward claimed" })
        updateUserTickets?.(result.tickets, result.legendary_tickets)
        setLevel5Claimed(true)
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch (e) {
      console.error(e)
      toast({ title: "Error", description: "Failed to claim reward", variant: "destructive" })
    } finally {
      setClaimLoading(false)
    }
  }

  const handleClaimMissionReward = async (missionType: string) => {
    if (!user || !clan) return

    try {
      const result = await claimClanMissionReward(clan.id, user.username, missionType)
      if (result.success) {
        toast({ title: "Success! 🎉", description: "Mission reward claimed!" })
        fetchClanMissions()
        // Refresh user data if needed
      } else {
        toast({ title: "Error", description: result.error, variant: "destructive" })
      }
    } catch (error) {
      console.error("Error claiming mission reward:", error)
      toast({ title: "Error", description: "Failed to claim reward", variant: "destructive" })
    }
  }

  const getRoleIcon = (role: string) => {
    switch (role) {
      case "xp_hunter":
        return <Sword className="h-4 w-4 text-orange-500" />
      case "lucky_star":
        return <Star className="h-4 w-4 text-yellow-500" />
      case "cheap_hustler":
        return <DollarSign className="h-4 w-4 text-green-500" />
      default:
        return <Users className="h-4 w-4 text-gray-500" />
    }
  }

  const getRoleName = (role: string) => {
    switch (role) {
      case "leader":
        return "Leader"
      case "xp_hunter":
        return "XP Hunter"
      case "lucky_star":
        return "Lucky Star"
      case "cheap_hustler":
        return "Cheap Hustler"
      default:
        return "Member"
    }
  }

  const getMissionIcon = (missionType: string) => {
    switch (missionType) {
      case "regular_packs":
        return ""
      case "legendary_cards":
        return ""
      case "legendary_packs":
        return ""
      default:
        return ""
    }
  }

  const getMissionTitle = (missionType: string) => {
    switch (missionType) {
      case "regular_packs":
        return "Open Regular Packs"
      case "legendary_cards":
        return "Pull Legendary Cards"
      case "legendary_packs":
        return "Open Legendary Packs"
      default:
        return "Unknown Mission"
    }
  }

  const getMissionReward = (missionType: string) => {
    switch (missionType) {
      case "regular_packs":
        return "2 Regular Tickets"
      case "legendary_cards":
        return "2 Legendary Tickets"
      case "legendary_packs":
        return "+2 Clan XP"
      default:
        return "Unknown Reward"
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-4 flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="h-8 w-8 border-4 border-t-transparent border-blue-500 rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-lg font-medium text-gray-700">Loading clan details...</p>
          </div>
        </div>
      </div>
    )
  }

  if (!clan) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="container mx-auto p-4 text-center min-h-[60vh] flex items-center justify-center">
          <div className="max-w-md">
            <AlertCircle className="h-16 w-16 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-3">Clan not found</h2>
            <p className="text-gray-600 mb-6">The clan you were looking for does not exist or was removed.</p>
            <Button onClick={() => router.push("/clan/browse")} className="bg-blue-600 hover:bg-blue-700">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to clan list
            </Button>
          </div>
        </div>
      </div>
    )
  }

  // Calculate progress to next level
  const currentLevelIndex = clanLevels.findIndex((l) => l.level === clan.level)
  const nextLevel = clanLevels[currentLevelIndex + 1]
  const progressPercentage = nextLevel ? (clan.xp / nextLevel.required_xp) * 100 : 100

  // Check if user can access restricted tabs - only clan members can access
  const canAccessRestrictedContent = isUserMember

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto p-4 max-w-6xl">
        {/* Header */}
        <div className="mb-6">
          {/* Back Button (own line) */}
          <div className="mb-2">
            
            <Button variant="ghost" size="sm" onClick={() => router.push("/")} className="hover:bg-gray-100">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>

          {/* New line: Clan name, Members, Browse Button next to each other */}
          <div className="flex flex-wrap items-center gap-4">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{clan.name}</h1>
            <p className="text-sm text-gray-600 flex items-center gap-2">
              <Users className="h-3 w-3" />
              {clan.member_count}/{clan.max_members} members
            </p>
            <Button
              onClick={() => router.push("/clan/browse")}
              size="sm"
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              <Search className="h-4 w-4 mr-2" />
              Browse
            </Button>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Clan Info Sidebar */}
          <div className="lg:col-span-1 space-y-4">
            {/* Main Clan Card */}
            <Card className="overflow-hidden">
              <div className="h-16 bg-blue-600 relative">
                <div className="absolute bottom-2 left-4 right-4">
                  <div className="flex items-center justify-between text-white">
                    <div>
                      <p className="text-xs opacity-90 flex items-center gap-1">
                        <Crown className="h-3 w-3" />
                        Founded by
                      </p>
                      <p className="font-medium text-sm">{clan.founder_name}</p>
                    </div>

                    <Badge variant="secondary" className="text-xs px-3 py-1 bg-white/20 text-white border-0">
                      Level {clan.level}
                    </Badge>
                  </div>
                </div>
              </div>

              <CardContent className="p-4">
                {/* Description */}
                <div className="mb-4">
                  {isUserFounder ? (
                    <>
                      {!editMode ? (
                        <div className="flex items-start justify-between group">
                          <p className="text-gray-700 leading-relaxed flex-1 text-sm">
                            {clan.description || "No description available."}
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditMode(true)}
                            className="ml-2 h-6 w-6 p-0"
                          >
                            <Edit3 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <textarea
                            maxLength={40}
                            className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            placeholder="Enter clan description..."
                            rows={3}
                          />
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={savingDescription}
                              onClick={async () => {
                                setSavingDescription(true)
                                const result = await updateClanDescription(clan.id, editDescription)
                                if (result.success) {
                                  toast({ title: "Updated!", description: "Description saved." })
                                  setClan((prev) => (prev ? { ...prev, description: editDescription } : prev))
                                  setEditMode(false)
                                } else {
                                  toast({ title: "Error", description: result.error, variant: "destructive" })
                                }
                                setSavingDescription(false)
                              }}
                              className="bg-green-600 hover:bg-green-700 text-white text-xs"
                            >
                              <Check className="h-3 w-3 mr-1" />
                              {savingDescription ? "Saving..." : "Save"}
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setEditMode(false)
                                setEditDescription(clan.description || "")
                              }}
                              className="text-xs"
                            >
                              <X className="h-3 w-3 mr-1" />
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="text-gray-700 leading-relaxed text-sm">
                      {clan.description || "No description available."}
                    </p>
                  )}
                </div>

                {/* XP Info Box */}

                {/* Progress to Next Level */}
                {nextLevel && (
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <div className="flex items-center gap-1 text-xs font-medium text-gray-700">
                        <span>Progress to Level {clan.level + 1}</span>
                        <button
                          onClick={() => setShowXpGuide(true)}
                          className="text-blue-500 hover:text-blue-700"
                          title="XP Guide"
                        >
                          <Info className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="text-xs font-bold text-blue-600">{progressPercentage.toFixed(0)}%</span>
                    </div>
                    <Progress value={progressPercentage} className="h-2" />
                    <div className="flex justify-between text-xs text-gray-500 mt-1">
                      <span>{clan.xp.toLocaleString()} XP</span>
                      <span>{nextLevel.required_xp.toLocaleString()} XP</span>
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-gray-500 mb-4">
                  <div className="flex items-center">
                    <Calendar className="h-3 w-3 mr-2" />
                    Founded on {new Date(clan.created_at).toLocaleDateString()}
                  </div>
                  {isUserFounder && (
                    <Button
                      onClick={() => setShowDeleteDialog(true)}
                      variant="outline"
                      size="sm"
                      className="border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 h-7 px-2 text-xs"
                    >
                      <XCircle className="h-3 w-3 mr-1" />
                      Delete Clan
                    </Button>
                  )}
                </div>

                {/* Action Buttons */}
                {user && !isUserMember && !userHasClan && clan.member_count < clan.max_members && (
                  <Button className="w-full bg-blue-600 hover:bg-blue-700 text-white" onClick={joinClan}>
                    <Users className="h-4 w-4 mr-2" />
                    Join Clan
                  </Button>
                )}

                {user && !isUserMember && !userHasClan && clan.member_count >= clan.max_members && (
                  <div className="text-center p-4 bg-red-50 rounded-lg border border-red-200">
                    <Lock className="h-8 w-8 text-red-400 mx-auto mb-2" />
                    <p className="text-sm text-red-600 font-medium">Clan is Full</p>
                    <p className="text-xs text-red-500 mt-1">Maximum {clan.max_members} members reached</p>
                  </div>
                )}

                {user && !isUserMember && userHasClan && (
                  <div className="text-center p-4 bg-gray-50 rounded-lg border">
                    <Lock className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                    <p className="text-sm text-gray-600 font-medium">You are already in a clan</p>
                    <p className="text-xs text-gray-500 mt-1">Leave your current clan to join this one</p>
                  </div>
                )}

                {user && isUserMember && !isUserFounder && (
                  <Button
                    variant="outline"
                    className="w-full border-red-200 text-red-600 hover:bg-red-50"
                    onClick={leaveClan}
                  >
                    <XCircle className="h-4 w-4 mr-2" />
                    Leave Clan
                  </Button>
                )}
              </CardContent>
            </Card>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-3">
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-blue-600">{clan.level}</div>
                  <div className="text-xs text-gray-600 font-medium">Clan Level</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4 text-center">
                  <div className="text-2xl font-bold text-green-600">{clan.xp.toLocaleString()}</div>
                  <div className="text-xs text-gray-600 font-medium">Total XP</div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="members" className="space-y-4">
              <TabsList className="grid w-full grid-cols-5 bg-white">
                <TabsTrigger value="members" className="flex items-center gap-1 text-xs font-medium">
                  <Users className="h-3 w-3" />
                  <span className="hidden sm:inline">Members</span>
                </TabsTrigger>
                <TabsTrigger
                  value="missions"
                  className={`flex items-center gap-1 text-xs font-medium ${
                    !canAccessRestrictedContent ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  disabled={!canAccessRestrictedContent}
                >
                  <Target className="h-3 w-3" />
                  <span className="hidden sm:inline">Missions</span>
                  {!canAccessRestrictedContent && <Lock className="h-2 w-2 ml-1" />}
                </TabsTrigger>
                <TabsTrigger
                  value="activity"
                  className={`flex items-center gap-1 text-xs font-medium ${
                    !canAccessRestrictedContent ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  disabled={!canAccessRestrictedContent}
                >
                  <TrendingUp className="h-3 w-3" />
                  <span className="hidden sm:inline">Activity</span>
                  {!canAccessRestrictedContent && <Lock className="h-2 w-2 ml-1" />}
                </TabsTrigger>
                <TabsTrigger value="rewards" className="flex items-center gap-1 text-xs font-medium">
                  <Trophy className="h-3 w-3" />
                  <span className="hidden sm:inline">Rewards</span>
                </TabsTrigger>
                <TabsTrigger
                  value="chat"
                  className={`flex items-center gap-1 text-xs font-medium ${
                    !canAccessRestrictedContent ? "opacity-50 cursor-not-allowed" : ""
                  }`}
                  disabled={!canAccessRestrictedContent}
                >
                  <MessageCircle className="h-3 w-3" />
                  <span className="hidden sm:inline">Chat</span>
                  {!canAccessRestrictedContent && <Lock className="h-2 w-2 ml-1" />}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="members">
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-center mb-2">
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Members ({clan.member_count}/{clan.max_members})
                      </CardTitle>
                      <Button variant="outline" size="sm" className="text-xs" onClick={() => setShowRoleInfo(true)}>
                        <Info className="h-3 w-3 mr-1" />
                        Role Info
                      </Button>
                    </div>

                    {/* Add Clan Expansion Button here */}
                  </CardHeader>
                  <CardContent className="p-4">
                    {memberLoading ? (
                      <div className="text-center py-8">
                        <div className="h-6 w-6 border-4 border-t-transparent border-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                        <p className="text-gray-600 text-sm">Loading members...</p>
                      </div>
                    ) : members.length > 0 ? (
                      <div className="space-y-3">
                        {members.map((member) => (
                          <div
                            key={member.id}
                            className={`flex items-center justify-between p-4 rounded-lg transition-colors ${
                              member.username === clan?.founder_id
                                ? "bg-gradient-to-r from-purple-50 to-indigo-50 border-2 border-purple-200 hover:from-purple-100 hover:to-indigo-100"
                                : member.role === "xp_hunter"
                                  ? "bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 hover:from-orange-100 hover:to-red-100"
                                  : member.role === "lucky_star"
                                    ? "bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200 hover:from-yellow-100 hover:to-amber-100"
                                    : member.role === "cheap_hustler"
                                      ? "bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 hover:from-green-100 hover:to-emerald-100"
                                      : "bg-gray-50 hover:bg-gray-100"
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="flex flex-col">
                                <div className="flex items-center gap-2">
                                  <p className="font-semibold text-gray-900 text-sm">{member.username}</p>
                                  {member.is_founder && (
                                    <Badge className="bg-amber-500 text-white border-0 text-xs">
                                      <Crown className="h-3 w-3 mr-1" />
                                      Founder
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 text-xs text-gray-600">
                                  <span className="flex items-center gap-1">Level {member.level}</span>
                                  <div className="flex items-center gap-1">
                                    {getRoleIcon(member.role)}
                                    <span>{getRoleName(member.role)}</span>
                                  </div>
                                </div>
                                {/* Only show role selector if user is founder and target is not founder and not themselves */}
                                {isUserFounder && !member.is_founder && member.username !== user?.username && (
                                  <div className="mt-2">
                                    <Select
                                      value={member.role}
                                      onValueChange={(newRole) => handleRoleChange(member.username, newRole)}
                                    >
                                      <SelectTrigger className="w-[130px] h-7 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="member">Member</SelectItem>
                                        <SelectItem value="xp_hunter">XP Hunter</SelectItem>
                                        <SelectItem value="lucky_star">Lucky Star</SelectItem>
                                        {clan.level >= 4 && (
                                          <SelectItem value="cheap_hustler">Cheap Hustler</SelectItem>
                                        )}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {isUserFounder && !member.is_founder && member.username !== user?.username && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-3 text-xs"
                                  onClick={() => handleKickMember(member)}
                                >
                                  <XCircle className="h-3 w-3 mr-1" />
                                  Remove
                                </Button>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <Users className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                        <p className="text-gray-600 text-sm">No members found</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="missions">
                {!canAccessRestrictedContent ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Lock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h3>
                      <p className="text-gray-600">You must be a member of this clan to view missions.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <Target className="h-5 w-5" />
                        Daily Clan Missions
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      {missionsLoading ? (
                        <div className="text-center py-8">
                          <div className="h-6 w-6 border-4 border-t-transparent border-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                          <p className="text-gray-600 text-sm">Loading missions...</p>
                        </div>
                      ) : clanMissions.length > 0 ? (
                        <div className="space-y-4">
                          {clanMissions.map((mission) => (
                            <div key={mission.mission_type} className="p-4 rounded-lg bg-gray-50 border">
                              <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <div className="text-2xl">{getMissionIcon(mission.mission_type)}</div>
                                  <div>
                                    <h3 className="font-semibold text-gray-900 text-sm">
                                      {getMissionTitle(mission.mission_type)}
                                    </h3>
                                    <p className="text-xs text-gray-600">
                                      {mission.progress} / {mission.goal} • Reward:{" "}
                                      {getMissionReward(mission.mission_type)}
                                    </p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  {mission.completed && (
                                    <Badge className="bg-green-500 text-white border-0 text-xs">
                                      <Check className="h-3 w-3 mr-1" />
                                      Complete
                                    </Badge>
                                  )}
                                </div>
                              </div>

                              <Progress
                                value={Math.min((mission.progress / mission.goal) * 100, 100)}
                                className="h-2 mb-3"
                              />

                              <Button
                                size="sm"
                                onClick={() => handleClaimMissionReward(mission.mission_type)}
                                disabled={!mission.completed || mission.user_claimed}
                                className={`w-full text-xs ${
                                  mission.user_claimed
                                    ? "bg-gray-100 text-gray-400"
                                    : "bg-blue-600 hover:bg-blue-700 text-white"
                                }`}
                              >
                                {mission.user_claimed ? (
                                  <>
                                    <Check className="h-3 w-3 mr-1" />
                                    Claimed
                                  </>
                                ) : mission.completed ? (
                                  <>
                                    <Gift className="h-3 w-3 mr-1" />
                                    Claim Reward
                                  </>
                                ) : (
                                  "Mission Incomplete"
                                )}
                              </Button>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <Target className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600 text-sm">No missions available</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="activity">
                {!canAccessRestrictedContent ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Lock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h3>
                      <p className="text-gray-600">You must be a member of this clan to view activity.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <TrendingUp className="h-5 w-5" />
                        Recent Activity
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      {activityLoading ? (
                        <div className="text-center py-8">
                          <div className="h-6 w-6 border-4 border-t-transparent border-blue-500 rounded-full animate-spin mx-auto mb-3"></div>
                          <p className="text-gray-600 text-sm">Loading activity...</p>
                        </div>
                      ) : activities.length > 0 ? (
                        <div className="space-y-3">
                          {activities.map((activity) => (
                            <div key={activity.id} className="flex items-start gap-3 p-4 rounded-lg bg-gray-50">
                              <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center flex-shrink-0">
                                <Shield className="h-4 w-4 text-white" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-gray-900 text-sm">{activity.description}</p>
                                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                                  <Calendar className="h-3 w-3" />
                                  {new Date(activity.created_at).toLocaleDateString()} at{" "}
                                  {new Date(activity.created_at).toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-8">
                          <TrendingUp className="h-12 w-12 text-gray-400 mx-auto mb-3" />
                          <p className="text-gray-600 text-sm">No activity found</p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="rewards">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <Trophy className="h-5 w-5" />
                      Clan Level Rewards
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-4">
                    <div className="overflow-hidden rounded-lg border">
                      <Table>
                        <TableHeader>
                          <TableRow className="bg-gray-50">
                            <TableHead className="font-semibold text-gray-900 text-sm">Level</TableHead>
                            <TableHead className="font-semibold text-gray-900 text-sm">Reward</TableHead>
                            <TableHead className="text-right font-semibold text-gray-900 text-sm">Status</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {clanLevels.map((levelInfo) => (
                            <TableRow key={levelInfo.level} className="hover:bg-gray-50">
                              <TableCell className="font-medium text-sm">{levelInfo.level}</TableCell>
                              <TableCell className="text-sm">{levelInfo.reward}</TableCell>
                              <TableCell className="text-right">
                                {clan.level >= levelInfo.level ? (
                                  <Badge className="bg-green-500 text-white border-0 text-xs">
                                    <Check className="h-3 w-3 mr-1" />
                                    Unlocked
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-gray-600 text-xs">
                                    <Lock className="h-3 w-3 mr-1" />
                                    Locked
                                  </Badge>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="chat">
                {!canAccessRestrictedContent ? (
                  <Card>
                    <CardContent className="p-8 text-center">
                      <Lock className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-900 mb-2">Access Restricted</h3>
                      <p className="text-gray-600">You must be a member of this clan to access the chat.</p>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-bold flex items-center gap-2">
                        <MessageCircle className="h-5 w-5" />
                        Clan Chat
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-4">
                      <ClanChat clanId={clan.id} />
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* Dialogs */}
        <Dialog open={kickMemberDialog} onOpenChange={setKickMemberDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-red-600">Remove Member</DialogTitle>
              <DialogDescription className="text-gray-600">
                Are you sure you want to remove{" "}
                <span className="font-semibold text-gray-900">{selectedMember?.username}</span> from the clan? This
                action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setKickMemberDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={confirmKickMember} className="bg-red-600 hover:bg-red-700">
                <XCircle className="h-4 w-4 mr-2" />
                Remove Member
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showXpGuide} onOpenChange={setShowXpGuide}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold">XP Guide</DialogTitle>
              <DialogDescription className="text-sm text-gray-600">How your clan earns XP:</DialogDescription>
            </DialogHeader>
            <ul className="text-sm text-gray-700 space-y-2 pl-1 pt-2">
              <li>• +1 XP per Regular Pack</li>
              <li>• +2 XP per Legendary Pack</li>
              <li>• +5 XP per God Pack</li>
            </ul>
            <DialogFooter className="mt-4">
              <Button onClick={() => setShowXpGuide(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="text-red-600 text-lg font-bold">Disband Clan</DialogTitle>
              <DialogDescription className="text-gray-600">
                Are you sure you want to permanently delete your clan? This action <b>cannot be undone</b> and all
                members will be removed.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                className="bg-red-600 hover:bg-red-700"
                onClick={() => {
                  deleteClan()
                  setShowDeleteDialog(false)
                }}
              >
                <XCircle className="h-4 w-4 mr-2" />
                Yes, delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showRoleInfo} onOpenChange={setShowRoleInfo}>
          <DialogContent className="border-0 shadow-2xl max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900">Clan Roles & Benefits</DialogTitle>
              <DialogDescription className="text-gray-600">
                Each special role gives different in-game benefits. Only the Leader can assign roles.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200">
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="h-4 w-4 text-amber-600" />
                  <p className="font-semibold text-amber-900 text-sm">Leader</p>
                </div>
                <ul className="text-xs text-amber-800 space-y-1">
                  <li>• +5% XP from all pack openings</li>
                  <li>• +2% chance to pull legendary cards</li>
                  <li>• +10% discount on tickets (if clan has 30+ members)</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-r from-yellow-50 to-amber-50 border border-yellow-200">
                <div className="flex items-center gap-2 mb-2">
                  <Star className="h-4 w-4 text-yellow-600" />
                  <p className="font-semibold text-yellow-900 text-sm">
                    Lucky Star ({roleCounts.lucky_star}/{clan.level >= 3 ? 5 : 3})
                  </p>
                </div>
                <ul className="text-xs text-yellow-800 space-y-1">
                  <li>• +2% chance to pull Legendary cards</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200">
                <div className="flex items-center gap-2 mb-2">
                  <Sword className="h-4 w-4 text-orange-600" />
                  <p className="font-semibold text-orange-900 text-sm">
                    XP Hunter ({roleCounts.xp_hunter}/{clan.level >= 3 ? 5 : 3})
                  </p>
                </div>
                <ul className="text-xs text-orange-800 space-y-1">
                  <li>• +5% XP from packs</li>
                </ul>
              </div>
              <div className="p-3 rounded-lg bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200">
                <div className="flex items-center gap-2 mb-2">
                  <DollarSign className="h-4 w-4 text-green-600" />
                  <p className="font-semibold text-green-900 text-sm flex items-center gap-2">
                    Cheap Hustler ({roleCounts.cheap_hustler}/2)
                    {clan.level < 4 && <Lock className="h-3 w-3 text-gray-500" />}
                  </p>
                </div>
                <ul className="text-xs text-green-800 space-y-1">
                  <li>• +10% discount on all ticket purchases</li>
                  {clan.level < 4 && <li className="text-gray-600 italic">• Requires clan level 4+</li>}
                </ul>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowRoleInfo(false)} className="w-full">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showLevelInfo} onOpenChange={setShowLevelInfo}>
          <DialogContent className="border-0 shadow-2xl max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900">Clan Levels and Rewards</DialogTitle>
              <DialogDescription className="text-gray-600">
                XP Guide: Regular packs give 1 XP • Legendary packs give 2 XP.
              </DialogDescription>
            </DialogHeader>
            <div className="overflow-hidden rounded-xl border border-gray-200">
              <Table>
                <TableHeader>
                  <TableRow className="bg-gradient-to-r from-gray-50 to-gray-100">
                    <TableHead className="font-semibold text-gray-900 text-sm">Level</TableHead>
                    <TableHead className="font-semibold text-gray-900 text-sm">Reward</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clanLevels.map((levelInfo) => (
                    <TableRow
                      key={levelInfo.level}
                      className={`hover:bg-gray-50/50 transition-colors ${
                        clan.level === levelInfo.level ? "bg-purple-50 border-l-4 border-l-purple-500" : ""
                      }`}
                    >
                      <TableCell className="font-medium text-sm">{levelInfo.level}</TableCell>
                      <TableCell className="text-sm">{levelInfo.reward}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowLevelInfo(false)} className="w-full">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
