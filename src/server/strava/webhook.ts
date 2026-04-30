import { db } from "@/server/db";
import { accounts } from "@/server/db/schema";
import { and, eq } from "drizzle-orm";
import { fetchStrava } from "./client";
import { getStravaToken } from "./token";
import { normalizeActivity, normalizeLap } from "./normalize";
import { deleteActivityByStravaId, replaceLaps, upsertActivity } from "./upsert";
import type { StravaDetailedActivity, StravaWebhookEvent } from "./types";

async function userIdForStravaAthlete(athleteId: number): Promise<string | null> {
  const rows = await db
    .select({ userId: accounts.userId })
    .from(accounts)
    .where(and(eq(accounts.provider, "strava"), eq(accounts.providerAccountId, String(athleteId))))
    .limit(1);
  return rows[0]?.userId ?? null;
}

export async function handleWebhookEvent(event: StravaWebhookEvent): Promise<void> {
  const userId = await userIdForStravaAthlete(event.owner_id);
  if (!userId) {
    console.warn("strava webhook: unknown owner", event.owner_id);
    return;
  }

  if (event.object_type === "athlete") {
    if (event.updates?.authorized === "false") {
      await db
        .update(accounts)
        .set({
          access_token: null,
          refresh_token: null,
          expires_at: null,
        })
        .where(
          and(
            eq(accounts.provider, "strava"),
            eq(accounts.providerAccountId, String(event.owner_id))
          )
        );
    }
    return;
  }

  // object_type === "activity"
  if (event.aspect_type === "delete") {
    await deleteActivityByStravaId(event.object_id);
    return;
  }

  // create / update — fetch full detail + laps and upsert
  const token = await getStravaToken(userId);
  const detail = await fetchStrava<StravaDetailedActivity>(
    `/activities/${event.object_id}`,
    token,
    { params: { include_all_efforts: "true" } }
  );
  const activityId = await upsertActivity(normalizeActivity(detail, userId));
  const laps = (detail.laps ?? []).map((l) => normalizeLap(l, activityId));
  await replaceLaps(activityId, laps);
}
