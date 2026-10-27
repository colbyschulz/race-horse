CREATE TYPE "public"."coach_turn_status" AS ENUM('running', 'done', 'error');--> statement-breakpoint
CREATE TABLE "coach_turn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"plan_id" uuid,
	"status" "coach_turn_status" DEFAULT 'running' NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "coach_turn" ADD CONSTRAINT "coach_turn_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_turn" ADD CONSTRAINT "coach_turn_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_turn_user_plan_idx" ON "coach_turn" USING btree ("user_id","plan_id") WHERE "coach_turn"."plan_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "coach_turn_user_null_plan_idx" ON "coach_turn" USING btree ("user_id") WHERE "coach_turn"."plan_id" is null;