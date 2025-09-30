"use client"

import MobileNav from "@/components/mobile-nav";

export default function KickOffPage() {
  return (
    <div className="min-h-screen bg-black flex items-center justify-center relative">
      <div className="text-center text-white">
        <h1 className="text-2xl font-bold mb-4">Kick Off Page</h1>
        <p className="text-gray-400">This page is currently under maintenance.</p>
        <p className="text-sm text-gray-500 mt-2">All content has been temporarily disabled.</p>
      </div>
      
      {/* Mobile Navigation */}
      <div className="fixed bottom-0 left-0 right-0 z-40">
        <MobileNav />
      </div>
    </div>
  );
}
