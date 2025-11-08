export interface MissionReward {
  xp?: number
  tickets?: number
  eliteTickets?: number
}

export interface DailyMissionDefinition {
  key: string
  label: string
  goal: number
  reward: MissionReward
}

export const DAILY_MISSIONS: DailyMissionDefinition[] = [
  {
    key: "trade_market_purchase",
    label: "Buy a card on the Trade Market",
    goal: 1,
    reward: { tickets: 1 },
  },
  {
    key: "ticket_shop_bulk_purchase",
    label: "Purchase at least 5 regular tickets",
    goal: 1,
    reward: { tickets: 1 },
  },
  {
    key: "legendary_bulk_20",
    label: "Pull a legendary from a 20-pack bulk opening",
    goal: 1,
    reward: { eliteTickets: 2 },
  },
  {
    key: "special_deal_purchase",
    label: "Purchase the Special Deal",
    goal: 1,
    reward: { tickets: 5 },
  },
  {
    key: "daily_deal_purchase",
    label: "Purchase the Deal of the Day",
    goal: 1,
    reward: { tickets: 1 },
  },
]
