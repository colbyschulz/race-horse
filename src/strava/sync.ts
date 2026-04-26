import { fetchStrava } from "./client";
import { getStravaToken } from "./token";
import { normalizeActivity, normalizeLap } from "./normalize";
import { replaceLaps, upsertActivity } from "./upsert";
import type {
  StravaDetailedActivity,
  StravaSummaryActivity,
} from "./types";

export const LIST_PAGE_SIZE = 200;

const TYPES_WITH_LAPS = new Set(["Run", "Ride", "VirtualRide"]);

export interface SyncResult {
  upserted: number;
  detailFailures: number;
  pages: number;
}

export async function syncActivities(opts: {
  userId: string;
  sinceDate: Date;
}): Promise<SyncResult> {
  const token = await getStravaToken(opts.userId);
  const after = Math.floor(opts.sinceDate.getTime() / 1000);

  let page = 1;
  let upserted = 0;
  let detailFailures = 0;
  let pages = 0;

  while (true) {
    const summaries = await fetchStrava<StravaSummaryActivity[]>(
      "/athlete/activities",
      token,
      { params: { per_page: LIST_PAGE_SIZE, page, after } },
    );
    pages += 1;

    if (!summaries.length) break;

    for (const summary of summaries) {
      const activityId = await upsertActivity(
        normalizeActivity(summary, opts.userId),
      );
      upserted += 1;

      if (!TYPES_WITH_LAPS.has(summary.type)) continue;

      try {
        const detail = await fetchStrava<StravaDetailedActivity>(
          `/activities/${summary.id}`,
          token,
          { params: { include_all_efforts: "true" } },
        );
        // upsert again with the richer detail (overwrites raw + any newly-present fields)
        await upsertActivity(normalizeActivity(detail, opts.userId));
        const laps = (detail.laps ?? []).map((l) => normalizeLap(l, activityId));
        await replaceLaps(activityId, laps);
      } catch (err) {
        detailFailures += 1;
        console.error("strava detail fetch failed", summary.id, err);
      }
    }

    page += 1;
  }

  return { upserted, detailFailures, pages };
}
