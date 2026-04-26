import { db } from "@/db";
import { accounts } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import type { StravaTokenResponse } from "./types";

const REFRESH_THRESHOLD_SECONDS = 60;
const STRAVA_TOKEN_URL = "https://www.strava.com/api/v3/oauth/token";

export async function getStravaToken(userId: string): Promise<string> {
  const rows = await db
    .select({
      access_token: accounts.access_token,
      refresh_token: accounts.refresh_token,
      expires_at: accounts.expires_at,
    })
    .from(accounts)
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "strava")))
    .limit(1);

  const row = rows[0];
  if (!row || !row.access_token || !row.refresh_token || !row.expires_at) {
    throw new Error(`No Strava account for user ${userId}`);
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (row.expires_at - nowSec > REFRESH_THRESHOLD_SECONDS) {
    return row.access_token;
  }

  const clientId = process.env.AUTH_STRAVA_ID;
  const clientSecret = process.env.AUTH_STRAVA_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("AUTH_STRAVA_ID / AUTH_STRAVA_SECRET not configured");
  }

  const res = await fetch(STRAVA_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
      refresh_token: row.refresh_token,
    }),
  });
  if (!res.ok) {
    throw new Error(`Strava token refresh failed: ${res.status} ${await res.text()}`);
  }
  const json = (await res.json()) as StravaTokenResponse;

  await db
    .update(accounts)
    .set({
      access_token: json.access_token,
      refresh_token: json.refresh_token,
      expires_at: json.expires_at,
      token_type: json.token_type,
    })
    .where(and(eq(accounts.userId, userId), eq(accounts.provider, "strava")));

  return json.access_token;
}
