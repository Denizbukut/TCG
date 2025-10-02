import { getDailyMissions } from "@/app/actions/missions"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { username } = await req.json()
  if (!username) return NextResponse.json({ success: false, error: "No username provided" })

  const { missions, bonusClaimed } = await getDailyMissions(username)

  const rewardMap: Record<string, string> = {
    open_regular_pack: "+1 Ticket",
    open_legendary_pack: "+1 Legendary Ticket",
    open_3_legendary_packs: "+2 Legendary Tickets",
    draw_legendary_card: "+1 Legendary Ticket",
    login_streak: "+50 XP",
  }

  const missionsWithRewards = missions.map((mission) => ({
    ...mission,
    reward_label: rewardMap[mission.key] || "Mystery Reward",
  }))

  return NextResponse.json({
    success: true,
    missions: missionsWithRewards,
    bonusClaimed,
  })
}
