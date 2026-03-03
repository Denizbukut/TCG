// Weekly Contest Configuration
// Ändere hier die Zeiten für neue Contests

export const WEEKLY_CONTEST_CONFIG = {
  // Contest Start Date (Montag der Woche)
  weekStart: "2026-03-03",
  
  // Contest End Date (Dienstag der nächsten Woche um 23:59:59 UTC)
  contestEnd: "2026-03-10T20:59:59Z",
  
  // Prize Pool Configuration
  prizePool: [
    { rank: "1st Place", reward: "150 WLD + 1000 Legendary Tickets", icon: "🥇" },
    { rank: "2nd Place", reward: "75 WLD + 500 Legendary Tickets", icon: "🥈" },
    { rank: "3rd Place", reward: "50 WLD + 250 Legendary Tickets", icon: "🥉" },
    { rank: "4th–6th Place", reward: "20 WLD + 150 Regular Tickets", icon: "🎖️" },
    { rank: "7th–10th Place", reward: "10 WLD + 50 Regular Tickets", icon: "🎖️" },
  ]
} as const

// Helper functions
export const getContestEndTimestamp = () => new Date(WEEKLY_CONTEST_CONFIG.contestEnd).getTime()

export const getContestEndDate = () => new Date(WEEKLY_CONTEST_CONFIG.contestEnd)

export const getContestStartDate = () => {
  // weekStart ist ein Datum (YYYY-MM-DD), setze es auf 00:00:00 UTC
  return new Date(WEEKLY_CONTEST_CONFIG.weekStart + "T00:00:00Z")
}

export const isContestActive = () => {
  const now = new Date()
  const contestStart = getContestStartDate()
  const contestEnd = getContestEndDate()
  return now >= contestStart && now <= contestEnd
}

export const getTimeUntilContestEnd = () => {
  const now = Date.now()
  const endTime = getContestEndTimestamp()
  return Math.max(0, endTime - now)
} 