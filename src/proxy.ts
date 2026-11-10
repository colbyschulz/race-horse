import { NextResponse, type NextRequest } from "next/server";
import {
  SESSION_COOKIE_NAMES,
  SESSION_MAX_AGE_SECONDS,
  sessionCookieOptions,
} from "@/lib/session-cookie";

// Optimistic check only: this runs on every app navigation and prefetch, so it
// looks at whether a session cookie exists and never touches the database. The
// real check is `getSession()` in the (app) layout, which sends a cookie that
// turns out to be invalid to /session-expired.
export function proxy(request: NextRequest) {
  const cookie = SESSION_COOKIE_NAMES.map((name) => request.cookies.get(name)).find(Boolean);
  const isHome = request.nextUrl.pathname === "/";

  if (!cookie) {
    return isHome ? NextResponse.next() : NextResponse.redirect(new URL("/", request.url));
  }

  const response = isHome
    ? NextResponse.redirect(new URL("/today", request.url))
    : NextResponse.next();

  // Auth.js only extends the cookie's expiry when it can write response
  // cookies, which a Server Component render can't. Roll it here so an active
  // user isn't signed out 30 days after sign-in.
  response.cookies.set(cookie.name, cookie.value, {
    ...sessionCookieOptions(cookie.name),
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export const config = {
  matcher: [
    "/",
    "/today/:path*",
    "/training/:path*",
    "/plans/:path*",
    "/settings/:path*",
    "/coach/:path*",
  ],
};
