import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

// ===========================================================================
// MAINTENANCE MODE
// Set to `true` to put the app into maintenance mode (every visitor only sees
// the maintenance screen). Set to `false` to bring it back. Can also be
// controlled via the env variable MAINTENANCE_MODE=true (e.g. on Vercel)
// without changing the code.
// ===========================================================================
const MAINTENANCE_MODE =
  process.env.MAINTENANCE_MODE === "false"
    ? false
    : process.env.MAINTENANCE_MODE === "true"
      ? true
      : true // Default: on

// Self-contained maintenance page — inline CSS, system fonts, no JavaScript,
// no external assets. Served directly so NOT A SINGLE extra request is made.
const MAINTENANCE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<title>Maintenance – Anime World TCG</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: linear-gradient(to bottom, #1b1040, #0b1026 55%, #000);
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 24px;
  }
  .box { max-width: 420px; display: flex; flex-direction: column; align-items: center; gap: 22px; }
  .icon {
    width: 80px; height: 80px; border-radius: 9999px;
    background: rgba(255,255,255,0.08);
    display: flex; align-items: center; justify-content: center;
    font-size: 38px;
  }
  h1 { font-size: 26px; font-weight: 600; letter-spacing: -0.01em; }
  p { font-size: 16px; line-height: 1.6; color: rgba(255,255,255,0.7); }
  .small { font-size: 14px; color: rgba(255,255,255,0.4); }
</style>
</head>
<body>
  <div class="box">
    <div class="icon">🛠️</div>
    <h1>The app is currently under maintenance</h1>
    <p>We're working on Anime World TCG and will be back shortly. Please check back again later.</p>
    <p class="small">Thanks for your patience 💜</p>
  </div>
</body>
</html>`

export function middleware(request: NextRequest) {
  if (!MAINTENANCE_MODE) {
    return NextResponse.next()
  }

  const { pathname } = request.nextUrl

  // Let the cron API through so scheduled jobs keep working during maintenance.
  if (pathname.startsWith("/api/cron")) {
    return NextResponse.next()
  }

  // Everything else (pages AND other API routes) gets the static HTML directly.
  // No React app, no providers, no price fetches, no JS — zero extra requests.
  return new NextResponse(MAINTENANCE_HTML, {
    status: 503,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "retry-after": "3600",
    },
  })
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
}
