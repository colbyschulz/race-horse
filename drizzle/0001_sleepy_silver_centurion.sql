CREATE TABLE "activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"strava_id" bigint NOT NULL,
	"start_date" timestamp with time zone NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"distance_meters" numeric,
	"moving_time_seconds" integer,
	"elapsed_time_seconds" integer,
	"avg_hr" numeric,
	"max_hr" numeric,
	"avg_pace_seconds_per_km" numeric,
	"avg_power_watts" numeric,
	"elevation_gain_m" numeric,
	"raw" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activity_strava_id_unique" UNIQUE("strava_id")
);
--> statement-breakpoint
CREATE TABLE "activity_lap" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"activity_id" uuid NOT NULL,
	"lap_index" integer NOT NULL,
	"distance_meters" numeric NOT NULL,
	"moving_time_seconds" integer NOT NULL,
	"elapsed_time_seconds" integer NOT NULL,
	"avg_pace_seconds_per_km" numeric,
	"avg_power_watts" numeric,
	"avg_hr" numeric,
	"max_hr" numeric,
	"elevation_gain_m" numeric,
	"start_index" integer,
	"end_index" integer
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_lap" ADD CONSTRAINT "activity_lap_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_user_start_idx" ON "activity" USING btree ("userId","start_date");--> statement-breakpoint
CREATE INDEX "activity_lap_activity_idx" ON "activity_lap" USING btree ("activity_id","lap_index");