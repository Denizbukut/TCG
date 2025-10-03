import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/utils/supabase/server";
import { v4 as uuidv4 } from "uuid";

// Hilfsfunktion: Slot-Mapping (Frontend <-> DB)
const slotMap = [
  "GK",
  "DF1", "DF2", "DF3", "DF4",
  "MF1", "MF2", "MF3", "MF4",
  "FW1", "FW2"
];

export async function GET(request: Request) {
  // User aus Cookie holen (hier: username)
  const cookieStore = await cookies();
  const userCookie = cookieStore.get("animeworld_user")?.value;
  let user_id = null;
  if (usernameCookie) {
    try {
      user_id = JSON.parse(userCookie).wallet_address;
    } catch {}
  }
  if (!user_id) {
    return NextResponse.json({ error: "Not authenticated", debug: { cookie: userCookie, user_id } }, { status: 401 });
  }
  const supabase = createSupabaseServerClient(cookieStore);
  // Squad aus DB holen
  const { data, error } = await supabase
    .from("user_team")
    .select("*")
    .eq("user_id", user_id)
    .single();
  if (error || !data) {
    return NextResponse.json({ squad: null });
  }
  // Mapping DB -> Frontend
  const squad: { [key: string]: string | null } = {};
  slotMap.forEach((slot, i) => {
    squad[slot] = data[`slot_${i}`] || null;
  });
  return NextResponse.json({ squad });
}

export async function POST(request: Request) {
  const cookieStore = await cookies();
  const userCookie = cookieStore.get("animeworld_user")?.value;
  let user_id = null;
  if (usernameCookie) {
    try {
      user_id = JSON.parse(userCookie).wallet_address;
    } catch {}
  }
  if (!user_id) {
    return NextResponse.json({ error: "Not authenticated", debug: { cookie: userCookie, user_id } }, { status: 401 });
  }
  const supabase = createSupabaseServerClient(cookieStore);
  const body = await request.json();
  const { squad } = body;
  if (!squad) {
    return NextResponse.json({ error: "No squad provided" }, { status: 400 });
  }
  // Mapping Frontend -> DB
  const dbSquad: Record<string, string | null> = {};
  slotMap.forEach((slot, i) => {
    dbSquad[`slot_${i}`] = squad[slot] || null;
  });
  // Check, ob schon ein Squad existiert
  const { data: existing } = await supabase
    .from("user_team")
    .select("id")
    .eq("user_id", user_id)
    .single();
  let result;
  if (existing) {
    // Update
    result = await supabase
      .from("user_team")
      .update({ ...dbSquad, updated_at: new Date().toISOString() })
      .eq("user_id", user_id);
  } else {
    // Insert
    result = await supabase
      .from("user_team")
      .insert({
        id: uuidv4(),
        user_id,
        ...dbSquad,
        updated_at: new Date().toISOString(),
      });
  }
  if (result.error) {
    return NextResponse.json({ error: "Failed to save squad", debug: { cookie: usernameCookie, user_id, dbError: result.error } }, { status: 500 });
  }
  return NextResponse.json({ success: true });
} 