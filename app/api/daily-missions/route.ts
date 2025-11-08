import { getDailyMissions } from "@/app/actions/missions"
import type { MissionReward } from "@/lib/daily-mission-definition"
import { NextResponse } from "next/server"

export async function POST(req: Request) {
  const { walletAddress } = await req.json()
  if (!walletAddress) {
    return NextResponse.json({ success: false, error: "No walletAddress provided" }, { status: 400 })
  }

  const { missions, bonusClaimed } = await getDailyMissions(walletAddress)

  const missionsWithRewards = missions.map((mission) => ({
    ...mission,
    reward_label: formatRewardLabel(mission.reward),
  }))

  return NextResponse.json({
    success: true,
    missions: missionsWithRewards,
    bonusClaimed,
  })
}

const formatRewardLabel = (reward: MissionReward) => {
  const parts: string[] = []

  if (reward.tickets) {
    parts.push(`+${reward.tickets} regular Ticket${reward.tickets > 1 ? "s" : ""}`)
  }

  if (reward.eliteTickets) {
    parts.push(`+${reward.eliteTickets} legendary Ticket${reward.eliteTickets > 1 ? "s" : ""}`)
  }

  if (reward.xp) {
    parts.push(`+${reward.xp} XP`)
  }

  return parts.length > 0 ? parts.join(" • ") : "Mystery Reward"
}
