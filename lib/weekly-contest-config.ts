// Weekly Contest Configuration
// Ändere hier die Zeiten für neue Contests

export const WEEKLY_CONTEST_CONFIG = {
  // Contest Start Date (Montag der Woche)
  weekStart: "2025-09-06",
  
  // Contest End Date (Dienstag der nächsten Woche um 23:59:59 UTC)
  contestEnd: "2025-09-13T23:59:59Z",
  
  // Prize Pool Configuration
  prizePool: [
    { rank: "1st Place", reward: "$200 in WLD + Ibrahimovic Lvl.3", icon: "🥇" },
    { rank: "2nd Place", reward: "$150 in WLD + Maldini Lvl. 2", icon: "🥈" },
    { rank: "3rd Place", reward: "$75 in WLD + Puskas Lvl. 1", icon: "🥉" },
    { rank: "4th–6th Place", reward: "$35 in WLD + Ramos Lvl. 4", icon: "🎖️" },
    { rank: "7th–10th Place", reward:"$15 in WLD + Ramos  Lvl. 3", icon: "🎖️" },
  ]
} as const

// Helper functions
export const getContestEndTimestamp = () => new Date(WEEKLY_CONTEST_CONFIG.contestEnd).getTime()

export const getContestEndDate = () => new Date(WEEKLY_CONTEST_CONFIG.contestEnd)

export const isContestActive = () => {
  const now = new Date()
  const contestEnd = getContestEndDate()
  return now <= contestEnd
}

export const getTimeUntilContestEnd = () => {
  const now = Date.now()
  const endTime = getContestEndTimestamp()
  return Math.max(0, endTime - now)
} 