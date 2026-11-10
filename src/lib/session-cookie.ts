// Auth.js names the session cookie by protocol: the `__Secure-` form on https,
// the plain form on http (local dev).
export const SESSION_COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
] as const;

// Matches the Auth.js default session lifetime (30 days).
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

export function sessionCookieOptions(name: string) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure: name.startsWith("__Secure-"),
  };
}
