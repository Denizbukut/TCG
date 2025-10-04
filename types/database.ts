// Define types for Supabase database tables

export interface User {
    wallet_address: string
    username: string
    tickets: number
    legendary_tickets: number
    icon_tickets: number // int4: Icon Tickets
    coins: number
    level: number
    experience: number
    next_level_exp: number
    has_premium: boolean
    ticket_last_claimed?: string
    last_login?: string
    world_id?: string
  }
  
  export interface PremiumPass {
  id: string
  user_id: string
  active: boolean
  purchased_at: string
  expires_at?: string
  last_elite_claim?: string
}

export interface XpPass {
  id: string
  user_id: string
  active: boolean
  purchased_at: string
  expires_at: string
}

export interface IconPass {
  id: string
  user_id: string
  active: boolean
  purchased_at: string
  expires_at: string
  created_at?: string
  updated_at?: string
}
  
  export interface ClaimedReward {
    id: string
    wallet_address: string
    level: number
    standard_claimed: boolean
    premium_claimed: boolean
    icon_claimed?: boolean
    claimed_at: string
  }
  
  export interface UserCard {
    id: string
    user_id: string
    card_id: string
    quantity: number
    level?: number
    favorite?: boolean
    obtained_at?: string
  }
  
  export interface Card {
    id: string
    name: string
    character: string
    image_url?: string
    rarity: "common" | "rare" | "epic" | "legendary"
    type?: string
    description?: string
  }
  
export interface ClanQuest {
  id: number
  clan_id: number
  quest_type: string
  goal: number
  progress: number
  claimed_by: string[]
  expires_at?: string
  created_at: string
}

export interface ClanMember {
  id: number
  clan_id: number
  user_id: string
  role: 'leader' | 'officer' | 'member'
  joined_at: string
}

export interface ClanFeedMessage {
  id: number
  clan_id: number
  user_id?: string
  message: string
  is_system: boolean
  created_at: string
}

export interface ClanWar {
  id: number
  season: number
  start_date: string
  end_date: string
  is_active: boolean
}

export interface ClanWarStat {
  id: number
  clan_war_id: number
  clan_id: number
  points: number
  updated_at: string
}

export interface ClanShopItem {
  id: number
  name: string
  description?: string
  xp_cost: number
  icon_url?: string
}

export interface ClanShopPurchase {
  id: number
  clan_id: number
  item_id: number
  purchased_at: string
}

export interface ClanLevelReward {
  id: number
  clan_id: number
  level: number
  reward_type: string
  claimed_by: string[]
  created_at: string
}

export interface XpPassPurchase {
  id: string
  username: string
  price_usd: number
  price_wld?: number
  duration_days: number
  purchased_at: string
  created_at: string
}