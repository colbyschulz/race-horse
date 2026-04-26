import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  primaryKey,
  integer,
  jsonb,
  uuid,
  bigint,
  numeric,
  index,
  uniqueIndex,
  date,
  boolean,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import type { AdapterAccountType } from "next-auth/adapters";

export type UserPreferences = {
  units: "mi" | "km";
  timezone: string;
  pace_format: "min_per_mi" | "min_per_km";
  power_units: "watts";
};

export const DEFAULT_PREFERENCES: UserPreferences = {
  units: "mi",
  timezone: "UTC",
  pace_format: "min_per_mi",
  power_units: "watts",
};

export const sportEnum = pgEnum("sport", ["run", "bike"]);
export const planModeEnum = pgEnum("plan_mode", ["goal", "indefinite"]);
export const planSourceEnum = pgEnum("plan_source", [
  "uploaded",
  "coach_generated",
]);
export const workoutTypeEnum = pgEnum("workout_type", [
  "easy",
  "long",
  "tempo",
  "threshold",
  "intervals",
  "recovery",
  "race",
  "rest",
  "cross",
]);

export type Goal = {
  race_date?: string;
  race_distance?: string;
  target_time?: string;
};

export type TargetIntensity = {
  pace?: { min_seconds_per_km?: number; max_seconds_per_km?: number };
  power?: { min_watts?: number; max_watts?: number };
  hr?: { min_bpm?: number; max_bpm?: number } | { zone: string };
  rpe?: number;
};

export type IntervalSpec = {
  reps: number;
  distance_m?: number;
  duration_s?: number;
  target_intensity?: TargetIntensity;
  rest?: { duration_s?: number; distance_m?: number };
};

export const users = pgTable("user", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  preferences: jsonb("preferences")
    .$type<UserPreferences>()
    .default(DEFAULT_PREFERENCES)
    .notNull(),
  coach_notes: text("coach_notes").notNull().default(""),
  last_synced_at: timestamp("last_synced_at", {
    withTimezone: true,
    mode: "date",
  }),
});

export const accounts = pgTable(
  "account",
  {
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => [
    primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  ],
);

export const sessions = pgTable("session", {
  sessionToken: text("sessionToken").primaryKey(),
  userId: uuid("userId")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

export const activities = pgTable(
  "activity",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    strava_id: bigint("strava_id", { mode: "number" }).notNull().unique(),
    start_date: timestamp("start_date", {
      withTimezone: true,
      mode: "date",
    }).notNull(),
    name: text("name").notNull(),
    type: text("type").notNull(),
    distance_meters: numeric("distance_meters"),
    moving_time_seconds: integer("moving_time_seconds"),
    elapsed_time_seconds: integer("elapsed_time_seconds"),
    avg_hr: numeric("avg_hr"),
    max_hr: numeric("max_hr"),
    avg_pace_seconds_per_km: numeric("avg_pace_seconds_per_km"),
    avg_power_watts: numeric("avg_power_watts"),
    elevation_gain_m: numeric("elevation_gain_m"),
    raw: jsonb("raw").notNull(),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("activity_user_start_idx").on(t.userId, t.start_date),
  ],
);

export const activityLaps = pgTable(
  "activity_lap",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    activity_id: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    lap_index: integer("lap_index").notNull(),
    distance_meters: numeric("distance_meters").notNull(),
    moving_time_seconds: integer("moving_time_seconds").notNull(),
    elapsed_time_seconds: integer("elapsed_time_seconds").notNull(),
    avg_pace_seconds_per_km: numeric("avg_pace_seconds_per_km"),
    avg_power_watts: numeric("avg_power_watts"),
    avg_hr: numeric("avg_hr"),
    max_hr: numeric("max_hr"),
    elevation_gain_m: numeric("elevation_gain_m"),
    start_index: integer("start_index"),
    end_index: integer("end_index"),
  },
  (t) => [
    index("activity_lap_activity_idx").on(t.activity_id, t.lap_index),
  ],
);

export const plans = pgTable(
  "plan",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sport: sportEnum("sport").notNull(),
    mode: planModeEnum("mode").notNull(),
    goal: jsonb("goal").$type<Goal>(),
    start_date: date("start_date", { mode: "string" }).notNull(),
    end_date: date("end_date", { mode: "string" }),
    is_active: boolean("is_active").notNull().default(false),
    source: planSourceEnum("source").notNull(),
    source_file_id: uuid("source_file_id"),
    created_at: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("plan_user_idx").on(t.userId),
    uniqueIndex("plan_one_active_per_user_idx")
      .on(t.userId)
      .where(sql`${t.is_active}`),
  ],
);

export const workouts = pgTable(
  "workout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    plan_id: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    sport: sportEnum("sport").notNull(),
    type: workoutTypeEnum("type").notNull(),
    distance_meters: numeric("distance_meters"),
    duration_seconds: integer("duration_seconds"),
    target_intensity: jsonb("target_intensity").$type<TargetIntensity>(),
    intervals: jsonb("intervals").$type<IntervalSpec[]>(),
    notes: text("notes").notNull().default(""),
  },
  (t) => [
    index("workout_plan_date_idx").on(t.plan_id, t.date),
  ],
);
