"use server"

import { createClient } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

// Create a server-side Supabase client
function createSupabaseServer() {
  return createClient(process.env.SUPABASE_URL || "", process.env.SUPABASE_SERVICE_ROLE_KEY || "", {
    auth: {
      persistSession: false,
    },
  })
}

// Typen für Clans
export type Clan = {
  id: number
  name: string
  description: string | null
  level: number
  xp: number
  xp_needed: number
  created_at: string
  founder_id: string
  logo_url: string | null
  member_count: number
}

// Clan erstellen
export async function createClan(username: string, name: string, description: string) {
  try {
    const supabase = createSupabaseServer()

    // Überprüfen, ob der Benutzer bereits in einem Clan ist
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("clan_id")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      console.error("Error checking user clan:", userError)
      return { success: false, error: "Benutzer nicht gefunden" }
    }

    if (userData.clan_id) {
      return { success: false, error: "Du bist bereits in einem Clan" }
    }

    // Überprüfen, ob der Clan-Name bereits existiert
    const { data: existingClan, error: existingClanError } = await supabase
      .from("clans")
      .select("id")
      .eq("name", name)
      .single()

    if (existingClan) {
      return { success: false, error: "Ein Clan mit diesem Namen existiert bereits" }
    }

    // Clan erstellen
    const { data: clan, error: clanError } = await supabase
      .from("clans")
      .insert({
        name,
        description,
        founder_id: username,
      })
      .select()
      .single()

    if (clanError) {
      console.error("Error creating clan:", clanError)
      return { success: false, error: "Fehler beim Erstellen des Clans" }
    }

    // Benutzer dem Clan zuweisen
    const { error: updateError } = await supabase
      .from("users")
      .update({ clan_id: clan.id })
      .eq("wallet_address", walletAddress)

    if (updateError) {
      console.error("Error updating user clan:", updateError)
      return { success: false, error: "Fehler beim Zuweisen des Clans" }
    }

    // Benutzer zu clan_members hinzufügen (wenn noch nicht vorhanden)
const { data: existingMember, error: memberCheckError } = await supabase
  .from("clan_members")
  .select("user_id")
  .eq("clan_id", clan.id)
  .eq("user_id", username)
  .maybeSingle()

if (!existingMember && !memberCheckError) {
  const { error: insertMemberError } = await supabase
    .from("clan_members")
    .insert({
      clan_id: clan.id,
      user_id: username,
      role: "leader", // Gründer wird direkt Leader
    })

  if (insertMemberError) {
    console.error("Fehler beim Hinzufügen zu clan_members:", insertMemberError)
    return { success: false, error: "Fehler beim Hinzufügen des Mitglieds" }
  }
}


const { count: memberCount, error: countError } = await supabase
  .from("clan_members")
  .select("*", { count: "exact", head: true })
  .eq("clan_id", clan.id)

if (!countError) {
  await supabase
    .from("clans")
    .update({ member_count: memberCount })
    .eq("id", clan.id)
}



    // Clan-Aktivität erstellen
    await supabase.from("clan_activities").insert({
      clan_id: clan.id,
      user_id: username,
      activity_type: "create",
      description: `${username} hat den Clan "${name}" gegründet`,
      xp_earned: 10,
    })
    await updateClanMemberCount(userData.clan_id)

    revalidatePath("/")
    revalidatePath("/clan")

    return { success: true, clan }
  } catch (error) {
    console.error("Error in createClan:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}

// Clan beitreten (Anfrage senden)
export async function requestJoinClan(username: string, clanId: number) {
  try {
    const supabase = createSupabaseServer()

    // Überprüfen, ob der Benutzer bereits in einem Clan ist
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("clan_id")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      console.error("Error checking user clan:", userError)
      return { success: false, error: "Benutzer nicht gefunden" }
    }

    if (userData.clan_id) {
      return { success: false, error: "Du bist bereits in einem Clan" }
    }

    // Überprüfen, ob bereits eine Anfrage existiert
    const { data: existingRequest, error: requestError } = await supabase
      .from("clan_requests")
      .select("id, status")
      .eq("clan_id", clanId)
      .eq("user_id", username)
      .single()

    if (existingRequest && existingRequest.status === "pending") {
      return { success: false, error: "Du hast bereits eine Anfrage an diesen Clan gesendet" }
    }

    // Anfrage erstellen oder aktualisieren
    if (existingRequest) {
      const { error: updateError } = await supabase
        .from("clan_requests")
        .update({ status: "pending" })
        .eq("id", existingRequest.id)

      if (updateError) {
        console.error("Error updating clan request:", updateError)
        return { success: false, error: "Fehler beim Aktualisieren der Anfrage" }
      }
    } else {
      const { error: insertError } = await supabase.from("clan_requests").insert({
        clan_id: clanId,
        user_id: username,
      })

      if (insertError) {
        console.error("Error creating clan request:", insertError)
        return { success: false, error: "Fehler beim Erstellen der Anfrage" }
      }
    }

    revalidatePath("/clan")

    return { success: true }
  } catch (error) {
    console.error("Error in requestJoinClan:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}

// Clan-Anfrage akzeptieren (nur für Clan-Gründer)
export async function acceptClanRequest(username: string, requestId: number) {
  try {
    const supabase = createSupabaseServer()

    // Anfrage abrufen
    const { data: request, error: requestError } = await supabase
  .from("clan_requests")
  .select("*, clans(id, name, founder_id, member_count)") // <— member_count einbeziehen!
  .eq("id", requestId)
  .single()

    if (requestError) {
      console.error("Error fetching clan request:", requestError)
      return { success: false, error: "Anfrage nicht gefunden" }
    }

    // Überprüfen, ob der Benutzer der Gründer des Clans ist
    if (request.clans.founder_id !== username) {
      return { success: false, error: "Du hast keine Berechtigung, diese Anfrage zu akzeptieren" }
    }

    // Anfrage akzeptieren
    const { error: updateRequestError } = await supabase
      .from("clan_requests")
      .update({ status: "accepted" })
      .eq("id", requestId)

    if (updateRequestError) {
      console.error("Error updating clan request:", updateRequestError)
      return { success: false, error: "Fehler beim Akzeptieren der Anfrage" }
    }

    // Benutzer dem Clan zuweisen
    const { error: updateUserError } = await supabase
      .from("users")
      .update({ clan_id: request.clan_id })
      .eq("username", request.user_id)

    if (updateUserError) {
      console.error("Error updating user clan:", updateUserError)
      return { success: false, error: "Fehler beim Zuweisen des Clans" }
    }

    await supabase.from("clan_members").insert({
      clan_id: request.clan_id,
      user_id: request.user_id,
      role: "member",
    })

    // Mitgliederzahl erhöhen
    const { error: updateClanError } = await supabase
      .from("clans")
      .update({ member_count: request.clans.member_count + 1 })
      .eq("id", request.clan_id)

    if (updateClanError) {
      console.error("Error updating clan member count:", updateClanError)
    }

    // Clan-Aktivität erstellen
    await supabase.from("clan_activities").insert({
      clan_id: request.clan_id,
      user_id: request.user_id,
      activity_type: "join",
      description: `${request.user_id} ist dem Clan "${request.clans.name}" beigetreten`,
      xp_earned: 5,
    })

    revalidatePath("/clan")

    return { success: true }
  } catch (error) {
    console.error("Error in acceptClanRequest:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}

// Clan verlassen
export async function leaveClan(username: string) {
  try {
    const supabase = createSupabaseServer()

    // Benutzer und Clan-Informationen abrufen
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("clan_id")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      console.error("Error fetching user:", userError)
      return { success: false, error: "Benutzer nicht gefunden" }
    }

    if (!userData.clan_id) {
      return { success: false, error: "Du bist in keinem Clan" }
    }

    // Clan-Informationen abrufen
    const { data: clanData, error: clanError } = await supabase
      .from("clans")
      .select("founder_id, name, member_count")
      .eq("id", userData.clan_id)
      .single()

    if (clanError) {
      console.error("Error fetching clan:", clanError)
      return { success: false, error: "Clan nicht gefunden" }
    }

    // Überprüfen, ob der Benutzer der Gründer ist
    if (clanData.founder_id === username) {
      return { success: false, error: "Als Gründer kannst du den Clan nicht verlassen. Du musst ihn auflösen." }
    }

    // Benutzer aus dem Clan entfernen
    const { error: updateError } = await supabase
      .from("users")
      .update({ clan_id: null })
      .eq("wallet_address", walletAddress)

    if (updateError) {
      console.error("Error removing user from clan:", updateError)
      return { success: false, error: "Fehler beim Verlassen des Clans" }
    }

    await supabase
      .from("clan_members")
      .delete()
      .eq("clan_id", userData.clan_id)
      .eq("user_id", username)

    // Mitgliederzahl verringern
    const { error: updateClanError } = await supabase
      .from("clans")
      .update({ member_count: clanData.member_count - 1 })
      .eq("id", userData.clan_id)

    if (updateClanError) {
      console.error("Error updating clan member count:", updateClanError)
    }

    // Clan-Aktivität erstellen
    await supabase.from("clan_activities").insert({
      clan_id: userData.clan_id,
      user_id: username,
      activity_type: "leave",
      description: `${username} hat den Clan "${clanData.name}" verlassen`,
      xp_earned: 0,
    })

    await updateClanMemberCount(userData.clan_id)

    revalidatePath("/")
    revalidatePath("/clan")

    return { success: true }
  } catch (error) {
    console.error("Error in leaveClan:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}

export async function updateClanMemberCount(clanId: number) {
  const supabase = createSupabaseServer()
  // 1. Mitglieder mit dieser clan_id zählen
  const { count, error: countError } = await supabase
    .from('users')
    .select('*', { count: 'exact', head: true })
    .eq('clan_id', clanId)

  if (countError) {
    console.error('Fehler beim Zählen der Mitglieder:', countError)
    return
  }

  // 2. Clan-Tabelle mit neuem Wert updaten
  const { error: updateError } = await supabase
    .from('clans')
    .update({ member_count: count })
    .eq('id', clanId)

  if (updateError) {
    console.error('Fehler beim Updaten des Clans:', updateError)
  } else {
    console.log(`Clan ${clanId}: member_count erfolgreich auf ${count} gesetzt.`)
  }
}

// Clan auflösen (nur für Gründer)
export async function dissolveClan(username: string, clanId: number) {
  try {
    const supabase = createSupabaseServer()

    // Clan-Informationen abrufen
    const { data: clanData, error: clanError } = await supabase
      .from("clans")
      .select("founder_id")
      .eq("id", clanId)
      .single()

    if (clanError) {
      console.error("Error fetching clan:", clanError)
      return { success: false, error: "Clan nicht gefunden" }
    }

    // Überprüfen, ob der Benutzer der Gründer ist
    if (clanData.founder_id !== username) {
      return { success: false, error: "Nur der Gründer kann den Clan auflösen" }
    }

    // Alle Benutzer aus dem Clan entfernen
    const { error: updateUsersError } = await supabase
      .from("users")
      .update({ clan_id: null })
      .eq("clan_id", clanId)

    if (updateUsersError) {
      console.error("Error removing users from clan:", updateUsersError)
      return { success: false, error: "Fehler beim Entfernen der Mitglieder" }
    }

    await supabase.from("clan_members").delete().eq("clan_id", clanId)

    // Clan löschen
    const { error: deleteClanError } = await supabase.from("clans").delete().eq("id", clanId)

    if (deleteClanError) {
      console.error("Error deleting clan:", deleteClanError)
      return { success: false, error: "Fehler beim Löschen des Clans" }
    }

    revalidatePath("/")
    revalidatePath("/clan")

    return { success: true }
  } catch (error) {
    console.error("Error in dissolveClan:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}

// Alle Clans abrufen
export async function getAllClans(page = 1, pageSize = 10) {
  try {
    const supabase = createSupabaseServer()
    const start = (page - 1) * pageSize
    const end = start + pageSize - 1

    // Clans abrufen
    const {
      data: clans,
      error,
      count,
    } = await supabase
      .from("clans")
      .select("*", { count: "exact" })
      .order("level", { ascending: false })
      .order("xp", { ascending: false })
      .range(start, end)

    if (error) {
      console.error("Error fetching clans:", error)
      return { success: false, error: "Fehler beim Abrufen der Clans" }
    }

    return {
      success: true,
      clans,
      pagination: {
        total: count || 0,
        page,
        pageSize,
        totalPages: Math.ceil((count || 0) / pageSize),
      },
    }
  } catch (error) {
    console.error("Error in getAllClans:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}

export async function updateClanDescription(clanId: number, newDescription: string) {
  const supabase = createSupabaseServer()
  const { error } = await supabase
    .from("clans")
    .update({ description: newDescription })
    .eq("id", clanId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
}
export async function updateClanMemberRole({
  clanId,
  targetUsername,
  newRole,
  currentUser,
}: {
  clanId: number
  targetUsername: string
  newRole: "member" | "xp_hunter" | "lucky_star" | "cheap_hustler"
  currentUser: string
}) {
  const supabase = createSupabaseServer()

  // 1. Is currentUser really the Leader of this clan?
  const { data: clanData, error: clanError } = await supabase
    .from("clans")
    .select("founder_id, level")
    .eq("id", clanId)
    .single()

  if (clanError || !clanData || clanData.founder_id !== currentUser) {
    return { success: false, error: "Only the clan founder can assign roles." }
  }

  // 2. Check role limits based on clan level
  const isLimitedRole = ["xp_hunter", "lucky_star"].includes(newRole)
  const isCheapHustler = newRole === "cheap_hustler"

  if (isLimitedRole) {
    const { data: roleUsers, count } = await supabase
      .from("clan_members")
      .select("*", { count: "exact", head: true })
      .eq("clan_id", clanId)
      .eq("role", newRole)

    // Level 3+ allows 5 members for xp_hunter and lucky_star, otherwise 3
    const maxAllowed = clanData.level >= 3 ? 5 : 3
    if ((count ?? 0) >= maxAllowed) {
      return {
        success: false,
        error: `Only ${maxAllowed} ${newRole.replace("_", " ")}s allowed${clanData.level >= 3 ? " (Level 3+ bonus)" : ""}.`,
      }
    }
  }

  if (isCheapHustler) {
    // Check if clan is level 4+
    if (clanData.level < 4) {
      return {
        success: false,
        error: "Cheap Hustler role requires clan level 4+.",
      }
    }

    // Check current cheap_hustler count (max 2)
    const { data: hustlerUsers, count } = await supabase
      .from("clan_members")
      .select("*", { count: "exact", head: true })
      .eq("clan_id", clanId)
      .eq("role", "cheap_hustler")

    if ((count ?? 0) >= 2) {
      return {
        success: false,
        error: "Only 2 Cheap Hustlers allowed per clan.",
      }
    }
  }

  // 3. Update role for target user
  const { error: updateError } = await supabase
    .from("clan_members")
    .update({ role: newRole })
    .eq("clan_id", clanId)
    .eq("user_id", targetUsername)

  if (updateError) {
    return { success: false, error: "Failed to update role." }
  }

  return { success: true }
}



// Clan-Details abrufen
export async function getClanDetails(clanId: number) {
  try {
    const supabase = createSupabaseServer()
    

    // Clan-Informationen abrufen
    const { data: clan, error: clanError } = await supabase.from("clans").select("*").eq("id", clanId).single()

    if (clanError) {
      console.error("Error fetching clan:", clanError)
      return { success: false, error: "Clan nicht gefunden" }
    }

    // Clan-Mitglieder aus Aktivitäten ableiten (nur "join"-Events)
// Clan-Mitglieder aus Aktivitäten ableiten (nur "join"-Events)
const { data: joinActivities, error: joinError } = await supabase
  .from("clan_activities")
  .select("user_id")
  .eq("clan_id", clanId)
  .eq("activity_type", "join")
  .order("created_at", { ascending: false })

if (joinError) {
  console.error("Error fetching join activities:", joinError)
  return { success: false, error: "Fehler beim Abrufen der Clan-Mitglieder" }
}

// Doppelte Nutzernamen filtern
const uniqueUsernames = Array.from(new Set(joinActivities.map((a) => a.user_id)))

// Nutzerdaten laden
const { data: members, error: userError } = await supabase
  .from("users")
  .select("username, level, avatar_url")
  .in("username", uniqueUsernames)

if (userError) {
  console.error("Error fetching users:", userError)
  return { success: false, error: "Fehler beim Laden der Mitglieder" }
}



    // Clan-Aktivitäten abrufen
    const { data: activities, error: activitiesError } = await supabase
      .from("clan_activities")
      .select("*")
      .eq("clan_id", clanId)
      .order("created_at", { ascending: false })
      .limit(20)

    if (activitiesError) {
      console.error("Error fetching clan activities:", activitiesError)
      return { success: false, error: "Fehler beim Abrufen der Clan-Aktivitäten" }
    }

    return {
      success: true,
      clan,
      members,
      activities,
    }
  } catch (error) {
    console.error("Error in getClanDetails:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}

export async function joinClanDirectly(walletAddress: string, clanId: number) {
  try {
    const supabase = createSupabaseServer()

    // User holen
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("clan_id")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError || !userData) {
      return { success: false, error: "Benutzer nicht gefunden" }
    }

    // Prüfen, ob er schon in einem Clan ist
    if (userData.clan_id) {
      return { success: false, error: "Du bist bereits in einem Clan" }
    }

    // Clan holen
    const { data: clanData, error: clanError } = await supabase
      .from("clans")
      .select("id, name, member_count")
      .eq("id", clanId)
      .single()

    if (clanError || !clanData) {
      return { success: false, error: "Clan nicht gefunden" }
    }

    // Benutzer-Clan aktualisieren
    const { error: updateUserError } = await supabase
      .from("users")
      .update({ clan_id: clanId })
      .eq("wallet_address", walletAddress)

    if (updateUserError) {
      return { success: false, error: "Fehler beim Beitreten zum Clan" }
    }

    // Vor Einfügen in clan_members prüfen, ob bereits Mitglied
    const { data: existingMember, error: memberCheckError } = await supabase
      .from("clan_members")
      .select("id")
      .eq("clan_id", clanId)
      .eq("user_id", username)
      .maybeSingle()

    if (!existingMember && !memberCheckError) {
      const { error: insertError } = await supabase
        .from("clan_members")
        .insert({
          clan_id: clanId,
          user_id: username,
          role: "member",
        })

      if (insertError) {
        return { success: false, error: "Fehler beim Einfügen in clan_members" }
      }
    }
    await updateClanMemberCount(clanId)
    // Clan-Mitgliederzahl aktualisieren
    const { count: memberCount, error: countError } = await supabase
      .from("clan_members")
      .select("*", { count: "exact", head: true })
      .eq("clan_id", clanId)

    if (!countError) {
      await supabase
        .from("clans")
        .update({ member_count: memberCount })
        .eq("id", clanId)
    }

    // Aktivität eintragen
    await supabase.from("clan_activities").insert({
      clan_id: clanId,
      user_id: username,
      activity_type: "join",
      description: `${username} ist dem Clan "${clanData.name}" beigetreten`,
      xp_earned: 5,
    })

    revalidatePath("/")
    revalidatePath("/clan")

    return { success: true }
  } catch (error) {
    console.error("Error in joinClanDirectly:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}


// Benutzer-Clan abrufen
export async function getUserClan(walletAddress: string) {
  try {
    const supabase = createSupabaseServer()

    // Benutzer-Informationen abrufen
    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("clan_id")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError) {
      console.error("Error fetching user:", userError)
      return { success: false, error: "Benutzer nicht gefunden" }
    }

    if (!userData.clan_id) {
      return { success: true, clan: null }
    }

    // Clan-Informationen abrufen
    const { data: clan, error: clanError } = await supabase
      .from("clans")
      .select("*")
      .eq("id", userData.clan_id)
      .single()

    if (clanError) {
      console.error("Error fetching clan:", clanError)
      return { success: false, error: "Clan nicht gefunden" }
    }

    return { success: true, clan }
  } catch (error) {
    console.error("Error in getUserClan:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}

// Claim level 5 reward (10 tickets each) for clan members
export async function claimLevel5Reward(walletAddress: string) {
  try {
    const supabase = createSupabaseServer()

    const { data: userData, error: userError } = await supabase
      .from("users")
      .select("clan_id, tickets, legendary_tickets")
      .eq("wallet_address", walletAddress)
      .single()

    if (userError || !userData?.clan_id) {
      return { success: false, error: "Benutzer hat keinen Clan" }
    }

    const { data: clanData, error: clanError } = await supabase
      .from("clans")
      .select("level")
      .eq("id", userData.clan_id)
      .single()

    if (clanError || !clanData || clanData.level < 5) {
      return { success: false, error: "Clan Level zu niedrig" }
    }

    const { data: rewardRow, error: rewardError } = await supabase
      .from("clan_level_rewards")
      .select("id, claimed_by")
      .eq("clan_id", userData.clan_id)
      .eq("level", 5)
      .single()

    if (rewardRow && rewardRow.claimed_by?.includes(username)) {
      return { success: false, error: "Belohnung bereits abgeholt" }
    }

    if (rewardError && rewardError.code !== "PGRST116") {
      console.error("Error checking reward:", rewardError)
      return { success: false, error: "Fehler" }
    }

    if (rewardRow) {
      const updated = [...(rewardRow.claimed_by || []), username]
      await supabase
        .from("clan_level_rewards")
        .update({ claimed_by: updated })
        .eq("id", rewardRow.id)
    } else {
      await supabase.from("clan_level_rewards").insert({
        clan_id: userData.clan_id,
        level: 5,
        reward_type: "10_tickets",
        claimed_by: [username],
      })
    }

    await supabase.from("clan_activities").insert({
      clan_id: userData.clan_id,
      user_id: username,
      activity_type: "claim_level5",
      description: "Level 5 Belohnung eingelöst",
    })

    const newTickets = (userData.tickets || 0) + 10
    const newLegendary = (userData.legendary_tickets || 0) + 10

    await supabase
      .from("users")
      .update({ tickets: newTickets, legendary_tickets: newLegendary })
      .eq("wallet_address", walletAddress)

    return { success: true, tickets: newTickets, legendary_tickets: newLegendary }
  } catch (error) {
    console.error("Error in claimLevel5Reward:", error)
    return { success: false, error: "Ein unerwarteter Fehler ist aufgetreten" }
  }
}