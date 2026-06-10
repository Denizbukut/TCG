export const metadata = {
  title: "Maintenance – Anime World TCG",
  description: "The app is currently under maintenance.",
}

export default function MaintenancePage() {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-gradient-to-b from-slate-900 via-slate-950 to-black px-6 text-center text-white">
      <div className="flex flex-col items-center gap-6 max-w-md">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white/10 text-4xl">
          🛠️
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
          The app is currently under maintenance
        </h1>
        <p className="text-base leading-relaxed text-white/70">
          We&apos;re working on Anime World TCG and will be back shortly.
          Please check back again later.
        </p>
        <p className="text-sm text-white/40">Thanks for your patience 💜</p>
      </div>
    </div>
  )
}
