import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { sessions } from "@/server/db/schema";
import { SESSION_COOKIE_NAMES, sessionCookieOptions } from "@/lib/session-cookie";

export const dynamic = "force-dynamic";

// The proxy trusts the session cookie's presence, so a cookie whose session is
// gone would bounce between / and /today forever. App pages send such requests
// here: the cookie is cleared only once the database confirms the session is
// gone, so a database blip never signs anyone out.
export async function GET(request: NextRequest) {
  const token = SESSION_COOKIE_NAMES.map((name) => request.cookies.get(name)?.value).find(Boolean);

  if (token) {
    let live: boolean;
    try {
      const [row] = await db
        .select({ expires: sessions.expires })
        .from(sessions)
        .where(eq(sessions.sessionToken, token))
        .limit(1);
      live = !!row && row.expires.valueOf() > Date.now();
    } catch {
      return retryPage();
    }
    // A live session means whatever sent the request here was transient. Offer
    // a retry rather than redirecting, which could loop.
    if (live) return retryPage();
  }

  const response = NextResponse.redirect(new URL("/", request.url));
  for (const name of SESSION_COOKIE_NAMES) {
    response.cookies.set(name, "", { ...sessionCookieOptions(name), maxAge: 0 });
  }
  return response;
}

function retryPage() {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Race Horse</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f5f0e8;font-family:system-ui,sans-serif;text-align:center}a{color:inherit}</style></head><body><main><p>Race Horse couldn't load your session.</p><p><a href="/today">Try again</a></p></main></body></html>`;
  return new Response(html, {
    status: 503,
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" },
  });
}
