CREATE TYPE "public"."plan_mode" AS ENUM('goal', 'indefinite');--> statement-breakpoint
CREATE TYPE "public"."plan_source" AS ENUM('uploaded', 'coach_generated');--> statement-breakpoint
CREATE TYPE "public"."sport" AS ENUM('run', 'bike');--> statement-breakpoint
CREATE TYPE "public"."workout_type" AS ENUM('easy', 'long', 'tempo', 'threshold', 'intervals', 'recovery', 'race', 'rest', 'cross');--> statement-breakpoint
CREATE TABLE "plan" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"userId" uuid NOT NULL,
	"title" text NOT NULL,
	"sport" "sport" NOT NULL,
	"mode" "plan_mode" NOT NULL,
	"goal" jsonb,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT false NOT NULL,
	"source" "plan_source" NOT NULL,
	"source_file_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"date" date NOT NULL,
	"sport" "sport" NOT NULL,
	"type" "workout_type" NOT NULL,
	"distance_meters" numeric,
	"duration_seconds" integer,
	"target_intensity" jsonb,
	"intervals" jsonb,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workout" ADD CONSTRAINT "workout_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "plan_user_idx" ON "plan" USING btree ("userId");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_one_active_per_user_idx" ON "plan" USING btree ("userId") WHERE "plan"."is_active";--> statement-breakpoint
CREATE INDEX "workout_plan_date_idx" ON "workout" USING btree ("plan_id","date");