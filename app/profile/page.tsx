"use client"

import { useAuth } from "@/contexts/auth-context"
import { useI18n } from "@/contexts/i18n-context"
import ProtectedRoute from "@/components/protected-route"
import MobileNav from "@/components/mobile-nav"
import LanguageSwitcher from "@/components/language-switcher"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { LogOut, Ticket, Crown, Trophy, TrendingUp } from "lucide-react"

export default function ProfilePage() {
  const { user, logout } = useAuth()
  const { t } = useI18n()

  // Calculate XP progress percentage
  const xpPercentage = user?.nextLevelExp 
    ? Math.min(((user?.experience || 0) / user.nextLevelExp) * 100, 100)
    : 0

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-[#18181b] to-[#232526] pb-20">
        <header className="bg-black/80 border-b border-yellow-400 px-4 py-3 backdrop-blur">
          <h1 className="text-xl font-bold bg-gradient-to-r from-yellow-200 via-yellow-400 to-yellow-600 bg-clip-text text-transparent">
            {t("profile.title", "My Profile")}
          </h1>
        </header>

        <main className="p-4 space-y-4 max-w-md mx-auto">
          {/* User Info Card */}
          <Card className="bg-gradient-to-br from-[#232526] to-[#18181b] border-2 border-yellow-400">
            <CardHeader className="pb-3">
              <div className="flex items-center gap-4">
                <Avatar className="h-16 w-16 border-2 border-yellow-400">
                  <AvatarFallback className="bg-yellow-400/20 text-yellow-400 text-xl font-bold">
                    {user?.username?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <CardTitle className="text-xl text-yellow-300">{user?.username || "User"}</CardTitle>
                  <CardDescription className="text-gray-400">
                    {t("profile.level", "Level")} {user?.level || 1}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* XP Progress Bar */}
              <div>
                <div className="flex justify-between text-xs text-gray-400 mb-1">
                  <span>{t("profile.experience", "Experience")}</span>
                  <span>{user?.experience || 0} / {user?.nextLevelExp || 500} XP</span>
                </div>
                <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-yellow-400 to-yellow-600 transition-all duration-500"
                    style={{ width: `${xpPercentage}%` }}
                  />
                </div>
              </div>

              {/* Tickets & Score */}
              <div className="grid grid-cols-3 gap-2 pt-2">
                <div className="bg-black/40 rounded-lg p-2 border border-yellow-400/30">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Ticket className="h-3.5 w-3.5 text-blue-400" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">{user?.tickets || 0}</div>
                    <div className="text-[10px] text-gray-400">{t("profile.tickets", "Tickets")}</div>
                  </div>
                </div>
                <div className="bg-black/40 rounded-lg p-2 border border-yellow-400/30">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Crown className="h-3.5 w-3.5 text-yellow-400" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">{user?.elite_tickets || 0}</div>
                    <div className="text-[10px] text-gray-400">{t("profile.elite", "Elite")}</div>
                  </div>
                </div>
                <div className="bg-black/40 rounded-lg p-2 border border-yellow-400/30">
                  <div className="flex items-center justify-center gap-1 mb-1">
                    <Trophy className="h-3.5 w-3.5 text-orange-400" />
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-bold text-white">{user?.score || 0}</div>
                    <div className="text-[10px] text-gray-400">{t("profile.score", "Score")}</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Language Selection Card */}
          <Card className="bg-gradient-to-br from-[#232526] to-[#18181b] border-2 border-yellow-400">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-yellow-300 flex items-center gap-2">
                🌍 {t("profile.language", "Language")}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <LanguageSwitcher />
            </CardContent>
          </Card>

          {/* Stats Grid */}
          <div className="grid grid-cols-2 gap-3">
            <Card className="bg-gradient-to-br from-[#232526] to-[#18181b] border border-yellow-400/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-yellow-300">{t("profile.level", "Level")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{user?.level || 1}</div>
                <p className="text-xs text-gray-400">{t("profile.current_level", "Current level")}</p>
              </CardContent>
            </Card>

            <Card className="bg-gradient-to-br from-[#232526] to-[#18181b] border border-yellow-400/50">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-yellow-300">{t("profile.score", "Score")}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">{user?.score || 0}</div>
                <p className="text-xs text-gray-400">{t("profile.total_score", "Total score")}</p>
              </CardContent>
            </Card>
          </div>

          {/* Logout Button */}
          <Button
            onClick={() => logout()}
            variant="destructive"
            className="w-full flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 border-2 border-red-500"
          >
            <LogOut className="h-4 w-4" />
            {t("profile.logout", "Logout")}
          </Button>
        </main>

        <MobileNav />
      </div>
    </ProtectedRoute>
  )
}
